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
        summary: 'Seguimiento del postulante en vivo por CI, nombre, correo o código KIR-ID (KIR-29)',
        description: 'Permite a los voluntarios consultar en tiempo real el estado visible, porcentaje de avance y detalle de sus 5 etapas de evaluación.',
        parameters: [
          { name: 'busqueda', in: 'query', required: true, schema: { type: 'string' }, description: 'CI, correo electrónico, nombre o código de seguimiento (ej. KIR-12)' },
        ],
        responses: {
          200: {
            description: 'Postulaciones encontradas con sus 5 etapas de evaluación y avance visible.',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      postulante: { $ref: '#/components/schemas/Postulante' },
                      postulacion: { $ref: '#/components/schemas/PostulacionSeguimiento' },
                      avance: { $ref: '#/components/schemas/AvanceProcesoVisible' },
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
    '/postulaciones/{id}/estado': {
      get: {
        tags: ['Postulaciones'],
        summary: 'Consultar estado y avance puntual de una postulación (KIR-51 & KIR-53)',
        description: 'Endpoint optimizado para el seguimiento periódico de una postulación específica por su ID o código KIR-ID.',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'ID numérico o código KIR-ID de la postulación' },
        ],
        responses: {
          200: {
            description: 'Estado y avance actualizado del proceso.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    postulante: { $ref: '#/components/schemas/Postulante' },
                    postulacion: { $ref: '#/components/schemas/PostulacionSeguimiento' },
                    avance: { $ref: '#/components/schemas/AvanceProcesoVisible' },
                  },
                },
              },
            },
          },
          400: { description: 'Identificador inválido.' },
          404: { description: 'Postulación no encontrada.' },
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
    '/evaluaciones/salud': {
      get: {
        tags: ['Evaluaciones'],
        summary: 'Listar evaluaciones de salud física y psicológica (KIR-28)',
        description: 'Requiere token autenticado con permiso applications.read. Permite filtrar por estado, proyecto o búsqueda.',
        parameters: [
          { name: 'estado', in: 'query', schema: { type: 'string', enum: ['pendientes', 'aprobado', 'observado', 'rechazado', 'bloqueadas', 'todos'] } },
          { name: 'proyecto_id', in: 'query', schema: { type: 'integer' } },
          { name: 'q', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Listado de evaluaciones de salud física y psicológica.' },
          401: { description: 'No autenticado.' },
          403: { description: 'Sin permiso applications.read.' },
        },
      },
    },
    '/evaluaciones/salud/{postulacion_id}': {
      post: {
        tags: ['Evaluaciones'],
        summary: 'Registrar evaluación de salud física y psicológica (KIR-55)',
        description: 'Requiere token autenticado con permiso applications.manage y etapa previa competencias aprobada.',
        parameters: [
          { name: 'postulacion_id', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['estado'],
                properties: {
                  estado: { type: 'string', enum: ['aprobado', 'observado', 'rechazado', 'en_revision'] },
                  evaluador: { type: 'string', example: 'Equipo Médico y Bienestar Kirikú' },
                  comentarios: { type: 'string', example: 'Certificado médico vigente y valoración psicológica favorable.' },
                  puntaje_bienestar: { type: 'integer', example: 90 },
                  nivel_riesgo: { type: 'string', enum: ['bajo', 'moderado', 'alto'] },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Evaluación de salud registrada.' },
          400: { description: 'Validación fallida o etapa previa no aprobada.' },
          401: { description: 'No autenticado.' },
          403: { description: 'Sin permiso applications.manage.' },
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
        summary: 'Listar donaciones con entregas y vínculo donante-receptor (KIR-32)',
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Buscar por donante, código KIR-DON, receptor o proyecto' },
          { name: 'tipo', in: 'query', schema: { type: 'string', enum: ['economica', 'especie'] } },
          { name: 'estado_entrega', in: 'query', schema: { type: 'string', enum: ['recibida', 'en_preparacion', 'entrega_parcial', 'entregada'] } },
        ],
        responses: {
          200: { description: 'Historial de donaciones económicas y en especie con resumen de entregas y saldo disponible.' },
        },
      },
      post: {
        tags: ['Donaciones'],
        summary: 'Registrar nueva donación vinculada a donante',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['donante_nombre', 'tipo_donacion', 'recibido_por'],
                properties: {
                  donante_nombre: { type: 'string', example: 'Banco Mercantil Santa Cruz' },
                  donante_tipo: { type: 'string', enum: ['persona', 'empresa', 'organizacion', 'anonimo'], example: 'empresa' },
                  donante_documento: { type: 'string', example: '1020304021' },
                  donante_email: { type: 'string', example: 'rse@bmsc.com.bo' },
                  donante_telefono: { type: 'string', example: '+591 71234567' },
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
          201: { description: 'Donación y donante registrados con código de trazabilidad KIR-DON.' },
        },
      },
    },
    '/donaciones/donantes': {
      get: {
        tags: ['Donaciones'],
        summary: 'Listar donantes registrados (KIR-38)',
        responses: { 200: { description: 'Catálogo de donantes y conteo de aportes.' } },
      },
    },
    '/donaciones/receptores': {
      get: {
        tags: ['Donaciones'],
        summary: 'Listar receptores registrados (KIR-38)',
        responses: { 200: { description: 'Catálogo de receptores beneficiarios vinculados a proyectos u organizaciones.' } },
      },
    },
    '/donaciones/{id}/trazabilidad': {
      get: {
        tags: ['Donaciones'],
        summary: 'Consultar cadena completa de trazabilidad Donante → Donación → Receptor (KIR-32)',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'ID numérico o código KIR-DON-X' },
        ],
        responses: {
          200: { description: 'Cadena completa de trazabilidad y resumen de saldos entregados.' },
          404: { description: 'Donación no encontrada.' },
        },
      },
    },
    '/donaciones/{id}/entregas': {
      post: {
        tags: ['Donaciones'],
        summary: 'Registrar entrega y vincular donación/donante con receptor (KIR-39)',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['responsable_entrega', 'recibido_por_receptor'],
                properties: {
                  receptor_id: { type: 'integer' },
                  receptor_nombre: { type: 'string', example: 'Comunidad Villa Adela Norte' },
                  receptor_tipo: { type: 'string', enum: ['proyecto', 'organizacion', 'comunidad', 'persona'], example: 'comunidad' },
                  receptor_ubicacion: { type: 'string', example: 'El Alto, La Paz' },
                  estado: { type: 'string', enum: ['programada', 'en_camino', 'entregada', 'verificada'], example: 'entregada' },
                  monto_entregado_bob: { type: 'number', example: 5000 },
                  detalle_bienes_entregados: { type: 'string', example: '25 kits escolares completos' },
                  responsable_entrega: { type: 'string', example: 'Coordinación Logística Kirikú' },
                  recibido_por_receptor: { type: 'string', example: 'María Mamani (Representante)' },
                  observaciones: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Entrega registrada con comprobante KIR-ENT y estado actualizado.' },
          400: { description: 'Validación fallida o monto superior al saldo disponible.' },
        },
      },
    },
    '/donaciones/entregas/{entregaId}': {
      patch: {
        tags: ['Donaciones'],
        summary: 'Actualizar estado de una entrega (programada → en_camino → entregada → verificada)',
        parameters: [
          { name: 'entregaId', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['estado'],
                properties: {
                  estado: { type: 'string', enum: ['programada', 'en_camino', 'entregada', 'verificada'] },
                  recibido_por_receptor: { type: 'string' },
                  observaciones: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Estado de entrega actualizado y sincronizado con la donación.' },
          400: { description: 'Transición de estado inválida.' },
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
      AvanceProcesoVisible: {
        type: 'object',
        properties: {
          porcentaje: { type: 'integer', example: 60 },
          etapas_totales: { type: 'integer', example: 5 },
          etapas_aprobadas: { type: 'integer', example: 3 },
          etapas_en_revision: { type: 'integer', example: 1 },
          etapas_observadas: { type: 'integer', example: 0 },
          etapas_rechazadas: { type: 'integer', example: 0 },
          etapas_pendientes: { type: 'integer', example: 1 },
          requiere_atencion: { type: 'boolean', example: false },
          siguiente_paso: { type: 'string', example: 'Actualmente en 4. Evaluación de Competencias.' },
          ultima_actualizacion: { type: 'string', format: 'date-time', nullable: true },
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
