import express, { Request, Response, Router } from 'express';
import { query, supabaseAdmin } from './supabase';
import { authenticate, requirePermission } from './authorization';

const router: Router = express.Router();

// Helper to calculate age from birth date
function calculateAge(birthDateString: string): number {
  const today = new Date();
  const birthDate = new Date(birthDateString);
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
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

    res.json({
      token: user.id,
      user: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
      },
      message: 'Inicio de sesión exitoso',
    });
  } catch (err: any) {
    console.error('Error in login:', err);
    res.status(500).json({ error: 'Error al procesar el inicio de sesión' });
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
// 2. PROYECTOS (Catálogo, Propuestas, Revisión)
// -------------------------------------------------------------
router.get('/proyectos', async (req: Request, res: Response) => {
  try {
    const { estado, ubicacion, organizacion_id, q } = req.query;
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

// Registro de propuesta de proyecto
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

    if (!titulo || !descripcion || !ubicacion) {
      return res.status(400).json({ error: 'Título, descripción y ubicación son obligatorios' });
    }

    let resolvedOrgId = organizacion_id;

    // Si se envió una nueva organización para crear
    if (!resolvedOrgId && organizacion_nueva && organizacion_nueva.nombre) {
      const orgRows = await query(
        `INSERT INTO organizaciones (nombre, tipo, contacto_nombre, contacto_email, contacto_telefono)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          organizacion_nueva.nombre,
          organizacion_nueva.tipo || 'ONG',
          organizacion_nueva.contacto_nombre || null,
          organizacion_nueva.contacto_email || null,
          organizacion_nueva.contacto_telefono || null,
        ]
      );
      resolvedOrgId = orgRows[0].id;
    }

    const rows = await query(
      `INSERT INTO proyectos (
         organizacion_id, titulo, descripcion, ubicacion, 
         cupos_disponibles, fecha_inicio, fecha_fin, 
         es_mayor_edad, estado, portada_url
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        resolvedOrgId || null,
        titulo,
        descripcion,
        ubicacion,
        cupos_disponibles || 10,
        fecha_inicio || null,
        fecha_fin || null,
        es_mayor_edad !== undefined ? es_mayor_edad : true,
        'pendiente_revision',
        portada_url || null,
      ]
    );

    res.status(201).json(rows[0]);
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

    const rows = await query(
      `UPDATE proyectos 
       SET estado = $1, 
           motivo_rechazo = $2, 
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [estado, estado === 'rechazado' ? motivo_rechazo : null, id]
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

// Seguimiento del Postulante en tiempo real (por CI o Email)
router.get('/postulaciones/tracking', async (req: Request, res: Response) => {
  try {
    const { busqueda } = req.query;
    if (!busqueda || typeof busqueda !== 'string') {
      return res.status(400).json({ error: 'Ingrese su CI o Correo Electrónico para consultar' });
    }

    const term = busqueda.trim();

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
       ORDER BY app.created_at DESC`,
      [term, `%${term}%`]
    );

    if (!postRows.length) {
      return res.json([]);
    }

    // Para cada postulación, obtener sus 5 etapas de evaluación
    const results = [];
    for (const row of postRows) {
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
      });
    }

    res.json(results);
  } catch (err: any) {
    console.error('Error tracking postulant:', err);
    res.status(500).json({ error: 'Error al consultar seguimiento de postulación' });
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

// Banco de postulantes único
router.get('/postulantes', async (req: Request, res: Response) => {
  try {
    const { q, profesion } = req.query;
    let sql = `
      SELECT p.*,
             COUNT(app.id) as total_postulaciones,
             MAX(app.created_at) as ultima_postulacion
      FROM postulantes p
      LEFT JOIN postulaciones app ON app.postulante_id = p.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (q) {
      params.push(`%${q}%`);
      sql += ` AND (p.nombres ILIKE $${params.length} OR p.apellidos ILIKE $${params.length} OR p.ci ILIKE $${params.length} OR p.habilidades ILIKE $${params.length})`;
    }

    if (profesion) {
      params.push(`%${profesion}%`);
      sql += ` AND p.profesion_ocupacion ILIKE $${params.length}`;
    }

    sql += ' GROUP BY p.id ORDER BY p.created_at DESC';

    const rows = await query(sql, params);
    res.json(rows);
  } catch (err: any) {
    console.error('Error fetching postulantes pool:', err);
    res.status(500).json({ error: 'Error al consultar banco de postulantes' });
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
       WHERE ($1 = '' OR COALESCE(pu.email, u.email) ILIKE '%' || $1 || '%' OR COALESCE(pu.nombre, '') ILIKE '%' || $1 || '%')
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
