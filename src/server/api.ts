import express, { Request, Response, Router } from 'express';
import { query, supabaseAdmin } from './supabase';
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
import { authenticate, requirePermission, type AuthenticatedRequest } from './authorization';

const router: Router = express.Router();

// Healthcheck endpoint (Docker Desktop / uptime monitoring)
router.get('/health', async (_req: Request, res: Response) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
  } catch (err: any) {
    res.status(503).json({ status: 'error', database: 'disconnected', error: err?.message });
  }
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
      return res.status(404).json({ error: 'No existe una cuenta registrada con este correo' });
    }

    const user = rows[0];
    if (user.password !== password) {
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

    res.json({
      token: user.id,
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

    const rows = await query(
      `SELECT p.id, p.titulo, p.ubicacion, p.cupos_disponibles,
              p.estado, COALESCE(p.publicado, false) AS publicado, p.fecha_publicacion,
              p.motivo_rechazo, p.created_at, p.updated_at,
              o.nombre AS organizacion_nombre
       FROM proyectos p
       JOIN organizaciones o ON o.id = p.organizacion_id
       WHERE LOWER(TRIM(o.contacto_email)) = LOWER($1)
       ORDER BY p.created_at DESC`,
      [busqueda]
    );

    res.json(rows);
  } catch (err: any) {
    console.error('Error tracking project proposals:', err);
    res.status(500).json({ error: 'Error al consultar el seguimiento de proyectos' });
  }
});

router.get('/proyectos', async (req: Request, res: Response) => {
  try {
    const { estado, publicado, ubicacion, organizacion_id, q } = req.query;
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

    if (q) {
      params.push(`%${q}%`);
      sql += ` AND (p.titulo ILIKE $${params.length} OR p.descripcion ILIKE $${params.length} OR p.ubicacion ILIKE $${params.length})`;
    }

    sql += ' ORDER BY p.created_at DESC';

    const rows = await query(sql, params);

    // Format with nested organizacion object
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

    res.json(formatted);
  } catch (err: any) {
    console.error('Error fetching proyectos:', err);
    res.status(500).json({ error: 'Error al consultar proyectos' });
  }
});

// KIR-79 & KIR-80: Listado público exclusivo de proyectos aprobados y publicados
router.get('/proyectos/publicados', async (req: Request, res: Response) => {
  try {
    const { ubicacion, organizacion_id, q } = req.query;
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

    res.json(formatted);
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

    // Si se rechaza o reabre a pendiente_revision, despublicar automáticamente para proteger el catálogo
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

    // Regla KIR-79: Solo los proyectos con estado 'aprobado' pueden publicarse
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
    const { busqueda } = req.query;
    if (!busqueda || typeof busqueda !== 'string' || !busqueda.trim()) {
      return res.status(400).json({ error: 'Ingrese su CI, Correo Electrónico o Código de Seguimiento para consultar' });
    }

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

    res.json(results);
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
    const { estado, proyecto_id, reasignacion, reenganche, q } = req.query;

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

        return {
          id: row.postulacion_id,
          estado_general: row.estado_general,
          es_reasignacion: row.es_reasignacion,
          es_reenganche: row.es_reasignacion,
          created_at: row.postulacion_fecha,
          updated_at: row.updated_at,
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

    res.json(appsWithEtapas);
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
    const { q, profesion, estado, proyecto_id, ordenar } = req.query;

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

    // Filtro por profesión / ocupación
    if (profesion && typeof profesion === 'string' && profesion.trim()) {
      params.push(`%${profesion.trim()}%`);
      sql += ` AND p.profesion_ocupacion ILIKE $${params.length}`;
    }

    // Filtro por estado de postulación
    if (estado && typeof estado === 'string') {
      if (estado === 'sin_postulacion') {
        sql += ` AND app.id IS NULL`;
      } else if (estado === 'reasignacion') {
        sql += ` AND app.es_reasignacion = true`;
      } else {
        params.push(estado);
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

    // Ordenamiento por avance si fue solicitado
    if (ordenar === 'avance_desc') {
      formatted.sort((a, b) => b.porcentaje_avance - a.porcentaje_avance);
    } else if (ordenar === 'avance_asc') {
      formatted.sort((a, b) => a.porcentaje_avance - b.porcentaje_avance);
    }

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

// KIR-70 & KIR-71: Consulta y listado de postulaciones en etapa inicial
router.get('/evaluaciones/inicial', async (req: Request, res: Response) => {
  try {
    const { estado, proyecto_id, q } = req.query;

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

    res.json(formatted);
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
    const { estado, proyecto_id, q } = req.query;

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

    res.json(formatted);
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
      const { estado, proyecto_id, q } = req.query;

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

      res.json(formatted);
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
    const { estado, proyecto_id, q } = req.query;
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
    res.json(formatted);
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
    const { estado, proyecto_id, q } = req.query;
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
    res.json(formatted);
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

    res.json(rows[0]);
  } catch (err: any) {
    console.error('Error updating postulacion status:', err);
    res.status(500).json({ error: 'Error al cambiar estado de postulación' });
  }
});

// -------------------------------------------------------------
// 4. DONACIONES
// -------------------------------------------------------------
router.get('/donaciones', async (req: Request, res: Response) => {
  try {
    const rows = await query(`
      SELECT d.*, 
             p.titulo as proyecto_titulo,
             p.ubicacion as proyecto_ubicacion
      FROM donaciones d
      LEFT JOIN proyectos p ON d.proyecto_destino_id = p.id
      ORDER BY d.fecha_recepcion DESC
    `);

    const formatted = rows.map((r: any) => ({
      ...r,
      proyecto: r.proyecto_destino_id
        ? {
            id: r.proyecto_destino_id,
            titulo: r.proyecto_titulo,
            ubicacion: r.proyecto_ubicacion,
          }
        : null,
    }));

    res.json(formatted);
  } catch (err: any) {
    console.error('Error fetching donaciones:', err);
    res.status(500).json({ error: 'Error al consultar donaciones' });
  }
});

router.post('/donaciones', async (req: Request, res: Response) => {
  try {
    const {
      donante_nombre,
      donante_email,
      tipo_donacion,
      monto_bob,
      descripcion_especie,
      proyecto_destino_id,
      recibido_por,
    } = req.body;

    if (!donante_nombre || !recibido_por || !tipo_donacion) {
      return res.status(400).json({
        error: 'Nombre del donante, tipo de donación y persona receptora son obligatorios',
      });
    }

    if (tipo_donacion === 'economica' && (!monto_bob || Number(monto_bob) <= 0)) {
      return res.status(400).json({ error: 'Debe ingresar un monto válido en Bs (BOB)' });
    }

    if (tipo_donacion === 'especie' && !descripcion_especie) {
      return res.status(400).json({ error: 'Debe describir los bienes donados en especie' });
    }

    const rows = await query(
      `INSERT INTO donaciones (
         donante_nombre, donante_email, tipo_donacion, 
         monto_bob, descripcion_especie, proyecto_destino_id, 
         recibido_por, fecha_recepcion
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [
        donante_nombre,
        donante_email || null,
        tipo_donacion,
        tipo_donacion === 'economica' ? Number(monto_bob) : null,
        tipo_donacion === 'especie' ? descripcion_especie : null,
        proyecto_destino_id || null,
        recibido_por,
      ]
    );

    res.status(201).json(rows[0]);
  } catch (err: any) {
    console.error('Error creating donacion:', err);
    res.status(500).json({ error: 'Error al registrar donación' });
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
    const totalDonacionesBob = await query("SELECT COALESCE(SUM(monto_bob), 0) as s FROM donaciones WHERE tipo_donacion = 'economica'");
    const totalDonacionesEspecie = await query("SELECT COUNT(*) as c FROM donaciones WHERE tipo_donacion = 'especie'");

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

export default router;
