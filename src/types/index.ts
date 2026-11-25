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
  postulante: Postulante & {
    edad?: number;
    es_mayor_edad?: boolean;
  };
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
  postulante: Postulante & {
    edad?: number;
    es_mayor_edad?: boolean;
  };
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

// KIR-54: Estructura de evaluación de salud física y psicológica (Etapa 5)
export interface EvaluacionSaludCriterios {
  apto_fisico?: boolean;
  apto_psicologico?: boolean;
  examen_medico_vigente?: boolean;
  condicion_especifica_atendida?: boolean;
}

export interface EvaluacionSaludItem {
  etapa_id: number | string;
  postulacion_id: number | string;
  etapa_estado: EtapaEstado;
  evaluador?: string | null;
  comentarios?: string | null;
  fecha_evaluacion?: string | null;
  postulacion_fecha: string;
  postulacion_estado: PostulacionEstado;
  inicial_estado: EtapaEstado | string;
  tecnica_estado: EtapaEstado | string;
  personal_estado: EtapaEstado | string;
  competencias_estado: EtapaEstado | string;
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

export interface RegistrarEvaluacionSaludPayload {
  estado: 'aprobado' | 'observado' | 'rechazado' | 'en_revision';
  evaluador: string;
  comentarios: string;
  puntaje_bienestar?: number;
  nivel_riesgo?: 'bajo' | 'moderado' | 'alto';
  criterios?: EvaluacionSaludCriterios;
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

// KIR-50: Definición de estados y avance visible del proceso de postulación
export type ProcesoEstadoVisibleCodigo =
  | 'en_proceso'
  | 'observado'
  | 'aprobado'
  | 'rechazado'
  | 'reasignacion';

export type ProcesoSeveridad = 'info' | 'success' | 'warning' | 'danger';

export interface ProcesoEstadoVisible {
  codigo: ProcesoEstadoVisibleCodigo;
  etiqueta: string;
  descripcion: string;
  severidad: ProcesoSeveridad;
}

export interface AvanceEtapaActual {
  codigo: EtapaNombre;
  nombre: string;
  orden: number;
  estado: EtapaEstado;
  evaluador?: string | null;
  comentarios?: string | null;
  fecha_evaluacion?: string | null;
}

export interface AvanceProcesoVisible {
  porcentaje: number;
  etapas_totales: number;
  etapas_aprobadas: number;
  etapas_en_revision: number;
  etapas_observadas: number;
  etapas_rechazadas: number;
  etapas_pendientes: number;
  estado_visible: ProcesoEstadoVisible;
  etapa_actual: AvanceEtapaActual | null;
  siguiente_paso: string;
  requiere_atencion: boolean;
  ultima_actualizacion: string | null;
}

export interface EvaluacionEtapaTracking extends EvaluacionEtapa {
  orden?: number;
  titulo_etapa?: string;
  descripcion_etapa?: string;
}

export interface PostulacionTrackingItem {
  postulante: Postulante;
  postulacion: {
    id: number | string;
    codigo_seguimiento?: string;
    estado_general: string;
    es_reasignacion: boolean;
    es_reenganche?: boolean;
    created_at: string;
    updated_at: string;
    proyecto: {
      id: number | string;
      titulo: string;
      ubicacion: string;
      portada_url?: string;
      organizacion_nombre?: string;
    };
    etapas: EvaluacionEtapaTracking[];
  };
  avance: AvanceProcesoVisible;
}

export type DonacionTipo = 'economica' | 'especie';

export type DonanteTipo = 'persona' | 'empresa' | 'organizacion' | 'anonimo';

export type ReceptorTipo = 'proyecto' | 'organizacion' | 'comunidad' | 'persona';

export type DonacionEstadoEntrega = 'ofrecida' | 'recibida' | 'en_preparacion' | 'entrega_parcial' | 'entregada';

export type DonacionOrigenRegistro = 'oferta_donante' | 'recepcion_interna';

export type DonacionModalidadEntrega =
  | 'transferencia_qr'
  | 'entrega_centro_acopio'
  | 'recojo_domicilio'
  | 'coordinacion_directa';

export type DonacionCategoriaEspecie =
  | 'alimentos'
  | 'ropa_abrigo'
  | 'utiles_escolares'
  | 'salud_higiene'
  | 'herramientas'
  | 'otros';

export type EntregaEstado = 'programada' | 'en_camino' | 'entregada' | 'verificada';

export interface Donante {
  id: number | string;
  nombre: string;
  tipo_donante: DonanteTipo | string;
  documento_identidad?: string | null;
  email?: string | null;
  telefono?: string | null;
  ciudad?: string | null;
  created_at?: string;
}

export interface Receptor {
  id: number | string;
  nombre: string;
  tipo_receptor: ReceptorTipo | string;
  documento_identidad?: string | null;
  email?: string | null;
  telefono?: string | null;
  ubicacion?: string | null;
  proyecto_id?: number | string | null;
  organizacion_id?: number | string | null;
  proyecto_titulo?: string | null;
  organizacion_nombre?: string | null;
  created_at?: string;
}

export interface EntregaDonacion {
  id: number | string;
  donacion_id: number | string;
  donante_id?: number | string | null;
  receptor_id: number | string;
  proyecto_id?: number | string | null;
  organizacion_id?: number | string | null;
  codigo_entrega: string;
  estado: EntregaEstado;
  monto_entregado_bob?: number | null;
  detalle_bienes_entregados?: string | null;
  responsable_entrega: string;
  recibido_por_receptor: string;
  fecha_entrega: string;
  observaciones?: string | null;
  created_at?: string;
  updated_at?: string;
  receptor?: Receptor | null;
  proyecto_titulo?: string | null;
  organizacion_nombre?: string | null;
}

export interface Donacion {
  id: number | string;
  codigo_donacion?: string;
  donante_id?: number | string | null;
  donante_nombre: string;
  donante_tipo?: DonanteTipo | string;
  donante_documento?: string | null;
  donante_email?: string | null;
  donante_telefono?: string | null;
  tipo_donacion: DonacionTipo;
  monto_bob?: number | null;
  descripcion_especie?: string | null;
  categoria_especie?: DonacionCategoriaEspecie | string | null;
  cantidad_especie?: number | null;
  proyecto_destino_id?: number | string | null;
  recibido_por?: string | null;
  fecha_recepcion: string;
  fecha_confirmacion_recepcion?: string | null;
  estado_entrega?: DonacionEstadoEntrega;
  origen_registro?: DonacionOrigenRegistro | string;
  modalidad_entrega?: DonacionModalidadEntrega | string | null;
  fecha_disponible_estimada?: string | null;
  direccion_recojo?: string | null;
  notas_donante?: string | null;
  updated_at?: string;
  proyecto?: Proyecto | null;
  donante?: Donante | null;
  entregas?: EntregaDonacion[];
  entregas_count?: number;
  monto_entregado_total?: number;
  saldo_disponible_bob?: number;
  ultimo_receptor?: string | null;
}

export interface DonacionTrazabilidad {
  donacion: Donacion;
  donante: Donante;
  proyecto_destino: Proyecto | null;
  entregas: EntregaDonacion[];
  resumen: {
    codigo_donacion: string;
    estado_entrega: DonacionEstadoEntrega;
    total_entregas: number;
    entregas_completadas: number;
    entregas_pendientes: number;
    monto_total_bob: number;
    monto_entregado_bob: number;
    saldo_disponible_bob: number;
    receptores_vinculados: number;
  };
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
  donante_tipo?: DonanteTipo;
  donante_documento?: string;
  donante_email?: string;
  donante_telefono?: string;
  donante_ciudad?: string;
  tipo_donacion: DonacionTipo;
  monto_bob?: number;
  descripcion_especie?: string;
  proyecto_destino_id?: string | number | null;
  recibido_por: string;
}

export interface RegisterDeliveryPayload {
  receptor_id?: number | string | null;
  receptor_nombre?: string;
  receptor_tipo?: ReceptorTipo;
  receptor_documento?: string;
  receptor_email?: string;
  receptor_telefono?: string;
  receptor_ubicacion?: string;
  proyecto_id?: number | string | null;
  organizacion_id?: number | string | null;
  estado?: EntregaEstado;
  monto_entregado_bob?: number | null;
  detalle_bienes_entregados?: string;
  responsable_entrega: string;
  recibido_por_receptor: string;
  fecha_entrega?: string;
  observaciones?: string;
}

export interface UpdateDeliveryStatusPayload {
  estado: EntregaEstado;
  recibido_por_receptor?: string;
  observaciones?: string;
}

export interface OfferDonationPayload {
  donante_nombre?: string;
  donante_tipo?: DonanteTipo;
  donante_documento?: string;
  donante_email?: string;
  donante_telefono?: string;
  donante_ciudad?: string;
  tipo_donacion: DonacionTipo;
  monto_bob?: number;
  descripcion_especie?: string;
  categoria_especie?: DonacionCategoriaEspecie | string;
  cantidad_especie?: number | null;
  proyecto_destino_id?: string | number | null;
  modalidad_entrega?: DonacionModalidadEntrega;
  fecha_disponible_estimada?: string;
  direccion_recojo?: string;
  notas_donante?: string;
}

export interface ConfirmDonationReceiptPayload {
  recibido_por: string;
  notas_recepcion?: string;
}

// KIR-31 (KIR-42): Solicitudes de necesidad de donación y sus receptores
export type DonationNeedStatus = 'pendiente' | 'en_revision' | 'atendida' | 'rechazada' | 'cancelada';

export interface DonationNeedRequestPayload {
  receptor_nombre: string;
  receptor_email: string;
  receptor_telefono: string;
  receptor_organizacion?: string;
  tipo_necesidad: DonacionTipo;
  titulo: string;
  descripcion: string;
  monto_objetivo?: number | null;
  cantidad_objetivo?: number | null;
  unidad_medida?: string;
  fecha_necesaria?: string;
  proyecto_destino_id?: number | string | null;
}

export interface DonationNeedRequestResponse {
  id: number | string;
  receptor_id: number | string;
  proyecto_destino_id?: number | string | null;
  tipo_necesidad: DonacionTipo;
  titulo: string;
  descripcion: string;
  monto_objetivo?: number | null;
  cantidad_objetivo?: number | null;
  unidad_medida?: string | null;
  fecha_necesaria?: string | null;
  estado: DonationNeedStatus;
  created_at: string;
  receptor: {
    nombre: string;
    email: string;
    telefono: string;
    organizacion?: string | null;
  };
  proyecto?: {
    id: number | string;
    titulo: string;
    ubicacion: string;
  } | null;
}

// KIR-33: Historial público/transparente de donaciones
export interface DonationHistoryItem {
  id: number | string;
  codigo_donacion?: string;
  estado_entrega?: DonacionEstadoEntrega | string;
  donante_nombre: string;
  tipo_donacion: DonacionTipo;
  monto_bob: number | null;
  descripcion_especie: string | null;
  fecha_recepcion: string;
  recibido_por: string | null;
  proyecto: {
    id: number | string;
    titulo: string;
    ubicacion: string;
  } | null;
}

export interface DonationHistoryResponse {
  items: DonationHistoryItem[];
  resumen: {
    total_aportes: number;
    monto_economico_bob: number;
    aportes_especie: number;
  };
  paginacion: {
    pagina: number;
    limite: number;
    paginas: number;
  };
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
  totalDonacionesOfrecidas?: number;
  totalDonacionesEntregadoBob?: number;
  totalEntregasRegistradas?: number;
}
