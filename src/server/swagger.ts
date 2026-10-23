import swaggerUi from 'swagger-ui-express';
import { Router } from 'express';

export const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Kirikú Voluntariado Comunitario - API REST',
    version: '1.0.0',
    description: `
Documentación oficial de la API REST del Sistema de Gestión de Voluntariado **Kirikú**.
Permite gestionar proyectos comunitarios, postulaciones de voluntarios con validación de mayoría de edad (+18), seguimiento en 5 etapas de evaluación, reasignación, banco de postulantes y registro transparente de donaciones en Supabase (PostgreSQL).
    `,
    contact: {
      name: 'Equipo de Desarrollo Kirikú - UCB Sistemas',
      email: 'contacto@kiriku.org',
    },
  },
  servers: [
    {
      url: '/api',
      description: 'Servidor API Local / Proxy',
    },
  ],
  tags: [
    { name: 'Proyectos', description: 'Catálogo de iniciativas comunitarias, propuestas y revisión administrativa' },
    { name: 'Postulaciones', description: 'Registro inicial, validación de mayoría de edad (+18), seguimiento y reasignación' },
    { name: 'Evaluaciones', description: 'Gestión y calificación de las 5 etapas de evaluación del voluntario' },
    { name: 'Postulantes', description: 'Banco de talentos y datos de voluntarios registrados' },
    { name: 'Organizaciones', description: 'Entidades sociales, ONGs y fundaciones aliadas' },
    { name: 'Donaciones', description: 'Registro transparente de donaciones económicas (Bs.) y en especie' },
    { name: 'Métricas', description: 'Indicadores clave y reportes en tiempo real para el panel administrativo' },
  ],
  paths: {
    '/proyectos': {
      get: {
        tags: ['Proyectos'],
        summary: 'Listar proyectos comunitarios',
        description: 'Obtiene el listado de proyectos registrados con filtros opcionales por estado, ubicación u organización.',
        parameters: [
          { name: 'estado', in: 'query', schema: { type: 'string', enum: ['aprobado', 'pendiente_revision', 'rechazado'] }, description: 'Filtrar por estado del proyecto (por defecto: aprobado)' },
          { name: 'ubicacion', in: 'query', schema: { type: 'string' }, description: 'Filtrar por ubicación geográfica' },
          { name: 'organizacion_id', in: 'query', schema: { type: 'integer' }, description: 'Filtrar por ID de la organización' },
          { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Buscar por título o descripción' },
        ],
        responses: {
          200: {
            description: 'Lista de proyectos obtenida exitosamente.',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Proyecto' },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Proyectos'],
        summary: 'Proponer una nueva iniciativa o proyecto',
        description: 'Permite a organizaciones o voluntarios postular una propuesta de proyecto comunitario para revisión.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ProponerProyectoInput' },
            },
          },
        },
        responses: {
          201: { description: 'Proyecto registrado en estado pendiente_revision.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Proyecto' } } } },
          400: { description: 'Campos requeridos faltantes.' },
        },
      },
    },
    '/proyectos/{id}': {
      get: {
        tags: ['Proyectos'],
        summary: 'Obtener detalle de un proyecto por ID',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'ID numérico del proyecto' },
        ],
        responses: {
          200: { description: 'Detalle del proyecto encontrado.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Proyecto' } } } },
          404: { description: 'Proyecto no encontrado.' },
        },
      },
    },
    '/proyectos/{id}/revision': {
      patch: {
        tags: ['Proyectos'],
        summary: 'Revisión administrativa de proyecto',
        description: 'Permite al administrador aprobar o rechazar un proyecto propuesto (exigiendo motivo de rechazo si aplica).',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'ID numérico del proyecto' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['estado'],
                properties: {
                  estado: { type: 'string', enum: ['aprobado', 'rechazado', 'pendiente_revision'] },
                  motivo_rechazo: { type: 'string', example: 'Falta detalle en la planificación de seguridad.' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Estado del proyecto actualizado exitosamente.' },
          400: { description: 'Datos inválidos o falta motivo de rechazo.' },
          404: { description: 'Proyecto no encontrado.' },
        },
      },
    },
    '/postulaciones/validar-edad': {
      post: {
        tags: ['Postulaciones'],
        summary: 'Validar mayoría de edad (+18) previa a la postulación (KIR-17 / KIR-99)',
        description: 'Calcula la edad exacta a partir de la fecha de nacimiento y dictamina si el voluntario cumple el requisito legal de mayoría de edad para el proyecto seleccionado.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['proyecto_id', 'fecha_nacimiento'],
                properties: {
                  proyecto_id: { type: 'integer', example: 1 },
                  fecha_nacimiento: { type: 'string', format: 'date', example: '2002-05-14' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Resultado de la validación de edad.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    proyecto_id: { type: 'integer' },
                    proyecto_titulo: { type: 'string' },
                    es_mayor_edad_requerido: { type: 'boolean' },
                    fecha_nacimiento: { type: 'string' },
                    edad_calculada: { type: 'integer', example: 22 },
                    es_mayor_edad: { type: 'boolean', example: true },
                    es_elegible: { type: 'boolean', example: true },
                    mensaje: { type: 'string', example: 'Cumples con el requisito de mayoría de edad (22 años).' },
                  },
                },
              },
            },
          },
          400: { description: 'Parámetros obligatorios faltantes.' },
          404: { description: 'Proyecto no encontrado.' },
        },
      },
    },
    '/postulaciones': {
      post: {
        tags: ['Postulaciones'],
        summary: 'Registrar postulación inicial vinculada a proyecto (KIR-102 a KIR-105)',
        description: 'Registra o actualiza al postulante en Supabase, vincula la postulación, valida mayoría de edad (+18) e inicializa automáticamente las 5 etapas de evaluación.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PostulacionInput' },
            },
          },
        },
        responses: {
          201: {
            description: 'Postulación registrada con éxito y 5 etapas inicializadas.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'Postulación registrada con éxito' },
                    postulacion_id: { type: 'integer', example: 4 },
                    postulante_id: { type: 'integer', example: 4 },
                    edad_calculada: { type: 'integer', example: 22 },
                    etapas_creadas: { type: 'integer', example: 5 },
                  },
                },
              },
            },
          },
          400: { description: 'Error de validación: campos faltantes, menor de edad o declaración jurada no aceptada.' },
          404: { description: 'Proyecto seleccionado no existe.' },
        },
      },
      get: {
        tags: ['Postulaciones'],
        summary: 'Listado administrativo de postulaciones con etapas',
        description: 'Consulta las postulaciones registradas en el sistema con soporte de filtros para coordinación y admisiones.',
        parameters: [
          { name: 'estado', in: 'query', schema: { type: 'string' }, description: 'Filtrar por estado general' },
          { name: 'proyecto_id', in: 'query', schema: { type: 'integer' }, description: 'Filtrar por proyecto' },
          { name: 'reasignacion', in: 'query', schema: { type: 'boolean' }, description: 'Filtrar solo postulaciones reasignadas' },
          { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Buscar por nombres, CI o habilidades' },
        ],
        responses: {
          200: {
            description: 'Lista de postulaciones con datos de postulante, proyecto y sus 5 etapas.',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/PostulacionCompleta' } } } },
          },
        },
      },
    },
    '/postulaciones/tracking': {
      get: {
        tags: ['Postulaciones'],
        summary: 'Seguimiento del postulante en vivo por CI, nombre o correo',
        description: 'Permite a los voluntarios consultar en tiempo real el progreso de sus 5 etapas de evaluación mediante búsqueda flexible.',
        parameters: [
          { name: 'busqueda', in: 'query', required: true, schema: { type: 'string' }, description: 'Cédula de identidad (CI), correo o nombre del postulante' },
        ],
        responses: {
          200: {
            description: 'Postulaciones encontradas con sus 5 etapas de evaluación.',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      postulante: { $ref: '#/components/schemas/Postulante' },
                      postulacion: { $ref: '#/components/schemas/PostulacionSeguimiento' },
                    },
                  },
                },
              },
            },
          },
          400: { description: 'Término de búsqueda no proporcionado.' },
        },
      },
    },
    '/postulaciones/{id}/reasignacion': {
      patch: {
        tags: ['Postulaciones'],
        summary: 'Reasignar postulante a otro proyecto comunitario',
        description: 'Permite transferir o reasignar a un voluntario hacia un nuevo proyecto con cupos disponibles.',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'ID de la postulación' },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  nuevo_proyecto_id: { type: 'integer', example: 2 },
                  es_reasignacion: { type: 'boolean', example: true },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Postulación reasignada con éxito.' },
          500: { description: 'Error al gestionar reasignación.' },
        },
      },
    },
    '/postulaciones/{id}/status': {
      patch: {
        tags: ['Postulaciones'],
        summary: 'Actualizar estado general de la postulación',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'ID de la postulación' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['estado_general'],
                properties: {
                  estado_general: { type: 'string', enum: ['en_proceso', 'aprobado', 'rechazado', 'reasignacion'] },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Estado general actualizado.' },
          400: { description: 'Estado general inválido.' },
        },
      },
    },
    '/evaluaciones/{id}': {
      patch: {
        tags: ['Evaluaciones'],
        summary: 'Calificar o actualizar una de las 5 etapas de evaluación',
        description: 'Actualiza el estado de una etapa (inicial, técnica, personal, competencias, salud física/psicológica), asignando evaluador y observaciones.',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'ID numérico de la etapa en evaluaciones_etapas' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['estado'],
                properties: {
                  estado: { type: 'string', enum: ['pendiente', 'en_revision', 'aprobado', 'observado', 'rechazado'] },
                  comentarios: { type: 'string', example: 'Documento de identidad verificado correctamente.' },
                  evaluador: { type: 'string', example: 'Comité de Admisiones Kirikú' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Etapa actualizada exitosamente.' },
          400: { description: 'Estado de etapa no válido.' },
        },
      },
    },
    '/postulantes': {
      get: {
        tags: ['Postulantes'],
        summary: 'Banco general de postulantes',
        description: 'Obtiene el listado de personas registradas en la plataforma con total de postulaciones.',
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Buscar por nombre, CI o habilidades' },
          { name: 'profesion', in: 'query', schema: { type: 'string' }, description: 'Filtrar por profesión u ocupación' },
        ],
        responses: {
          200: { description: 'Lista de postulantes obtenida exitosamente.' },
        },
      },
    },
    '/organizaciones': {
      get: {
        tags: ['Organizaciones'],
        summary: 'Listar organizaciones aliadas',
        responses: {
          200: { description: 'Lista de organizaciones registradas.' },
        },
      },
      post: {
        tags: ['Organizaciones'],
        summary: 'Crear nueva organización aliada',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['nombre', 'tipo'],
                properties: {
                  nombre: { type: 'string', example: 'Fundación Manos Limpias' },
                  tipo: { type: 'string', example: 'fundacion' },
                  contacto_nombre: { type: 'string', example: 'Carlos Mendoza' },
                  contacto_email: { type: 'string', example: 'carlos@manoslimpias.org' },
                  contacto_telefono: { type: 'string', example: '+591 71234567' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Organización creada exitosamente.' },
        },
      },
    },
    '/donaciones': {
      get: {
        tags: ['Donaciones'],
        summary: 'Listar donaciones recibidas',
        responses: {
          200: { description: 'Historial de donaciones económicas y en especie.' },
        },
      },
      post: {
        tags: ['Donaciones'],
        summary: 'Registrar nueva donación comunitaria',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['donante_nombre', 'tipo_donacion', 'recibido_por'],
                properties: {
                  donante_nombre: { type: 'string', example: 'Banco Mercantil Santa Cruz' },
                  donante_email: { type: 'string', example: 'rse@bmsc.com.bo' },
                  tipo_donacion: { type: 'string', enum: ['economica', 'especie'], example: 'economica' },
                  monto_bob: { type: 'number', example: 12500.00 },
                  descripcion_especie: { type: 'string', example: '50 cajas de útiles escolares' },
                  proyecto_destino_id: { type: 'integer', example: 1 },
                  recibido_por: { type: 'string', example: 'Kevin Sancalli' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Donación registrada con éxito.' },
        },
      },
    },
    '/metrics': {
      get: {
        tags: ['Métricas'],
        summary: 'Obtener métricas cuantitativas para dashboard',
        description: 'Calcula indicadores agregados en tiempo real desde Supabase para el panel administrativo.',
        responses: {
          200: {
            description: 'Métricas calculadas con éxito.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    totalProyectos: { type: 'integer', example: 3 },
                    proyectosAprobados: { type: 'integer', example: 2 },
                    proyectosPendientes: { type: 'integer', example: 1 },
                    totalPostulantes: { type: 'integer', example: 3 },
                    postulacionesEnProceso: { type: 'integer', example: 3 },
                    postulacionesAprobadas: { type: 'integer', example: 0 },
                    postulacionesReasignacion: { type: 'integer', example: 0 },
                    totalDonacionesBob: { type: 'number', example: 12500.00 },
                    totalDonacionesEspecie: { type: 'integer', example: 1 },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Proyecto: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          organizacion_id: { type: 'integer', example: 2 },
          titulo: { type: 'string', example: 'Reforestación Urbana Bosquecillo Pura Pura' },
          descripcion: { type: 'string', example: 'Jornadas de siembra de plantines nativos y concientización comunitaria.' },
          ubicacion: { type: 'string', example: 'La Paz, Zona Pura Pura' },
          cupos_disponibles: { type: 'integer', example: 25 },
          es_mayor_edad: { type: 'boolean', example: true },
          estado: { type: 'string', enum: ['aprobado', 'pendiente_revision', 'rechazado'], example: 'aprobado' },
          portada_url: { type: 'string', example: 'https://images.unsplash.com/...' },
          organizacion_nombre: { type: 'string', example: 'EcoHuertos La Paz' },
        },
      },
      ProponerProyectoInput: {
        type: 'object',
        required: ['titulo', 'descripcion', 'ubicacion'],
        properties: {
          titulo: { type: 'string', example: 'Taller de Arte y Música para Niños' },
          descripcion: { type: 'string', example: 'Talleres gratuitos de expresión artística y desarrollo creativo.' },
          ubicacion: { type: 'string', example: 'Cochabamba, Zona Central' },
          cupos_disponibles: { type: 'integer', example: 15 },
          es_mayor_edad: { type: 'boolean', example: false },
          portada_url: { type: 'string', example: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09' },
          organizacion_id: { type: 'integer', example: 1 },
        },
      },
      Postulante: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 3 },
          nombres: { type: 'string', example: 'Kevin C' },
          apellidos: { type: 'string', example: 'Sancalli S' },
          email: { type: 'string', example: 'kevin.sancalli@ucb.edu.bo' },
          ci: { type: 'string', example: '9154355' },
          telefono: { type: 'string', example: '6718766' },
          profesion_ocupacion: { type: 'string', example: 'Estudiante de Ing. de Sistemas' },
        },
      },
      PostulacionInput: {
        type: 'object',
        required: ['nombres', 'apellidos', 'email', 'ci', 'fecha_nacimiento', 'proyecto_id'],
        properties: {
          nombres: { type: 'string', example: 'Kevin C' },
          apellidos: { type: 'string', example: 'Sancalli S' },
          email: { type: 'string', example: 'kevin.sancalli@ucb.edu.bo' },
          ci: { type: 'string', example: '9154355' },
          telefono: { type: 'string', example: '+591 6718766' },
          fecha_nacimiento: { type: 'string', format: 'date', example: '2004-02-19' },
          profesion_ocupacion: { type: 'string', example: 'Estudiante de Ing. de Sistemas' },
          habilidades: { type: 'string', example: 'Programación, trabajo comunitario' },
          motivacion: { type: 'string', example: 'Aportar a la juventud con educación digital.' },
          proyecto_id: { type: 'integer', example: 2 },
          confirmacion_mayor_edad: { type: 'boolean', example: true },
        },
      },
      PostulacionSeguimiento: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 3 },
          estado_general: { type: 'string', example: 'en_proceso' },
          es_reasignacion: { type: 'boolean', example: false },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
          proyecto: {
            type: 'object',
            properties: {
              id: { type: 'integer', example: 2 },
              titulo: { type: 'string', example: 'Apoyo Escolar y Alfabetización Digital' },
              ubicacion: { type: 'string', example: 'El Alto, Villa Adela' },
              organizacion_nombre: { type: 'string', example: 'Fundación Manos Limpias' },
            },
          },
          etapas: {
            type: 'array',
            items: { $ref: '#/components/schemas/EvaluacionEtapa' },
          },
        },
      },
      EvaluacionEtapa: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 11 },
          postulacion_id: { type: 'integer', example: 3 },
          etapa: { type: 'string', enum: ['inicial', 'tecnica', 'personal', 'competencias', 'salud_fisica_psicologica'], example: 'inicial' },
          estado: { type: 'string', enum: ['pendiente', 'en_revision', 'aprobado', 'observado', 'rechazado'], example: 'aprobado' },
          evaluador: { type: 'string', example: 'Comité de Admisiones Kirikú' },
          comentarios: { type: 'string', example: 'Recepción de postulación y verificación de requisitos básicos.' },
          fecha_evaluacion: { type: 'string', format: 'date-time' },
        },
      },
      PostulacionCompleta: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          estado_general: { type: 'string', example: 'en_proceso' },
          es_reasignacion: { type: 'boolean', example: false },
          postulante: { $ref: '#/components/schemas/Postulante' },
          etapas: {
            type: 'array',
            items: { $ref: '#/components/schemas/EvaluacionEtapa' },
          },
        },
      },
    },
  },
};

export function setupSwagger(app: any) {
  // Serve Swagger UI at /api-docs and /api/docs
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'Kirikú API Docs - Swagger',
    customCss: `
      .swagger-ui .topbar { background-color: #1E7B85; border-bottom: 3px solid #F58F38; }
      .swagger-ui .topbar .topbar-wrapper a span { font-weight: bold; }
    `,
  }));

  // JSON raw specification endpoint
  app.get('/api/openapi.json', (req: any, res: any) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
}
