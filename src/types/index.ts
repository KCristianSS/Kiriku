export type OrganizacionTipo = 'ONG' | 'Fundación' | 'Empresa' | 'Institución Educativa' | 'Colectivo Social' | string;

export interface Organizacion {
  id: number | string;
  nombre: string;
  tipo: OrganizacionTipo;
  contacto_nombre?: string | null;
  contacto_email?: string | null;
  contacto_telefono?: string | null;
  created_at?: string;
}

export type ProyectoEstado = 'pendiente_revision' | 'aprobado' | 'rechazado';

// KIR-78: Estado de publicación de proyectos aprobados
export type ProyectoEstadoPublicacion = 'sin_publicar' | 'publicado' | 'oculto';

export interface Proyecto {
  id: number | string;
  organizacion_id?: number | string | null;
  titulo: string;
  descripcion: string;
  ubicacion: string;
  cupos_disponibles: number;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  es_mayor_edad: boolean;
  estado: ProyectoEstado;
  publicado?: boolean;
  fecha_publicacion?: string | null;
  motivo_rechazo?: string | null;
  portada_url?: string | null;
  created_at?: string;
  updated_at?: string;
  organizacion_nombre?: string | null;
  organizacion?: Organizacion | null;
}

export interface PublishProjectPayload {
  publicado: boolean;
}

export interface Postulante {
  id: number | string;
  nombres: string;
  apellidos: string;
  email: string;
  telefono?: string | null;
  ci: string;
  fecha_nacimiento: string;
  profesion_ocupacion?: string | null;
  habilidades?: string | null;
  motivacion?: string | null;
  created_at?: string;
}

// KIR-94: Estructura del banco de postulantes con datos de perfil y avance parcial
export interface PostulanteBancoItem extends Postulante {
  edad: number;
  es_mayor_edad: boolean;
  total_postulaciones: number;
  ultima_postulacion?: string;
  postulacion_id?: number | string | null;
  proyecto_id?: number | string | null;
  proyecto_titulo?: string | null;
  proyecto_ubicacion?: string | null;
  organizacion_nombre?: string | null;
  estado_general?: PostulacionEstado | 'sin_postulacion' | string;
  es_reasignacion?: boolean;
  etapas_totales: number;
  etapas_aprobadas: number;
  porcentaje_avance: number;
  etapas: EvaluacionEtapa[];
}

export interface PostulanteMetricasResumen {
  totalPostulantes: number;
  enProceso: number;
  aprobados: number;
  rechazados: number;
  reasignaciones: number;
  promedioAvance: number;
  profesiones: string[];
}

export type PostulacionEstado = 'en_proceso' | 'aprobado' | 'rechazado' | 'reasignacion' | 'reenganche';

export type EtapaNombre =
  | 'inicial'
  | 'tecnica'
  | 'personal'
  | 'competencias'
  | 'salud_fisica_psicologica';

export type EtapaEstado = 'pendiente' | 'en_revision' | 'aprobado' | 'observado' | 'rechazado';

export interface EvaluacionEtapa {
  id: number | string;
  postulacion_id: number | string;
  etapa: EtapaNombre;
  estado: EtapaEstado;
  evaluador?: string | null;
  comentarios?: string | null;
  fecha_evaluacion?: string | null;
}

// KIR-70: Estructura de evaluación inicial
export interface EvaluacionInicialItem {
  etapa_id: number | string;
  postulacion_id: number | string;
  etapa_estado: EtapaEstado;
  evaluador?: string | null;
  comentarios?: string | null;
  fecha_evaluacion?: string | null;
  postulacion_fecha: string;
  postulacion_estado: PostulacionEstado;
  postulante: Postulante & {
    edad: number;
    es_mayor_edad: boolean;
  };
  proyecto: {
    id: number | string;
    titulo: string;
    ubicacion: string;
    es_mayor_edad: boolean;
    organizacion_nombre?: string | null;
  };
}

export interface RegistrarEvaluacionInicialPayload {
  estado: 'aprobado' | 'observado' | 'rechazado' | 'en_revision';
  evaluador: string;
  comentarios: string;
  criterios?: {
    mayoria_edad_verificada?: boolean;
    identidad_ci_valida?: boolean;
    carta_motivacion_apta?: boolean;
    disponibilidad_confirmada?: boolean;
  };
}

// KIR-66: Estructura de evaluación técnica (Socio Territorial)
export interface EvaluacionTecnicaCriterios {
  experiencia_afin?: boolean;
  disponibilidad_territorial?: boolean;
  competencias_tecnicas?: boolean;
  capacidad_trabajo_campo?: boolean;
}

export interface EvaluacionTecnicaItem {
  etapa_id: number | string;
  postulacion_id: number | string;
  etapa_estado: EtapaEstado;
  evaluador?: string | null;
  comentarios?: string | null;
  fecha_evaluacion?: string | null;
  postulacion_fecha: string;
  postulacion_estado: PostulacionEstado;
  inicial_estado: EtapaEstado | string;
  inicial_comentarios?: string | null;
  inicial_evaluador?: string | null;
  puede_evaluar: boolean;
  postulante: Postulante & {
    edad: number;
    es_mayor_edad: boolean;
  };
  proyecto: {
    id: number | string;
    titulo: string;
    ubicacion: string;
    cupos_disponibles?: number;
    organizacion_id?: number | string | null;
    organizacion_nombre?: string | null;
  };
}

export interface RegistrarEvaluacionTecnicaPayload {
  estado: 'aprobado' | 'observado' | 'rechazado' | 'en_revision';
  evaluador: string;
  comentarios: string;
  puntaje_tecnico?: number;
  criterios?: EvaluacionTecnicaCriterios;
}

// KIR-58: Rúbrica estructurada para la evaluación por competencias.
export interface EvaluacionCompetenciasCriterios {
  trabajo_equipo: number;
  comunicacion: number;
  liderazgo: number;
  resolucion_problemas: number;
  empatia_adaptabilidad: number;
}

export interface EvaluacionCompetenciasItem {
  etapa_id: number | string;
  postulacion_id: number | string;
  etapa_estado: EtapaEstado;
  evaluador?: string | null;
  comentarios?: string | null;
  fecha_evaluacion?: string | null;
  detalle_criterios: EvaluacionCompetenciasCriterios;
  puntaje_promedio: number | null;
  tecnica_estado: EtapaEstado | string;
  personal_estado: EtapaEstado | string;
  puede_evaluar: boolean;
  postulante: Postulante;
  proyecto: {
    id: number | string;
    titulo: string;
    ubicacion: string;
    organizacion_nombre?: string | null;
  };
}

export interface RegistrarEvaluacionCompetenciasPayload {
  estado: 'aprobado' | 'observado' | 'rechazado';
  evaluador: string;
  comentarios: string;
  criterios: EvaluacionCompetenciasCriterios;
}

// KIR-62: Criterios estructurados para la entrevista personal.
export interface EvaluacionPersonalCriterios {
  motivacion_servicio: number;
  compromiso_responsabilidad: number;
  comunicacion_interpersonal: number;
  disponibilidad: number;
  madurez_autocuidado: number;
}

export interface EvaluacionPersonalItem {
  etapa_id: number | string;
  postulacion_id: number | string;
  etapa_estado: EtapaEstado;
  evaluador?: string | null;
  comentarios?: string | null;
  fecha_evaluacion?: string | null;
  detalle_criterios_personales: EvaluacionPersonalCriterios;
  puntaje_promedio: number | null;
  tecnica_estado: EtapaEstado | string;
  puede_evaluar: boolean;
  postulante: Postulante;
  proyecto: {
    id: number | string;
    titulo: string;
    ubicacion: string;
    organizacion_nombre?: string | null;
  };
}

export interface RegistrarEvaluacionPersonalPayload {
  estado: 'aprobado' | 'observado' | 'rechazado';
  evaluador: string;
  comentarios: string;
  criterios: EvaluacionPersonalCriterios;
}


export interface Postulacion {
  id: number | string;
  postulante_id: number | string;
  proyecto_id: number | string;
  estado_general: PostulacionEstado;
  es_reasignacion: boolean;
  es_reenganche?: boolean; // Compatibilidad
  created_at?: string;
  updated_at?: string;
  postulante?: Postulante;
  proyecto?: Proyecto;
  etapas?: EvaluacionEtapa[];
}

export type DonacionTipo = 'economica' | 'especie';

export interface Donacion {
  id: number | string;
  donante_nombre: string;
  donante_email?: string | null;
  tipo_donacion: DonacionTipo;
  monto_bob?: number | null;
  descripcion_especie?: string | null;
  proyecto_destino_id?: number | string | null;
  recibido_por: string;
  fecha_recepcion: string;
  proyecto?: Proyecto | null;
}

export interface CreatePostulantePayload {
  nombres: string;
  apellidos: string;
  email: string;
  telefono?: string;
  ci: string;
  fecha_nacimiento: string;
  profesion_ocupacion?: string;
  habilidades?: string;
  motivacion?: string;
  proyecto_id: number | string;
  confirmacion_mayor_edad?: boolean;
}

// KIR-102: Estructura de datos de la postulación inicial
export type PostulacionInicialPayload = CreatePostulantePayload;

export interface PostulacionRegistroResponse {
  message: string;
  postulacion_id: number | string;
  postulante_id: number | string;
  edad_calculada?: number;
  etapas_creadas?: number;
}

// KIR-99: Validación previa a la postulación
export interface ValidarEdadPayload {
  proyecto_id: number | string;
  fecha_nacimiento: string;
}

export interface ValidarEdadResponse {
  proyecto_id: number | string;
  proyecto_titulo: string;
  es_mayor_edad_requerido: boolean;
  fecha_nacimiento: string;
  edad_calculada: number;
  es_mayor_edad: boolean;
  es_elegible: boolean;
  mensaje: string;
}

export interface ProposeProjectPayload {
  titulo: string;
  descripcion: string;
  ubicacion: string;
  cupos_disponibles: number;
  fecha_inicio?: string;
  fecha_fin?: string;
  es_mayor_edad: boolean;
  portada_url?: string;
  organizacion_id?: string;
  organizacion_nueva?: {
    nombre: string;
    tipo: string;
    contacto_nombre: string;
    contacto_email: string;
    contacto_telefono: string;
  };
}

export interface CreateDonationPayload {
  donante_nombre: string;
  donante_email?: string;
  tipo_donacion: DonacionTipo;
  monto_bob?: number;
  descripcion_especie?: string;
  proyecto_destino_id?: string | null;
  recibido_por: string;
}

export interface DashboardMetrics {
  totalProyectos: number;
  proyectosAprobados: number;
  proyectosPublicados?: number;
  proyectosPendientes: number;
  totalPostulantes: number;
  postulacionesEnProceso: number;
  postulacionesAprobadas: number;
  postulacionesReasignacion: number;
  postulacionesReenganche?: number;
  totalDonacionesBob: number;
  totalDonacionesEspecie: number;
}
