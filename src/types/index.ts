export type OrganizacionTipo = 'ONG' | 'Fundación' | 'Empresa' | 'Institución Educativa' | 'Colectivo Social' | string;

export interface Organizacion {
  id: string;
  nombre: string;
  tipo: OrganizacionTipo;
  contacto_nombre?: string | null;
  contacto_email?: string | null;
  contacto_telefono?: string | null;
  created_at?: string;
}

export type ProyectoEstado = 'pendiente_revision' | 'aprobado' | 'rechazado';

export interface Proyecto {
  id: string;
  organizacion_id?: string | null;
  titulo: string;
  descripcion: string;
  ubicacion: string;
  cupos_disponibles: number;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  es_mayor_edad: boolean;
  estado: ProyectoEstado;
  motivo_rechazo?: string | null;
  portada_url?: string | null;
  created_at?: string;
  updated_at?: string;
  organizacion?: Organizacion | null;
}

export interface Postulante {
  id: string;
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

export type PostulacionEstado = 'en_proceso' | 'aprobado' | 'rechazado' | 'reenganche';

export type EtapaNombre =
  | 'inicial'
  | 'tecnica'
  | 'personal'
  | 'competencias'
  | 'salud_fisica_psicologica';

export type EtapaEstado = 'pendiente' | 'en_revision' | 'aprobado' | 'observado' | 'rechazado';

export interface EvaluacionEtapa {
  id: string;
  postulacion_id: string;
  etapa: EtapaNombre;
  estado: EtapaEstado;
  evaluador?: string | null;
  comentarios?: string | null;
  fecha_evaluacion?: string | null;
}

export interface Postulacion {
  id: string;
  postulante_id: string;
  proyecto_id: string;
  estado_general: PostulacionEstado;
  es_reenganche: boolean;
  created_at?: string;
  updated_at?: string;
  postulante?: Postulante;
  proyecto?: Proyecto;
  etapas?: EvaluacionEtapa[];
}

export type DonacionTipo = 'economica' | 'especie';

export interface Donacion {
  id: string;
  donante_nombre: string;
  donante_email?: string | null;
  tipo_donacion: DonacionTipo;
  monto_bob?: number | null;
  descripcion_especie?: string | null;
  proyecto_destino_id?: string | null;
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
  proyecto_id: string;
  confirmacion_mayor_edad?: boolean;
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
  proyectosPendientes: number;
  totalPostulantes: number;
  postulacionesEnProceso: number;
  postulacionesAprobadas: number;
  postulacionesReenganche: number;
  totalDonacionesBob: number;
  totalDonacionesEspecie: number;
}
