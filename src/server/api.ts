import express, { NextFunction, Request, Response, Router } from 'express';
import { dbPool, isDatabaseConfigured, query, supabaseAdmin } from './supabase';
import {
  calculateCompetencyAverage,
  isCompetencyDecision,
  validateCompetencyScores,
} from './competency-evaluation';
import {
  calculatePersonalAverage,
  isPersonalDecision,
  validatePersonalScores,
} from './personal-evaluation';
import {
  calculateDonationBalance,
  canTransitionDeliveryState,
  deriveDonationDeliveryStatus,
  formatDeliveryCode,
  formatDonationCode,
  normalizeDeliveryState,
  normalizeDonorType,
  normalizeRecipientType,
  validateDeliveryRegistration,
  validateOfferedDonation,
} from './donation-traceability';
import {
  normalizeRecipientEmail,
  validateDonationNeedRequest,
} from './donation-needs';
import {
  buildDonationHistoryConditions,
  parseDonationHistoryFilters,
  toDonationHistoryItem,
  type DonationHistoryRow,
} from './donation-history';
import { authenticate, requirePermission, signAuthToken, type AuthenticatedRequest } from './authorization';
import { cacheService, buildCacheKey } from './cache';
import {
  DONATION_SORT_OPTIONS,
  PROJECT_SORT_OPTIONS,
  filterAndSortDonations,
  filterAndSortProjects,
  normalizeCategoryFilter,
  normalizeSortOrder,
  validatePriceRange,
  validateQuotaRange,
  validateScoreRange,
} from './catalog-filters';
import {
  buildCsvReport,
  querySystemLogs,
  recordSystemLog,
  type CsvColumn,
} from './audit-logs';
import { hasPermission } from './permissions';

const router: Router = express.Router();

function getActorMeta(req: Request) {
  const authReq = req as AuthenticatedRequest;
  return {
    user_id: authReq.userId || null,
    user_email: authReq.userEmail || null,
    user_role: authReq.userRole || null,
  };
}

// Status endpoint (never throws when DATABASE_URL is not yet configured)
router.get('/status', (_req: Request, res: Response) => {
  res.json({ databaseConfigured: isDatabaseConfigured });
});

// Healthcheck endpoint (Docker Desktop / uptime monitoring)
router.get('/health', async (_req: Request, res: Response) => {
  if (!isDatabaseConfigured) {
    return res.status(503).json({
      status: 'error',
      database: 'unconfigured',
      error: 'DATABASE_URL no configurada en las variables de entorno del servidor (.env)',
    });
  }
  try {
    await query('SELECT 1');
    res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
  } catch (err: any) {
    res.status(503).json({ status: 'error', database: 'disconnected', error: err?.message });
  }
});

// Guard DB-backed routes cleanly when DATABASE_URL is missing in the environment
router.use((_req: Request, res: Response, next: NextFunction) => {
  if (!isDatabaseConfigured) {
    return res.status(503).json({
      error: 'Base de datos no conectada: configura DATABASE_URL en los secretos del entorno o en tu archivo .env.',
    });
  }
  next();
});

// Helper to calculate age from birth date
function calculateAge(birthDateString: string | Date): number {
  const today = new Date();
  if (typeof birthDateString === 'string' && /^\d{4}-\d{2}-\d{2}/.test(birthDateString)) {
    const [birthYear, birthMonth, birthDay] = birthDateString.split('T')[0].split('-').map(Number);
    let age = today.getFullYear() - birthYear;
    const m = (today.getMonth() + 1) - birthMonth;
    if (m < 0 || (m === 0 && today.getDate() < birthDay)) {
      age--;
    }
    return age;
  }
  const birthDate = new Date(birthDateString);
  let age = today.getFullYear() - birthDate.getUTCFullYear();
  const m = (today.getMonth() + 1) - (birthDate.getUTCMonth() + 1);
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getUTCDate())) {
    age--;
  }
  return age;
}

// -------------------------------------------------------------
// 0. AUTENTICACIÓN ADMINISTRATIVA (LOGIN REAL)
// -------------------------------------------------------------
router.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Correo y contraseña son obligatorios' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const rows = await query<{ id: string; nombre: string; email: string; password: string; rol: string }>(
      'SELECT id, nombre, email, password, rol FROM public.usuarios WHERE LOWER(email) = $1 LIMIT 1',
      [cleanEmail]
    );

    if (rows.length === 0) {
      await recordSystemLog({
        user_email: cleanEmail,
        action: 'AUTH_LOGIN',
        module: 'auth',
        status: 'denied',
        details: 'Intento de inicio de sesión con correo no registrado',
      }).catch(() => {});
      return res.status(404).json({ error: 'No existe una cuenta registrada con este correo' });
    }

    const user = rows[0];
    if (user.password !== password) {
      await recordSystemLog({
        user_id: String(user.id),
        user_email: user.email,
        user_role: user.rol,
        action: 'AUTH_LOGIN',
        module: 'auth',
        status: 'denied',
        details: 'Contraseña incorrecta al iniciar sesión',
      }).catch(() => {});
      return res.status(401).json({ error: 'Contraseña incorrecta. Por favor verifica tus credenciales.' });
    }

    const permRows = await query<{ code: string }>(
      `SELECT DISTINCT p.code
       FROM user_roles ur
       JOIN role_permissions rp ON rp.role_id = ur.role_id
       JOIN permissions p ON p.id = rp.permission_id
       JOIN roles r ON r.id = ur.role_id AND r.active = TRUE
       WHERE ur.user_id = $1
       UNION
       SELECT DISTINCT p.code
       FROM roles r
       JOIN role_permissions rp ON rp.role_id = r.id
       JOIN permissions p ON p.id = rp.permission_id
       WHERE r.code = $2 AND r.active = TRUE`,
      [user.id, user.rol]
    );

    const jwtToken = signAuthToken({
      sub: String(user.id),
      email: user.email,
      rol: user.rol,
    });

    await recordSystemLog({
      user_id: String(user.id),
      user_email: user.email,
      user_role: user.rol,
      action: 'AUTH_LOGIN',
      module: 'auth',
      status: 'success',
      details: `Inicio de sesión exitoso (${user.rol})`,
    }).catch(() => {});

    res.json({
      token: jwtToken,
      user: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
        permisos: permRows.map((p) => p.code),
      },
      message: 'Inicio de sesión exitoso',
    });
  } catch (err: any) {
    console.error('Error in login:', err);
    res.status(500).json({ error: 'Error al procesar el inicio de sesión' });
  }
});

router.get('/auth/me', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userRows = await query<{ id: string; nombre: string; email: string; rol: string }>(
      'SELECT id, nombre, email, rol FROM public.usuarios WHERE id::text = $1 LIMIT 1',
      [req.userId]
    );
    const u = userRows[0];
    res.json({
      userId: req.userId,
      nombre: u?.nombre || 'Administrador',
      email: u?.email || '',
      rol: u?.rol || (req.userId === '00000000-0000-0000-0000-000000000001' ? 'administrador' : 'usuario'),
      permissions: req.permissions || [],
    });
  } catch (err: any) {
    console.error('Error fetching /auth/me:', err);
    res.status(500).json({ error: 'Error al obtener perfil y permisos del usuario' });
  }
});

router.get('/auth/demo-users', async (_req: Request, res: Response) => {
  try {
    const rows = await query<{ id: string; nombre: string; email: string; rol: string }>(
      'SELECT id, nombre, email, rol FROM public.usuarios WHERE activo = TRUE ORDER BY id ASC LIMIT 6'
    );
    res.json(rows);
  } catch (err: any) {
    console.error('Error fetching demo users:', err);
    res.json([]);
  }
});

// -------------------------------------------------------------
// 1. ORGANIZACIONES
// -------------------------------------------------------------
router.get('/organizaciones', async (req: Request, res: Response) => {
  try {
    const rows = await query('SELECT * FROM organizaciones ORDER BY nombre ASC');
    res.json(rows);
  } catch (err: any) {
    console.error('Error fetching organizaciones:', err);
    res.status(500).json({ error: 'Error al obtener organizaciones' });
  }
});

router.post('/organizaciones', authenticate, requirePermission('projects.review'), async (req: Request, res: Response) => {
  try {
    const { nombre, tipo, contacto_nombre, contacto_email, contacto_telefono } = req.body;
    if (!nombre || !tipo) {
      return res.status(400).json({ error: 'Nombre y tipo son obligatorios' });
    }
    const rows = await query(
      `INSERT INTO organizaciones (nombre, tipo, contacto_nombre, contacto_email, contacto_telefono)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [nombre, tipo, contacto_nombre || null, contacto_email || null, contacto_telefono || null]
    );
    res.status(201).json(rows[0]);
  } catch (err: any) {
    console.error('Error creating organizacion:', err);
    res.status(500).json({ error: 'Error al registrar organización' });
  }
});

// -------------------------------------------------------------
// 2. PROYECTOS (Catálogo, Propuestas, Revisión, Seguimiento)
// -------------------------------------------------------------
// KIR-23 (KIR-74 & KIR-75): Consulta de seguimiento del proyecto inscrito por organización
router.get('/proyectos/tracking', async (req: Request, res: Response) => {
  try {
    const busqueda = typeof req.query.busqueda === 'string' ? req.query.busqueda.trim() : '';
    if (!busqueda) {
      return res.status(400).json({ error: 'Ingrese el correo de contacto de la organización' });
    }

    const quotaRange = validateQuotaRange(req.query.cupos_min, req.query.cupos_max);
    if (!quotaRange.ok) {
      return res.status(400).json({ error: quotaRange.error });
    }

    const estadoFilter = normalizeCategoryFilter(req.query.estado);
    const ordenar = normalizeSortOrder(req.query.ordenar, PROJECT_SORT_OPTIONS, 'recientes');

    const rows = await query(
      `SELECT p.id, p.titulo, p.ubicacion, p.cupos_disponibles,
              p.estado, COALESCE(p.publicado, false) AS publicado, p.fecha_publicacion,
              p.motivo_rechazo, p.created_at, p.updated_at,
              o.nombre AS organizacion_nombre, o.tipo AS organizacion_tipo
       FROM proyectos p
       JOIN organizaciones o ON o.id = p.organizacion_id
       WHERE LOWER(TRIM(o.contacto_email)) = LOWER($1)
       ORDER BY p.created_at DESC`,
      [busqueda]
    );

    const filteredByState = estadoFilter
      ? rows.filter((r: any) => String(r.estado || '').toLowerCase() === estadoFilter.toLowerCase())
      : rows;

    const finalRows = filterAndSortProjects(filteredByState as any[], {
      cuposMin: quotaRange.min,
      cuposMax: quotaRange.max,
      ordenar,
    });

    res.json(finalRows);
  } catch (err: any) {
    console.error('Error tracking project proposals:', err);
    res.status(500).json({ error: 'Error al consultar el seguimiento de proyectos' });
  }
});

router.get('/proyectos', async (req: Request, res: Response) => {
  try {
    const { estado, publicado, ubicacion, organizacion_id, q, categoria, cupos_min, cupos_max, ordenar } = req.query;
    const quotaRange = validateQuotaRange(cupos_min, cupos_max);
    if (!quotaRange.ok) {
      return res.status(400).json({ error: quotaRange.error });
    }

    const cleanCategoria = normalizeCategoryFilter(categoria);
    const cleanSort = normalizeSortOrder(ordenar, PROJECT_SORT_OPTIONS, 'recientes');
    const cacheKey = buildCacheKey('proyectos:list', {
      estado,
      publicado,
      ubicacion,
      organizacion_id,
      q,
      categoria: cleanCategoria,
      cupos_min: quotaRange.min,
      cupos_max: quotaRange.max,
      ordenar: cleanSort,
    });

    const cached = await cacheService.get<any[]>(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('X-Cache-Backend', cacheService.getStats().backend);
      return res.json(cached);
    }

    let sql = `
      SELECT p.*, 
             o.nombre as organizacion_nombre, 
             o.tipo as organizacion_tipo,
             o.contacto_nombre as organizacion_contacto
      FROM proyectos p
      LEFT JOIN organizaciones o ON p.organizacion_id = o.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (estado) {
      params.push(estado);
      sql += ` AND p.estado = $${params.length}`;
    }

    if (publicado === 'true' || publicado === 'false') {
      params.push(publicado === 'true');
      sql += ` AND p.publicado = $${params.length}`;
    }

    if (ubicacion) {
      params.push(`%${ubicacion}%`);
      sql += ` AND p.ubicacion ILIKE $${params.length}`;
    }

    if (organizacion_id) {
      params.push(organizacion_id);
      sql += ` AND p.organizacion_id = $${params.length}`;
    }

    if (cleanCategoria) {
      params.push(cleanCategoria);
      sql += ` AND LOWER(COALESCE(o.tipo, '')) = LOWER($${params.length})`;
    }

    if (quotaRange.min !== null) {
      params.push(quotaRange.min);
      sql += ` AND p.cupos_disponibles >= $${params.length}`;
    }

    if (quotaRange.max !== null) {
      params.push(quotaRange.max);
      sql += ` AND p.cupos_disponibles <= $${params.length}`;
    }

    if (q) {
      params.push(`%${q}%`);
      sql += ` AND (p.titulo ILIKE $${params.length} OR p.descripcion ILIKE $${params.length} OR p.ubicacion ILIKE $${params.length})`;
    }

    sql += ' ORDER BY p.created_at DESC';

    const rows = await query(sql, params);

    const formatted = rows.map((r: any) => ({
      ...r,
      publicado: Boolean(r.publicado),
      organizacion: r.organizacion_id
        ? {
            id: r.organizacion_id,
            nombre: r.organizacion_nombre,
            tipo: r.organizacion_tipo,
            contacto_nombre: r.organizacion_contacto,
          }
        : null,
    }));

    const sorted = filterAndSortProjects(formatted, {
      categoria: cleanCategoria,
      cuposMin: quotaRange.min,
      cuposMax: quotaRange.max,
      ordenar: cleanSort,
    });

    await cacheService.set(cacheKey, sorted, 60);
    res.setHeader('X-Cache', 'MISS');
    res.setHeader('X-Cache-Backend', cacheService.getStats().backend);
    res.json(sorted);
  } catch (err: any) {
    console.error('Error fetching proyectos:', err);
    res.status(500).json({ error: 'Error al consultar proyectos' });
  }
});

// KIR-79 & KIR-80: Listado público exclusivo de proyectos aprobados y publicados
router.get('/proyectos/publicados', async (req: Request, res: Response) => {
  try {
    const { ubicacion, organizacion_id, q, categoria, cupos_min, cupos_max, ordenar } = req.query;
    const quotaRange = validateQuotaRange(cupos_min, cupos_max);
    if (!quotaRange.ok) {
      return res.status(400).json({ error: quotaRange.error });
    }

    const cleanCategoria = normalizeCategoryFilter(categoria);
    const cleanSort = normalizeSortOrder(ordenar, PROJECT_SORT_OPTIONS, 'recientes');
    const cacheKey = buildCacheKey('proyectos:publicados', {
      ubicacion,
      organizacion_id,
      q,
      categoria: cleanCategoria,
      cupos_min: quotaRange.min,
      cupos_max: quotaRange.max,
      ordenar: cleanSort,
    });

    const cached = await cacheService.get<any[]>(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('X-Cache-Backend', cacheService.getStats().backend);
      return res.json(cached);
    }

    let sql = `
      SELECT p.*, 
             o.nombre as organizacion_nombre, 
             o.tipo as organizacion_tipo,
             o.contacto_nombre as organizacion_contacto
      FROM proyectos p
      LEFT JOIN organizaciones o ON p.organizacion_id = o.id
      WHERE p.estado = 'aprobado' AND p.publicado = true
    `;
    const params: any[] = [];

    if (ubicacion) {
      params.push(`%${ubicacion}%`);
      sql += ` AND p.ubicacion ILIKE $${params.length}`;
    }

    if (organizacion_id) {
      params.push(organizacion_id);
      sql += ` AND p.organizacion_id = $${params.length}`;
    }

    if (cleanCategoria) {
      params.push(cleanCategoria);
      sql += ` AND LOWER(COALESCE(o.tipo, '')) = LOWER($${params.length})`;
    }

    if (quotaRange.min !== null) {
      params.push(quotaRange.min);
      sql += ` AND p.cupos_disponibles >= $${params.length}`;
    }

    if (quotaRange.max !== null) {
      params.push(quotaRange.max);
      sql += ` AND p.cupos_disponibles <= $${params.length}`;
    }

    if (q) {
      params.push(`%${q}%`);
      sql += ` AND (p.titulo ILIKE $${params.length} OR p.descripcion ILIKE $${params.length} OR p.ubicacion ILIKE $${params.length})`;
    }

    sql += ' ORDER BY p.fecha_publicacion DESC NULLS LAST, p.created_at DESC';

    const rows = await query(sql, params);

    const formatted = rows.map((r: any) => ({
      ...r,
      publicado: true,
      organizacion: r.organizacion_id
        ? {
            id: r.organizacion_id,
            nombre: r.organizacion_nombre,
            tipo: r.organizacion_tipo,
            contacto_nombre: r.organizacion_contacto,
          }
        : null,
    }));

    const sorted =
      cleanSort === 'recientes'
        ? formatted
        : filterAndSortProjects(formatted, {
            categoria: cleanCategoria,
            cuposMin: quotaRange.min,
            cuposMax: quotaRange.max,
            ordenar: cleanSort,
          });

    await cacheService.set(cacheKey, sorted, 60);
    res.setHeader('X-Cache', 'MISS');
    res.setHeader('X-Cache-Backend', cacheService.getStats().backend);
    res.json(sorted);
  } catch (err: any) {
    console.error('Error fetching published proyectos:', err);
    res.status(500).json({ error: 'Error al consultar proyectos publicados' });
  }
});

router.get('/proyectos/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const rows = await query(
      `SELECT p.*, 
              o.nombre as organizacion_nombre, 
              o.tipo as organizacion_tipo,
              o.contacto_nombre as organizacion_contacto,
              o.contacto_email as organizacion_email,
              o.contacto_telefono as organizacion_telefono
       FROM proyectos p
       LEFT JOIN organizaciones o ON p.organizacion_id = o.id
       WHERE p.id = $1`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }

    const r = rows[0];
    res.json({
      ...r,
      organizacion: r.organizacion_id
        ? {
            id: r.organizacion_id,
            nombre: r.organizacion_nombre,
            tipo: r.organizacion_tipo,
            contacto_nombre: r.organizacion_contacto,
            contacto_email: r.organizacion_email,
            contacto_telefono: r.organizacion_telefono,
          }
        : null,
    });
  } catch (err: any) {
    console.error('Error fetching project by id:', err);
    res.status(500).json({ error: 'Error al obtener proyecto' });
  }
});

// -------------------------------------------------------------
// PROPUESTAS DE PROYECTOS COMUNITARIOS (HISTORIA KIR-106: KIR-107, KIR-108, KIR-109, KIR-110)
// -------------------------------------------------------------
router.post('/proyectos', async (req: Request, res: Response) => {
  try {
    const {
      titulo,
      descripcion,
      ubicacion,
      cupos_disponibles,
      fecha_inicio,
      fecha_fin,
      es_mayor_edad,
      portada_url,
      organizacion_id,
      organizacion_nueva,
    } = req.body;

    // KIR-109: Validación de campos obligatorios
    if (!titulo || typeof titulo !== 'string' || titulo.trim().length < 5) {
      return res.status(400).json({ error: 'El título del proyecto es obligatorio y debe tener al menos 5 caracteres' });
    }

    if (!descripcion || typeof descripcion !== 'string' || descripcion.trim().length < 15) {
      return res.status(400).json({ error: 'La descripción del proyecto es obligatoria y debe tener al menos 15 caracteres' });
    }

    if (!ubicacion || typeof ubicacion !== 'string' || ubicacion.trim().length < 3) {
      return res.status(400).json({ error: 'La ubicación del proyecto es obligatoria (al menos 3 caracteres)' });
    }

    // Validación de cupos
    const parsedCupos = Number(cupos_disponibles);
    if (isNaN(parsedCupos) || parsedCupos <= 0 || !Number.isInteger(parsedCupos)) {
      return res.status(400).json({ error: 'El número de cupos disponibles debe ser un número entero mayor a 0' });
    }

    // Validación de organización (existente o nueva)
    const hasExistingOrg = Boolean(organizacion_id);
    const hasNewOrg = Boolean(organizacion_nueva && organizacion_nueva.nombre && organizacion_nueva.nombre.trim());

    if (!hasExistingOrg && !hasNewOrg) {
      return res.status(400).json({
        error: 'Debe vincular una organización aliada existente o registrar los datos de una nueva institución',
      });
    }

    // KIR-109: Validación de fechas de ejecución
    if (fecha_inicio && fecha_fin) {
      const dInicio = new Date(fecha_inicio);
      const dFin = new Date(fecha_fin);

      if (isNaN(dInicio.getTime()) || isNaN(dFin.getTime())) {
        return res.status(400).json({ error: 'Las fechas de ejecución deben ser válidas' });
      }

      if (dFin < dInicio) {
        return res.status(400).json({
          error: 'La fecha de finalización no puede ser anterior a la fecha de inicio del proyecto',
        });
      }
    }

    let resolvedOrgId = organizacion_id;

    // Si se envió una nueva organización para crear
    if (!resolvedOrgId && hasNewOrg) {
      const orgRows = await query(
        `INSERT INTO organizaciones (nombre, tipo, contacto_nombre, contacto_email, contacto_telefono)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          organizacion_nueva.nombre.trim(),
          organizacion_nueva.tipo || 'ONG',
          organizacion_nueva.contacto_nombre ? organizacion_nueva.contacto_nombre.trim() : null,
          organizacion_nueva.contacto_email ? organizacion_nueva.contacto_email.trim() : null,
          organizacion_nueva.contacto_telefono ? organizacion_nueva.contacto_telefono.trim() : null,
        ]
      );
      resolvedOrgId = orgRows[0].id;
    }

    // KIR-108: Registrar la propuesta obligatoriamente en estado 'pendiente_revision' y sin publicar
    const rows = await query(
      `INSERT INTO proyectos (
         organizacion_id, titulo, descripcion, ubicacion, 
         cupos_disponibles, fecha_inicio, fecha_fin, 
         es_mayor_edad, estado, publicado, fecha_publicacion, portada_url, motivo_rechazo, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, NULL, $10, NULL, NOW(), NOW())
       RETURNING *`,
      [
        resolvedOrgId || null,
        titulo.trim(),
        descripcion.trim(),
        ubicacion.trim(),
        parsedCupos,
        fecha_inicio || null,
        fecha_fin || null,
        es_mayor_edad !== undefined ? Boolean(es_mayor_edad) : true,
        'pendiente_revision',
        portada_url ? portada_url.trim() : null,
      ]
    );

    await cacheService.delByPrefix('proyectos:');
    await recordSystemLog({
      ...getActorMeta(req),
      action: 'PROJECT_PROPOSE',
      module: 'proyectos',
      status: 'success',
      details: `Propuesta registrada: ${rows[0].titulo} (ID ${rows[0].id})`,
    }).catch(() => {});

    res.status(201).json({
      message: 'Propuesta de proyecto comunitario registrada con éxito en estado pendiente de revisión',
      proyecto: rows[0],
    });
  } catch (err: any) {
    console.error('Error creating project proposal:', err);
    res.status(500).json({ error: 'Error al registrar propuesta de proyecto' });
  }
});


// Revisión de proyectos: aprobar o rechazar con motivo
router.patch('/proyectos/:id/revision', authenticate, requirePermission('projects.review'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { estado, motivo_rechazo } = req.body;

    if (!['aprobado', 'rechazado', 'pendiente_revision'].includes(estado)) {
      return res.status(400).json({ error: 'Estado de revisión inválido' });
    }

    if (estado === 'rechazado' && !motivo_rechazo) {
      return res.status(400).json({ error: 'Debe especificar el motivo de rechazo' });
    }

    const isApproved = estado === 'aprobado';
    const rows = await query(
      `UPDATE proyectos 
       SET estado = $1::varchar, 
           motivo_rechazo = $2::text,
           publicado = CASE WHEN $3::boolean THEN publicado ELSE false END,
           fecha_publicacion = CASE WHEN $3::boolean THEN fecha_publicacion ELSE NULL END,
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [estado, estado === 'rechazado' ? motivo_rechazo : null, isApproved, id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }

    await cacheService.delByPrefix('proyectos:');
    await recordSystemLog({
      ...getActorMeta(req),
      action: 'PROJECT_REVIEW',
      module: 'proyectos',
      status: 'success',
      details: `Proyecto ${id} marcado como ${estado}`,
    }).catch(() => {});

    res.json(rows[0]);
  } catch (err: any) {
    console.error('Error updating project status:', err);
    res.status(500).json({ error: 'Error al actualizar estado del proyecto' });
  }
});

// -------------------------------------------------------------
// PUBLICACIÓN Y VISIBILIDAD DE PROYECTOS APROBADOS (HISTORIA KIR-22: KIR-78, KIR-79, KIR-80, KIR-81)
// -------------------------------------------------------------
router.patch('/proyectos/:id/publicacion', authenticate, requirePermission('projects.review'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { publicado } = req.body;

    if (typeof publicado !== 'boolean') {
      return res.status(400).json({ error: 'El campo publicado (booleano) es obligatorio' });
    }

    const existingRows = await query<{ id: number; titulo: string; estado: string; publicado: boolean }>(
      'SELECT id, titulo, estado, publicado FROM proyectos WHERE id = $1',
      [id]
    );

    if (!existingRows.length) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }

    const existing = existingRows[0];

    if (publicado && existing.estado !== 'aprobado') {
      return res.status(400).json({
        error: `Solo los proyectos en estado aprobado pueden ser publicados. Estado actual: ${existing.estado}`,
      });
    }

    const rows = await query(
      `UPDATE proyectos
       SET publicado = $1::boolean,
           fecha_publicacion = CASE WHEN $1::boolean = true THEN COALESCE(fecha_publicacion, NOW()) ELSE NULL END,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [publicado, id]
    );

    await cacheService.delByPrefix('proyectos:');
    await recordSystemLog({
      ...getActorMeta(req),
      action: 'PROJECT_PUBLISH',
      module: 'proyectos',
      status: 'success',
      details: `Proyecto "${existing.titulo}" ${publicado ? 'publicado' : 'ocultado'}`,
    }).catch(() => {});

    res.json({
      message: publicado
        ? `Proyecto "${existing.titulo}" publicado con éxito en el catálogo de voluntarios.`
        : `Proyecto "${existing.titulo}" ocultado del catálogo público.`,
      proyecto: rows[0],
    });
  } catch (err: any) {
    console.error('Error updating project publication status:', err);
    res.status(500).json({ error: 'Error al actualizar estado de publicación del proyecto' });
  }
});

// -------------------------------------------------------------
// 3. POSTULACIONES Y EVALUACIÓN EN 5 ETAPAS
// -------------------------------------------------------------

// KIR-99: Validación previa a la postulación (Verificación de mayoría de edad)
router.post('/postulaciones/validar-edad', async (req: Request, res: Response) => {
  try {
    const { proyecto_id, fecha_nacimiento } = req.body;

    if (!proyecto_id || !fecha_nacimiento) {
      return res.status(400).json({ error: 'proyecto_id y fecha_nacimiento son obligatorios para validar' });
    }

    const proyRows = await query('SELECT id, titulo, es_mayor_edad, ubicacion FROM proyectos WHERE id = $1', [proyecto_id]);
    if (!proyRows.length) {
      return res.status(404).json({ error: 'El proyecto seleccionado no existe' });
    }

    const proyecto = proyRows[0];
    const edad = calculateAge(fecha_nacimiento);
    const esMayor = edad >= 18;
    const esElegible = !proyecto.es_mayor_edad || esMayor;

    res.json({
      proyecto_id: proyecto.id,
      proyecto_titulo: proyecto.titulo,
      es_mayor_edad_requerido: proyecto.es_mayor_edad,
      fecha_nacimiento,
      edad_calculada: edad,
      es_mayor_edad: esMayor,
      es_elegible: esElegible,
      mensaje: !esElegible
        ? `Este proyecto requiere ser mayor de edad (+18 años). Tu edad calculada es de ${edad} años.`
        : proyecto.es_mayor_edad
        ? `Cumples con el requisito de mayoría de edad (${edad} años).`
        : `Este proyecto no tiene restricción de mayoría de edad.`
    });
  } catch (err: any) {
    console.error('Error validating age before application:', err);
    res.status(500).json({ error: 'Error al validar mayoría de edad' });
  }
});

router.post('/postulaciones', async (req: Request, res: Response) => {
  try {
    const {
      nombres,
      apellidos,
      email,
      telefono,
      ci,
      fecha_nacimiento,
      profesion_ocupacion,
      habilidades,
      motivacion,
      proyecto_id,
      confirmacion_mayor_edad,
    } = req.body;

    if (!nombres || !apellidos || !email || !ci || !fecha_nacimiento || !proyecto_id) {
      return res.status(400).json({ error: 'Todos los campos obligatorios deben estar presentes' });
    }

    // 1. Obtener proyecto para verificar restricción de mayoría de edad
    const proyRows = await query('SELECT * FROM proyectos WHERE id = $1', [proyecto_id]);
    if (!proyRows.length) {
      return res.status(404).json({ error: 'Proyecto seleccionado no existe' });
    }
    const proyecto = proyRows[0];

    const edad = calculateAge(fecha_nacimiento);
    if (proyecto.es_mayor_edad && edad < 18) {
      return res.status(400).json({
        error: `Este proyecto requiere ser mayor de edad (+18 años). Edad calculada: ${edad} años.`,
        edad_calculada: edad,
        requerimiento_cumplido: false,
        es_mayor_edad_requerido: true,
      });
    }

    if (proyecto.es_mayor_edad && !confirmacion_mayor_edad) {
      return res.status(400).json({
        error: 'Debe aceptar la declaración obligatoria de mayoría de edad.',
        requiere_declaracion_jurada: true,
      });
    }

    // 2. Insertar o actualizar datos del postulante
    let postulanteId: string;
    const existingPostulante = await query(
      'SELECT id FROM postulantes WHERE ci = $1 OR email = $2 LIMIT 1',
      [ci, email]
    );

    if (existingPostulante.length > 0) {
      postulanteId = existingPostulante[0].id;
      await query(
        `UPDATE postulantes
         SET nombres = $1, apellidos = $2, email = $3, telefono = $4,
             fecha_nacimiento = $5, profesion_ocupacion = $6, habilidades = $7, motivacion = $8
         WHERE id = $9`,
        [
          nombres,
          apellidos,
          email,
          telefono || null,
          fecha_nacimiento,
          profesion_ocupacion || null,
          habilidades || null,
          motivacion || null,
          postulanteId,
        ]
      );
    } else {
      const newPostulante = await query(
        `INSERT INTO postulantes (
           nombres, apellidos, email, telefono, ci, 
           fecha_nacimiento, profesion_ocupacion, habilidades, motivacion
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          nombres,
          apellidos,
          email,
          telefono || null,
          ci,
          fecha_nacimiento,
          profesion_ocupacion || null,
          habilidades || null,
          motivacion || null,
        ]
      );
      postulanteId = newPostulante[0].id;
    }

    // 3. Verificar si ya existe postulación para este proyecto
    const existingApp = await query(
      'SELECT id FROM postulaciones WHERE postulante_id = $1 AND proyecto_id = $2 LIMIT 1',
      [postulanteId, proyecto_id]
    );

    let postulacionId: string;
    if (existingApp.length > 0) {
      postulacionId = existingApp[0].id;
      await query(
        `UPDATE postulaciones 
         SET estado_general = 'en_proceso', updated_at = NOW() 
         WHERE id = $1`,
        [postulacionId]
      );
    } else {
      const newApp = await query(
        `INSERT INTO postulaciones (postulante_id, proyecto_id, estado_general, es_reasignacion)
         VALUES ($1, $2, 'en_proceso', false)
         RETURNING id`,
        [postulanteId, proyecto_id]
      );
      postulacionId = newApp[0].id;
    }

    // 4. Inicializar automáticamente las 5 etapas de evaluación
    const etapas: Array<{ etapa: string; estado: string; evaluador: string; comentarios: string }> = [
      {
        etapa: 'inicial',
        estado: 'en_revision',
        evaluador: 'Comité de Admisiones Kirikú',
        comentarios: 'Recepción de postulación y verificación de requisitos básicos.',
      },
      {
        etapa: 'tecnica',
        estado: 'pendiente',
        evaluador: 'Socio Territorial / Coordinador de Proyecto',
        comentarios: 'Evaluación técnica y compatibilidad de habilidades específicas.',
      },
      {
        etapa: 'personal',
        estado: 'pendiente',
        evaluador: 'Psicología y Talento Kirikú',
        comentarios: 'Entrevista individual de motivación y disponibilidad horaria.',
      },
      {
        etapa: 'competencias',
        estado: 'pendiente',
        evaluador: 'Facilitador de Dinámica Grupal',
        comentarios: 'Taller de trabajo en equipo, resolución de conflictos y liderazgo social.',
      },
      {
        etapa: 'salud_fisica_psicologica',
        estado: 'pendiente',
        evaluador: 'Equipo Médico y Bienestar',
        comentarios: 'Certificación médica y validación de aptitud psicofísica para trabajo en campo.',
      },
    ];

    for (const e of etapas) {
      await query(
        `INSERT INTO evaluaciones_etapas (postulacion_id, etapa, estado, evaluador, comentarios, fecha_evaluacion)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (postulacion_id, etapa) DO NOTHING`,
        [postulacionId, e.etapa, e.estado, e.evaluador, e.comentarios]
      );
    }

    await Promise.all([
      cacheService.delByPrefix('postulantes:'),
      cacheService.delByPrefix('evaluaciones:'),
    ]);
    await recordSystemLog({
      ...getActorMeta(req),
      action: 'APPLICATION_CREATE',
      module: 'postulaciones',
      status: 'success',
      details: `Postulación KIR-${postulacionId} registrada para proyecto ${proyecto_id}`,
    }).catch(() => {});

    res.status(201).json({
      message: 'Postulación registrada con éxito',
      postulacion_id: postulacionId,
      postulante_id: postulanteId,
      edad_calculada: edad,
      etapas_creadas: etapas.length,
    });
  } catch (err: any) {
    console.error('Error creating postulacion:', err);
    res.status(500).json({ error: 'Error al procesar la postulación' });
  }
});

// -------------------------------------------------------------
// DEFINICIÓN DE ESTADOS Y AVANCE VISIBLE DEL PROCESO (KIR-29: KIR-50 & KIR-51)
// -------------------------------------------------------------
export const ETAPAS_PROCESO_DEFINICION = [
  {
    codigo: 'inicial',
    orden: 1,
    nombre: '1. Etapa Inicial',
    descripcion: 'Recepción y verificación de CI, mayoría de edad y requisitos formales.',
  },
  {
    codigo: 'tecnica',
    orden: 2,
    nombre: '2. Evaluación Técnica',
    descripcion: 'Validación por el socio territorial de capacidades y perfil de voluntariado.',
  },
  {
    codigo: 'personal',
    orden: 3,
    nombre: '3. Entrevista Personal',
    descripcion: 'Entrevista individual de motivación, compromiso y disponibilidad horaria.',
  },
  {
    codigo: 'competencias',
    orden: 4,
    nombre: '4. Evaluación de Competencias',
    descripcion: 'Taller de dinámica grupal, resolución de dilemas éticos y trabajo en equipo.',
  },
  {
    codigo: 'salud_fisica_psicologica',
    orden: 5,
    nombre: '5. Salud Física y Psicológica',
    descripcion: 'Dictamen de aptitud física y bienestar psicológico para actividades comunitarias.',
  },
] as const;

export function normalizeEtapaEstado(estado: unknown): 'pendiente' | 'en_revision' | 'aprobado' | 'observado' | 'rechazado' {
  if (!estado) return 'pendiente';
  const norm = String(estado).trim().toLowerCase();
  if (norm === 'aprobada' || norm === 'aprobado') return 'aprobado';
  if (norm === 'rechazada' || norm === 'rechazado') return 'rechazado';
  if (norm === 'observada' || norm === 'observado') return 'observado';
  if (norm === 'en revision' || norm === 'en revisión' || norm === 'en_revisión' || norm === 'en_revision' || norm === 'en_curso') {
    return 'en_revision';
  }
  return 'pendiente';
}

export function enrichStagesForTracking(rawEtapas: any[]) {
  const byCode = new Map<string, any>();
  for (const e of rawEtapas || []) {
    byCode.set(String(e.etapa), e);
  }

  return ETAPAS_PROCESO_DEFINICION.map((def) => {
    const found = byCode.get(def.codigo);
    const normalizedEstado = normalizeEtapaEstado(found?.estado);
    return {
      id: found?.id ?? `virtual-${def.codigo}`,
      postulacion_id: found?.postulacion_id ?? null,
      etapa: def.codigo,
      estado: normalizedEstado,
      evaluador: found?.evaluador ?? null,
      comentarios: found?.comentarios ?? null,
      fecha_evaluacion: found?.fecha_evaluacion ?? null,
      orden: def.orden,
      titulo_etapa: def.nombre,
      descripcion_etapa: def.descripcion,
    };
  });
}

export function buildProcessProgress(
  estadoGeneral: string,
  rawEtapas: any[],
  updatedAt?: string | Date | null
) {
  const etapas = enrichStagesForTracking(rawEtapas);
  const total = ETAPAS_PROCESO_DEFINICION.length;

  let aprobadas = 0;
  let enRevision = 0;
  let observadas = 0;
  let rechazadas = 0;
  let pendientes = 0;

  let latestTimestamp: number = updatedAt ? new Date(updatedAt).getTime() : 0;
  if (isNaN(latestTimestamp)) latestTimestamp = 0;

  for (const e of etapas) {
    if (e.estado === 'aprobado') aprobadas++;
    else if (e.estado === 'en_revision') enRevision++;
    else if (e.estado === 'observado') observadas++;
    else if (e.estado === 'rechazado') rechazadas++;
    else pendientes++;

    if (e.fecha_evaluacion) {
      const ts = new Date(e.fecha_evaluacion).getTime();
      if (!isNaN(ts) && ts > latestTimestamp) {
        latestTimestamp = ts;
      }
    }
  }

  const porcentaje = Math.round((aprobadas / total) * 100);

  // Determinar etapa actual prioritaria para mostrar al postulante
  const activeStage =
    etapas.find((e) => e.estado === 'rechazado') ||
    etapas.find((e) => e.estado === 'observado') ||
    etapas.find((e) => e.estado === 'en_revision') ||
    (aprobadas === total ? etapas[total - 1] : etapas.find((e) => e.estado === 'pendiente')) ||
    etapas[0];

  const etapaActual = activeStage
    ? {
        codigo: activeStage.etapa,
        nombre: activeStage.titulo_etapa,
        orden: activeStage.orden,
        estado: activeStage.estado,
        evaluador: activeStage.evaluador,
        comentarios: activeStage.comentarios,
        fecha_evaluacion: activeStage.fecha_evaluacion,
      }
    : null;

  const generalNorm = String(estadoGeneral || 'en_proceso').trim().toLowerCase();
  const isRejected = generalNorm === 'rechazado' || rechazadas > 0;
  const isApproved = !isRejected && (generalNorm === 'aprobado' || aprobadas === total);
  const isObserved = !isRejected && !isApproved && observadas > 0;
  const isReasignacion = !isRejected && !isApproved && (generalNorm === 'reasignacion' || generalNorm === 'reenganche');

  let estado_visible: {
    codigo: 'en_proceso' | 'observado' | 'aprobado' | 'rechazado' | 'reasignacion';
    etiqueta: string;
    descripcion: string;
    severidad: 'info' | 'success' | 'warning' | 'danger';
  };
  let siguiente_paso = '';

  if (isRejected) {
    estado_visible = {
      codigo: 'rechazado',
      etiqueta: 'No Seleccionado',
      descripcion: 'El proceso de evaluación concluyó sin aprobación en una de las etapas.',
      severidad: 'danger',
    };
    siguiente_paso = etapaActual?.comentarios
      ? `Revisa el detalle en ${etapaActual.nombre}: "${etapaActual.comentarios}". Puedes postular a otros proyectos compatibles.`
      : 'Puedes explorar otras iniciativas disponibles en el catálogo de proyectos.';
  } else if (isApproved) {
    estado_visible = {
      codigo: 'aprobado',
      etiqueta: 'Postulación Aprobada',
      descripcion: 'Has completado y aprobado satisfactoriamente las 5 etapas de selección.',
      severidad: 'success',
    };
    siguiente_paso =
      '¡Felicidades! Completaste el 100% de las etapas. El coordinador del proyecto se comunicará contigo para la inducción.';
  } else if (isObserved) {
    estado_visible = {
      codigo: 'observado',
      etiqueta: 'Con Observaciones',
      descripcion: 'Una etapa requiere tu atención o subsanación antes de continuar al siguiente nivel.',
      severidad: 'warning',
    };
    siguiente_paso = etapaActual
      ? `Revisa la observación en ${etapaActual.nombre}${etapaActual.comentarios ? `: "${etapaActual.comentarios}"` : '.'}`
      : 'Revisa las observaciones registradas por el equipo evaluador.';
  } else if (isReasignacion) {
    estado_visible = {
      codigo: 'reasignacion',
      etiqueta: 'En Reasignación',
      descripcion: 'Tu perfil está siendo evaluado para reasignación a un proyecto con cupos disponibles.',
      severidad: 'info',
    };
    siguiente_paso = 'El equipo de coordinación confirmará pronto la nueva asignación de proyecto.';
  } else {
    estado_visible = {
      codigo: 'en_proceso',
      etiqueta: 'En Proceso de Evaluación',
      descripcion: 'Tu postulación avanza activamente a través de las 5 etapas de selección.',
      severidad: 'info',
    };
    if (etapaActual) {
      const evalRef = etapaActual.evaluador ? ` a cargo de ${etapaActual.evaluador}` : '';
      siguiente_paso = `Actualmente en ${etapaActual.nombre}${evalRef}. Vuelve a consultar periódicamente para ver actualizaciones.`;
    } else {
      siguiente_paso = 'Tu postulación se encuentra registrada en espera de revisión.';
    }
  }

  return {
    porcentaje,
    etapas_totales: total,
    etapas_aprobadas: aprobadas,
    etapas_en_revision: enRevision,
    etapas_observadas: observadas,
    etapas_rechazadas: rechazadas,
    etapas_pendientes: pendientes,
    estado_visible,
    etapa_actual: etapaActual,
    siguiente_paso,
    requiere_atencion: isObserved || isRejected,
    ultima_actualizacion: latestTimestamp > 0 ? new Date(latestTimestamp).toISOString() : null,
  };
}

// KIR-51: Seguimiento del Postulante en tiempo real (por CI, Correo, Nombre o Código KIR-ID)
router.get('/postulaciones/tracking', async (req: Request, res: Response) => {
  try {
    const { busqueda, estado, avance_min, avance_max, ordenar } = req.query;
    if (!busqueda || typeof busqueda !== 'string' || !busqueda.trim()) {
      return res.status(400).json({ error: 'Ingrese su CI, Correo Electrónico o Código de Seguimiento para consultar' });
    }

    const scoreRange = validateScoreRange(avance_min, avance_max, 100);
    if (!scoreRange.ok) {
      return res.status(400).json({ error: scoreRange.error });
    }
    const cleanEstado = normalizeCategoryFilter(estado).toLowerCase();
    const cleanSort = normalizeSortOrder(ordenar, ['recientes', 'avance_desc', 'avance_asc', 'titulo_asc'] as const, 'recientes');

    const term = busqueda.trim();
    const codeMatch = term.match(/^(?:KIR-?|#)?(\d+)$/i);
    const trackingId = codeMatch ? parseInt(codeMatch[1], 10) : null;

    const postRows = await query(
      `SELECT p.*,
              app.id as postulacion_id,
              app.proyecto_id,
              app.estado_general,
              app.es_reasignacion,
              app.created_at as fecha_postulacion,
              app.updated_at as fecha_actualizacion,
              proy.titulo as proyecto_titulo,
              proy.ubicacion as proyecto_ubicacion,
              proy.portada_url as proyecto_portada,
              org.nombre as organizacion_nombre
       FROM postulantes p
       JOIN postulaciones app ON app.postulante_id = p.id
       JOIN proyectos proy ON app.proyecto_id = proy.id
       LEFT JOIN organizaciones org ON proy.organizacion_id = org.id
       WHERE LOWER(TRIM(p.ci)) = LOWER(TRIM($1))
          OR LOWER(REPLACE(REPLACE(p.ci, ' ', ''), '-', '')) = LOWER(REPLACE(REPLACE($1, ' ', ''), '-', ''))
          OR LOWER(p.ci) LIKE LOWER($2)
          OR LOWER(p.email) = LOWER(TRIM($1))
          OR LOWER(p.email) LIKE LOWER($2)
          OR LOWER(p.nombres || ' ' || p.apellidos) LIKE LOWER($2)
          OR ($3::int IS NOT NULL AND app.id = $3::int)
       ORDER BY app.created_at DESC`,
      [term, `%${term}%`, trackingId]
    );

    if (!postRows.length) {
      return res.json([]);
    }

    // Para cada postulación, obtener sus 5 etapas de evaluación y calcular avance visible
    const results = [];
    for (const row of postRows) {
      const rawEtapas = await query(
        `SELECT * FROM evaluaciones_etapas 
         WHERE postulacion_id = $1 
         ORDER BY 
           CASE etapa
             WHEN 'inicial' THEN 1
             WHEN 'tecnica' THEN 2
             WHEN 'personal' THEN 3
             WHEN 'competencias' THEN 4
             WHEN 'salud_fisica_psicologica' THEN 5
             ELSE 6
           END ASC`,
        [row.postulacion_id]
      );

      const etapas = enrichStagesForTracking(rawEtapas);
      const avance = buildProcessProgress(row.estado_general, rawEtapas, row.fecha_actualizacion);

      results.push({
        postulante: {
          id: row.id,
          nombres: row.nombres,
          apellidos: row.apellidos,
          email: row.email,
          ci: row.ci,
          telefono: row.telefono,
          profesion_ocupacion: row.profesion_ocupacion,
        },
        postulacion: {
          id: row.postulacion_id,
          codigo_seguimiento: `KIR-${row.postulacion_id}`,
          estado_general: row.estado_general,
          es_reasignacion: row.es_reasignacion,
          es_reenganche: row.es_reasignacion,
          created_at: row.fecha_postulacion,
          updated_at: row.fecha_actualizacion,
          proyecto: {
            id: row.proyecto_id,
            titulo: row.proyecto_titulo,
            ubicacion: row.proyecto_ubicacion,
            portada_url: row.proyecto_portada,
            organizacion_nombre: row.organizacion_nombre,
          },
          etapas,
        },
        avance,
      });
    }

    let filteredResults = results.filter((item) => {
      if (cleanEstado && item.avance.estado_visible.codigo !== cleanEstado && item.postulacion.estado_general !== cleanEstado) {
        return false;
      }
      if (scoreRange.min !== null && item.avance.porcentaje < scoreRange.min) return false;
      if (scoreRange.max !== null && item.avance.porcentaje > scoreRange.max) return false;
      return true;
    });

    if (cleanSort === 'avance_desc') {
      filteredResults.sort((a, b) => b.avance.porcentaje - a.avance.porcentaje);
    } else if (cleanSort === 'avance_asc') {
      filteredResults.sort((a, b) => a.avance.porcentaje - b.avance.porcentaje);
    } else if (cleanSort === 'titulo_asc') {
      filteredResults.sort((a, b) => a.postulacion.proyecto.titulo.localeCompare(b.postulacion.proyecto.titulo, 'es'));
    }

    res.json(filteredResults);
  } catch (err: any) {
    console.error('Error tracking postulant:', err);
    res.status(500).json({ error: 'Error al consultar seguimiento de postulación' });
  }
});

// KIR-51 & KIR-53: Consulta periódica puntual del estado y avance por ID de postulación
router.get('/postulaciones/:id/estado', async (req: Request, res: Response) => {
  try {
    const rawId = String(req.params.id || '').replace(/^KIR-?/i, '').trim();
    if (!/^\d+$/.test(rawId)) {
      return res.status(400).json({ error: 'El identificador de postulación debe ser numérico' });
    }
    const postulacionId = parseInt(rawId, 10);

    const rows = await query(
      `SELECT p.*,
              app.id as postulacion_id,
              app.proyecto_id,
              app.estado_general,
              app.es_reasignacion,
              app.created_at as fecha_postulacion,
              app.updated_at as fecha_actualizacion,
              proy.titulo as proyecto_titulo,
              proy.ubicacion as proyecto_ubicacion,
              proy.portada_url as proyecto_portada,
              org.nombre as organizacion_nombre
       FROM postulaciones app
       JOIN postulantes p ON app.postulante_id = p.id
       JOIN proyectos proy ON app.proyecto_id = proy.id
       LEFT JOIN organizaciones org ON proy.organizacion_id = org.id
       WHERE app.id = $1
       LIMIT 1`,
      [postulacionId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Postulación no encontrada' });
    }

    const row = rows[0];
    const rawEtapas = await query(
      `SELECT * FROM evaluaciones_etapas
       WHERE postulacion_id = $1
       ORDER BY
         CASE etapa
           WHEN 'inicial' THEN 1
           WHEN 'tecnica' THEN 2
           WHEN 'personal' THEN 3
           WHEN 'competencias' THEN 4
           WHEN 'salud_fisica_psicologica' THEN 5
           ELSE 6
         END ASC`,
      [row.postulacion_id]
    );

    const etapas = enrichStagesForTracking(rawEtapas);
    const avance = buildProcessProgress(row.estado_general, rawEtapas, row.fecha_actualizacion);

    res.json({
      postulante: {
        id: row.id,
        nombres: row.nombres,
        apellidos: row.apellidos,
        email: row.email,
        ci: row.ci,
        telefono: row.telefono,
        profesion_ocupacion: row.profesion_ocupacion,
      },
      postulacion: {
        id: row.postulacion_id,
        codigo_seguimiento: `KIR-${row.postulacion_id}`,
        estado_general: row.estado_general,
        es_reasignacion: row.es_reasignacion,
        es_reenganche: row.es_reasignacion,
        created_at: row.fecha_postulacion,
        updated_at: row.fecha_actualizacion,
        proyecto: {
          id: row.proyecto_id,
          titulo: row.proyecto_titulo,
          ubicacion: row.proyecto_ubicacion,
          portada_url: row.proyecto_portada,
          organizacion_nombre: row.organizacion_nombre,
        },
        etapas,
      },
      avance,
    });
  } catch (err: any) {
    console.error('Error fetching application status by ID:', err);
    res.status(500).json({ error: 'Error al consultar el estado de la postulación' });
  }
});

// Banco de Postulantes & Lista de postulaciones para Administradores
router.get('/postulaciones', authenticate, requirePermission('applications.read'), async (req: Request, res: Response) => {
  try {
    const { estado, proyecto_id, reasignacion, reenganche, q, avance_min, avance_max, ordenar } = req.query;
    const scoreRange = validateScoreRange(avance_min, avance_max, 100);
    if (!scoreRange.ok) {
      return res.status(400).json({ error: scoreRange.error });
    }
    const cleanSort = normalizeSortOrder(ordenar, ['recientes', 'avance_desc', 'avance_asc', 'nombre_asc'] as const, 'recientes');

    let sql = `
      SELECT app.id as postulacion_id,
             app.estado_general,
             app.es_reasignacion,
             app.created_at as postulacion_fecha,
             app.updated_at,
             p.id as postulante_id,
             p.nombres,
             p.apellidos,
             p.email,
             p.telefono,
             p.ci,
             p.fecha_nacimiento,
             p.profesion_ocupacion,
             p.habilidades,
             p.motivacion,
             proy.id as proyecto_id,
             proy.titulo as proyecto_titulo,
             proy.ubicacion as proyecto_ubicacion,
             proy.cupos_disponibles,
             org.nombre as organizacion_nombre
      FROM postulaciones app
      JOIN postulantes p ON app.postulante_id = p.id
      JOIN proyectos proy ON app.proyecto_id = proy.id
      LEFT JOIN organizaciones org ON proy.organizacion_id = org.id
      WHERE 1=1
    `;

    const params: any[] = [];

    if (estado) {
      params.push(estado);
      sql += ` AND app.estado_general = $${params.length}`;
    }

    if (proyecto_id) {
      params.push(proyecto_id);
      sql += ` AND app.proyecto_id = $${params.length}`;
    }

    if (reasignacion === 'true' || reenganche === 'true') {
      sql += ' AND app.es_reasignacion = true';
    }

    if (q) {
      params.push(`%${q}%`);
      sql += ` AND (
        p.nombres ILIKE $${params.length} OR 
        p.apellidos ILIKE $${params.length} OR 
        p.ci ILIKE $${params.length} OR 
        p.profesion_ocupacion ILIKE $${params.length} OR 
        p.habilidades ILIKE $${params.length}
      )`;
    }

    sql += ' ORDER BY app.created_at DESC';

    const rows = await query(sql, params);

    // Fetch all evaluation stages for returned applications
    const appsWithEtapas = await Promise.all(
      rows.map(async (row: any) => {
        const etapas = await query(
          `SELECT * FROM evaluaciones_etapas 
           WHERE postulacion_id = $1 
           ORDER BY 
             CASE etapa
               WHEN 'inicial' THEN 1
               WHEN 'tecnica' THEN 2
               WHEN 'personal' THEN 3
               WHEN 'competencias' THEN 4
               WHEN 'salud_fisica_psicologica' THEN 5
               ELSE 6
             END ASC`,
          [row.postulacion_id]
        );

        const etapasAprobadas = etapas.filter((e: any) => e.estado === 'aprobado').length;
        const porcentajeAvance = Math.round((etapasAprobadas / 5) * 100);

        return {
          id: row.postulacion_id,
          estado_general: row.estado_general,
          es_reasignacion: row.es_reasignacion,
          es_reenganche: row.es_reasignacion,
          created_at: row.postulacion_fecha,
          updated_at: row.updated_at,
          etapas_aprobadas: etapasAprobadas,
          porcentaje_avance: porcentajeAvance,
          postulante: {
            id: row.postulante_id,
            nombres: row.nombres,
            apellidos: row.apellidos,
            email: row.email,
            telefono: row.telefono,
            ci: row.ci,
            fecha_nacimiento: row.fecha_nacimiento,
            profesion_ocupacion: row.profesion_ocupacion,
            habilidades: row.habilidades,
            motivacion: row.motivacion,
          },
          proyecto: {
            id: row.proyecto_id,
            titulo: row.proyecto_titulo,
            ubicacion: row.proyecto_ubicacion,
            cupos_disponibles: row.cupos_disponibles,
            organizacion_nombre: row.organizacion_nombre,
          },
          etapas,
        };
      })
    );

    const filteredApps = appsWithEtapas.filter((app) => {
      if (scoreRange.min !== null && app.porcentaje_avance < scoreRange.min) return false;
      if (scoreRange.max !== null && app.porcentaje_avance > scoreRange.max) return false;
      return true;
    });

    if (cleanSort === 'avance_desc') {
      filteredApps.sort((a, b) => b.porcentaje_avance - a.porcentaje_avance);
    } else if (cleanSort === 'avance_asc') {
      filteredApps.sort((a, b) => a.porcentaje_avance - b.porcentaje_avance);
    } else if (cleanSort === 'nombre_asc') {
      filteredApps.sort((a, b) =>
        `${a.postulante.nombres} ${a.postulante.apellidos}`.localeCompare(
          `${b.postulante.nombres} ${b.postulante.apellidos}`,
          'es'
        )
      );
    }

    res.json(filteredApps);
  } catch (err: any) {
    console.error('Error fetching admin applications:', err);
    res.status(500).json({ error: 'Error al consultar postulaciones de administración' });
  }
});

// -------------------------------------------------------------
// BANCO DE POSTULANTES POR PERFIL (HISTORIA KIR-18: KIR-94, KIR-95, KIR-96, KIR-97)
// -------------------------------------------------------------

// KIR-96: Métricas y resumen del banco de postulantes
router.get('/postulantes/metricas/resumen', async (_req: Request, res: Response) => {
  try {
    const totalRow = await query<{ count: string }>('SELECT COUNT(*) as count FROM postulantes');
    const totalPostulantes = parseInt(totalRow[0]?.count || '0', 10);

    const statsRow = await query<{
      en_proceso: string;
      aprobado: string;
      rechazado: string;
      reasignacion: string;
    }>(`
      SELECT 
        COUNT(CASE WHEN app.estado_general = 'en_proceso' THEN 1 END) as en_proceso,
        COUNT(CASE WHEN app.estado_general = 'aprobado' THEN 1 END) as aprobado,
        COUNT(CASE WHEN app.estado_general = 'rechazado' THEN 1 END) as rechazado,
        COUNT(CASE WHEN app.es_reasignacion = true THEN 1 END) as reasignacion
      FROM postulaciones app
    `);

    // Profesiones únicas para filtrado dinámico
    const profRows = await query<{ profesion: string }>(`
      SELECT DISTINCT TRIM(profesion_ocupacion) as profesion 
      FROM postulantes 
      WHERE profesion_ocupacion IS NOT NULL AND TRIM(profesion_ocupacion) <> ''
      ORDER BY profesion ASC
    `);

    // Promedio de avance general en etapas
    const avanceRow = await query<{ promedio: string }>(`
      SELECT AVG(etapas_aprobadas.total * 20.0) as promedio
      FROM (
        SELECT postulacion_id, COUNT(CASE WHEN estado = 'aprobado' THEN 1 END) as total
        FROM evaluaciones_etapas
        GROUP BY postulacion_id
      ) etapas_aprobadas
    `);

    const promedioAvance = Math.round(parseFloat(avanceRow[0]?.promedio || '0'));

    res.json({
      totalPostulantes,
      enProceso: parseInt(statsRow[0]?.en_proceso || '0', 10),
      aprobados: parseInt(statsRow[0]?.aprobado || '0', 10),
      rechazados: parseInt(statsRow[0]?.rechazado || '0', 10),
      reasignaciones: parseInt(statsRow[0]?.reasignacion || '0', 10),
      promedioAvance,
      profesiones: profRows.map((r) => r.profesion),
    });
  } catch (err: any) {
    console.error('Error fetching postulantes metrics:', err);
    res.status(500).json({ error: 'Error al consultar métricas del banco de postulantes' });
  }
});

// KIR-94 & KIR-95: Consulta, filtros avanzados y avance parcial del banco de postulantes
router.get('/postulantes', async (req: Request, res: Response) => {
  try {
    const { q, profesion, categoria, estado, proyecto_id, ordenar, avance_min, avance_max } = req.query;
    const scoreRange = validateScoreRange(avance_min, avance_max, 100);
    if (!scoreRange.ok) {
      return res.status(400).json({ error: scoreRange.error });
    }

    const cleanProfession = normalizeCategoryFilter(profesion || categoria);
    const cleanEstado = normalizeCategoryFilter(estado);
    const cleanSort = normalizeSortOrder(ordenar, ['recientes', 'nombre_asc', 'avance_desc', 'avance_asc'] as const, 'recientes');
    const cacheKey = buildCacheKey('postulantes:list', {
      q,
      profesion: cleanProfession,
      estado: cleanEstado,
      proyecto_id,
      ordenar: cleanSort,
      avance_min: scoreRange.min,
      avance_max: scoreRange.max,
    });

    const cached = await cacheService.get<any[]>(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('X-Cache-Backend', cacheService.getStats().backend);
      return res.json(cached);
    }

    let sql = `
      SELECT p.*,
             app.id as postulacion_id,
             app.estado_general,
             app.es_reasignacion,
             app.created_at as fecha_postulacion,
             app.updated_at as fecha_actualizacion_postulacion,
             proy.id as proyecto_id,
             proy.titulo as proyecto_titulo,
             proy.ubicacion as proyecto_ubicacion,
             org.nombre as organizacion_nombre,
             (SELECT COUNT(*) FROM postulaciones WHERE postulante_id = p.id) as total_postulaciones
      FROM postulantes p
      LEFT JOIN LATERAL (
        SELECT * FROM postulaciones 
        WHERE postulante_id = p.id 
        ORDER BY created_at DESC 
        LIMIT 1
      ) app ON true
      LEFT JOIN proyectos proy ON app.proyecto_id = proy.id
      LEFT JOIN organizaciones org ON proy.organizacion_id = org.id
      WHERE 1=1
    `;
    const params: any[] = [];

    // Filtro de búsqueda general
    if (q && typeof q === 'string' && q.trim()) {
      params.push(`%${q.trim()}%`);
      sql += ` AND (
        p.nombres ILIKE $${params.length} OR 
        p.apellidos ILIKE $${params.length} OR 
        p.ci ILIKE $${params.length} OR 
        p.email ILIKE $${params.length} OR 
        p.profesion_ocupacion ILIKE $${params.length} OR 
        p.habilidades ILIKE $${params.length}
      )`;
    }

    // Filtro por profesión / ocupación (categoría de perfil)
    if (cleanProfession) {
      params.push(`%${cleanProfession}%`);
      sql += ` AND p.profesion_ocupacion ILIKE $${params.length}`;
    }

    // Filtro por estado de postulación
    if (cleanEstado) {
      if (cleanEstado === 'sin_postulacion') {
        sql += ` AND app.id IS NULL`;
      } else if (cleanEstado === 'reasignacion') {
        sql += ` AND app.es_reasignacion = true`;
      } else {
        params.push(cleanEstado);
        sql += ` AND app.estado_general = $${params.length}`;
      }
    }

    // Filtro por proyecto
    if (proyecto_id) {
      params.push(proyecto_id);
      sql += ` AND app.proyecto_id = $${params.length}`;
    }

    // Ordenamiento
    if (ordenar === 'nombre_asc') {
      sql += ' ORDER BY p.nombres ASC, p.apellidos ASC';
    } else {
      sql += ' ORDER BY p.created_at DESC';
    }

    const rows = await query<any>(sql, params);

    // Obtener las etapas de evaluación para cada postulante con postulación activa
    const postulacionesIds = rows.map((r: any) => r.postulacion_id).filter(Boolean);
    let allEtapas: any[] = [];
    if (postulacionesIds.length > 0) {
      allEtapas = await query<any>(
        `SELECT id, postulacion_id, etapa, estado, evaluador, comentarios, fecha_evaluacion
         FROM evaluaciones_etapas
         WHERE postulacion_id = ANY($1::int[])
         ORDER BY 
           CASE etapa
             WHEN 'inicial' THEN 1
             WHEN 'tecnica' THEN 2
             WHEN 'personal' THEN 3
             WHEN 'competencias' THEN 4
             WHEN 'salud_fisica_psicologica' THEN 5
             ELSE 6
           END ASC`,
        [postulacionesIds]
      );
    }

    // Agrupar etapas por postulacion_id
    const etapasPorPostulacion = new Map<number, any[]>();
    for (const etapa of allEtapas) {
      const pid = Number(etapa.postulacion_id);
      if (!etapasPorPostulacion.has(pid)) {
        etapasPorPostulacion.set(pid, []);
      }
      etapasPorPostulacion.get(pid)!.push(etapa);
    }

    // Estructurar el perfil completo con cálculo de avance parcial
    let formatted = rows.map((r: any) => {
      const edad = calculateAge(r.fecha_nacimiento);
      const pid = r.postulacion_id ? Number(r.postulacion_id) : null;
      const etapas = pid ? etapasPorPostulacion.get(pid) || [] : [];
      const etapasAprobadas = etapas.filter((e: any) => e.estado === 'aprobado').length;
      const porcentajeAvance = etapas.length > 0 ? Math.round((etapasAprobadas / 5) * 100) : 0;

      return {
        id: r.id,
        ci: r.ci,
        nombres: r.nombres,
        apellidos: r.apellidos,
        email: r.email,
        telefono: r.telefono,
        fecha_nacimiento: r.fecha_nacimiento,
        edad,
        es_mayor_edad: edad >= 18,
        profesion_ocupacion: r.profesion_ocupacion,
        habilidades: r.habilidades,
        motivacion: r.motivacion,
        created_at: r.created_at,
        total_postulaciones: parseInt(r.total_postulaciones || '0', 10),
        ultima_postulacion: r.fecha_postulacion,
        postulacion_id: r.postulacion_id,
        proyecto_id: r.proyecto_id,
        proyecto_titulo: r.proyecto_titulo,
        proyecto_ubicacion: r.proyecto_ubicacion,
        organizacion_nombre: r.organizacion_nombre,
        estado_general: r.estado_general || 'sin_postulacion',
        es_reasignacion: Boolean(r.es_reasignacion),
        etapas_totales: 5,
        etapas_aprobadas: etapasAprobadas,
        porcentaje_avance: porcentajeAvance,
        etapas,
      };
    });

    // Filtrar por rango de avance si fue solicitado
    if (scoreRange.min !== null || scoreRange.max !== null) {
      formatted = formatted.filter((item) => {
        if (scoreRange.min !== null && item.porcentaje_avance < scoreRange.min) return false;
        if (scoreRange.max !== null && item.porcentaje_avance > scoreRange.max) return false;
        return true;
      });
    }

    // Ordenamiento por avance si fue solicitado
    if (cleanSort === 'avance_desc') {
      formatted.sort((a, b) => b.porcentaje_avance - a.porcentaje_avance);
    } else if (cleanSort === 'avance_asc') {
      formatted.sort((a, b) => a.porcentaje_avance - b.porcentaje_avance);
    }

    await cacheService.set(cacheKey, formatted, 45);
    res.setHeader('X-Cache', 'MISS');
    res.setHeader('X-Cache-Backend', cacheService.getStats().backend);
    res.json(formatted);
  } catch (err: any) {
    console.error('Error fetching postulantes pool:', err);
    res.status(500).json({ error: 'Error al consultar banco de postulantes' });
  }
});

// KIR-96: Detalle de perfil completo y avance parcial de un postulante
router.get('/postulantes/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const postRows = await query<any>('SELECT * FROM postulantes WHERE id = $1', [id]);
    if (!postRows.length) {
      return res.status(404).json({ error: 'Postulante no encontrado' });
    }
    const postulante = postRows[0];
    const edad = calculateAge(postulante.fecha_nacimiento);

    // Obtener historial completo de postulaciones
    const appRows = await query<any>(
      `SELECT app.*, 
              proy.titulo as proyecto_titulo, 
              proy.ubicacion as proyecto_ubicacion,
              proy.cupos_disponibles,
              proy.portada_url as proyecto_portada,
              org.nombre as organizacion_nombre
       FROM postulaciones app
       JOIN proyectos proy ON app.proyecto_id = proy.id
       LEFT JOIN organizaciones org ON proy.organizacion_id = org.id
       WHERE app.postulante_id = $1
       ORDER BY app.created_at DESC`,
      [id]
    );

    // Obtener etapas para cada postulación
    const aplicacionesConEtapas = await Promise.all(
      appRows.map(async (app: any) => {
        const etapas = await query<any>(
          `SELECT * FROM evaluaciones_etapas 
           WHERE postulacion_id = $1 
           ORDER BY 
             CASE etapa
               WHEN 'inicial' THEN 1
               WHEN 'tecnica' THEN 2
               WHEN 'personal' THEN 3
               WHEN 'competencias' THEN 4
               WHEN 'salud_fisica_psicologica' THEN 5
               ELSE 6
             END ASC`,
          [app.id]
        );
        const aprobadas = etapas.filter((e: any) => e.estado === 'aprobado').length;
        return {
          ...app,
          etapas_totales: 5,
          etapas_aprobadas: aprobadas,
          porcentaje_avance: Math.round((aprobadas / 5) * 100),
          etapas,
        };
      })
    );

    res.json({
      ...postulante,
      edad,
      es_mayor_edad: edad >= 18,
      postulaciones: aplicacionesConEtapas,
      total_postulaciones: aplicacionesConEtapas.length,
      postulacion_activa: aplicacionesConEtapas[0] || null,
    });
  } catch (err: any) {
    console.error('Error fetching postulante profile:', err);
    res.status(500).json({ error: 'Error al consultar perfil del postulante' });
  }
});


// -------------------------------------------------------------
// EVALUACIÓN INICIAL DE POSTULACIONES (HISTORIA KIR-24: KIR-70, KIR-71, KIR-72, KIR-73)
// -------------------------------------------------------------

// KIR-71: Métricas de la etapa inicial
router.get('/evaluaciones/inicial/metricas', async (_req: Request, res: Response) => {
  try {
    const stats = await query<{
      total: string;
      pendientes: string;
      aprobados: string;
      observados: string;
      rechazados: string;
    }>(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN estado IN ('pendiente', 'en_revision', 'en revision') THEN 1 END) as pendientes,
        COUNT(CASE WHEN estado = 'aprobado' THEN 1 END) as aprobados,
        COUNT(CASE WHEN estado = 'observado' THEN 1 END) as observados,
        COUNT(CASE WHEN estado = 'rechazado' THEN 1 END) as rechazados
      FROM evaluaciones_etapas
      WHERE etapa = 'inicial'
    `);

    res.json({
      total: parseInt(stats[0]?.total || '0', 10),
      pendientes: parseInt(stats[0]?.pendientes || '0', 10),
      aprobados: parseInt(stats[0]?.aprobados || '0', 10),
      observados: parseInt(stats[0]?.observados || '0', 10),
      rechazados: parseInt(stats[0]?.rechazados || '0', 10),
    });
  } catch (err: any) {
    console.error('Error fetching metricas iniciales:', err);
    res.status(500).json({ error: 'Error al consultar métricas de evaluación inicial' });
  }
});

const EVALUATION_SORT_OPTIONS = ['recientes', 'nombre_asc', 'puntaje_desc', 'puntaje_asc'] as const;

function extractEvaluationScore(item: any): number | null {
  if (typeof item.puntaje_promedio === 'number' && Number.isFinite(item.puntaje_promedio)) {
    return item.puntaje_promedio;
  }
  const text = String(item.comentarios || '');
  const m100 = text.match(/(\d+(?:\.\d+)?)\s*\/\s*100/);
  if (m100) return Number(m100[1]);
  const m5 = text.match(/(\d+(?:\.\d+)?)\s*\/\s*5/);
  if (m5) return Number(m5[1]);
  return null;
}

function filterAndSortEvaluationItems<
  T extends {
    postulante?: { nombres?: string; apellidos?: string; profesion_ocupacion?: string | null };
    puntaje_promedio?: number | null;
    comentarios?: string | null;
    etapa_id?: number;
  },
>(
  items: T[],
  opts: {
    categoria?: string;
    puntajeMin?: number | null;
    puntajeMax?: number | null;
    ordenar?: (typeof EVALUATION_SORT_OPTIONS)[number];
  }
): T[] {
  const cat = normalizeCategoryFilter(opts.categoria).toLowerCase();
  const filtered = items.filter((item) => {
    if (cat) {
      const prof = String(item.postulante?.profesion_ocupacion || '').toLowerCase();
      if (!prof.includes(cat)) return false;
    }
    if (opts.puntajeMin !== null && opts.puntajeMin !== undefined) {
      const score = extractEvaluationScore(item);
      if (score === null || score < opts.puntajeMin) return false;
    }
    if (opts.puntajeMax !== null && opts.puntajeMax !== undefined) {
      const score = extractEvaluationScore(item);
      if (score === null || score > opts.puntajeMax) return false;
    }
    return true;
  });

  const sort = opts.ordenar || 'recientes';
  if (sort === 'nombre_asc') {
    return [...filtered].sort((a, b) =>
      `${a.postulante?.nombres || ''} ${a.postulante?.apellidos || ''}`.localeCompare(
        `${b.postulante?.nombres || ''} ${b.postulante?.apellidos || ''}`,
        'es'
      )
    );
  }
  if (sort === 'puntaje_desc') {
    return [...filtered].sort((a, b) => (extractEvaluationScore(b) ?? -1) - (extractEvaluationScore(a) ?? -1));
  }
  if (sort === 'puntaje_asc') {
    return [...filtered].sort((a, b) => (extractEvaluationScore(a) ?? 999) - (extractEvaluationScore(b) ?? 999));
  }
  return filtered;
}

// KIR-70 & KIR-71: Consulta y listado de postulaciones en etapa inicial
router.get('/evaluaciones/inicial', async (req: Request, res: Response) => {
  try {
    const { estado, proyecto_id, q, categoria, puntaje_min, puntaje_max, ordenar } = req.query;
    const scoreRange = validateScoreRange(puntaje_min, puntaje_max, 100);
    if (!scoreRange.ok) {
      return res.status(400).json({ error: scoreRange.error });
    }
    const cleanCategoria = normalizeCategoryFilter(categoria);
    const cleanSort = normalizeSortOrder(ordenar, EVALUATION_SORT_OPTIONS, 'recientes');
    const cacheKey = buildCacheKey('evaluaciones:inicial', {
      estado,
      proyecto_id,
      q,
      categoria: cleanCategoria,
      puntaje_min: scoreRange.min,
      puntaje_max: scoreRange.max,
      ordenar: cleanSort,
    });
    const cached = await cacheService.get<any[]>(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('X-Cache-Backend', cacheService.getStats().backend);
      return res.json(cached);
    }

    let sql = `
      SELECT ee.id as etapa_id,
             ee.postulacion_id,
             ee.estado as etapa_estado,
             ee.evaluador,
             ee.comentarios,
             ee.fecha_evaluacion,
             app.created_at as postulacion_fecha,
             app.estado_general as postulacion_estado,
             p.id as postulante_id,
             p.nombres,
             p.apellidos,
             p.ci,
             p.email,
             p.telefono,
             p.fecha_nacimiento,
             p.profesion_ocupacion,
             p.habilidades,
             p.motivacion,
             proy.id as proyecto_id,
             proy.titulo as proyecto_titulo,
             proy.ubicacion as proyecto_ubicacion,
             proy.es_mayor_edad as proyecto_es_mayor_edad,
             org.nombre as organizacion_nombre
      FROM evaluaciones_etapas ee
      JOIN postulaciones app ON app.id = ee.postulacion_id
      JOIN postulantes p ON p.id = app.postulante_id
      JOIN proyectos proy ON proy.id = app.proyecto_id
      LEFT JOIN organizaciones org ON org.id = proy.organizacion_id
      WHERE ee.etapa = 'inicial'
    `;
    const params: any[] = [];

    if (estado && typeof estado === 'string') {
      const normalized = estado.trim().toLowerCase();
      if (['pendiente', 'pendientes', 'pendiente_revision', 'en_revision', 'en revision', 'en revisión'].includes(normalized)) {
        sql += ` AND ee.estado IN ('pendiente', 'pendiente_revision', 'en_revision', 'en revision', 'en revisión')`;
      } else if (normalized !== 'todos') {
        const estadoMap: Record<string, string> = {
          aprobados: 'aprobado',
          observados: 'observado',
          rechazados: 'rechazado',
        };
        params.push(estadoMap[normalized] || normalized);
        sql += ` AND ee.estado = $${params.length}`;
      }
    }

    if (proyecto_id) {
      params.push(proyecto_id);
      sql += ` AND proy.id = $${params.length}`;
    }

    if (q && typeof q === 'string' && q.trim()) {
      params.push(`%${q.trim()}%`);
      sql += ` AND (
        p.nombres ILIKE $${params.length} OR 
        p.apellidos ILIKE $${params.length} OR 
        p.ci ILIKE $${params.length} OR 
        p.email ILIKE $${params.length} OR 
        proy.titulo ILIKE $${params.length}
      )`;
    }

    sql += ' ORDER BY ee.id DESC';

    const rows = await query<any>(sql, params);

    const formatted = rows.map((r: any) => {
      const edad = calculateAge(r.fecha_nacimiento);
      return {
        etapa_id: r.etapa_id,
        postulacion_id: r.postulacion_id,
        etapa_estado: r.etapa_estado === 'en revision' ? 'en_revision' : r.etapa_estado,
        evaluador: r.evaluador,
        comentarios: r.comentarios,
        fecha_evaluacion: r.fecha_evaluacion,
        postulacion_fecha: r.postulacion_fecha,
        postulacion_estado: r.postulacion_estado,
        postulante: {
          id: r.postulante_id,
          nombres: r.nombres,
          apellidos: r.apellidos,
          ci: r.ci,
          email: r.email,
          telefono: r.telefono,
          fecha_nacimiento: r.fecha_nacimiento,
          edad,
          es_mayor_edad: edad >= 18,
          profesion_ocupacion: r.profesion_ocupacion,
          habilidades: r.habilidades,
          motivacion: r.motivacion,
        },
        proyecto: {
          id: r.proyecto_id,
          titulo: r.proyecto_titulo,
          ubicacion: r.proyecto_ubicacion,
          es_mayor_edad: r.proyecto_es_mayor_edad,
          organizacion_nombre: r.organizacion_nombre,
        },
      };
    });

    const finalRows = filterAndSortEvaluationItems(formatted, {
      categoria: cleanCategoria,
      puntajeMin: scoreRange.min,
      puntajeMax: scoreRange.max,
      ordenar: cleanSort,
    });

    await cacheService.set(cacheKey, finalRows, 45);
    res.setHeader('X-Cache', 'MISS');
    res.setHeader('X-Cache-Backend', cacheService.getStats().backend);
    res.json(finalRows);
  } catch (err: any) {
    console.error('Error fetching initial evaluations:', err);
    res.status(500).json({ error: 'Error al consultar evaluaciones iniciales' });
  }
});

// KIR-71: Registrar decisión y calificar etapa inicial de una postulación
router.post('/evaluaciones/inicial/:postulacion_id', async (req: Request, res: Response) => {
  try {
    const { postulacion_id } = req.params;
    const { estado, evaluador, comentarios, criterios } = req.body;

    if (!['aprobado', 'observado', 'rechazado', 'en_revision'].includes(estado)) {
      return res.status(400).json({ error: 'Estado de evaluación inicial inválido' });
    }

    if ((estado === 'rechazado' || estado === 'observado') && (!comentarios || comentarios.trim().length < 5)) {
      return res.status(400).json({
        error: `Debe detallar el motivo u observaciones ${estado === 'rechazado' ? 'del rechazo' : 'de la observación'} (mínimo 5 caracteres)`,
      });
    }

    // Formatear comentarios con detalle de criterios si se enviaron
    let observacionesCompletas = comentarios ? comentarios.trim() : '';
    if (criterios && typeof criterios === 'object') {
      const resumenCriterios = [
        criterios.mayoria_edad_verificada ? 'Mayoría de edad: Conforme (+18)' : null,
        criterios.identidad_ci_valida ? 'Identidad y CI: Verificados' : null,
        criterios.carta_motivacion_apta ? 'Motivación: Apta' : null,
        criterios.disponibilidad_confirmada ? 'Disponibilidad: Confirmada' : null,
      ].filter(Boolean);

      if (resumenCriterios.length > 0) {
        observacionesCompletas = `[Verificación: ${resumenCriterios.join(' | ')}] ${observacionesCompletas}`.trim();
      }
    }

    const evaluadorNombre = evaluador && evaluador.trim() ? evaluador.trim() : 'Comité de Admisiones Kirikú';

    // 1. Actualizar la etapa 'inicial'
    const updatedStage = await query<any>(
      `UPDATE evaluaciones_etapas 
       SET estado = $1, 
           comentarios = $2, 
           evaluador = $3, 
           fecha_evaluacion = NOW()
       WHERE postulacion_id = $4 AND etapa = 'inicial'
       RETURNING *`,
      [estado, observacionesCompletas || 'Evaluación inicial procesada por Comité Kirikú', evaluadorNombre, postulacion_id]
    );

    if (!updatedStage.length) {
      return res.status(404).json({ error: 'No se encontró la etapa inicial para esta postulación' });
    }

    // 2. Transición del flujo según el resultado:
    if (estado === 'aprobado') {
      // Activar automáticamente la siguiente etapa ('tecnica') poniéndola en 'en_revision' si estaba 'pendiente'
      await query(
        `UPDATE evaluaciones_etapas 
         SET estado = 'en_revision', fecha_evaluacion = NOW()
         WHERE postulacion_id = $1 AND etapa = 'tecnica' AND estado = 'pendiente'`,
        [postulacion_id]
      );
      // Mantener postulación general en 'en_proceso'
      await query(
        `UPDATE postulaciones 
         SET estado_general = 'en_proceso', updated_at = NOW() 
         WHERE id = $1`,
        [postulacion_id]
      );
    } else if (estado === 'rechazado') {
      // Si la etapa inicial es rechazada, toda la postulación se rechaza
      await query(
        `UPDATE postulaciones 
         SET estado_general = 'rechazado', updated_at = NOW() 
         WHERE id = $1`,
        [postulacion_id]
      );
    } else if (estado === 'observado') {
      // Postulación observada sigue en proceso pero con etapa observada
      await query(
        `UPDATE postulaciones 
         SET estado_general = 'en_proceso', updated_at = NOW() 
         WHERE id = $1`,
        [postulacion_id]
      );
    }

    await Promise.all([
      cacheService.delByPrefix('evaluaciones:'),
      cacheService.delByPrefix('postulantes:'),
    ]);
    await recordSystemLog({
      ...getActorMeta(req),
      action: 'EVALUATION_INITIAL',
      module: 'evaluaciones',
      status: 'success',
      details: `Evaluación inicial de postulación ${postulacion_id} registrada como ${estado}`,
    }).catch(() => {});

    res.json({
      message: `Evaluación inicial registrada con éxito (${estado})`,
      etapa: updatedStage[0],
      postulacion_id: Number(postulacion_id),
      estado_general: estado === 'rechazado' ? 'rechazado' : 'en_proceso',
    });
  } catch (err: any) {
    console.error('Error recording initial evaluation:', err);
    res.status(500).json({ error: 'Error al registrar evaluación inicial' });
  }
});

// -------------------------------------------------------------
// EVALUACIÓN TÉCNICA SOCIO TERRITORIAL (HISTORIA KIR-25: KIR-66, KIR-67, KIR-68)
// -------------------------------------------------------------

// KIR-67: Métricas de la etapa técnica
router.get('/evaluaciones/tecnica/metricas', async (_req: Request, res: Response) => {
  try {
    const stats = await query<{
      total: string;
      disponibles: string;
      bloqueadas: string;
      pendientes: string;
      aprobados: string;
      observados: string;
      rechazados: string;
    }>(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN ee_init.estado = 'aprobado' THEN 1 END) as disponibles,
        COUNT(CASE WHEN ee_init.estado != 'aprobado' AND ee.estado = 'pendiente' THEN 1 END) as bloqueadas,
        COUNT(CASE WHEN ee_init.estado = 'aprobado' AND ee.estado IN ('pendiente', 'en_revision', 'en revision') THEN 1 END) as pendientes,
        COUNT(CASE WHEN ee.estado = 'aprobado' THEN 1 END) as aprobados,
        COUNT(CASE WHEN ee.estado = 'observado' THEN 1 END) as observados,
        COUNT(CASE WHEN ee.estado = 'rechazado' THEN 1 END) as rechazados
      FROM evaluaciones_etapas ee
      JOIN evaluaciones_etapas ee_init ON ee_init.postulacion_id = ee.postulacion_id AND ee_init.etapa = 'inicial'
      WHERE ee.etapa = 'tecnica'
    `);

    res.json({
      total: parseInt(stats[0]?.total || '0', 10),
      disponibles: parseInt(stats[0]?.disponibles || '0', 10),
      bloqueadas: parseInt(stats[0]?.bloqueadas || '0', 10),
      pendientes: parseInt(stats[0]?.pendientes || '0', 10),
      aprobados: parseInt(stats[0]?.aprobados || '0', 10),
      observados: parseInt(stats[0]?.observados || '0', 10),
      rechazados: parseInt(stats[0]?.rechazados || '0', 10),
    });
  } catch (err: any) {
    console.error('Error fetching metricas tecnicas:', err);
    res.status(500).json({ error: 'Error al consultar métricas de evaluación técnica' });
  }
});

// KIR-67: Consulta y listado de postulaciones para Socio Territorial en etapa técnica
router.get('/evaluaciones/tecnica', async (req: Request, res: Response) => {
  try {
    const { estado, proyecto_id, q, categoria, puntaje_min, puntaje_max, ordenar } = req.query;
    const scoreRange = validateScoreRange(puntaje_min, puntaje_max, 100);
    if (!scoreRange.ok) {
      return res.status(400).json({ error: scoreRange.error });
    }
    const cleanCategoria = normalizeCategoryFilter(categoria);
    const cleanSort = normalizeSortOrder(ordenar, EVALUATION_SORT_OPTIONS, 'recientes');
    const cacheKey = buildCacheKey('evaluaciones:tecnica', {
      estado,
      proyecto_id,
      q,
      categoria: cleanCategoria,
      puntaje_min: scoreRange.min,
      puntaje_max: scoreRange.max,
      ordenar: cleanSort,
    });
    const cached = await cacheService.get<any[]>(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('X-Cache-Backend', cacheService.getStats().backend);
      return res.json(cached);
    }

    let sql = `
      SELECT ee.id as etapa_id,
             ee.postulacion_id,
             ee.estado as etapa_estado,
             ee.evaluador,
             ee.comentarios,
             ee.fecha_evaluacion,
             ee_init.estado as inicial_estado,
             ee_init.comentarios as inicial_comentarios,
             ee_init.evaluador as inicial_evaluador,
             app.created_at as postulacion_fecha,
             app.estado_general as postulacion_estado,
             p.id as postulante_id,
             p.nombres,
             p.apellidos,
             p.ci,
             p.email,
             p.telefono,
             p.fecha_nacimiento,
             p.profesion_ocupacion,
             p.habilidades,
             p.motivacion,
             proy.id as proyecto_id,
             proy.titulo as proyecto_titulo,
             proy.ubicacion as proyecto_ubicacion,
             proy.cupos_disponibles as proyecto_cupos,
             proy.organizacion_id,
             org.nombre as organizacion_nombre
      FROM evaluaciones_etapas ee
      JOIN evaluaciones_etapas ee_init ON ee_init.postulacion_id = ee.postulacion_id AND ee_init.etapa = 'inicial'
      JOIN postulaciones app ON app.id = ee.postulacion_id
      JOIN postulantes p ON p.id = app.postulante_id
      JOIN proyectos proy ON proy.id = app.proyecto_id
      LEFT JOIN organizaciones org ON org.id = proy.organizacion_id
      WHERE ee.etapa = 'tecnica'
    `;
    const params: any[] = [];

    if (estado && typeof estado === 'string') {
      const normalized = estado.trim().toLowerCase();
      if (['pendiente', 'pendientes', 'pendiente_revision', 'en_revision', 'en revision', 'en revisión'].includes(normalized)) {
        sql += ` AND ee_init.estado = 'aprobado' AND ee.estado IN ('pendiente', 'pendiente_revision', 'en_revision', 'en revision', 'en revisión')`;
      } else if (normalized === 'bloqueadas' || normalized === 'bloqueada') {
        sql += ` AND ee_init.estado != 'aprobado' AND ee.estado = 'pendiente'`;
      } else if (normalized !== 'todos') {
        const estadoMap: Record<string, string> = {
          aprobados: 'aprobado',
          observados: 'observado',
          rechazados: 'rechazado',
        };
        params.push(estadoMap[normalized] || normalized);
        sql += ` AND ee.estado = $${params.length}`;
      }
    }

    if (proyecto_id) {
      params.push(proyecto_id);
      sql += ` AND proy.id = $${params.length}`;
    }

    if (q && typeof q === 'string' && q.trim()) {
      params.push(`%${q.trim()}%`);
      sql += ` AND (
        p.nombres ILIKE $${params.length} OR
        p.apellidos ILIKE $${params.length} OR
        p.ci ILIKE $${params.length} OR
        COALESCE(p.profesion_ocupacion, '') ILIKE $${params.length} OR
        COALESCE(p.habilidades, '') ILIKE $${params.length} OR
        proy.titulo ILIKE $${params.length} OR
        COALESCE(org.nombre, '') ILIKE $${params.length}
      )`;
    }

    sql += ' ORDER BY ee.id DESC';

    const rows = await query<any>(sql, params);

    const formatted = rows.map((r: any) => {
      const edad = calculateAge(r.fecha_nacimiento);
      const puedeEvaluar = r.inicial_estado === 'aprobado';
      return {
        etapa_id: r.etapa_id,
        postulacion_id: r.postulacion_id,
        etapa_estado: r.etapa_estado === 'en revision' ? 'en_revision' : r.etapa_estado,
        evaluador: r.evaluador,
        comentarios: r.comentarios,
        fecha_evaluacion: r.fecha_evaluacion,
        postulacion_fecha: r.postulacion_fecha,
        postulacion_estado: r.postulacion_estado,
        inicial_estado: r.inicial_estado,
        inicial_comentarios: r.inicial_comentarios,
        inicial_evaluador: r.inicial_evaluador,
        puede_evaluar: puedeEvaluar,
        postulante: {
          id: r.postulante_id,
          nombres: r.nombres,
          apellidos: r.apellidos,
          ci: r.ci,
          email: r.email,
          telefono: r.telefono,
          fecha_nacimiento: r.fecha_nacimiento,
          edad,
          es_mayor_edad: edad >= 18,
          profesion_ocupacion: r.profesion_ocupacion,
          habilidades: r.habilidades,
          motivacion: r.motivacion,
        },
        proyecto: {
          id: r.proyecto_id,
          titulo: r.proyecto_titulo,
          ubicacion: r.proyecto_ubicacion,
          cupos_disponibles: r.proyecto_cupos,
          organizacion_id: r.organizacion_id,
          organizacion_nombre: r.organizacion_nombre,
        },
      };
    });

    const finalRows = filterAndSortEvaluationItems(formatted, {
      categoria: cleanCategoria,
      puntajeMin: scoreRange.min,
      puntajeMax: scoreRange.max,
      ordenar: cleanSort,
    });

    await cacheService.set(cacheKey, finalRows, 45);
    res.setHeader('X-Cache', 'MISS');
    res.setHeader('X-Cache-Backend', cacheService.getStats().backend);
    res.json(finalRows);
  } catch (err: any) {
    console.error('Error fetching technical evaluations:', err);
    res.status(500).json({ error: 'Error al consultar evaluaciones técnicas' });
  }
});

// KIR-67: Registrar decisión técnica del Socio Territorial y desbloquear Entrevista Personal
router.post('/evaluaciones/tecnica/:postulacion_id', async (req: Request, res: Response) => {
  try {
    const { postulacion_id } = req.params;
    const { estado, evaluador, comentarios, puntaje_tecnico, criterios } = req.body;

    if (!['aprobado', 'observado', 'rechazado', 'en_revision'].includes(estado)) {
      return res.status(400).json({ error: 'Estado de evaluación técnica inválido' });
    }

    if ((estado === 'rechazado' || estado === 'observado') && (!comentarios || comentarios.trim().length < 5)) {
      return res.status(400).json({
        error: `Debe detallar las observaciones técnicas o motivo ${estado === 'rechazado' ? 'del rechazo' : 'de la observación'} (mínimo 5 caracteres)`,
      });
    }

    // Verificar precondición: etapa inicial debe estar aprobada
    const initRows = await query<{ estado: string }>(
      `SELECT estado FROM evaluaciones_etapas WHERE postulacion_id = $1 AND etapa = 'inicial'`,
      [postulacion_id]
    );
    if (!initRows.length) {
      return res.status(404).json({ error: 'No se encontró la postulación o etapa inicial asociada' });
    }
    if (initRows[0].estado !== 'aprobado') {
      return res.status(400).json({
        error: 'La etapa inicial debe estar aprobada antes de registrar la evaluación técnica',
      });
    }

    let observacionesCompletas = comentarios ? comentarios.trim() : '';
    const detallesTecnicos: string[] = [];

    if (typeof puntaje_tecnico === 'number' && !isNaN(puntaje_tecnico)) {
      const score = Math.max(0, Math.min(100, Math.round(puntaje_tecnico)));
      detallesTecnicos.push(`Puntaje Técnico: ${score}/100`);
    }

    if (criterios && typeof criterios === 'object') {
      if (criterios.experiencia_afin) detallesTecnicos.push('Experiencia Afín: Sí');
      if (criterios.competencias_tecnicas) detallesTecnicos.push('Competencias Técnicas: Aptas');
      if (criterios.disponibilidad_territorial) detallesTecnicos.push('Disponibilidad Territorial: Confirmada');
      if (criterios.capacidad_trabajo_campo) detallesTecnicos.push('Trabajo de Campo: Apto');
    }

    if (detallesTecnicos.length > 0) {
      observacionesCompletas = `[Socio Territorial: ${detallesTecnicos.join(' | ')}] ${observacionesCompletas}`.trim();
    }

    const evaluadorNombre =
      evaluador && evaluador.trim() ? evaluador.trim() : 'Socio Territorial / Coordinador de Proyecto';

    const updatedStage = await query<any>(
      `UPDATE evaluaciones_etapas
       SET estado = $1,
           comentarios = $2,
           evaluador = $3,
           fecha_evaluacion = NOW()
       WHERE postulacion_id = $4 AND etapa = 'tecnica'
       RETURNING *`,
      [
        estado,
        observacionesCompletas || 'Evaluación técnica validada por Socio Territorial',
        evaluadorNombre,
        postulacion_id,
      ]
    );

    if (!updatedStage.length) {
      return res.status(404).json({ error: 'No se encontró la etapa técnica para esta postulación' });
    }

    if (estado === 'aprobado') {
      // Activar automáticamente la etapa 3 ('personal') poniéndola en 'en_revision' si estaba 'pendiente'
      await query(
        `UPDATE evaluaciones_etapas
         SET estado = 'en_revision', fecha_evaluacion = NOW()
         WHERE postulacion_id = $1 AND etapa = 'personal' AND estado = 'pendiente'`,
        [postulacion_id]
      );
      await query(
        `UPDATE postulaciones
         SET estado_general = 'en_proceso', updated_at = NOW()
         WHERE id = $1`,
        [postulacion_id]
      );
    } else if (estado === 'rechazado') {
      await query(
        `UPDATE postulaciones
         SET estado_general = 'rechazado', updated_at = NOW()
         WHERE id = $1`,
        [postulacion_id]
      );
    } else if (estado === 'observado') {
      await query(
        `UPDATE postulaciones
         SET estado_general = 'en_proceso', updated_at = NOW()
         WHERE id = $1`,
        [postulacion_id]
      );
    }

    await Promise.all([
      cacheService.delByPrefix('evaluaciones:'),
      cacheService.delByPrefix('postulantes:'),
    ]);
    await recordSystemLog({
      ...getActorMeta(req),
      action: 'EVALUATION_TECHNICAL',
      module: 'evaluaciones',
      status: 'success',
      details: `Evaluación técnica de postulación ${postulacion_id} registrada como ${estado}`,
    }).catch(() => {});

    res.json({
      message: `Evaluación técnica registrada con éxito (${estado})`,
      etapa: updatedStage[0],
      postulacion_id: Number(postulacion_id),
      estado_general: estado === 'rechazado' ? 'rechazado' : 'en_proceso',
    });
  } catch (err: any) {
    console.error('Error recording technical evaluation:', err);
    res.status(500).json({ error: 'Error al registrar evaluación técnica' });
  }
});

// -------------------------------------------------------------
// EVALUACIÓN DE SALUD FÍSICA Y PSICOLÓGICA (HISTORIA KIR-28: KIR-54, KIR-55, KIR-56, KIR-57)
// -------------------------------------------------------------

// KIR-55 & KIR-56: Métricas de la etapa de salud física y psicológica (requiere permiso applications.read)
router.get(
  '/evaluaciones/salud/metricas',
  authenticate,
  requirePermission('applications.read'),
  async (_req: Request, res: Response) => {
    try {
      const stats = await query<{
        total: string;
        disponibles: string;
        bloqueadas: string;
        pendientes: string;
        aprobados: string;
        observados: string;
        rechazados: string;
      }>(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN ee_comp.estado = 'aprobado' THEN 1 END) as disponibles,
          COUNT(CASE WHEN COALESCE(ee_comp.estado, 'pendiente') != 'aprobado' AND ee.estado = 'pendiente' THEN 1 END) as bloqueadas,
          COUNT(CASE WHEN ee_comp.estado = 'aprobado' AND ee.estado IN ('pendiente', 'en_revision', 'en revision') THEN 1 END) as pendientes,
          COUNT(CASE WHEN ee.estado = 'aprobado' THEN 1 END) as aprobados,
          COUNT(CASE WHEN ee.estado = 'observado' THEN 1 END) as observados,
          COUNT(CASE WHEN ee.estado = 'rechazado' THEN 1 END) as rechazados
        FROM evaluaciones_etapas ee
        LEFT JOIN evaluaciones_etapas ee_comp ON ee_comp.postulacion_id = ee.postulacion_id AND ee_comp.etapa = 'competencias'
        WHERE ee.etapa = 'salud_fisica_psicologica'
      `);

      res.json({
        total: parseInt(stats[0]?.total || '0', 10),
        disponibles: parseInt(stats[0]?.disponibles || '0', 10),
        bloqueadas: parseInt(stats[0]?.bloqueadas || '0', 10),
        pendientes: parseInt(stats[0]?.pendientes || '0', 10),
        aprobados: parseInt(stats[0]?.aprobados || '0', 10),
        observados: parseInt(stats[0]?.observados || '0', 10),
        rechazados: parseInt(stats[0]?.rechazados || '0', 10),
      });
    } catch (err: any) {
      console.error('Error fetching metricas salud:', err);
      res.status(500).json({ error: 'Error al consultar métricas de evaluación de salud' });
    }
  }
);

// KIR-54, KIR-55 & KIR-56: Consulta y listado de postulaciones en etapa salud física y psicológica
router.get(
  '/evaluaciones/salud',
  authenticate,
  requirePermission('applications.read'),
  async (req: Request, res: Response) => {
    try {
      const { estado, proyecto_id, q, categoria, puntaje_min, puntaje_max, ordenar } = req.query;
      const scoreRange = validateScoreRange(puntaje_min, puntaje_max, 100);
      if (!scoreRange.ok) {
        return res.status(400).json({ error: scoreRange.error });
      }
      const cleanCategoria = normalizeCategoryFilter(categoria);
      const cleanSort = normalizeSortOrder(ordenar, EVALUATION_SORT_OPTIONS, 'recientes');
      const cacheKey = buildCacheKey('evaluaciones:salud', {
        estado,
        proyecto_id,
        q,
        categoria: cleanCategoria,
        puntaje_min: scoreRange.min,
        puntaje_max: scoreRange.max,
        ordenar: cleanSort,
      });
      const cached = await cacheService.get<any[]>(cacheKey);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('X-Cache-Backend', cacheService.getStats().backend);
        return res.json(cached);
      }

      let sql = `
        SELECT ee.id as etapa_id,
               ee.postulacion_id,
               ee.estado as etapa_estado,
               ee.evaluador,
               ee.comentarios,
               ee.fecha_evaluacion,
               COALESCE(ee_init.estado, 'pendiente') as inicial_estado,
               COALESCE(ee_tec.estado, 'pendiente') as tecnica_estado,
               COALESCE(ee_pers.estado, 'pendiente') as personal_estado,
               COALESCE(ee_comp.estado, 'pendiente') as competencias_estado,
               app.created_at as postulacion_fecha,
               app.estado_general as postulacion_estado,
               p.id as postulante_id,
               p.nombres,
               p.apellidos,
               p.ci,
               p.email,
               p.telefono,
               p.fecha_nacimiento,
               p.profesion_ocupacion,
               p.habilidades,
               p.motivacion,
               proy.id as proyecto_id,
               proy.titulo as proyecto_titulo,
               proy.ubicacion as proyecto_ubicacion,
               proy.cupos_disponibles as proyecto_cupos,
               proy.organizacion_id,
               org.nombre as organizacion_nombre
        FROM evaluaciones_etapas ee
        LEFT JOIN evaluaciones_etapas ee_init ON ee_init.postulacion_id = ee.postulacion_id AND ee_init.etapa = 'inicial'
        LEFT JOIN evaluaciones_etapas ee_tec ON ee_tec.postulacion_id = ee.postulacion_id AND ee_tec.etapa = 'tecnica'
        LEFT JOIN evaluaciones_etapas ee_pers ON ee_pers.postulacion_id = ee.postulacion_id AND ee_pers.etapa = 'personal'
        LEFT JOIN evaluaciones_etapas ee_comp ON ee_comp.postulacion_id = ee.postulacion_id AND ee_comp.etapa = 'competencias'
        JOIN postulaciones app ON app.id = ee.postulacion_id
        JOIN postulantes p ON p.id = app.postulante_id
        JOIN proyectos proy ON proy.id = app.proyecto_id
        LEFT JOIN organizaciones org ON org.id = proy.organizacion_id
        WHERE ee.etapa = 'salud_fisica_psicologica'
      `;
      const params: any[] = [];

      if (estado && typeof estado === 'string') {
        const normalized = estado.trim().toLowerCase();
        if (['pendiente', 'pendientes', 'pendiente_revision', 'en_revision', 'en revision', 'en revisión'].includes(normalized)) {
          sql += ` AND COALESCE(ee_comp.estado, 'pendiente') = 'aprobado' AND ee.estado IN ('pendiente', 'pendiente_revision', 'en_revision', 'en revision', 'en revisión')`;
        } else if (normalized === 'bloqueadas' || normalized === 'bloqueada') {
          sql += ` AND COALESCE(ee_comp.estado, 'pendiente') != 'aprobado' AND ee.estado = 'pendiente'`;
        } else if (normalized !== 'todos') {
          const estadoMap: Record<string, string> = {
            aprobados: 'aprobado',
            observados: 'observado',
            rechazados: 'rechazado',
          };
          params.push(estadoMap[normalized] || normalized);
          sql += ` AND ee.estado = $${params.length}`;
        }
      }

      if (proyecto_id) {
        params.push(proyecto_id);
        sql += ` AND proy.id = $${params.length}`;
      }

      if (q && typeof q === 'string' && q.trim()) {
        params.push(`%${q.trim()}%`);
        sql += ` AND (
          p.nombres ILIKE $${params.length} OR
          p.apellidos ILIKE $${params.length} OR
          p.ci ILIKE $${params.length} OR
          p.email ILIKE $${params.length} OR
          proy.titulo ILIKE $${params.length} OR
          COALESCE(org.nombre, '') ILIKE $${params.length}
        )`;
      }

      sql += ' ORDER BY ee.id DESC';

      const rows = await query<any>(sql, params);

      const formatted = rows.map((r: any) => {
        const edad = calculateAge(r.fecha_nacimiento);
        const puedeEvaluar = r.competencias_estado === 'aprobado';
        return {
          etapa_id: r.etapa_id,
          postulacion_id: r.postulacion_id,
          etapa_estado: r.etapa_estado === 'en revision' ? 'en_revision' : r.etapa_estado,
          evaluador: r.evaluador,
          comentarios: r.comentarios,
          fecha_evaluacion: r.fecha_evaluacion,
          postulacion_fecha: r.postulacion_fecha,
          postulacion_estado: r.postulacion_estado,
          inicial_estado: r.inicial_estado,
          tecnica_estado: r.tecnica_estado,
          personal_estado: r.personal_estado,
          competencias_estado: r.competencias_estado,
          puede_evaluar: puedeEvaluar,
          postulante: {
            id: r.postulante_id,
            nombres: r.nombres,
            apellidos: r.apellidos,
            ci: r.ci,
            email: r.email,
            telefono: r.telefono,
            fecha_nacimiento: r.fecha_nacimiento,
            edad,
            es_mayor_edad: edad >= 18,
            profesion_ocupacion: r.profesion_ocupacion,
            habilidades: r.habilidades,
            motivacion: r.motivacion,
          },
          proyecto: {
            id: r.proyecto_id,
            titulo: r.proyecto_titulo,
            ubicacion: r.proyecto_ubicacion,
            cupos_disponibles: r.proyecto_cupos,
            organizacion_id: r.organizacion_id,
            organizacion_nombre: r.organizacion_nombre,
          },
        };
      });

      const finalRows = filterAndSortEvaluationItems(formatted, {
        categoria: cleanCategoria,
        puntajeMin: scoreRange.min,
        puntajeMax: scoreRange.max,
        ordenar: cleanSort,
      });

      await cacheService.set(cacheKey, finalRows, 45);
      res.setHeader('X-Cache', 'MISS');
      res.setHeader('X-Cache-Backend', cacheService.getStats().backend);
      res.json(finalRows);
    } catch (err: any) {
      console.error('Error fetching health evaluations:', err);
      res.status(500).json({ error: 'Error al consultar evaluaciones de salud física y psicológica' });
    }
  }
);

// KIR-55 & KIR-56: Registrar evaluación de salud física y psicológica (requiere permiso applications.manage)
router.post(
  '/evaluaciones/salud/:postulacion_id',
  authenticate,
  requirePermission('applications.manage'),
  async (req: Request, res: Response) => {
    try {
      const { postulacion_id } = req.params;
      const { estado, evaluador, comentarios, puntaje_bienestar, nivel_riesgo, criterios } = req.body;

      if (!['aprobado', 'observado', 'rechazado', 'en_revision'].includes(estado)) {
        return res.status(400).json({ error: 'Estado de evaluación de salud inválido' });
      }

      if ((estado === 'rechazado' || estado === 'observado') && (!comentarios || comentarios.trim().length < 5)) {
        return res.status(400).json({
          error: `Debe detallar el diagnóstico, observación médica o motivo ${estado === 'rechazado' ? 'del rechazo' : 'de la observación'} (mínimo 5 caracteres)`,
        });
      }

      // Verificar precondición: etapa previa ('competencias') debe estar aprobada
      const compRows = await query<{ estado: string }>(
        `SELECT estado FROM evaluaciones_etapas WHERE postulacion_id = $1 AND etapa = 'competencias'`,
        [postulacion_id]
      );
      if (!compRows.length) {
        return res.status(404).json({ error: 'No se encontró la postulación o la etapa previa de competencias' });
      }
      if (compRows[0].estado !== 'aprobado') {
        return res.status(400).json({
          error: 'La etapa previa (Competencias) debe estar aprobada antes de registrar la evaluación de salud física y psicológica',
        });
      }

      let observacionesCompletas = comentarios ? comentarios.trim() : '';
      const detallesSalud: string[] = [];

      if (typeof puntaje_bienestar === 'number' && !isNaN(puntaje_bienestar)) {
        const score = Math.max(0, Math.min(100, Math.round(puntaje_bienestar)));
        detallesSalud.push(`Índice de Bienestar: ${score}/100`);
      }

      if (nivel_riesgo && ['bajo', 'moderado', 'alto'].includes(nivel_riesgo)) {
        detallesSalud.push(`Riesgo: ${nivel_riesgo.toUpperCase()}`);
      }

      if (criterios && typeof criterios === 'object') {
        if (criterios.apto_fisico) detallesSalud.push('Apto Físico: Sí');
        if (criterios.apto_psicologico) detallesSalud.push('Apto Psicológico: Sí');
        if (criterios.examen_medico_vigente) detallesSalud.push('Certificado Médico: Vigente');
        if (criterios.condicion_especifica_atendida) detallesSalud.push('Condiciones Médicas: Compatibles');
      }

      if (detallesSalud.length > 0) {
        observacionesCompletas = `[Salud Física y Psicológica: ${detallesSalud.join(' | ')}] ${observacionesCompletas}`.trim();
      }

      const evaluadorNombre =
        evaluador && evaluador.trim() ? evaluador.trim() : 'Equipo Médico y Bienestar Kirikú';

      const updatedStage = await query<any>(
        `UPDATE evaluaciones_etapas
         SET estado = $1,
             comentarios = $2,
             evaluador = $3,
             fecha_evaluacion = NOW()
         WHERE postulacion_id = $4 AND etapa = 'salud_fisica_psicologica'
         RETURNING *`,
        [
          estado,
          observacionesCompletas || 'Evaluación médica y psicológica validada por Equipo de Bienestar',
          evaluadorNombre,
          postulacion_id,
        ]
      );

      if (!updatedStage.length) {
        return res.status(404).json({ error: 'No se encontró la etapa de salud física y psicológica para esta postulación' });
      }

      let estadoGeneralFinal = 'en_proceso';
      if (estado === 'aprobado') {
        const allStages = await query<{ estado: string }>(
          'SELECT estado FROM evaluaciones_etapas WHERE postulacion_id = $1',
          [postulacion_id]
        );
        const allApproved = allStages.length === 5 && allStages.every((s) => s.estado === 'aprobado');
        estadoGeneralFinal = allApproved ? 'aprobado' : 'en_proceso';
        await query(
          `UPDATE postulaciones
           SET estado_general = $1, updated_at = NOW()
           WHERE id = $2`,
          [estadoGeneralFinal, postulacion_id]
        );
      } else if (estado === 'rechazado') {
        estadoGeneralFinal = 'rechazado';
        await query(
          `UPDATE postulaciones
           SET estado_general = 'rechazado', updated_at = NOW()
           WHERE id = $1`,
          [postulacion_id]
        );
      } else {
        await query(
          `UPDATE postulaciones
           SET estado_general = 'en_proceso', updated_at = NOW()
           WHERE id = $1`,
          [postulacion_id]
        );
      }

      await Promise.all([
        cacheService.delByPrefix('evaluaciones:'),
        cacheService.delByPrefix('postulantes:'),
      ]);
      await recordSystemLog({
        ...getActorMeta(req),
        action: 'EVALUATION_HEALTH',
        module: 'evaluaciones',
        status: 'success',
        details: `Evaluación de salud de postulación ${postulacion_id} registrada como ${estado}`,
      }).catch(() => {});

      res.json({
        message: `Evaluación de salud física y psicológica registrada con éxito (${estado})`,
        etapa: updatedStage[0],
        postulacion_id: Number(postulacion_id),
        estado_general: estadoGeneralFinal,
      });
    } catch (err: any) {
      console.error('Error recording health evaluation:', err);
      res.status(500).json({ error: 'Error al registrar evaluación de salud física y psicológica' });
    }
  }
);


// KIR-63: Consulta de postulaciones listas para la entrevista personal.
router.get('/evaluaciones/personal', async (req: Request, res: Response) => {
  try {
    const { estado, proyecto_id, q, categoria, puntaje_min, puntaje_max, ordenar } = req.query;
    const scoreRange = validateScoreRange(puntaje_min, puntaje_max, 100);
    if (!scoreRange.ok) {
      return res.status(400).json({ error: scoreRange.error });
    }
    const cleanCategoria = normalizeCategoryFilter(categoria);
    const cleanSort = normalizeSortOrder(ordenar, EVALUATION_SORT_OPTIONS, 'recientes');
    const cacheKey = buildCacheKey('evaluaciones:personal', {
      estado,
      proyecto_id,
      q,
      categoria: cleanCategoria,
      puntaje_min: scoreRange.min,
      puntaje_max: scoreRange.max,
      ordenar: cleanSort,
    });
    const cached = await cacheService.get<any[]>(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('X-Cache-Backend', cacheService.getStats().backend);
      return res.json(cached);
    }
    let sql = `
      SELECT ee.id AS etapa_id, ee.postulacion_id, ee.estado AS etapa_estado,
             ee.evaluador, ee.comentarios, ee.fecha_evaluacion, ee.detalle_criterios_personales,
             ee_tecnica.estado AS tecnica_estado,
             p.id AS postulante_id, p.nombres, p.apellidos, p.ci, p.email, p.telefono,
             p.fecha_nacimiento, p.profesion_ocupacion, p.habilidades, p.motivacion,
             proy.id AS proyecto_id, proy.titulo AS proyecto_titulo,
             proy.ubicacion AS proyecto_ubicacion, org.nombre AS organizacion_nombre
      FROM evaluaciones_etapas ee
      JOIN evaluaciones_etapas ee_tecnica
        ON ee_tecnica.postulacion_id = ee.postulacion_id AND ee_tecnica.etapa = 'tecnica'
      JOIN postulaciones app ON app.id = ee.postulacion_id
      JOIN postulantes p ON p.id = app.postulante_id
      JOIN proyectos proy ON proy.id = app.proyecto_id
      LEFT JOIN organizaciones org ON org.id = proy.organizacion_id
      WHERE ee.etapa = 'personal'
    `;
    const params: any[] = [];

    if (estado && typeof estado === 'string') {
      const normalized = estado.trim().toLowerCase();
      if (['pendiente', 'pendientes', 'en_revision'].includes(normalized)) {
        sql += ` AND ee_tecnica.estado = 'aprobado' AND ee.estado IN ('pendiente', 'en_revision')`;
      } else if (normalized === 'bloqueadas' || normalized === 'bloqueada') {
        sql += ` AND ee_tecnica.estado != 'aprobado'`;
      } else if (normalized !== 'todos') {
        const statusMap: Record<string, string> = { aprobados: 'aprobado', observados: 'observado', rechazados: 'rechazado' };
        params.push(statusMap[normalized] || normalized);
        sql += ` AND ee.estado = $${params.length}`;
      }
    }
    if (proyecto_id) {
      params.push(proyecto_id);
      sql += ` AND proy.id = $${params.length}`;
    }
    if (q && typeof q === 'string' && q.trim()) {
      params.push(`%${q.trim()}%`);
      sql += ` AND (p.nombres ILIKE $${params.length} OR p.apellidos ILIKE $${params.length}
        OR p.ci ILIKE $${params.length} OR COALESCE(p.profesion_ocupacion, '') ILIKE $${params.length}
        OR COALESCE(p.habilidades, '') ILIKE $${params.length} OR proy.titulo ILIKE $${params.length})`;
    }
    sql += ' ORDER BY ee.id DESC';

    const rows = await query<any>(sql, params);
    const formatted = rows.map((row: any) => {
      const criteria = row.detalle_criterios_personales && typeof row.detalle_criterios_personales === 'object'
        ? row.detalle_criterios_personales
        : {};
      const scoreCount = Object.values(criteria).filter((value) => typeof value === 'number').length;
      const age = calculateAge(row.fecha_nacimiento);
      return {
        etapa_id: row.etapa_id,
        postulacion_id: row.postulacion_id,
        etapa_estado: row.etapa_estado,
        evaluador: row.evaluador,
        comentarios: row.comentarios,
        fecha_evaluacion: row.fecha_evaluacion,
        detalle_criterios_personales: criteria,
        puntaje_promedio: scoreCount === 5 ? calculatePersonalAverage(criteria) : null,
        tecnica_estado: row.tecnica_estado,
        puede_evaluar: row.tecnica_estado === 'aprobado',
        postulante: {
          id: row.postulante_id,
          nombres: row.nombres,
          apellidos: row.apellidos,
          ci: row.ci,
          email: row.email,
          telefono: row.telefono,
          fecha_nacimiento: row.fecha_nacimiento,
          edad: age,
          es_mayor_edad: age >= 18,
          profesion_ocupacion: row.profesion_ocupacion,
          habilidades: row.habilidades,
          motivacion: row.motivacion,
        },
        proyecto: {
          id: row.proyecto_id,
          titulo: row.proyecto_titulo,
          ubicacion: row.proyecto_ubicacion,
          organizacion_nombre: row.organizacion_nombre,
        },
      };
    });
    const finalRows = filterAndSortEvaluationItems(formatted, {
      categoria: cleanCategoria,
      puntajeMin: scoreRange.min,
      puntajeMax: scoreRange.max,
      ordenar: cleanSort,
    });

    await cacheService.set(cacheKey, finalRows, 45);
    res.setHeader('X-Cache', 'MISS');
    res.setHeader('X-Cache-Backend', cacheService.getStats().backend);
    res.json(finalRows);
  } catch (err: any) {
    console.error('Error fetching personal evaluations:', err);
    res.status(500).json({ error: 'Error al consultar evaluaciones personales' });
  }
});

// KIR-63: Registra entrevista personal y habilita la etapa por competencias.
router.post('/evaluaciones/personal/:postulacion_id', async (req: Request, res: Response) => {
  try {
    const { postulacion_id } = req.params;
    const { estado, evaluador, comentarios, criterios } = req.body ?? {};

    if (!isPersonalDecision(estado)) {
      return res.status(400).json({ error: 'La decisión debe ser aprobado, observado o rechazado' });
    }
    if (!validatePersonalScores(criterios)) {
      return res.status(400).json({ error: 'Asigne una puntuación de 1 a 5 a cada criterio de entrevista personal' });
    }
    if ((estado === 'rechazado' || estado === 'observado') &&
        (typeof comentarios !== 'string' || comentarios.trim().length < 5)) {
      return res.status(400).json({ error: 'Detalle el motivo de la observación o rechazo (mínimo 5 caracteres)' });
    }

    const previousStage = await query<{ estado: string }>(
      `SELECT estado FROM evaluaciones_etapas WHERE postulacion_id = $1 AND etapa = 'tecnica'`,
      [postulacion_id]
    );
    if (!previousStage.length) {
      return res.status(404).json({ error: 'No se encontró la postulación o su etapa técnica' });
    }
    if (previousStage[0].estado !== 'aprobado') {
      return res.status(400).json({ error: 'La etapa técnica debe estar aprobada antes de la entrevista personal' });
    }

    const evaluatorName = typeof evaluador === 'string' && evaluador.trim()
      ? evaluador.trim()
      : 'Comité de Entrevista Personal';
    const scoreAverage = calculatePersonalAverage(criterios);
    const comments = typeof comentarios === 'string' ? comentarios.trim() : '';
    const updated = await query<any>(
      `UPDATE evaluaciones_etapas
       SET estado = $1, detalle_criterios_personales = $2::jsonb,
           comentarios = $3, evaluador = $4, fecha_evaluacion = NOW()
       WHERE postulacion_id = $5 AND etapa = 'personal'
       RETURNING *`,
      [estado, JSON.stringify(criterios), comments || `Puntaje promedio: ${scoreAverage}/5`, evaluatorName, postulacion_id]
    );
    if (!updated.length) {
      return res.status(404).json({ error: 'No se encontró la etapa personal para esta postulación' });
    }

    if (estado === 'aprobado') {
      await query(
        `UPDATE evaluaciones_etapas SET estado = 'en_revision', fecha_evaluacion = NOW()
         WHERE postulacion_id = $1 AND etapa = 'competencias' AND estado = 'pendiente'`,
        [postulacion_id]
      );
      await query(`UPDATE postulaciones SET estado_general = 'en_proceso', updated_at = NOW() WHERE id = $1`, [postulacion_id]);
    } else if (estado === 'rechazado') {
      await query(`UPDATE postulaciones SET estado_general = 'rechazado', updated_at = NOW() WHERE id = $1`, [postulacion_id]);
    } else if (estado === 'observado') {
      await query(`UPDATE postulaciones SET estado_general = 'en_proceso', updated_at = NOW() WHERE id = $1`, [postulacion_id]);
    }

    await Promise.all([
      cacheService.delByPrefix('evaluaciones:'),
      cacheService.delByPrefix('postulantes:'),
    ]);
    await recordSystemLog({
      ...getActorMeta(req),
      action: 'EVALUATION_PERSONAL',
      module: 'evaluaciones',
      status: 'success',
      details: `Entrevista personal de postulación ${postulacion_id} registrada como ${estado} (promedio ${scoreAverage}/5)`,
    }).catch(() => {});

    res.json({
      message: `Evaluación personal registrada (${estado})`,
      etapa: updated[0],
      postulacion_id: Number(postulacion_id),
      puntaje_promedio: scoreAverage,
      estado_general: estado === 'rechazado' ? 'rechazado' : 'en_proceso',
    });
  } catch (err: any) {
    console.error('Error recording personal evaluation:', err);
    res.status(500).json({ error: 'Error al registrar evaluación personal' });
  }
});

// KIR-59: Consulta de postulaciones en la evaluación por competencias.
router.get('/evaluaciones/competencias', async (req: Request, res: Response) => {
  try {
    const { estado, proyecto_id, q, categoria, puntaje_min, puntaje_max, ordenar } = req.query;
    const scoreRange = validateScoreRange(puntaje_min, puntaje_max, 100);
    if (!scoreRange.ok) {
      return res.status(400).json({ error: scoreRange.error });
    }
    const cleanCategoria = normalizeCategoryFilter(categoria);
    const cleanSort = normalizeSortOrder(ordenar, EVALUATION_SORT_OPTIONS, 'recientes');
    const cacheKey = buildCacheKey('evaluaciones:competencias', {
      estado,
      proyecto_id,
      q,
      categoria: cleanCategoria,
      puntaje_min: scoreRange.min,
      puntaje_max: scoreRange.max,
      ordenar: cleanSort,
    });
    const cached = await cacheService.get<any[]>(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('X-Cache-Backend', cacheService.getStats().backend);
      return res.json(cached);
    }
    let sql = `
      SELECT ee.id AS etapa_id, ee.postulacion_id, ee.estado AS etapa_estado,
             ee.evaluador, ee.comentarios, ee.fecha_evaluacion, ee.detalle_criterios,
             ee_tecnica.estado AS tecnica_estado, ee_personal.estado AS personal_estado,
             p.id AS postulante_id, p.nombres, p.apellidos, p.ci, p.email, p.telefono,
             p.fecha_nacimiento, p.profesion_ocupacion, p.habilidades, p.motivacion,
             proy.id AS proyecto_id, proy.titulo AS proyecto_titulo,
             proy.ubicacion AS proyecto_ubicacion, org.nombre AS organizacion_nombre
      FROM evaluaciones_etapas ee
      JOIN evaluaciones_etapas ee_tecnica
        ON ee_tecnica.postulacion_id = ee.postulacion_id AND ee_tecnica.etapa = 'tecnica'
      JOIN evaluaciones_etapas ee_personal
        ON ee_personal.postulacion_id = ee.postulacion_id AND ee_personal.etapa = 'personal'
      JOIN postulaciones app ON app.id = ee.postulacion_id
      JOIN postulantes p ON p.id = app.postulante_id
      JOIN proyectos proy ON proy.id = app.proyecto_id
      LEFT JOIN organizaciones org ON org.id = proy.organizacion_id
      WHERE ee.etapa = 'competencias'
    `;
    const params: any[] = [];

    if (estado && typeof estado === 'string') {
      const normalized = estado.trim().toLowerCase();
      if (['pendiente', 'pendientes', 'en_revision'].includes(normalized)) {
        sql += ` AND ee_tecnica.estado = 'aprobado' AND ee_personal.estado = 'aprobado' AND ee.estado IN ('pendiente', 'en_revision')`;
      } else if (normalized === 'bloqueadas' || normalized === 'bloqueada') {
        sql += ` AND (ee_tecnica.estado != 'aprobado' OR ee_personal.estado != 'aprobado')`;
      } else if (normalized !== 'todos') {
        const statusMap: Record<string, string> = { aprobados: 'aprobado', observados: 'observado', rechazados: 'rechazado' };
        params.push(statusMap[normalized] || normalized);
        sql += ` AND ee.estado = $${params.length}`;
      }
    }
    if (proyecto_id) {
      params.push(proyecto_id);
      sql += ` AND proy.id = $${params.length}`;
    }
    if (q && typeof q === 'string' && q.trim()) {
      params.push(`%${q.trim()}%`);
      sql += ` AND (p.nombres ILIKE $${params.length} OR p.apellidos ILIKE $${params.length}
        OR p.ci ILIKE $${params.length} OR COALESCE(p.profesion_ocupacion, '') ILIKE $${params.length}
        OR COALESCE(p.habilidades, '') ILIKE $${params.length} OR proy.titulo ILIKE $${params.length})`;
    }
    sql += ' ORDER BY ee.id DESC';

    const rows = await query<any>(sql, params);
    const formatted = rows.map((row: any) => {
      const criteria = row.detalle_criterios && typeof row.detalle_criterios === 'object' ? row.detalle_criterios : {};
      const scoreCount = Object.values(criteria).filter((value) => typeof value === 'number').length;
      const age = calculateAge(row.fecha_nacimiento);
      return {
        etapa_id: row.etapa_id,
        postulacion_id: row.postulacion_id,
        etapa_estado: row.etapa_estado,
        evaluador: row.evaluador,
        comentarios: row.comentarios,
        fecha_evaluacion: row.fecha_evaluacion,
        detalle_criterios: criteria,
        puntaje_promedio: scoreCount === 5 ? calculateCompetencyAverage(criteria) : null,
        tecnica_estado: row.tecnica_estado,
        personal_estado: row.personal_estado,
        puede_evaluar: row.tecnica_estado === 'aprobado' && row.personal_estado === 'aprobado',
        postulante: {
          id: row.postulante_id,
          nombres: row.nombres,
          apellidos: row.apellidos,
          ci: row.ci,
          email: row.email,
          telefono: row.telefono,
          fecha_nacimiento: row.fecha_nacimiento,
          edad: age,
          es_mayor_edad: age >= 18,
          profesion_ocupacion: row.profesion_ocupacion,
          habilidades: row.habilidades,
          motivacion: row.motivacion,
        },
        proyecto: {
          id: row.proyecto_id,
          titulo: row.proyecto_titulo,
          ubicacion: row.proyecto_ubicacion,
          organizacion_nombre: row.organizacion_nombre,
        },
      };
    });
    const finalRows = filterAndSortEvaluationItems(formatted, {
      categoria: cleanCategoria,
      puntajeMin: scoreRange.min,
      puntajeMax: scoreRange.max,
      ordenar: cleanSort,
    });

    await cacheService.set(cacheKey, finalRows, 45);
    res.setHeader('X-Cache', 'MISS');
    res.setHeader('X-Cache-Backend', cacheService.getStats().backend);
    res.json(finalRows);
  } catch (err: any) {
    console.error('Error fetching competency evaluations:', err);
    res.status(500).json({ error: 'Error al consultar evaluaciones por competencias' });
  }
});

// KIR-59: Registra la rúbrica y habilita salud integral al aprobar competencias.
router.post('/evaluaciones/competencias/:postulacion_id', async (req: Request, res: Response) => {
  try {
    const { postulacion_id } = req.params;
    const { estado, evaluador, comentarios, criterios } = req.body ?? {};

    if (!isCompetencyDecision(estado)) {
      return res.status(400).json({ error: 'La decisión debe ser aprobado, observado o rechazado' });
    }
    if (!validateCompetencyScores(criterios)) {
      return res.status(400).json({ error: 'Asigne una puntuación de 1 a 5 a cada criterio de competencias' });
    }
    if ((estado === 'rechazado' || estado === 'observado') &&
        (typeof comentarios !== 'string' || comentarios.trim().length < 5)) {
      return res.status(400).json({ error: 'Detalle el motivo del rechazo u observación (mínimo 5 caracteres)' });
    }

    const previousStages = await query<{ etapa: string; estado: string }>(
      `SELECT etapa, estado FROM evaluaciones_etapas
       WHERE postulacion_id = $1 AND etapa IN ('tecnica', 'personal')`,
      [postulacion_id]
    );
    const stageStates = new Map(previousStages.map((stage) => [stage.etapa, stage.estado]));
    if (!stageStates.has('tecnica') || !stageStates.has('personal')) {
      return res.status(404).json({ error: 'No se encontró la postulación o sus etapas previas' });
    }
    if (stageStates.get('tecnica') !== 'aprobado' || stageStates.get('personal') !== 'aprobado') {
      return res.status(400).json({ error: 'Las etapas técnica y personal deben estar aprobadas antes de competencias' });
    }

    const evaluatorName = typeof evaluador === 'string' && evaluador.trim()
      ? evaluador.trim()
      : 'Comité de Evaluación por Competencias';
    const scoreAverage = calculateCompetencyAverage(criterios);
    const comments = typeof comentarios === 'string' ? comentarios.trim() : '';
    const updated = await query<any>(
      `UPDATE evaluaciones_etapas
       SET estado = $1, detalle_criterios = $2::jsonb,
           comentarios = $3, evaluador = $4, fecha_evaluacion = NOW()
       WHERE postulacion_id = $5 AND etapa = 'competencias'
       RETURNING *`,
      [estado, JSON.stringify(criterios), comments || `Puntaje promedio: ${scoreAverage}/5`, evaluatorName, postulacion_id]
    );
    if (!updated.length) {
      return res.status(404).json({ error: 'No se encontró la etapa de competencias para esta postulación' });
    }

    if (estado === 'aprobado') {
      await query(
        `UPDATE evaluaciones_etapas SET estado = 'en_revision', fecha_evaluacion = NOW()
         WHERE postulacion_id = $1 AND etapa = 'salud_fisica_psicologica' AND estado = 'pendiente'`,
        [postulacion_id]
      );
      await query(`UPDATE postulaciones SET estado_general = 'en_proceso', updated_at = NOW() WHERE id = $1`, [postulacion_id]);
    } else if (estado === 'rechazado') {
      await query(`UPDATE postulaciones SET estado_general = 'rechazado', updated_at = NOW() WHERE id = $1`, [postulacion_id]);
    } else if (estado === 'observado') {
      await query(`UPDATE postulaciones SET estado_general = 'en_proceso', updated_at = NOW() WHERE id = $1`, [postulacion_id]);
    }

    await Promise.all([
      cacheService.delByPrefix('evaluaciones:'),
      cacheService.delByPrefix('postulantes:'),
    ]);
    await recordSystemLog({
      ...getActorMeta(req),
      action: 'EVALUATION_COMPETENCY',
      module: 'evaluaciones',
      status: 'success',
      details: `Evaluación por competencias de postulación ${postulacion_id} registrada como ${estado} (promedio ${scoreAverage}/5)`,
    }).catch(() => {});

    res.json({
      message: `Evaluación por competencias registrada (${estado})`,
      etapa: updated[0],
      postulacion_id: Number(postulacion_id),
      puntaje_promedio: scoreAverage,
      estado_general: estado === 'rechazado' ? 'rechazado' : 'en_proceso',
    });
  } catch (err: any) {
    console.error('Error recording competency evaluation:', err);
    res.status(500).json({ error: 'Error al registrar evaluación por competencias' });
  }
});

// Calificar etapa de evaluación
router.patch('/evaluaciones/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { estado, comentarios, evaluador } = req.body;

    if (!['pendiente', 'en_revision', 'aprobado', 'observado', 'rechazado'].includes(estado)) {
      return res.status(400).json({ error: 'Estado de etapa inválido' });
    }

    const stageRows = await query<{ etapa: string }>(
      'SELECT etapa FROM evaluaciones_etapas WHERE id = $1',
      [id]
    );
    if (!stageRows.length) {
      return res.status(404).json({ error: 'Etapa de evaluación no encontrada' });
    }
    if (stageRows[0].etapa === 'competencias' || stageRows[0].etapa === 'personal') {
      return res.status(400).json({ error: 'Use el formulario especializado de la etapa para registrar su rúbrica' });
    }

    const rows = await query(
      `UPDATE evaluaciones_etapas 
       SET estado = $1, 
           comentarios = COALESCE($2, comentarios),
           evaluador = COALESCE($3, evaluador),
           fecha_evaluacion = NOW()
       WHERE id = $4
       RETURNING *`,
      [estado, comentarios || null, evaluador || null, id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Etapa de evaluación no encontrada' });
    }

    const etapa = rows[0];

    // Desbloquear automáticamente la etapa siguiente en el flujo secuencial
    if (estado === 'aprobado') {
      const nextStageMap: Record<string, string> = {
        inicial: 'tecnica',
        tecnica: 'personal',
        personal: 'competencias',
        competencias: 'salud_fisica_psicologica',
      };
      const nextStage = nextStageMap[etapa.etapa];
      if (nextStage) {
        await query(
          `UPDATE evaluaciones_etapas
           SET estado = 'en_revision', fecha_evaluacion = NOW()
           WHERE postulacion_id = $1 AND etapa = $2 AND estado = 'pendiente'`,
          [etapa.postulacion_id, nextStage]
        );
      }
    }

    // Verificar si todas las 5 etapas están aprobadas para actualizar automáticamente el estado_general
    const allStages = await query(
      'SELECT estado FROM evaluaciones_etapas WHERE postulacion_id = $1',
      [etapa.postulacion_id]
    );

    const anyRejected = allStages.some((s: any) => s.estado === 'rechazado');
    const allApproved = allStages.length === 5 && allStages.every((s: any) => s.estado === 'aprobado');

    if (anyRejected) {
      await query(
        `UPDATE postulaciones 
         SET estado_general = 'rechazado', updated_at = NOW() 
         WHERE id = $1`,
        [etapa.postulacion_id]
      );
    } else if (allApproved) {
      await query(
        `UPDATE postulaciones 
         SET estado_general = 'aprobado', updated_at = NOW() 
         WHERE id = $1`,
        [etapa.postulacion_id]
      );
    }

    await Promise.all([
      cacheService.delByPrefix('evaluaciones:'),
      cacheService.delByPrefix('postulantes:'),
    ]);
    await recordSystemLog({
      ...getActorMeta(req),
      action: 'EVALUATION_STAGE_UPDATE',
      module: 'evaluaciones',
      status: 'success',
      details: `Etapa ${etapa.etapa} (ID ${id}) actualizada a ${estado}`,
    }).catch(() => {});

    res.json(etapa);
  } catch (err: any) {
    console.error('Error updating etapa:', err);
    res.status(500).json({ error: 'Error al calificar etapa de evaluación' });
  }
});

// Reasignación de postulante (KIR: Reasignación)
const handleReasignacion = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { nuevo_proyecto_id, es_reasignacion, es_reenganche } = req.body;
    const isReassigned = es_reasignacion !== undefined ? es_reasignacion : (es_reenganche !== undefined ? es_reenganche : true);

    if (nuevo_proyecto_id) {
      // Reasignar a otro proyecto
      const rows = await query(
        `UPDATE postulaciones 
         SET proyecto_id = $1, 
             es_reasignacion = true, 
             estado_general = 'reasignacion',
             updated_at = NOW() 
         WHERE id = $2 
         RETURNING *`,
        [nuevo_proyecto_id, id]
      );
      await Promise.all([
        cacheService.delByPrefix('postulantes:'),
        cacheService.delByPrefix('evaluaciones:'),
      ]);
      await recordSystemLog({
        ...getActorMeta(req),
        action: 'APPLICATION_REASSIGN',
        module: 'postulaciones',
        status: 'success',
        details: `Postulación ${id} reasignada al proyecto ${nuevo_proyecto_id}`,
      }).catch(() => {});
      return res.json(rows[0]);
    } else {
      const rows = await query(
        `UPDATE postulaciones 
         SET es_reasignacion = $1, 
             estado_general = CASE WHEN $1 THEN 'reasignacion' ELSE estado_general END,
             updated_at = NOW() 
         WHERE id = $2 
         RETURNING *`,
        [isReassigned, id]
      );
      await Promise.all([
        cacheService.delByPrefix('postulantes:'),
        cacheService.delByPrefix('evaluaciones:'),
      ]);
      await recordSystemLog({
        ...getActorMeta(req),
        action: 'APPLICATION_REASSIGN',
        module: 'postulaciones',
        status: 'success',
        details: `Postulación ${id} marcada con reasignación=${Boolean(isReassigned)}`,
      }).catch(() => {});
      return res.json(rows[0]);
    }
  } catch (err: any) {
    console.error('Error managing reasignacion:', err);
    res.status(500).json({ error: 'Error al gestionar reasignación' });
  }
};

router.patch('/postulaciones/:id/reasignacion', handleReasignacion);
router.patch('/postulaciones/:id/reenganche', handleReasignacion);

// Actualizar estado general de la postulación
router.patch('/postulaciones/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { estado_general } = req.body;

    if (!['en_proceso', 'aprobado', 'rechazado', 'reasignacion', 'reenganche'].includes(estado_general)) {
      return res.status(400).json({ error: 'Estado general inválido' });
    }

    const rows = await query(
      `UPDATE postulaciones 
       SET estado_general = $1, updated_at = NOW() 
       WHERE id = $2 
       RETURNING *`,
      [estado_general, id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Postulación no encontrada' });
    }

    await Promise.all([
      cacheService.delByPrefix('postulantes:'),
      cacheService.delByPrefix('evaluaciones:'),
    ]);
    await recordSystemLog({
      ...getActorMeta(req),
      action: 'APPLICATION_STATUS_UPDATE',
      module: 'postulaciones',
      status: 'success',
      details: `Estado general de postulación ${id} cambiado a ${estado_general}`,
    }).catch(() => {});

    res.json(rows[0]);
  } catch (err: any) {
    console.error('Error updating postulacion status:', err);
    res.status(500).json({ error: 'Error al cambiar estado de postulación' });
  }
});

// -------------------------------------------------------------
// 4. DONACIONES, VÍNCULO DONANTE-RECEPTOR Y TRAZABILIDAD (KIR-32)
// -------------------------------------------------------------
function mapEntregaRow(e: any) {
  return {
    id: e.id,
    donacion_id: e.donacion_id,
    donante_id: e.donante_id,
    receptor_id: e.receptor_id,
    proyecto_id: e.proyecto_id,
    organizacion_id: e.organizacion_id,
    codigo_entrega: e.codigo_entrega || formatDeliveryCode(e.id),
    estado: e.estado,
    monto_entregado_bob: e.monto_entregado_bob !== null && e.monto_entregado_bob !== undefined
      ? Number(e.monto_entregado_bob)
      : null,
    detalle_bienes_entregados: e.detalle_bienes_entregados,
    responsable_entrega: e.responsable_entrega,
    recibido_por_receptor: e.recibido_por_receptor,
    fecha_entrega: e.fecha_entrega,
    observaciones: e.observaciones,
    created_at: e.created_at,
    updated_at: e.updated_at,
    proyecto_titulo: e.proyecto_titulo || null,
    organizacion_nombre: e.organizacion_nombre || null,
    receptor: e.receptor_id
      ? {
          id: e.receptor_id,
          nombre: e.receptor_nombre,
          tipo_receptor: e.receptor_tipo,
          documento_identidad: e.receptor_documento,
          email: e.receptor_email,
          telefono: e.receptor_telefono,
          ubicacion: e.receptor_ubicacion,
          proyecto_id: e.receptor_proyecto_id,
          organizacion_id: e.receptor_organizacion_id,
          proyecto_titulo: e.proyecto_titulo || null,
          organizacion_nombre: e.organizacion_nombre || null,
        }
      : null,
  };
}

router.get('/donaciones/donantes', async (_req: Request, res: Response) => {
  try {
    const rows = await query(`
      SELECT dn.*, COUNT(d.id)::int AS total_donaciones
      FROM donantes dn
      LEFT JOIN donaciones d ON d.donante_id = dn.id
      GROUP BY dn.id
      ORDER BY dn.created_at DESC, dn.id DESC
      LIMIT 100
    `);
    res.json(rows);
  } catch (err: any) {
    console.error('Error fetching donantes:', err);
    res.status(500).json({ error: 'Error al consultar donantes registrados' });
  }
});

router.get('/donaciones/receptores', async (_req: Request, res: Response) => {
  try {
    const rows = await query(`
      SELECT r.*,
             p.titulo AS proyecto_titulo,
             o.nombre AS organizacion_nombre
      FROM receptores r
      LEFT JOIN proyectos p ON r.proyecto_id = p.id
      LEFT JOIN organizaciones o ON r.organizacion_id = o.id
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT 100
    `);
    res.json(rows);
  } catch (err: any) {
    console.error('Error fetching receptores:', err);
    res.status(500).json({ error: 'Error al consultar receptores registrados' });
  }
});

// KIR-33 (KIR-35): Consultar historial de donaciones con filtros y paginación
router.get('/donaciones/historial', async (req: Request, res: Response) => {
  try {
    const parsed = parseDonationHistoryFilters(req.query as Record<string, unknown>);
    if (!parsed.valid) {
      return res.status(400).json({ error: parsed.error });
    }

    const priceRange = validatePriceRange(
      req.query.monto_min ?? req.query.precio_min,
      req.query.monto_max ?? req.query.precio_max
    );
    if (!priceRange.ok) {
      return res.status(400).json({ error: priceRange.error });
    }

    const cleanCategoria = normalizeCategoryFilter(req.query.categoria);
    const cleanSort = normalizeSortOrder(req.query.ordenar, DONATION_SORT_OPTIONS, 'recientes');
    const { filters } = parsed;

    const cacheKey = buildCacheKey('donaciones:historial', {
      ...filters,
      categoria: cleanCategoria,
      monto_min: priceRange.min,
      monto_max: priceRange.max,
      ordenar: cleanSort,
    });
    const cached = await cacheService.get<any>(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('X-Cache-Backend', cacheService.getStats().backend);
      return res.json(cached);
    }

    const { whereSql, params } = buildDonationHistoryConditions(filters);
    const extraClauses: string[] = [];
    const queryParams: any[] = [...params];

    if (cleanCategoria) {
      queryParams.push(cleanCategoria);
      extraClauses.push(`LOWER(COALESCE(d.categoria_especie, '')) = LOWER($${queryParams.length})`);
    }
    if (priceRange.min !== null) {
      queryParams.push(priceRange.min);
      extraClauses.push(`COALESCE(d.monto_bob, 0) >= $${queryParams.length}`);
    }
    if (priceRange.max !== null) {
      queryParams.push(priceRange.max);
      extraClauses.push(`COALESCE(d.monto_bob, 0) <= $${queryParams.length}`);
    }

    const combinedWhere =
      extraClauses.length > 0
        ? whereSql
          ? `${whereSql} AND ${extraClauses.join(' AND ')}`
          : `WHERE ${extraClauses.join(' AND ')}`
        : whereSql;

    const orderByMap: Record<string, string> = {
      recientes: 'd.fecha_recepcion DESC, d.id DESC',
      monto_desc: 'COALESCE(d.monto_bob, 0) DESC, d.fecha_recepcion DESC',
      monto_asc: 'COALESCE(d.monto_bob, 0) ASC, d.fecha_recepcion DESC',
      donante_asc: 'd.donante_nombre ASC, d.fecha_recepcion DESC',
    };
    const orderBy = orderByMap[cleanSort] || orderByMap.recientes;

    const summaryRows = await query<any>(
      `SELECT COUNT(*)::int AS total,
              COALESCE(SUM(CASE WHEN d.tipo_donacion = 'economica' THEN d.monto_bob ELSE 0 END), 0) AS monto_economico_bob,
              COUNT(*) FILTER (WHERE d.tipo_donacion = 'especie')::int AS aportes_especie
       FROM donaciones d
       LEFT JOIN proyectos p ON p.id = d.proyecto_destino_id
       ${combinedWhere}`,
      queryParams
    );

    const limitPlaceholder = `$${queryParams.length + 1}`;
    const offsetPlaceholder = `$${queryParams.length + 2}`;

    const rows = await query<DonationHistoryRow>(
      `SELECT d.id,
              COALESCE(d.codigo_donacion, 'KIR-DON-' || d.id::text) AS codigo_donacion,
              COALESCE(d.estado_entrega, 'recibida') AS estado_entrega,
              d.donante_nombre,
              d.tipo_donacion,
              d.monto_bob,
              d.descripcion_especie,
              d.proyecto_destino_id,
              d.recibido_por,
              d.fecha_recepcion,
              p.titulo AS proyecto_titulo,
              p.ubicacion AS proyecto_ubicacion
       FROM donaciones d
       LEFT JOIN proyectos p ON p.id = d.proyecto_destino_id
       ${combinedWhere}
       ORDER BY ${orderBy}
       LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
      [...queryParams, filters.limite, (filters.pagina - 1) * filters.limite]
    );

    const summary = summaryRows[0] || { total: 0, monto_economico_bob: 0, aportes_especie: 0 };
    const total = Number(summary.total);

    const payload = {
      items: rows.map(toDonationHistoryItem),
      resumen: {
        total_aportes: total,
        monto_economico_bob: Number(summary.monto_economico_bob),
        aportes_especie: Number(summary.aportes_especie),
      },
      paginacion: {
        pagina: filters.pagina,
        limite: filters.limite,
        paginas: Math.ceil(total / filters.limite),
      },
    };

    await cacheService.set(cacheKey, payload, 45);
    res.setHeader('X-Cache', 'MISS');
    res.setHeader('X-Cache-Backend', cacheService.getStats().backend);
    res.json(payload);
  } catch (err: any) {
    console.error('Error fetching donation history:', err);
    res.status(500).json({ error: 'Error al consultar el historial de donaciones' });
  }
});

router.get('/donaciones', async (req: Request, res: Response) => {
  try {
    const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const tipoFilter = typeof req.query.tipo === 'string' ? req.query.tipo.trim() : '';
    const estadoEntregaFilter =
      typeof req.query.estado_entrega === 'string' ? req.query.estado_entrega.trim() : '';
    const origenFilter =
      typeof req.query.origen === 'string' ? req.query.origen.trim() : '';
    const cleanCategoria = normalizeCategoryFilter(req.query.categoria);
    const cleanSort = normalizeSortOrder(req.query.ordenar, DONATION_SORT_OPTIONS, 'recientes');
    const priceRange = validatePriceRange(
      req.query.monto_min ?? req.query.precio_min,
      req.query.monto_max ?? req.query.precio_max
    );
    if (!priceRange.ok) {
      return res.status(400).json({ error: priceRange.error });
    }

    const cacheKey = buildCacheKey('donaciones:list', {
      q: search,
      tipo: tipoFilter,
      estado_entrega: estadoEntregaFilter,
      origen: origenFilter,
      categoria: cleanCategoria,
      monto_min: priceRange.min,
      monto_max: priceRange.max,
      ordenar: cleanSort,
    });
    const cached = await cacheService.get<any[]>(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('X-Cache-Backend', cacheService.getStats().backend);
      return res.json(cached);
    }

    const conditions: string[] = [];
    const params: any[] = [];

    if (tipoFilter && ['economica', 'especie'].includes(tipoFilter)) {
      params.push(tipoFilter);
      conditions.push(`d.tipo_donacion = $${params.length}`);
    }

    if (
      estadoEntregaFilter &&
      ['ofrecida', 'recibida', 'en_preparacion', 'entrega_parcial', 'entregada'].includes(estadoEntregaFilter)
    ) {
      params.push(estadoEntregaFilter);
      conditions.push(`COALESCE(d.estado_entrega, 'recibida') = $${params.length}`);
    }

    if (origenFilter && ['oferta_donante', 'recepcion_interna'].includes(origenFilter)) {
      params.push(origenFilter);
      conditions.push(`COALESCE(d.origen_registro, 'recepcion_interna') = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      const pIdx = params.length;
      conditions.push(`(
        d.donante_nombre ILIKE $${pIdx}
        OR COALESCE(d.codigo_donacion, 'KIR-DON-' || d.id::text) ILIKE $${pIdx}
        OR COALESCE(d.descripcion_especie, '') ILIKE $${pIdx}
        OR COALESCE(p.titulo, '') ILIKE $${pIdx}
        OR EXISTS (
          SELECT 1
          FROM entregas_donaciones ed
          JOIN receptores rec ON rec.id = ed.receptor_id
          WHERE ed.donacion_id = d.id
            AND (rec.nombre ILIKE $${pIdx} OR COALESCE(ed.codigo_entrega, '') ILIKE $${pIdx})
        )
      )`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const donationsRows = await query(
      `
      SELECT d.*,
             p.titulo AS proyecto_titulo,
             p.ubicacion AS proyecto_ubicacion,
             dn.nombre AS dn_nombre,
             dn.tipo_donante AS dn_tipo_donante,
             dn.documento_identidad AS dn_documento_identidad,
             dn.email AS dn_email,
             dn.telefono AS dn_telefono,
             dn.ciudad AS dn_ciudad
      FROM donaciones d
      LEFT JOIN proyectos p ON d.proyecto_destino_id = p.id
      LEFT JOIN donantes dn ON d.donante_id = dn.id
      ${whereClause}
      ORDER BY d.fecha_recepcion DESC, d.id DESC
    `,
      params
    );

    if (!donationsRows.length) {
      return res.json([]);
    }

    const donationIds = donationsRows.map((d: any) => d.id);
    const entregasRows = await query(
      `
      SELECT e.*,
             r.nombre AS receptor_nombre,
             r.tipo_receptor AS receptor_tipo,
             r.documento_identidad AS receptor_documento,
             r.email AS receptor_email,
             r.telefono AS receptor_telefono,
             r.ubicacion AS receptor_ubicacion,
             r.proyecto_id AS receptor_proyecto_id,
             r.organizacion_id AS receptor_organizacion_id,
             p.titulo AS proyecto_titulo,
             o.nombre AS organizacion_nombre
      FROM entregas_donaciones e
      JOIN receptores r ON e.receptor_id = r.id
      LEFT JOIN proyectos p ON COALESCE(e.proyecto_id, r.proyecto_id) = p.id
      LEFT JOIN organizaciones o ON COALESCE(e.organizacion_id, r.organizacion_id) = o.id
      WHERE e.donacion_id = ANY($1::int[])
      ORDER BY e.fecha_entrega DESC, e.id DESC
    `,
      [donationIds]
    );

    const entregasByDonation = new Map<number, any[]>();
    for (const row of entregasRows) {
      const mapped = mapEntregaRow(row);
      const list = entregasByDonation.get(row.donacion_id) || [];
      list.push(mapped);
      entregasByDonation.set(row.donacion_id, list);
    }

    const formatted = donationsRows.map((r: any) => {
      const entregas = entregasByDonation.get(r.id) || [];
      const balance = calculateDonationBalance(r.tipo_donacion, r.monto_bob, entregas);
      const derivedStatus = deriveDonationDeliveryStatus(
        r.tipo_donacion,
        r.monto_bob,
        entregas,
        r.estado_entrega
      );

      return {
        ...r,
        monto_bob: r.monto_bob !== null && r.monto_bob !== undefined ? Number(r.monto_bob) : null,
        codigo_donacion: r.codigo_donacion || formatDonationCode(r.id),
        estado_entrega: r.estado_entrega || derivedStatus,
        proyecto: r.proyecto_destino_id
          ? {
              id: r.proyecto_destino_id,
              titulo: r.proyecto_titulo,
              ubicacion: r.proyecto_ubicacion,
            }
          : null,
        donante: r.donante_id
          ? {
              id: r.donante_id,
              nombre: r.dn_nombre || r.donante_nombre,
              tipo_donante: r.dn_tipo_donante || r.donante_tipo || 'persona',
              documento_identidad: r.dn_documento_identidad || r.donante_documento || null,
              email: r.dn_email || r.donante_email || null,
              telefono: r.dn_telefono || r.donante_telefono || null,
              ciudad: r.dn_ciudad || null,
            }
          : {
              id: `legacy-${r.id}`,
              nombre: r.donante_nombre,
              tipo_donante: r.donante_tipo || 'persona',
              documento_identidad: r.donante_documento || null,
              email: r.donante_email || null,
              telefono: r.donante_telefono || null,
            },
        entregas,
        entregas_count: entregas.length,
        monto_entregado_total: balance.monto_entregado_bob,
        saldo_disponible_bob: balance.saldo_disponible_bob,
        ultimo_receptor: entregas[0]?.receptor?.nombre || null,
      };
    });

    const filteredAndSorted = filterAndSortDonations(formatted, {
      categoria: cleanCategoria,
      montoMin: priceRange.min,
      montoMax: priceRange.max,
      ordenar: cleanSort,
    });

    await cacheService.set(cacheKey, filteredAndSorted, 45);
    res.setHeader('X-Cache', 'MISS');
    res.setHeader('X-Cache-Backend', cacheService.getStats().backend);
    res.json(filteredAndSorted);
  } catch (err: any) {
    console.error('Error fetching donaciones:', err);
    res.status(500).json({ error: 'Error al consultar donaciones' });
  }
});

router.get('/donaciones/:id/trazabilidad', async (req: Request, res: Response) => {
  try {
    const idParam = String(req.params.id || '').trim().toUpperCase();
    const numericId = idParam.startsWith('KIR-DON-')
      ? Number(idParam.replace('KIR-DON-', ''))
      : Number(idParam);

    if (!Number.isInteger(numericId) || numericId <= 0) {
      return res.status(400).json({ error: 'Identificador de donación inválido' });
    }

    const donRows = await query(
      `
      SELECT d.*,
             p.titulo AS proyecto_titulo,
             p.ubicacion AS proyecto_ubicacion,
             dn.nombre AS dn_nombre,
             dn.tipo_donante AS dn_tipo_donante,
             dn.documento_identidad AS dn_documento_identidad,
             dn.email AS dn_email,
             dn.telefono AS dn_telefono,
             dn.ciudad AS dn_ciudad,
             dn.created_at AS dn_created_at
      FROM donaciones d
      LEFT JOIN proyectos p ON d.proyecto_destino_id = p.id
      LEFT JOIN donantes dn ON d.donante_id = dn.id
      WHERE d.id = $1
      LIMIT 1
    `,
      [numericId]
    );

    if (!donRows.length) {
      return res.status(404).json({ error: 'Donación no encontrada' });
    }

    const d = donRows[0];
    const entregasRows = await query(
      `
      SELECT e.*,
             r.nombre AS receptor_nombre,
             r.tipo_receptor AS receptor_tipo,
             r.documento_identidad AS receptor_documento,
             r.email AS receptor_email,
             r.telefono AS receptor_telefono,
             r.ubicacion AS receptor_ubicacion,
             r.proyecto_id AS receptor_proyecto_id,
             r.organizacion_id AS receptor_organizacion_id,
             p.titulo AS proyecto_titulo,
             o.nombre AS organizacion_nombre
      FROM entregas_donaciones e
      JOIN receptores r ON e.receptor_id = r.id
      LEFT JOIN proyectos p ON COALESCE(e.proyecto_id, r.proyecto_id) = p.id
      LEFT JOIN organizaciones o ON COALESCE(e.organizacion_id, r.organizacion_id) = o.id
      WHERE e.donacion_id = $1
      ORDER BY e.fecha_entrega ASC, e.id ASC
    `,
      [numericId]
    );

    const entregas = entregasRows.map(mapEntregaRow);
    const balance = calculateDonationBalance(d.tipo_donacion, d.monto_bob, entregas);
    const estadoEntrega =
      d.estado_entrega ||
      deriveDonationDeliveryStatus(d.tipo_donacion, d.monto_bob, entregas, d.estado_entrega);
    const receptoresUnicos = new Set(entregas.map((e) => e.receptor_id));

    const donante = {
      id: d.donante_id || `legacy-${d.id}`,
      nombre: d.dn_nombre || d.donante_nombre,
      tipo_donante: d.dn_tipo_donante || d.donante_tipo || 'persona',
      documento_identidad: d.dn_documento_identidad || d.donante_documento || null,
      email: d.dn_email || d.donante_email || null,
      telefono: d.dn_telefono || d.donante_telefono || null,
      ciudad: d.dn_ciudad || null,
      created_at: d.dn_created_at || d.fecha_recepcion,
    };

    const proyectoDestino = d.proyecto_destino_id
      ? {
          id: d.proyecto_destino_id,
          titulo: d.proyecto_titulo,
          ubicacion: d.proyecto_ubicacion,
        }
      : null;

    res.json({
      donacion: {
        ...d,
        monto_bob: d.monto_bob !== null && d.monto_bob !== undefined ? Number(d.monto_bob) : null,
        codigo_donacion: d.codigo_donacion || formatDonationCode(d.id),
        estado_entrega: estadoEntrega,
        proyecto: proyectoDestino,
        donante,
      },
      donante,
      proyecto_destino: proyectoDestino,
      entregas,
      resumen: {
        codigo_donacion: d.codigo_donacion || formatDonationCode(d.id),
        estado_entrega: estadoEntrega,
        total_entregas: entregas.length,
        entregas_completadas: balance.entregas_completadas,
        entregas_pendientes: balance.entregas_pendientes,
        monto_total_bob: balance.monto_total_bob,
        monto_entregado_bob: balance.monto_entregado_bob,
        saldo_disponible_bob: balance.saldo_disponible_bob,
        receptores_vinculados: receptoresUnicos.size,
      },
    });
  } catch (err: any) {
    console.error('Error fetching donation traceability:', err);
    res.status(500).json({ error: 'Error al consultar trazabilidad de la donación' });
  }
});

router.post('/donaciones', async (req: Request, res: Response) => {
  const client = await dbPool.connect();
  try {
    const {
      donante_nombre,
      donante_tipo,
      donante_documento,
      donante_email,
      donante_telefono,
      donante_ciudad,
      tipo_donacion,
      monto_bob,
      descripcion_especie,
      proyecto_destino_id,
      recibido_por,
    } = req.body || {};

    const cleanNombre = typeof donante_nombre === 'string' ? donante_nombre.trim() : '';
    const cleanRecibidoPor = typeof recibido_por === 'string' ? recibido_por.trim() : '';

    if (!cleanNombre || !cleanRecibidoPor || !tipo_donacion) {
      return res.status(400).json({
        error: 'Nombre del donante, tipo de donación y persona receptora son obligatorios',
      });
    }

    if (!['economica', 'especie'].includes(tipo_donacion)) {
      return res.status(400).json({ error: 'El tipo de donación debe ser economica o especie' });
    }

    if (tipo_donacion === 'economica' && (!monto_bob || Number(monto_bob) <= 0)) {
      return res.status(400).json({ error: 'Debe ingresar un monto válido en Bs (BOB)' });
    }

    if (tipo_donacion === 'especie' && (!descripcion_especie || !String(descripcion_especie).trim())) {
      return res.status(400).json({ error: 'Debe describir los bienes donados en especie' });
    }

    const cleanEmail = typeof donante_email === 'string' && donante_email.trim() ? donante_email.trim().toLowerCase() : null;
    const cleanDoc = typeof donante_documento === 'string' && donante_documento.trim() ? donante_documento.trim() : null;
    const cleanTel = typeof donante_telefono === 'string' && donante_telefono.trim() ? donante_telefono.trim() : null;
    const cleanCiudad = typeof donante_ciudad === 'string' && donante_ciudad.trim() ? donante_ciudad.trim() : null;
    const normalizedTipoDonante = normalizeDonorType(donante_tipo);

    await client.query('BEGIN');

    // Buscar donante existente por documento o correo, o registrar uno nuevo
    let donanteRow: any = null;
    if (cleanDoc) {
      const byDoc = await client.query(
        'SELECT * FROM donantes WHERE LOWER(TRIM(documento_identidad)) = LOWER($1) LIMIT 1',
        [cleanDoc]
      );
      if (byDoc.rows.length) {
        donanteRow = byDoc.rows[0];
      }
    }
    if (!donanteRow && cleanEmail) {
      const byEmail = await client.query(
        'SELECT * FROM donantes WHERE LOWER(TRIM(email)) = LOWER($1) LIMIT 1',
        [cleanEmail]
      );
      if (byEmail.rows.length) {
        donanteRow = byEmail.rows[0];
      }
    }

    if (donanteRow) {
      const updDonante = await client.query(
        `UPDATE donantes
         SET nombre = $1,
             tipo_donante = $2,
             documento_identidad = COALESCE($3, documento_identidad),
             email = COALESCE($4, email),
             telefono = COALESCE($5, telefono),
             ciudad = COALESCE($6, ciudad)
         WHERE id = $7
         RETURNING *`,
        [cleanNombre, normalizedTipoDonante, cleanDoc, cleanEmail, cleanTel, cleanCiudad, donanteRow.id]
      );
      donanteRow = updDonante.rows[0];
    } else {
      const insDonante = await client.query(
        `INSERT INTO donantes (nombre, tipo_donante, documento_identidad, email, telefono, ciudad)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [cleanNombre, normalizedTipoDonante, cleanDoc, cleanEmail, cleanTel, cleanCiudad]
      );
      donanteRow = insDonante.rows[0];
    }

    const proyectoId =
      proyecto_destino_id !== undefined && proyecto_destino_id !== null && String(proyecto_destino_id).trim() !== ''
        ? Number(proyecto_destino_id)
        : null;

    const insDon = await client.query(
      `INSERT INTO donaciones (
         donante_id, donante_nombre, donante_tipo, donante_documento,
         donante_email, donante_telefono, tipo_donacion,
         monto_bob, descripcion_especie, proyecto_destino_id,
         recibido_por, fecha_recepcion, estado_entrega, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), 'recibida', NOW())
       RETURNING *`,
      [
        donanteRow.id,
        cleanNombre,
        normalizedTipoDonante,
        cleanDoc,
        cleanEmail,
        cleanTel,
        tipo_donacion,
        tipo_donacion === 'economica' ? Number(monto_bob) : null,
        tipo_donacion === 'especie' ? String(descripcion_especie).trim() : null,
        proyectoId,
        cleanRecibidoPor,
      ]
    );

    const createdId = insDon.rows[0].id;
    const codigoDonacion = formatDonationCode(createdId);

    const updatedDon = await client.query(
      `UPDATE donaciones SET codigo_donacion = $1 WHERE id = $2 RETURNING *`,
      [codigoDonacion, createdId]
    );

    let proyectoObj: any = null;
    if (proyectoId) {
      const pRows = await client.query('SELECT id, titulo, ubicacion FROM proyectos WHERE id = $1', [proyectoId]);
      if (pRows.rows.length) proyectoObj = pRows.rows[0];
    }

    await client.query('COMMIT');

    await Promise.all([
      cacheService.delByPrefix('donaciones:'),
      cacheService.delByPrefix('necesidades:'),
    ]);
    await recordSystemLog({
      ...getActorMeta(req),
      action: 'DONATION_CREATE',
      module: 'donaciones',
      status: 'success',
      details: `Donación ${codigoDonacion} (${tipo_donacion}) registrada de ${cleanNombre}`,
    }).catch(() => {});

    const row = updatedDon.rows[0];
    res.status(201).json({
      ...row,
      monto_bob: row.monto_bob !== null && row.monto_bob !== undefined ? Number(row.monto_bob) : null,
      codigo_donacion: codigoDonacion,
      donante: donanteRow,
      proyecto: proyectoObj,
      entregas: [],
      entregas_count: 0,
      monto_entregado_total: 0,
      saldo_disponible_bob: row.tipo_donacion === 'economica' ? Number(row.monto_bob || 0) : 0,
      ultimo_receptor: null,
    });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error creating donacion:', err);
    res.status(500).json({ error: 'Error al registrar donación' });
  } finally {
    client.release();
  }
});

// KIR-30 / KIR-47: Registrar donación ofrecida directamente por un donante
router.post('/donaciones/ofrecer', async (req: Request, res: Response) => {
  const client = await dbPool.connect();
  try {
    const validation = validateOfferedDonation(req.body || {});
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error });
    }

    const v = validation.data;
    await client.query('BEGIN');

    let proyectoObj: any = null;
    if (v.proyecto_destino_id) {
      const pRows = await client.query(
        'SELECT id, titulo, ubicacion, estado FROM proyectos WHERE id = $1 LIMIT 1',
        [v.proyecto_destino_id]
      );
      if (!pRows.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'El proyecto destino seleccionado no existe' });
      }
      proyectoObj = {
        id: pRows.rows[0].id,
        titulo: pRows.rows[0].titulo,
        ubicacion: pRows.rows[0].ubicacion,
      };
    }

    // Buscar donante existente por documento o correo (si no es anónimo), o registrar nuevo donante
    let donanteRow: any = null;
    if (v.donante_tipo !== 'anonimo') {
      if (v.donante_documento) {
        const byDoc = await client.query(
          'SELECT * FROM donantes WHERE LOWER(TRIM(documento_identidad)) = LOWER($1) LIMIT 1',
          [v.donante_documento]
        );
        if (byDoc.rows.length) donanteRow = byDoc.rows[0];
      }
      if (!donanteRow && v.donante_email) {
        const byEmail = await client.query(
          'SELECT * FROM donantes WHERE LOWER(TRIM(email)) = LOWER($1) LIMIT 1',
          [v.donante_email]
        );
        if (byEmail.rows.length) donanteRow = byEmail.rows[0];
      }
    }

    if (donanteRow) {
      const updDonante = await client.query(
        `UPDATE donantes
         SET nombre = $1,
             tipo_donante = $2,
             documento_identidad = COALESCE($3, documento_identidad),
             email = COALESCE($4, email),
             telefono = COALESCE($5, telefono),
             ciudad = COALESCE($6, ciudad)
         WHERE id = $7
         RETURNING *`,
        [
          v.donante_nombre,
          v.donante_tipo,
          v.donante_documento,
          v.donante_email,
          v.donante_telefono,
          v.donante_ciudad,
          donanteRow.id,
        ]
      );
      donanteRow = updDonante.rows[0];
    } else {
      const insDonante = await client.query(
        `INSERT INTO donantes (nombre, tipo_donante, documento_identidad, email, telefono, ciudad)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          v.donante_nombre,
          v.donante_tipo,
          v.donante_documento,
          v.donante_email,
          v.donante_telefono,
          v.donante_ciudad,
        ]
      );
      donanteRow = insDonante.rows[0];
    }

    const insDon = await client.query(
      `INSERT INTO donaciones (
         donante_id, donante_nombre, donante_tipo, donante_documento,
         donante_email, donante_telefono, tipo_donacion,
         monto_bob, descripcion_especie, categoria_especie, cantidad_especie,
         proyecto_destino_id, recibido_por, fecha_recepcion,
         estado_entrega, origen_registro, modalidad_entrega,
         fecha_disponible_estimada, direccion_recojo, notas_donante, updated_at
       ) VALUES (
         $1, $2, $3, $4,
         $5, $6, $7,
         $8, $9, $10, $11,
         $12, NULL, NOW(),
         'ofrecida', 'oferta_donante', $13,
         $14, $15, $16, NOW()
       )
       RETURNING *`,
      [
        donanteRow.id,
        v.donante_nombre,
        v.donante_tipo,
        v.donante_documento,
        v.donante_email,
        v.donante_telefono,
        v.tipo_donacion,
        v.monto_bob,
        v.descripcion_especie,
        v.categoria_especie,
        v.cantidad_especie,
        v.proyecto_destino_id,
        v.modalidad_entrega,
        v.fecha_disponible_estimada,
        v.direccion_recojo,
        v.notas_donante,
      ]
    );

    const createdId = insDon.rows[0].id;
    const codigoDonacion = formatDonationCode(createdId);

    const updatedDon = await client.query(
      `UPDATE donaciones SET codigo_donacion = $1 WHERE id = $2 RETURNING *`,
      [codigoDonacion, createdId]
    );

    await client.query('COMMIT');

    await Promise.all([
      cacheService.delByPrefix('donaciones:'),
      cacheService.delByPrefix('necesidades:'),
    ]);
    await recordSystemLog({
      ...getActorMeta(req),
      action: 'DONATION_OFFER',
      module: 'donaciones',
      status: 'success',
      details: `Oferta de donación ${codigoDonacion} (${v.tipo_donacion}) registrada`,
    }).catch(() => {});

    const row = updatedDon.rows[0];
    res.status(201).json({
      message: `¡Gracias! Tu donación ofrecida fue registrada con el código ${codigoDonacion}. Nuestro equipo coordinará la recepción según la modalidad elegida.`,
      donacion: {
        ...row,
        monto_bob: row.monto_bob !== null && row.monto_bob !== undefined ? Number(row.monto_bob) : null,
        codigo_donacion: codigoDonacion,
        estado_entrega: 'ofrecida',
        origen_registro: 'oferta_donante',
        donante: donanteRow,
        proyecto: proyectoObj,
        entregas: [],
        entregas_count: 0,
        monto_entregado_total: 0,
        saldo_disponible_bob: row.tipo_donacion === 'economica' ? Number(row.monto_bob || 0) : 0,
        ultimo_receptor: null,
      },
    });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error offering donacion:', err);
    res.status(500).json({ error: 'Error al registrar la donación ofrecida' });
  } finally {
    client.release();
  }
});

// Confirmar recepción de una donación ofrecida (pasa de 'ofrecida' a 'recibida')
router.patch('/donaciones/:id/confirmar-recepcion', async (req: Request, res: Response) => {
  try {
    const donacionId = Number(req.params.id);
    if (!Number.isInteger(donacionId) || donacionId <= 0) {
      return res.status(400).json({ error: 'ID de donación inválido' });
    }

    const recibidoPor =
      typeof req.body?.recibido_por === 'string' ? req.body.recibido_por.trim() : '';
    if (recibidoPor.length < 2) {
      return res.status(400).json({
        error: 'Debe indicar el nombre de la persona de Kirikú que recibe o verifica la donación',
      });
    }

    const donRows = await query('SELECT * FROM donaciones WHERE id = $1 LIMIT 1', [donacionId]);
    if (!donRows.length) {
      return res.status(404).json({ error: 'Donación no encontrada' });
    }

    const donacion = donRows[0];
    if (donacion.estado_entrega && donacion.estado_entrega !== 'ofrecida') {
      return res.status(400).json({
        error: `La donación ya fue confirmada (estado actual: ${donacion.estado_entrega})`,
      });
    }

    const notasRecepcion =
      typeof req.body?.notas_recepcion === 'string' && req.body.notas_recepcion.trim()
        ? req.body.notas_recepcion.trim()
        : null;

    const updated = await query(
      `UPDATE donaciones
       SET estado_entrega = 'recibida',
           recibido_por = $1,
           fecha_confirmacion_recepcion = NOW(),
           notas_donante = CASE
             WHEN $2::text IS NULL THEN notas_donante
             WHEN notas_donante IS NULL OR notas_donante = '' THEN $2::text
             ELSE notas_donante || ' | Recepción: ' || $2::text
           END,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [recibidoPor, notasRecepcion, donacionId]
    );

    await cacheService.delByPrefix('donaciones:');
    await recordSystemLog({
      ...getActorMeta(req),
      action: 'DONATION_CONFIRM_RECEIPT',
      module: 'donaciones',
      status: 'success',
      details: `Recepción de donación ${donacionId} confirmada por ${recibidoPor}`,
    }).catch(() => {});

    const row = updated[0];
    res.json({
      message: 'Recepción de donación confirmada correctamente. Ya puedes vincular un receptor y registrar entregas.',
      donacion: {
        ...row,
        monto_bob: row.monto_bob !== null && row.monto_bob !== undefined ? Number(row.monto_bob) : null,
        codigo_donacion: row.codigo_donacion || formatDonationCode(row.id),
      },
    });
  } catch (err: any) {
    console.error('Error confirming donation receipt:', err);
    res.status(500).json({ error: 'Error al confirmar la recepción de la donación' });
  }
});

router.post('/donaciones/:id/entregas', async (req: Request, res: Response) => {
  const client = await dbPool.connect();
  try {
    const donacionId = Number(req.params.id);
    if (!Number.isInteger(donacionId) || donacionId <= 0) {
      return res.status(400).json({ error: 'ID de donación inválido' });
    }

    const donRows = await client.query('SELECT * FROM donaciones WHERE id = $1 LIMIT 1', [donacionId]);
    if (!donRows.rows.length) {
      return res.status(404).json({ error: 'Donación no encontrada' });
    }
    const donacion = donRows.rows[0];

    if (donacion.estado_entrega === 'ofrecida') {
      return res.status(400).json({
        error: 'Esta donación sigue en estado "ofrecida". Confirma primero su recepción en custodia antes de asignarla a un receptor.',
      });
    }

    const existingEntregasRows = await client.query(
      'SELECT id, estado, monto_entregado_bob FROM entregas_donaciones WHERE donacion_id = $1',
      [donacionId]
    );

    const validation = validateDeliveryRegistration(donacion, existingEntregasRows.rows, req.body || {});
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error });
    }

    const body = req.body || {};
    await client.query('BEGIN');

    // Garantizar donante_id vinculado si era una donación histórica sin donante_id
    let donanteId = donacion.donante_id;
    if (!donanteId) {
      const insDonante = await client.query(
        `INSERT INTO donantes (nombre, tipo_donante, documento_identidad, email, telefono)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          donacion.donante_nombre,
          normalizeDonorType(donacion.donante_tipo),
          donacion.donante_documento || null,
          donacion.donante_email || null,
          donacion.donante_telefono || null,
        ]
      );
      donanteId = insDonante.rows[0].id;
      await client.query('UPDATE donaciones SET donante_id = $1 WHERE id = $2', [donanteId, donacionId]);
    }

    // Resolver o registrar receptor
    let receptorRow: any = null;
    if (body.receptor_id !== undefined && body.receptor_id !== null && String(body.receptor_id).trim() !== '') {
      const recRes = await client.query('SELECT * FROM receptores WHERE id = $1 LIMIT 1', [
        Number(body.receptor_id),
      ]);
      if (!recRes.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'El receptor seleccionado no existe' });
      }
      receptorRow = recRes.rows[0];
    } else {
      const proyectoIdRec =
        body.proyecto_id !== undefined && body.proyecto_id !== null && String(body.proyecto_id).trim() !== ''
          ? Number(body.proyecto_id)
          : donacion.proyecto_destino_id || null;
      const orgIdRec =
        body.organizacion_id !== undefined && body.organizacion_id !== null && String(body.organizacion_id).trim() !== ''
          ? Number(body.organizacion_id)
          : null;

      const insRec = await client.query(
        `INSERT INTO receptores (
           nombre, tipo_receptor, documento_identidad, email, telefono, ubicacion, proyecto_id, organizacion_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          String(body.receptor_nombre).trim(),
          normalizeRecipientType(body.receptor_tipo),
          body.receptor_documento ? String(body.receptor_documento).trim() : null,
          body.receptor_email ? String(body.receptor_email).trim().toLowerCase() : null,
          body.receptor_telefono ? String(body.receptor_telefono).trim() : null,
          body.receptor_ubicacion ? String(body.receptor_ubicacion).trim() : null,
          proyectoIdRec,
          orgIdRec,
        ]
      );
      receptorRow = insRec.rows[0];
    }

    const entregaProyectoId =
      body.proyecto_id !== undefined && body.proyecto_id !== null && String(body.proyecto_id).trim() !== ''
        ? Number(body.proyecto_id)
        : receptorRow.proyecto_id || donacion.proyecto_destino_id || null;
    const entregaOrgId =
      body.organizacion_id !== undefined && body.organizacion_id !== null && String(body.organizacion_id).trim() !== ''
        ? Number(body.organizacion_id)
        : receptorRow.organizacion_id || null;

    const fechaEntrega = body.fecha_entrega ? new Date(body.fecha_entrega) : new Date();
    const validFecha = Number.isNaN(fechaEntrega.getTime()) ? new Date() : fechaEntrega;

    const insEntrega = await client.query(
      `INSERT INTO entregas_donaciones (
         donacion_id, donante_id, receptor_id, proyecto_id, organizacion_id,
         codigo_entrega, estado, monto_entregado_bob, detalle_bienes_entregados,
         responsable_entrega, recibido_por_receptor, fecha_entrega, observaciones,
         created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, 'TEMP', $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
       RETURNING *`,
      [
        donacionId,
        donanteId,
        receptorRow.id,
        entregaProyectoId,
        entregaOrgId,
        validation.estado,
        validation.monto_entregado_bob,
        donacion.tipo_donacion === 'especie'
          ? String(body.detalle_bienes_entregados).trim()
          : body.detalle_bienes_entregados
          ? String(body.detalle_bienes_entregados).trim()
          : null,
        String(body.responsable_entrega).trim(),
        String(body.recibido_por_receptor).trim(),
        validFecha.toISOString(),
        body.observaciones ? String(body.observaciones).trim() : null,
      ]
    );

    const entregaId = insEntrega.rows[0].id;
    const codigoEntrega = formatDeliveryCode(entregaId);

    await client.query('UPDATE entregas_donaciones SET codigo_entrega = $1 WHERE id = $2', [
      codigoEntrega,
      entregaId,
    ]);

    const allEntregasRes = await client.query(
      'SELECT estado, monto_entregado_bob FROM entregas_donaciones WHERE donacion_id = $1',
      [donacionId]
    );
    const nuevoEstadoDonacion = deriveDonationDeliveryStatus(
      donacion.tipo_donacion,
      donacion.monto_bob,
      allEntregasRes.rows
    );
    const balance = calculateDonationBalance(
      donacion.tipo_donacion,
      donacion.monto_bob,
      allEntregasRes.rows
    );

    await client.query(
      `UPDATE donaciones
       SET estado_entrega = $1, updated_at = NOW()
       WHERE id = $2`,
      [nuevoEstadoDonacion, donacionId]
    );

    const enrichedEntregaRes = await client.query(
      `
      SELECT e.*,
             r.nombre AS receptor_nombre,
             r.tipo_receptor AS receptor_tipo,
             r.documento_identidad AS receptor_documento,
             r.email AS receptor_email,
             r.telefono AS receptor_telefono,
             r.ubicacion AS receptor_ubicacion,
             r.proyecto_id AS receptor_proyecto_id,
             r.organizacion_id AS receptor_organizacion_id,
             p.titulo AS proyecto_titulo,
             o.nombre AS organizacion_nombre
      FROM entregas_donaciones e
      JOIN receptores r ON e.receptor_id = r.id
      LEFT JOIN proyectos p ON COALESCE(e.proyecto_id, r.proyecto_id) = p.id
      LEFT JOIN organizaciones o ON COALESCE(e.organizacion_id, r.organizacion_id) = o.id
      WHERE e.id = $1
      LIMIT 1
    `,
      [entregaId]
    );

    await client.query('COMMIT');

    await cacheService.delByPrefix('donaciones:');
    await recordSystemLog({
      ...getActorMeta(req),
      action: 'DONATION_DELIVERY_CREATE',
      module: 'donaciones',
      status: 'success',
      details: `Entrega ${codigoEntrega} registrada para donación ${donacionId}`,
    }).catch(() => {});

    res.status(201).json({
      message: 'Entrega registrada y vínculo donante-receptor trazado correctamente',
      entrega: mapEntregaRow(enrichedEntregaRes.rows[0]),
      donacion_estado_entrega: nuevoEstadoDonacion,
      saldo_disponible_bob: balance.saldo_disponible_bob,
    });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error registering donation delivery:', err);
    res.status(500).json({ error: 'Error al registrar entrega de donación' });
  } finally {
    client.release();
  }
});

router.patch('/donaciones/entregas/:entregaId', async (req: Request, res: Response) => {
  const client = await dbPool.connect();
  try {
    const entregaId = Number(req.params.entregaId);
    if (!Number.isInteger(entregaId) || entregaId <= 0) {
      return res.status(400).json({ error: 'ID de entrega inválido' });
    }

    const existingRes = await client.query(
      'SELECT * FROM entregas_donaciones WHERE id = $1 LIMIT 1',
      [entregaId]
    );
    if (!existingRes.rows.length) {
      return res.status(404).json({ error: 'Registro de entrega no encontrado' });
    }

    const existing = existingRes.rows[0];
    const nextStateRaw = req.body?.estado;
    if (!nextStateRaw || !['programada', 'en_camino', 'entregada', 'verificada'].includes(String(nextStateRaw))) {
      return res.status(400).json({
        error: 'Estado inválido. Valores permitidos: programada, en_camino, entregada, verificada',
      });
    }

    const currentState = normalizeDeliveryState(existing.estado);
    const nextState = normalizeDeliveryState(nextStateRaw);

    if (!canTransitionDeliveryState(currentState, nextState)) {
      return res.status(400).json({
        error: `No se puede retroceder una entrega del estado '${currentState}' a '${nextState}'`,
      });
    }

    await client.query('BEGIN');

    const recibidoPor =
      typeof req.body?.recibido_por_receptor === 'string' && req.body.recibido_por_receptor.trim()
        ? req.body.recibido_por_receptor.trim()
        : existing.recibido_por_receptor;
    const observaciones =
      typeof req.body?.observaciones === 'string' && req.body.observaciones.trim()
        ? req.body.observaciones.trim()
        : existing.observaciones;

    await client.query(
      `UPDATE entregas_donaciones
       SET estado = $1,
           recibido_por_receptor = $2,
           observaciones = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [nextState, recibidoPor, observaciones, entregaId]
    );

    const donRes = await client.query('SELECT * FROM donaciones WHERE id = $1 LIMIT 1', [
      existing.donacion_id,
    ]);
    const donacion = donRes.rows[0];

    const allEntregasRes = await client.query(
      'SELECT estado, monto_entregado_bob FROM entregas_donaciones WHERE donacion_id = $1',
      [existing.donacion_id]
    );
    const nuevoEstadoDonacion = deriveDonationDeliveryStatus(
      donacion.tipo_donacion,
      donacion.monto_bob,
      allEntregasRes.rows
    );

    await client.query(
      'UPDATE donaciones SET estado_entrega = $1, updated_at = NOW() WHERE id = $2',
      [nuevoEstadoDonacion, existing.donacion_id]
    );

    const enrichedEntregaRes = await client.query(
      `
      SELECT e.*,
             r.nombre AS receptor_nombre,
             r.tipo_receptor AS receptor_tipo,
             r.documento_identidad AS receptor_documento,
             r.email AS receptor_email,
             r.telefono AS receptor_telefono,
             r.ubicacion AS receptor_ubicacion,
             r.proyecto_id AS receptor_proyecto_id,
             r.organizacion_id AS receptor_organizacion_id,
             p.titulo AS proyecto_titulo,
             o.nombre AS organizacion_nombre
      FROM entregas_donaciones e
      JOIN receptores r ON e.receptor_id = r.id
      LEFT JOIN proyectos p ON COALESCE(e.proyecto_id, r.proyecto_id) = p.id
      LEFT JOIN organizaciones o ON COALESCE(e.organizacion_id, r.organizacion_id) = o.id
      WHERE e.id = $1
      LIMIT 1
    `,
      [entregaId]
    );

    await client.query('COMMIT');

    await cacheService.delByPrefix('donaciones:');
    await recordSystemLog({
      ...getActorMeta(req),
      action: 'DONATION_DELIVERY_STATUS',
      module: 'donaciones',
      status: 'success',
      details: `Entrega ${entregaId} actualizada a estado ${nextState}`,
    }).catch(() => {});

    res.json({
      message: 'Estado de entrega actualizado correctamente',
      entrega: mapEntregaRow(enrichedEntregaRes.rows[0]),
      donacion_estado_entrega: nuevoEstadoDonacion,
    });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error updating delivery status:', err);
    res.status(500).json({ error: 'Error al actualizar estado de entrega' });
  } finally {
    client.release();
  }
});

// KIR-31 (KIR-43): Listar y registrar necesidades de donación vinculadas a su receptor
router.get('/necesidades-donacion', async (req: Request, res: Response) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const tipo = normalizeCategoryFilter(req.query.tipo || req.query.categoria).toLowerCase();
    const priceRange = validatePriceRange(
      req.query.monto_min ?? req.query.precio_min,
      req.query.monto_max ?? req.query.precio_max
    );
    if (!priceRange.ok) {
      return res.status(400).json({ error: priceRange.error });
    }
    const cleanSort = normalizeSortOrder(
      req.query.ordenar,
      ['recientes', 'monto_desc', 'monto_asc', 'titulo_asc'] as const,
      'recientes'
    );

    const cacheKey = buildCacheKey('necesidades:list', {
      q,
      tipo,
      monto_min: priceRange.min,
      monto_max: priceRange.max,
      ordenar: cleanSort,
    });
    const cached = await cacheService.get<any[]>(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('X-Cache-Backend', cacheService.getStats().backend);
      return res.json(cached);
    }

    const rows = await query(
      `SELECT n.*,
              json_build_object(
                'nombre', r.nombre,
                'email', r.email,
                'telefono', r.telefono,
                'organizacion', r.organizacion
              ) AS receptor,
              CASE
                WHEN p.id IS NOT NULL THEN json_build_object(
                  'id', p.id,
                  'titulo', p.titulo,
                  'ubicacion', p.ubicacion
                )
                ELSE NULL
              END AS proyecto
       FROM necesidades_donacion n
       JOIN receptores_donacion r ON r.id = n.receptor_id
       LEFT JOIN proyectos p ON p.id = n.proyecto_destino_id
       ORDER BY n.created_at DESC, n.id DESC
       LIMIT 100`
    );

    const formatted = rows
      .map((row: any) => ({
        ...row,
        monto_objetivo: row.monto_objetivo !== null && row.monto_objetivo !== undefined ? Number(row.monto_objetivo) : null,
        cantidad_objetivo: row.cantidad_objetivo !== null && row.cantidad_objetivo !== undefined ? Number(row.cantidad_objetivo) : null,
      }))
      .filter((item: any) => {
        if (tipo && String(item.tipo_necesidad || '').toLowerCase() !== tipo) return false;
        const monto = Number(item.monto_objetivo || 0);
        if (priceRange.min !== null && monto < priceRange.min) return false;
        if (priceRange.max !== null && monto > priceRange.max) return false;
        if (q) {
          const hay =
            String(item.titulo || '').toLowerCase().includes(q.toLowerCase()) ||
            String(item.descripcion || '').toLowerCase().includes(q.toLowerCase()) ||
            String(item.receptor?.nombre || '').toLowerCase().includes(q.toLowerCase()) ||
            String(item.receptor?.organizacion || '').toLowerCase().includes(q.toLowerCase());
          if (!hay) return false;
        }
        return true;
      });

    if (cleanSort === 'monto_desc') {
      formatted.sort((a: any, b: any) => Number(b.monto_objetivo || 0) - Number(a.monto_objetivo || 0));
    } else if (cleanSort === 'monto_asc') {
      formatted.sort((a: any, b: any) => Number(a.monto_objetivo || 0) - Number(b.monto_objetivo || 0));
    } else if (cleanSort === 'titulo_asc') {
      formatted.sort((a: any, b: any) => String(a.titulo || '').localeCompare(String(b.titulo || ''), 'es'));
    }

    await cacheService.set(cacheKey, formatted, 45);
    res.setHeader('X-Cache', 'MISS');
    res.setHeader('X-Cache-Backend', cacheService.getStats().backend);
    res.json(formatted);
  } catch (err: any) {
    console.error('Error fetching donation needs:', err);
    res.status(500).json({ error: 'Error al consultar las necesidades de donación' });
  }
});

router.post('/necesidades-donacion', async (req: Request, res: Response) => {
  try {
    const request = req.body ?? {};
    const validation = validateDonationNeedRequest(request);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const projectId =
      request.proyecto_destino_id != null && request.proyecto_destino_id !== ''
        ? Number(request.proyecto_destino_id)
        : null;

    let proyectoObj: { id: number | string; titulo: string; ubicacion: string } | null = null;
    if (projectId) {
      const project = await query<{ id: number | string; titulo: string; ubicacion: string }>(
        `SELECT id, titulo, ubicacion FROM proyectos WHERE id = $1 AND estado = 'aprobado' LIMIT 1`,
        [projectId]
      );
      if (!project.length) {
        return res.status(400).json({ error: 'El proyecto seleccionado no existe o no está aprobado' });
      }
      proyectoObj = project[0];
    }

    const amount = request.tipo_necesidad === 'economica' ? Number(request.monto_objetivo) : null;
    const quantity =
      request.tipo_necesidad === 'especie' && request.cantidad_objetivo != null && request.cantidad_objetivo !== ''
        ? Number(request.cantidad_objetivo)
        : null;

    const rows = await query(
      `WITH receptor AS (
         INSERT INTO receptores_donacion (nombre, email, telefono, organizacion)
         VALUES ($2, $1, $3, $4)
         ON CONFLICT (email) DO UPDATE SET
           nombre = EXCLUDED.nombre,
           telefono = EXCLUDED.telefono,
           organizacion = EXCLUDED.organizacion,
           updated_at = NOW()
         RETURNING id, nombre, email, telefono, organizacion
       ), solicitud AS (
         INSERT INTO necesidades_donacion (
           receptor_id, proyecto_destino_id, tipo_necesidad, titulo, descripcion,
           monto_objetivo, cantidad_objetivo, unidad_medida, fecha_necesaria
         )
         SELECT id, $5, $6, $7, $8, $9, $10, $11, $12 FROM receptor
         RETURNING *
       )
       SELECT solicitud.*, json_build_object(
         'nombre', receptor.nombre,
         'email', receptor.email,
         'telefono', receptor.telefono,
         'organizacion', receptor.organizacion
       ) AS receptor
       FROM solicitud JOIN receptor ON receptor.id = solicitud.receptor_id`,
      [
        normalizeRecipientEmail(request.receptor_email),
        request.receptor_nombre.trim(),
        request.receptor_telefono.trim(),
        typeof request.receptor_organizacion === 'string' ? request.receptor_organizacion.trim() || null : null,
        projectId,
        request.tipo_necesidad,
        request.titulo.trim(),
        request.descripcion.trim(),
        amount,
        quantity,
        request.tipo_necesidad === 'especie' && typeof request.unidad_medida === 'string'
          ? request.unidad_medida.trim() || null
          : null,
        request.fecha_necesaria || null,
      ]
    );

    const created = rows[0];
    await cacheService.delByPrefix('necesidades:');
    await recordSystemLog({
      ...getActorMeta(req),
      action: 'DONATION_NEED_CREATE',
      module: 'necesidades-donacion',
      status: 'success',
      details: `Necesidad "${created.titulo}" registrada (${created.tipo_necesidad})`,
    }).catch(() => {});

    res.status(201).json({
      ...created,
      monto_objetivo: created.monto_objetivo !== null && created.monto_objetivo !== undefined ? Number(created.monto_objetivo) : null,
      cantidad_objetivo: created.cantidad_objetivo !== null && created.cantidad_objetivo !== undefined ? Number(created.cantidad_objetivo) : null,
      proyecto: proyectoObj,
    });
  } catch (err: any) {
    console.error('Error registering donation need:', err);
    res.status(500).json({ error: 'Error al registrar la necesidad de donación' });
  }
});

// -------------------------------------------------------------
// 5. MÉTRICAS PARA DASHBOARD ADMINISTRATIVO
// -------------------------------------------------------------
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const totalProj = await query('SELECT COUNT(*) as c FROM proyectos');
    const aprobadosProj = await query("SELECT COUNT(*) as c FROM proyectos WHERE estado = 'aprobado'");
    const publicadosProj = await query("SELECT COUNT(*) as c FROM proyectos WHERE estado = 'aprobado' AND publicado = true");
    const pendientesProj = await query("SELECT COUNT(*) as c FROM proyectos WHERE estado = 'pendiente_revision'");
    const totalPost = await query('SELECT COUNT(*) as c FROM postulantes');
    const appsEnProceso = await query("SELECT COUNT(*) as c FROM postulaciones WHERE estado_general = 'en_proceso'");
    const appsAprobadas = await query("SELECT COUNT(*) as c FROM postulaciones WHERE estado_general = 'aprobado'");
    const appsReasignacion = await query("SELECT COUNT(*) as c FROM postulaciones WHERE es_reasignacion = true OR estado_general = 'reasignacion' OR estado_general = 'reenganche'");
    const totalDonacionesBob = await query(
      "SELECT COALESCE(SUM(monto_bob), 0) as s FROM donaciones WHERE tipo_donacion = 'economica' AND COALESCE(estado_entrega, 'recibida') <> 'ofrecida'"
    );
    const totalDonacionesEspecie = await query(
      "SELECT COUNT(*) as c FROM donaciones WHERE tipo_donacion = 'especie' AND COALESCE(estado_entrega, 'recibida') <> 'ofrecida'"
    );
    const totalDonacionesOfrecidas = await query(
      "SELECT COUNT(*) as c FROM donaciones WHERE estado_entrega = 'ofrecida'"
    );
    const totalEntregadoBob = await query(
      "SELECT COALESCE(SUM(monto_entregado_bob), 0) as s FROM entregas_donaciones WHERE estado IN ('entregada', 'verificada')"
    );
    const totalEntregas = await query('SELECT COUNT(*) as c FROM entregas_donaciones');

    res.json({
      totalProyectos: parseInt(totalProj[0].c, 10),
      proyectosAprobados: parseInt(aprobadosProj[0].c, 10),
      proyectosPublicados: parseInt(publicadosProj[0].c, 10),
      proyectosPendientes: parseInt(pendientesProj[0].c, 10),
      totalPostulantes: parseInt(totalPost[0].c, 10),
      postulacionesEnProceso: parseInt(appsEnProceso[0].c, 10),
      postulacionesAprobadas: parseInt(appsAprobadas[0].c, 10),
      postulacionesReasignacion: parseInt(appsReasignacion[0].c, 10),
      postulacionesReenganche: parseInt(appsReasignacion[0].c, 10),
      totalDonacionesBob: parseFloat(totalDonacionesBob[0].s),
      totalDonacionesEspecie: parseInt(totalDonacionesEspecie[0].c, 10),
      totalDonacionesOfrecidas: parseInt(totalDonacionesOfrecidas[0].c, 10),
      totalDonacionesEntregadoBob: parseFloat(totalEntregadoBob[0].s),
      totalEntregasRegistradas: parseInt(totalEntregas[0].c, 10),
    });
  } catch (err: any) {
    console.error('Error fetching metrics:', err);
    res.status(500).json({ error: 'Error al calcular métricas' });
  }
});

// -------------------------------------------------------------
// 5.5. ROLES Y GESTIÓN DE USUARIOS (KIR-11 & KIR-6)
// -------------------------------------------------------------
router.get('/roles/permissions', authenticate, requirePermission('roles.manage'), async (_req, res) => {
  try {
    res.json(await query('SELECT id, code, name, description FROM permissions ORDER BY name'));
  } catch (error) {
    console.error('Error obteniendo permisos:', error);
    res.status(500).json({ error: 'No se pudieron obtener los permisos' });
  }
});

router.get('/roles/users', authenticate, requirePermission('users.manage_roles'), async (req, res) => {
  try {
    const search = String(req.query.q || '').trim();
    const users = await query(
      `SELECT 
         COALESCE(pu.id, u.id) AS id,
         COALESCE(pu.email, u.email) AS email,
         COALESCE(pu.nombre, (u.raw_user_meta_data->>'full_name'), 'Usuario') AS nombre,
         COALESCE(json_agg(json_build_object('id', r.id, 'code', r.code, 'name', r.name))
           FILTER (WHERE r.id IS NOT NULL), '[]') AS roles
       FROM public.usuarios pu
       FULL OUTER JOIN auth.users u ON u.id = pu.id
       LEFT JOIN user_roles ur ON ur.user_id = COALESCE(pu.id, u.id)
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE ($1::text = '' OR COALESCE(pu.email, u.email) ILIKE '%' || $1::text || '%' OR COALESCE(pu.nombre, '') ILIKE '%' || $1::text || '%')
       GROUP BY pu.id, u.id, pu.email, u.email, pu.nombre, u.raw_user_meta_data
       ORDER BY COALESCE(pu.email, u.email) LIMIT 50`,
      [search]
    );
    res.json(users);
  } catch (error) {
    console.error('Error obteniendo usuarios:', error);
    res.status(500).json({ error: 'No se pudieron obtener los usuarios de Supabase Auth' });
  }
});

router.post('/roles/users', authenticate, requirePermission('users.manage_roles'), async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const roleId = Number(req.body?.role_id);

  if (name.length < 2 || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !Number.isInteger(roleId) || roleId < 1) {
    return res.status(400).json({ error: 'Nombre (mínimo 2 letras), correo válido y rol obligatorio son requeridos' });
  }

  try {
    const roles = await query('SELECT id FROM roles WHERE id = $1 AND active = TRUE', [roleId]);
    if (!roles.length) {
      return res.status(400).json({ error: 'Selecciona un rol activo válido' });
    }

    let createdUserId: string | null = null;
    let createdEmail: string = email;

    // Intentar invitación a través de Supabase Auth Admin si está disponible
    if (supabaseAdmin) {
      try {
        const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
          data: { full_name: name },
        });
        if (data?.user) {
          createdUserId = data.user.id;
          createdEmail = data.user.email || email;
        } else if (error) {
          const isConflict = /already|registered|exists/i.test(error.message);
          if (isConflict) {
            return res.status(409).json({ error: 'Ya existe una cuenta con ese correo' });
          }
        }
      } catch (adminErr) {
        console.warn('supabaseAdmin error, falling back to direct auth.users creation:', adminErr);
      }
    }

    // Fallback: si supabaseAdmin no está configurado o falló, crear usuario directamente en auth.users
    if (!createdUserId) {
      const existing = await query('SELECT id FROM auth.users WHERE LOWER(email) = $1', [email]);
      if (existing.length > 0) {
        return res.status(409).json({ error: 'Ya existe una cuenta con ese correo' });
      }

      const inserted = await query<{ id: string; email: string }>(
        `INSERT INTO auth.users (
          id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), 'authenticated', 'authenticated', $1,
          json_build_object('full_name', $2), json_build_object('provider', 'email', 'providers', array['email']),
          NOW(), NOW()
        ) RETURNING id, email`,
        [email, name]
      );
      createdUserId = inserted[0].id;
      createdEmail = inserted[0].email;
    }

    // Asignar rol en user_roles
    await query(
      `INSERT INTO user_roles (user_id, role_id, assigned_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      [createdUserId, roleId, (req as any).userId || null]
    );

    // Registro opcional en public.usuarios si existe
    try {
      await query(
        `INSERT INTO usuarios (nombre, email, rol, activo, created_at)
         VALUES ($1, $2, (SELECT code FROM roles WHERE id = $3), TRUE, NOW())
         ON CONFLICT DO NOTHING`,
        [name, createdEmail, roleId]
      );
    } catch {
      // Ignorar si public.usuarios tiene otro formato
    }

    await recordSystemLog({
      ...getActorMeta(req),
      action: 'ROLE_USER_CREATE',
      module: 'roles',
      status: 'success',
      details: `Usuario ${createdEmail} registrado con rol ID ${roleId}`,
    }).catch(() => {});

    res.status(201).json({
      id: createdUserId,
      email: createdEmail,
      message: 'Usuario registrado exitosamente y rol asignado.',
    });
  } catch (error: any) {
    console.error('Error registrando usuario:', error);
    res.status(500).json({ error: 'No se pudo registrar el usuario' });
  }
});

router.get('/roles', authenticate, requirePermission('roles.manage'), async (_req, res) => {
  try {
    res.json(
      await query(
        `SELECT r.id, r.code, r.name, r.description, r.active,
          COALESCE(json_agg(json_build_object('id', p.id, 'code', p.code, 'name', p.name))
          FILTER (WHERE p.id IS NOT NULL), '[]') AS permissions
         FROM roles r LEFT JOIN role_permissions rp ON rp.role_id = r.id
         LEFT JOIN permissions p ON p.id = rp.permission_id
         GROUP BY r.id ORDER BY r.name`
      )
    );
  } catch (error) {
    console.error('Error obteniendo roles:', error);
    res.status(500).json({ error: 'No se pudieron obtener los roles' });
  }
});

router.post('/roles', authenticate, requirePermission('roles.manage'), async (req, res) => {
  const { code, name, description = '', permission_codes = [] } = req.body || {};
  if (!/^[a-z][a-z0-9_]{2,49}$/.test(code || '') || !name?.trim() || !Array.isArray(permission_codes)) {
    return res.status(400).json({ error: 'Código, nombre y lista de permisos válidos son obligatorios' });
  }
  try {
    const role = (
      await query<{ id: number }>(
        'INSERT INTO roles (code, name, description) VALUES ($1, $2, $3) RETURNING id',
        [code, name.trim(), String(description).trim()]
      )
    )[0];
    await query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT $1, id FROM permissions WHERE code = ANY($2::text[]) ON CONFLICT DO NOTHING`,
      [role.id, permission_codes]
    );
    await recordSystemLog({
      ...getActorMeta(req),
      action: 'ROLE_CREATE',
      module: 'roles',
      status: 'success',
      details: `Rol "${code}" creado con ${permission_codes.length} permisos`,
    }).catch(() => {});
    res.status(201).json({ id: role.id, code, name: name.trim() });
  } catch (error: any) {
    if (error.code === '23505') return res.status(409).json({ error: 'Ya existe un rol con ese código' });
    console.error('Error creando rol:', error);
    res.status(500).json({ error: 'No se pudo crear el rol' });
  }
});

router.patch('/roles/:id', authenticate, requirePermission('roles.manage'), async (req, res) => {
  const roleId = Number(req.params.id);
  const { name, description = '', active = true, permission_codes = [] } = req.body || {};
  if (!Number.isInteger(roleId) || roleId < 1 || !name?.trim() || !Array.isArray(permission_codes)) {
    return res.status(400).json({ error: 'Datos del rol inválidos' });
  }
  try {
    const updated = await query(
      'UPDATE roles SET name = $2, description = $3, active = $4 WHERE id = $1 RETURNING id',
      [roleId, name.trim(), String(description).trim(), Boolean(active)]
    );
    if (!updated.length) return res.status(404).json({ error: 'Rol no encontrado' });
    await query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);
    await query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT $1, id FROM permissions WHERE code = ANY($2::text[]) ON CONFLICT DO NOTHING`,
      [roleId, permission_codes]
    );
    await recordSystemLog({
      ...getActorMeta(req),
      action: 'ROLE_UPDATE',
      module: 'roles',
      status: 'success',
      details: `Rol ID ${roleId} (${name.trim()}) actualizado (${permission_codes.length} permisos)`,
    }).catch(() => {});
    res.json({ message: 'Rol actualizado' });
  } catch (error) {
    console.error('Error actualizando rol:', error);
    res.status(500).json({ error: 'No se pudo actualizar el rol' });
  }
});

router.put('/roles/users/:userId', authenticate, requirePermission('users.manage_roles'), async (req, res) => {
  const { userId } = req.params;
  const roleId = Number(req.body?.role_id);
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !Number.isInteger(roleId) || roleId < 1) {
    return res.status(400).json({ error: 'Usuario o rol inválido' });
  }
  try {
    const role = await query<{ id: number; code: string; name: string }>(
      'SELECT id, code, name FROM roles WHERE id = $1 AND active = TRUE',
      [roleId]
    );
    const user = await query<{ id: string; email: string }>(
      'SELECT id, email FROM auth.users WHERE id = $1',
      [userId]
    );
    if (!role.length || !user.length) return res.status(404).json({ error: 'Usuario o rol no encontrado' });

    // Validar assigned_by: solo pasar el UUID si realmente existe en auth.users
    const adminId = (req as any).userId;
    let assignedBy: string | null = null;
    if (adminId && /^[0-9a-f-]{36}$/i.test(adminId)) {
      const validAdmin = await query('SELECT id FROM auth.users WHERE id = $1', [adminId]);
      if (validAdmin.length > 0) assignedBy = adminId;
    }

    // Actualizar user_roles
    await query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
    await query('INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES ($1, $2, $3)', [
      userId,
      roleId,
      assignedBy,
    ]);

    // Actualizar sincronizadamente en public.usuarios
    try {
      await query(
        `UPDATE public.usuarios 
         SET rol = $1, updated_at = NOW() 
         WHERE id = $2 OR LOWER(email) = LOWER($3)`,
        [role[0].code, userId, user[0].email]
      );
    } catch (pubErr) {
      console.warn('Error updating public.usuarios:', pubErr);
    }

    await recordSystemLog({
      ...getActorMeta(req),
      action: 'ROLE_ASSIGN',
      module: 'roles',
      status: 'success',
      details: `Rol "${role[0].code}" asignado a ${user[0].email}`,
    }).catch(() => {});

    res.json({ message: `Rol "${role[0].name}" asignado correctamente al usuario ${user[0].email}` });
  } catch (error) {
    console.error('Error asignando rol:', error);
    res.status(500).json({ error: 'No se pudo asignar el rol' });
  }
});

// -------------------------------------------------------------
// 6. GESTIÓN DE IMÁGENES / ENLACES ALMACENADOS EN BASE DE DATOS
// -------------------------------------------------------------
router.get('/imagenes/:clave', async (req: Request, res: Response) => {
  try {
    const { clave } = req.params;
    const rows = await query(
      'SELECT url, tipo_mime, datos_base64 FROM imagenes WHERE clave = $1',
      [clave]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Imagen no encontrada en la base de datos' });
    }

    const { url, tipo_mime, datos_base64 } = rows[0];

    // If a clean URL is stored, redirect or serve it
    if (url) {
      return res.redirect(url);
    }

    if (datos_base64) {
      const imageBuffer = Buffer.from(datos_base64, 'base64');
      res.setHeader('Content-Type', tipo_mime || 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(imageBuffer);
    }

    res.status(404).json({ error: 'No hay URL ni contenido para esta imagen' });
  } catch (err: any) {
    console.error('Error fetching image from DB:', err);
    res.status(500).json({ error: 'Error al obtener imagen' });
  }
});

router.get('/imagenes', authenticate, requirePermission('projects.review'), async (req: Request, res: Response) => {
  try {
    const rows = await query(
      'SELECT id, clave, nombre, url, tipo_mime, created_at FROM imagenes ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err: any) {
    console.error('Error listing images:', err);
    res.status(500).json({ error: 'Error al listar imágenes' });
  }
});

router.post('/imagenes', authenticate, requirePermission('projects.review'), async (req: Request, res: Response) => {
  try {
    const { clave, nombre, url, tipo_mime } = req.body;

    if (!clave || !nombre || !url) {
      return res.status(400).json({ error: 'clave, nombre y url son obligatorios' });
    }

    const rows = await query(
      `INSERT INTO imagenes (clave, nombre, url, tipo_mime)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (clave) DO UPDATE 
       SET url = EXCLUDED.url,
           nombre = EXCLUDED.nombre,
           tipo_mime = EXCLUDED.tipo_mime,
           updated_at = NOW()
       RETURNING id, clave, nombre, url, tipo_mime, created_at, updated_at`,
      [clave, nombre, url, tipo_mime || 'image/png']
    );

    res.status(201).json(rows[0]);
  } catch (err: any) {
    console.error('Error storing image in DB:', err);
    res.status(500).json({ error: 'Error al almacenar imagen en base de datos' });
  }
});

// -------------------------------------------------------------
// 7. CACHÉ, AUDITORÍA Y REPORTES EXPORTABLES POR ROL (SPRINT 1 CORRECCIONES)
// -------------------------------------------------------------
router.get('/cache/stats', authenticate, requirePermission('audit.read'), (_req: Request, res: Response) => {
  res.json(cacheService.getStats());
});

router.get('/logs', authenticate, requirePermission('audit.read'), async (req: Request, res: Response) => {
  try {
    const sortAllowed = ['recientes', 'antiguos', 'duracion_desc', 'tamano_desc'] as const;
    const ordenar = normalizeSortOrder(req.query.ordenar, sortAllowed, 'recientes');
    const data = await querySystemLogs({
      module: typeof req.query.module === 'string' ? req.query.module : undefined,
      action: typeof req.query.action === 'string' ? req.query.action : undefined,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
      fecha_desde: typeof req.query.fecha_desde === 'string' ? req.query.fecha_desde : undefined,
      fecha_hasta: typeof req.query.fecha_hasta === 'string' ? req.query.fecha_hasta : undefined,
      ordenar,
      pagina: req.query.pagina ? Number(req.query.pagina) : 1,
      limite: req.query.limite ? Number(req.query.limite) : 25,
    });
    res.json(data);
  } catch (err: any) {
    console.error('Error fetching system logs:', err);
    res.status(500).json({ error: 'Error al consultar los logs del sistema' });
  }
});

const EXPORT_MODULES = [
  'catalogo',
  'proyectos',
  'proyectos-seguimiento',
  'postulaciones-seguimiento',
  'donaciones',
  'historial-donaciones',
  'necesidades-donacion',
  'postulantes',
  'evaluacion-inicial',
  'evaluacion-tecnica',
  'evaluacion-personal',
  'evaluacion-competencias',
  'evaluacion-salud',
  'roles',
  'logs',
] as const;

router.get(
  '/exports/:modulo',
  authenticate,
  requirePermission('reports.export'),
  async (req: AuthenticatedRequest, res: Response) => {
    const startMs = Date.now();
    const modulo = String(req.params.modulo || '').trim().toLowerCase();

    if (!EXPORT_MODULES.includes(modulo as any)) {
      return res.status(400).json({ error: `Módulo exportable no reconocido: ${modulo}` });
    }

    const extraPermissionMap: Record<string, string> = {
      'evaluacion-salud': 'applications.read',
      roles: 'roles.manage',
      logs: 'audit.read',
    };
    const requiredExtra = extraPermissionMap[modulo];
    if (requiredExtra && !hasPermission(req.userId, req.permissions, requiredExtra)) {
      await recordSystemLog({
        ...getActorMeta(req),
        action: 'EXPORT_DENIED',
        module: modulo,
        format: 'csv',
        duration_ms: Date.now() - startMs,
        filters_json: req.query as Record<string, unknown>,
        status: 'denied',
        details: `Exportación denegada por falta de permiso ${requiredExtra}`,
      }).catch(() => {});
      return res.status(403).json({ error: `No tienes permiso (${requiredExtra}) para exportar ${modulo}` });
    }

    try {
      let csvResult: { csv: string; sizeBytes: number; rowCount: number };

      if (modulo === 'catalogo' || modulo === 'proyectos') {
        const quotaRange = validateQuotaRange(req.query.cupos_min, req.query.cupos_max);
        if (!quotaRange.ok) return res.status(400).json({ error: quotaRange.error });

        const cleanCategoria = normalizeCategoryFilter(req.query.categoria);
        const cleanSort = normalizeSortOrder(req.query.ordenar, PROJECT_SORT_OPTIONS, 'recientes');
        const estado = modulo === 'catalogo' ? 'aprobado' : normalizeCategoryFilter(req.query.estado);
        const publicado = modulo === 'catalogo' ? 'true' : normalizeCategoryFilter(req.query.publicado);
        const ubicacion = typeof req.query.ubicacion === 'string' ? req.query.ubicacion.trim() : '';
        const orgId = typeof req.query.organizacion_id === 'string' ? req.query.organizacion_id.trim() : '';
        const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

        let sql = `
          SELECT p.*, o.nombre AS organizacion_nombre, o.tipo AS organizacion_tipo
          FROM proyectos p
          LEFT JOIN organizaciones o ON p.organizacion_id = o.id
          WHERE 1=1
        `;
        const params: any[] = [];
        if (estado) {
          params.push(estado);
          sql += ` AND p.estado = $${params.length}`;
        }
        if (publicado === 'true' || publicado === 'false') {
          params.push(publicado === 'true');
          sql += ` AND p.publicado = $${params.length}`;
        }
        if (ubicacion) {
          params.push(`%${ubicacion}%`);
          sql += ` AND p.ubicacion ILIKE $${params.length}`;
        }
        if (orgId) {
          params.push(orgId);
          sql += ` AND p.organizacion_id = $${params.length}`;
        }
        if (cleanCategoria) {
          params.push(cleanCategoria);
          sql += ` AND LOWER(COALESCE(o.tipo, '')) = LOWER($${params.length})`;
        }
        if (quotaRange.min !== null) {
          params.push(quotaRange.min);
          sql += ` AND p.cupos_disponibles >= $${params.length}`;
        }
        if (quotaRange.max !== null) {
          params.push(quotaRange.max);
          sql += ` AND p.cupos_disponibles <= $${params.length}`;
        }
        if (q) {
          params.push(`%${q}%`);
          sql += ` AND (p.titulo ILIKE $${params.length} OR p.descripcion ILIKE $${params.length} OR p.ubicacion ILIKE $${params.length})`;
        }
        sql += ' ORDER BY p.created_at DESC';

        const rows = await query<any>(sql, params);
        const sorted = filterAndSortProjects(rows, {
          categoria: cleanCategoria,
          cuposMin: quotaRange.min,
          cuposMax: quotaRange.max,
          ordenar: cleanSort,
        });
        const columns: CsvColumn<any>[] = [
          { header: 'ID', value: (r) => r.id },
          { header: 'Título', value: (r) => r.titulo },
          { header: 'Organización', value: (r) => r.organizacion_nombre || '' },
          { header: 'Categoría', value: (r) => r.organizacion_tipo || '' },
          { header: 'Ubicación', value: (r) => r.ubicacion },
          { header: 'Cupos Disponibles', value: (r) => r.cupos_disponibles },
          { header: 'Mayor de Edad (+18)', value: (r) => (r.es_mayor_edad ? 'Sí' : 'No') },
          { header: 'Estado', value: (r) => r.estado },
          { header: 'Publicado', value: (r) => (r.publicado ? 'Sí' : 'No') },
          { header: 'Fecha Creación', value: (r) => r.created_at },
        ];
        csvResult = buildCsvReport(columns, sorted);
      } else if (modulo === 'proyectos-seguimiento') {
        const quotaRange = validateQuotaRange(req.query.cupos_min, req.query.cupos_max);
        if (!quotaRange.ok) return res.status(400).json({ error: quotaRange.error });
        const busqueda = typeof req.query.busqueda === 'string' ? req.query.busqueda.trim() : '';
        const estadoFilter = normalizeCategoryFilter(req.query.estado);
        const cleanSort = normalizeSortOrder(req.query.ordenar, PROJECT_SORT_OPTIONS, 'recientes');

        const params: any[] = [];
        let sql = `
          SELECT p.id, p.titulo, p.ubicacion, p.cupos_disponibles, p.estado,
                 COALESCE(p.publicado, false) AS publicado, p.motivo_rechazo, p.created_at,
                 o.nombre AS organizacion_nombre, o.tipo AS organizacion_tipo, o.contacto_email
          FROM proyectos p
          JOIN organizaciones o ON o.id = p.organizacion_id
          WHERE 1=1
        `;
        if (busqueda) {
          params.push(busqueda);
          sql += ` AND LOWER(TRIM(o.contacto_email)) = LOWER($${params.length})`;
        }
        const rows = await query<any>(sql, params);
        const filteredState = estadoFilter
          ? rows.filter((r) => String(r.estado || '').toLowerCase() === estadoFilter.toLowerCase())
          : rows;
        const sorted = filterAndSortProjects(filteredState, {
          cuposMin: quotaRange.min,
          cuposMax: quotaRange.max,
          ordenar: cleanSort,
        });
        csvResult = buildCsvReport(
          [
            { header: 'ID', value: (r) => r.id },
            { header: 'Proyecto', value: (r) => r.titulo },
            { header: 'Organización', value: (r) => r.organizacion_nombre },
            { header: 'Correo Organización', value: (r) => r.contacto_email || '' },
            { header: 'Ubicación', value: (r) => r.ubicacion },
            { header: 'Cupos', value: (r) => r.cupos_disponibles },
            { header: 'Estado', value: (r) => r.estado },
            { header: 'Publicado', value: (r) => (r.publicado ? 'Sí' : 'No') },
            { header: 'Motivo Rechazo', value: (r) => r.motivo_rechazo || '' },
          ],
          sorted
        );
      } else if (modulo === 'postulaciones-seguimiento') {
        const scoreRange = validateScoreRange(req.query.avance_min, req.query.avance_max, 100);
        if (!scoreRange.ok) return res.status(400).json({ error: scoreRange.error });
        const term = typeof req.query.busqueda === 'string' ? req.query.busqueda.trim() : '';
        const estadoFilter = normalizeCategoryFilter(req.query.estado).toLowerCase();
        const codeMatch = term.match(/^(?:KIR-?|#)?(\d+)$/i);
        const trackingId = codeMatch ? parseInt(codeMatch[1], 10) : null;

        const params: any[] = [];
        let whereSql = '';
        if (term) {
          params.push(term, `%${term}%`, trackingId);
          whereSql = `WHERE (
            LOWER(TRIM(p.ci)) = LOWER(TRIM($1))
            OR LOWER(p.email) = LOWER(TRIM($1))
            OR LOWER(p.nombres || ' ' || p.apellidos) LIKE LOWER($2)
            OR ($3::int IS NOT NULL AND app.id = $3::int)
          )`;
        }
        const rows = await query<any>(
          `SELECT app.id AS postulacion_id, app.estado_general, app.es_reasignacion, app.created_at,
                  p.nombres, p.apellidos, p.ci, p.email, proy.titulo AS proyecto_titulo,
                  COALESCE((SELECT COUNT(*) FROM evaluaciones_etapas ee WHERE ee.postulacion_id = app.id AND ee.estado = 'aprobado'), 0) AS etapas_aprobadas
           FROM postulaciones app
           JOIN postulantes p ON p.id = app.postulante_id
           JOIN proyectos proy ON proy.id = app.proyecto_id
           ${whereSql}
           ORDER BY app.created_at DESC`,
          params
        );
        const mapped = rows
          .map((r) => ({
            ...r,
            porcentaje_avance: Math.round((Number(r.etapas_aprobadas) / 5) * 100),
          }))
          .filter((r) => {
            if (estadoFilter && String(r.estado_general || '').toLowerCase() !== estadoFilter) return false;
            if (scoreRange.min !== null && r.porcentaje_avance < scoreRange.min) return false;
            if (scoreRange.max !== null && r.porcentaje_avance > scoreRange.max) return false;
            return true;
          });
        csvResult = buildCsvReport(
          [
            { header: 'Código', value: (r) => `KIR-${r.postulacion_id}` },
            { header: 'Postulante', value: (r) => `${r.nombres} ${r.apellidos}` },
            { header: 'CI', value: (r) => r.ci },
            { header: 'Correo', value: (r) => r.email },
            { header: 'Proyecto', value: (r) => r.proyecto_titulo },
            { header: 'Estado General', value: (r) => r.estado_general },
            { header: 'Avance (%)', value: (r) => r.porcentaje_avance },
            { header: 'Reasignación', value: (r) => (r.es_reasignacion ? 'Sí' : 'No') },
          ],
          mapped
        );
      } else if (modulo === 'donaciones' || modulo === 'historial-donaciones') {
        const priceRange = validatePriceRange(
          req.query.monto_min ?? req.query.precio_min,
          req.query.monto_max ?? req.query.precio_max
        );
        if (!priceRange.ok) return res.status(400).json({ error: priceRange.error });
        const cleanCategoria = normalizeCategoryFilter(req.query.categoria);
        const cleanSort = normalizeSortOrder(req.query.ordenar, DONATION_SORT_OPTIONS, 'recientes');
        const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
        const tipo = normalizeCategoryFilter(req.query.tipo);
        const estadoEntrega = normalizeCategoryFilter(req.query.estado_entrega);

        const rows = await query<any>(
          `SELECT d.*, p.titulo AS proyecto_titulo
           FROM donaciones d
           LEFT JOIN proyectos p ON p.id = d.proyecto_destino_id
           ORDER BY d.fecha_recepcion DESC, d.id DESC`
        );
        const filtered = filterAndSortDonations(rows, {
          q,
          tipo,
          categoria: cleanCategoria,
          estado_entrega: estadoEntrega,
          montoMin: priceRange.min,
          montoMax: priceRange.max,
          ordenar: cleanSort,
        });
        csvResult = buildCsvReport(
          [
            { header: 'Código', value: (r) => r.codigo_donacion || formatDonationCode(r.id) },
            { header: 'Donante', value: (r) => r.donante_nombre },
            { header: 'Tipo', value: (r) => r.tipo_donacion },
            { header: 'Categoría Especie', value: (r) => r.categoria_especie || '' },
            { header: 'Monto (Bs)', value: (r) => (r.monto_bob !== null ? Number(r.monto_bob) : '') },
            { header: 'Descripción Especie', value: (r) => r.descripcion_especie || '' },
            { header: 'Estado Entrega', value: (r) => r.estado_entrega || 'recibida' },
            { header: 'Proyecto Destino', value: (r) => r.proyecto_titulo || 'Fondo General' },
            { header: 'Recibido Por', value: (r) => r.recibido_por || '' },
            { header: 'Fecha Recepción', value: (r) => r.fecha_recepcion },
          ],
          filtered
        );
      } else if (modulo === 'necesidades-donacion') {
        const priceRange = validatePriceRange(
          req.query.monto_min ?? req.query.precio_min,
          req.query.monto_max ?? req.query.precio_max
        );
        if (!priceRange.ok) return res.status(400).json({ error: priceRange.error });
        const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
        const tipo = normalizeCategoryFilter(req.query.tipo || req.query.categoria).toLowerCase();
        const cleanSort = normalizeSortOrder(
          req.query.ordenar,
          ['recientes', 'monto_desc', 'monto_asc', 'titulo_asc'] as const,
          'recientes'
        );

        const rows = await query<any>(
          `SELECT n.*, r.nombre AS receptor_nombre, r.organizacion AS receptor_org, p.titulo AS proyecto_titulo
           FROM necesidades_donacion n
           JOIN receptores_donacion r ON r.id = n.receptor_id
           LEFT JOIN proyectos p ON p.id = n.proyecto_destino_id
           ORDER BY n.created_at DESC, n.id DESC`
        );
        const filtered = rows.filter((item) => {
          if (tipo && String(item.tipo_necesidad || '').toLowerCase() !== tipo) return false;
          const monto = Number(item.monto_objetivo || 0);
          if (priceRange.min !== null && monto < priceRange.min) return false;
          if (priceRange.max !== null && monto > priceRange.max) return false;
          if (q) {
            const hay =
              String(item.titulo || '').toLowerCase().includes(q) ||
              String(item.descripcion || '').toLowerCase().includes(q) ||
              String(item.receptor_nombre || '').toLowerCase().includes(q);
            if (!hay) return false;
          }
          return true;
        });
        if (cleanSort === 'monto_desc') {
          filtered.sort((a, b) => Number(b.monto_objetivo || 0) - Number(a.monto_objetivo || 0));
        } else if (cleanSort === 'monto_asc') {
          filtered.sort((a, b) => Number(a.monto_objetivo || 0) - Number(b.monto_objetivo || 0));
        } else if (cleanSort === 'titulo_asc') {
          filtered.sort((a, b) => String(a.titulo || '').localeCompare(String(b.titulo || ''), 'es'));
        }
        csvResult = buildCsvReport(
          [
            { header: 'ID', value: (r) => r.id },
            { header: 'Título', value: (r) => r.titulo },
            { header: 'Tipo', value: (r) => r.tipo_necesidad },
            { header: 'Monto Objetivo (Bs)', value: (r) => r.monto_objetivo ?? '' },
            { header: 'Cantidad Objetivo', value: (r) => r.cantidad_objetivo ?? '' },
            { header: 'Unidad', value: (r) => r.unidad_medida || '' },
            { header: 'Receptor', value: (r) => r.receptor_nombre },
            { header: 'Organización', value: (r) => r.receptor_org || '' },
            { header: 'Proyecto', value: (r) => r.proyecto_titulo || '' },
            { header: 'Fecha Necesaria', value: (r) => r.fecha_necesaria || '' },
          ],
          filtered
        );
      } else if (modulo === 'postulantes') {
        const scoreRange = validateScoreRange(req.query.avance_min, req.query.avance_max, 100);
        if (!scoreRange.ok) return res.status(400).json({ error: scoreRange.error });
        const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
        const prof = normalizeCategoryFilter(req.query.profesion || req.query.categoria).toLowerCase();
        const estadoFilter = normalizeCategoryFilter(req.query.estado).toLowerCase();

        const rows = await query<any>(
          `SELECT p.*, app.id AS postulacion_id, app.estado_general,
                  proy.titulo AS proyecto_titulo,
                  COALESCE((SELECT COUNT(*) FROM evaluaciones_etapas ee WHERE ee.postulacion_id = app.id AND ee.estado = 'aprobado'), 0) AS etapas_aprobadas
           FROM postulantes p
           LEFT JOIN LATERAL (
             SELECT * FROM postulaciones WHERE postulante_id = p.id ORDER BY created_at DESC LIMIT 1
           ) app ON true
           LEFT JOIN proyectos proy ON proy.id = app.proyecto_id
           ORDER BY p.created_at DESC`
        );
        const filtered = rows
          .map((r) => ({
            ...r,
            porcentaje_avance: r.postulacion_id ? Math.round((Number(r.etapas_aprobadas) / 5) * 100) : 0,
          }))
          .filter((r) => {
            if (prof && !String(r.profesion_ocupacion || '').toLowerCase().includes(prof)) return false;
            if (estadoFilter && String(r.estado_general || 'sin_postulacion').toLowerCase() !== estadoFilter) return false;
            if (scoreRange.min !== null && r.porcentaje_avance < scoreRange.min) return false;
            if (scoreRange.max !== null && r.porcentaje_avance > scoreRange.max) return false;
            if (q) {
              const hay =
                `${r.nombres} ${r.apellidos}`.toLowerCase().includes(q) ||
                String(r.ci || '').toLowerCase().includes(q) ||
                String(r.email || '').toLowerCase().includes(q) ||
                String(r.habilidades || '').toLowerCase().includes(q);
              if (!hay) return false;
            }
            return true;
          });
        csvResult = buildCsvReport(
          [
            { header: 'ID', value: (r) => r.id },
            { header: 'Nombre Completo', value: (r) => `${r.nombres} ${r.apellidos}` },
            { header: 'CI', value: (r) => r.ci },
            { header: 'Correo', value: (r) => r.email },
            { header: 'Profesión', value: (r) => r.profesion_ocupacion || '' },
            { header: 'Proyecto Actual', value: (r) => r.proyecto_titulo || '' },
            { header: 'Estado', value: (r) => r.estado_general || 'sin_postulacion' },
            { header: 'Avance (%)', value: (r) => r.porcentaje_avance },
          ],
          filtered
        );
      } else if (modulo.startsWith('evaluacion-')) {
        const stageMap: Record<string, string> = {
          'evaluacion-inicial': 'inicial',
          'evaluacion-tecnica': 'tecnica',
          'evaluacion-personal': 'personal',
          'evaluacion-competencias': 'competencias',
          'evaluacion-salud': 'salud_fisica_psicologica',
        };
        const etapaCode = stageMap[modulo];
        const scoreRange = validateScoreRange(req.query.puntaje_min, req.query.puntaje_max, 100);
        if (!scoreRange.ok) return res.status(400).json({ error: scoreRange.error });
        const cleanCategoria = normalizeCategoryFilter(req.query.categoria);
        const cleanSort = normalizeSortOrder(req.query.ordenar, EVALUATION_SORT_OPTIONS, 'recientes');
        const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
        const estadoFilter = normalizeCategoryFilter(req.query.estado).toLowerCase();

        const rows = await query<any>(
          `SELECT ee.id AS etapa_id, ee.postulacion_id, ee.estado AS etapa_estado, ee.evaluador,
                  ee.comentarios, ee.fecha_evaluacion, ee.detalle_criterios, ee.detalle_criterios_personales,
                  p.nombres, p.apellidos, p.ci, p.profesion_ocupacion, proy.titulo AS proyecto_titulo
           FROM evaluaciones_etapas ee
           JOIN postulaciones app ON app.id = ee.postulacion_id
           JOIN postulantes p ON p.id = app.postulante_id
           JOIN proyectos proy ON proy.id = app.proyecto_id
           WHERE ee.etapa = $1
           ORDER BY ee.id DESC`,
          [etapaCode]
        );
        const mapped = rows.map((r) => {
          const criteria =
            etapaCode === 'personal'
              ? r.detalle_criterios_personales
              : etapaCode === 'competencias'
              ? r.detalle_criterios
              : null;
          let avg: number | null = null;
          if (criteria && typeof criteria === 'object') {
            const vals = Object.values(criteria).filter((v): v is number => typeof v === 'number');
            if (vals.length === 5) {
              avg = Number((vals.reduce((a, b) => a + b, 0) / 5).toFixed(2));
            }
          }
          return {
            ...r,
            puntaje_promedio: avg,
            postulante: { nombres: r.nombres, apellidos: r.apellidos, profesion_ocupacion: r.profesion_ocupacion },
          };
        });
        const filteredBase = mapped.filter((r) => {
          if (estadoFilter && estadoFilter !== 'todos') {
            const norm = r.etapa_estado === 'en revision' ? 'en_revision' : r.etapa_estado;
            if (estadoFilter === 'pendientes' || estadoFilter === 'pendiente') {
              if (!['pendiente', 'en_revision', 'pendiente_revision'].includes(norm)) return false;
            } else if (norm !== estadoFilter.replace(/s$/, '')) {
              return false;
            }
          }
          if (q) {
            const hay =
              `${r.nombres} ${r.apellidos}`.toLowerCase().includes(q) ||
              String(r.ci || '').toLowerCase().includes(q) ||
              String(r.proyecto_titulo || '').toLowerCase().includes(q);
            if (!hay) return false;
          }
          return true;
        });
        const finalRows = filterAndSortEvaluationItems(filteredBase, {
          categoria: cleanCategoria,
          puntajeMin: scoreRange.min,
          puntajeMax: scoreRange.max,
          ordenar: cleanSort,
        });
        csvResult = buildCsvReport(
          [
            { header: 'Postulación', value: (r) => `KIR-${r.postulacion_id}` },
            { header: 'Postulante', value: (r) => `${r.nombres} ${r.apellidos}` },
            { header: 'CI', value: (r) => r.ci },
            { header: 'Profesión', value: (r) => r.profesion_ocupacion || '' },
            { header: 'Proyecto', value: (r) => r.proyecto_titulo },
            { header: 'Estado Etapa', value: (r) => r.etapa_estado },
            { header: 'Evaluador', value: (r) => r.evaluador || '' },
            { header: 'Puntaje', value: (r) => extractEvaluationScore(r) ?? '' },
            { header: 'Comentarios', value: (r) => r.comentarios || '' },
            { header: 'Fecha Evaluación', value: (r) => r.fecha_evaluacion || '' },
          ],
          finalRows
        );
      } else if (modulo === 'roles') {
        const rows = await query<any>(
          `SELECT r.id, r.code, r.name, r.description, r.active,
                  COALESCE(string_agg(p.code, ', ' ORDER BY p.code), '') AS permissions_csv
           FROM roles r
           LEFT JOIN role_permissions rp ON rp.role_id = r.id
           LEFT JOIN permissions p ON p.id = rp.permission_id
           GROUP BY r.id
           ORDER BY r.name`
        );
        csvResult = buildCsvReport(
          [
            { header: 'ID', value: (r) => r.id },
            { header: 'Código', value: (r) => r.code },
            { header: 'Nombre', value: (r) => r.name },
            { header: 'Descripción', value: (r) => r.description || '' },
            { header: 'Activo', value: (r) => (r.active ? 'Sí' : 'No') },
            { header: 'Permisos', value: (r) => r.permissions_csv },
          ],
          rows
        );
      } else {
        // logs
        const logsRes = await querySystemLogs({
          module: typeof req.query.module === 'string' ? req.query.module : undefined,
          action: typeof req.query.action === 'string' ? req.query.action : undefined,
          status: typeof req.query.status === 'string' ? req.query.status : undefined,
          q: typeof req.query.q === 'string' ? req.query.q : undefined,
          fecha_desde: typeof req.query.fecha_desde === 'string' ? req.query.fecha_desde : undefined,
          fecha_hasta: typeof req.query.fecha_hasta === 'string' ? req.query.fecha_hasta : undefined,
          pagina: 1,
          limite: 1000,
        });
        csvResult = buildCsvReport(
          [
            { header: 'ID', value: (r) => r.id },
            { header: 'Fecha', value: (r) => r.created_at },
            { header: 'Usuario', value: (r) => r.user_email || 'anónimo' },
            { header: 'Rol', value: (r) => r.user_role || '' },
            { header: 'Acción', value: (r) => r.action },
            { header: 'Módulo', value: (r) => r.module },
            { header: 'Estado', value: (r) => r.status },
            { header: 'Formato', value: (r) => r.format || '' },
            { header: 'Filas', value: (r) => r.row_count ?? '' },
            { header: 'Tamaño (bytes)', value: (r) => r.file_size_bytes ?? '' },
            { header: 'Duración (ms)', value: (r) => r.duration_ms },
            { header: 'Detalle', value: (r) => r.details || '' },
          ],
          logsRes.items
        );
      }

      const durationMs = Math.max(1, Date.now() - startMs);
      await recordSystemLog({
        ...getActorMeta(req),
        action: `EXPORT_${modulo.toUpperCase().replace(/-/g, '_')}`,
        module: modulo,
        format: 'csv',
        file_size_bytes: csvResult.sizeBytes,
        row_count: csvResult.rowCount,
        duration_ms: durationMs,
        filters_json: req.query as Record<string, unknown>,
        status: 'success',
        details: `Exportación CSV de ${modulo} (${csvResult.rowCount} filas, ${csvResult.sizeBytes} bytes, ${durationMs} ms)`,
      }).catch(() => {});

      const dateStamp = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="kiriku-${modulo}-${dateStamp}.csv"`);
      res.setHeader('X-Export-Size-Bytes', String(csvResult.sizeBytes));
      res.setHeader('X-Export-Duration-Ms', String(durationMs));
      res.setHeader('X-Export-Rows', String(csvResult.rowCount));
      return res.status(200).send(csvResult.csv);
    } catch (err: any) {
      const durationMs = Date.now() - startMs;
      await recordSystemLog({
        ...getActorMeta(req),
        action: `EXPORT_${modulo.toUpperCase().replace(/-/g, '_')}`,
        module: modulo,
        format: 'csv',
        duration_ms: durationMs,
        filters_json: req.query as Record<string, unknown>,
        status: 'error',
        details: err?.message || 'Error generando reporte CSV',
      }).catch(() => {});
      console.error(`Error exporting module ${modulo}:`, err);
      return res.status(500).json({ error: 'Error al generar el reporte exportable' });
    }
  }
);

export default router;
