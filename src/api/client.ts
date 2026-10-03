import axios from 'axios';
import type {
  Proyecto,
  Organizacion,
  Postulacion,
  Postulante,
  EvaluacionEtapa,
  Donacion,
  CreatePostulantePayload,
  ProposeProjectPayload,
  CreateDonationPayload,
  DashboardMetrics,
} from '../types';

export const apiClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

export const api = {
  // Proyectos
  async getProyectos(params?: {
    estado?: string;
    ubicacion?: string;
    organizacion_id?: string;
    q?: string;
  }): Promise<Proyecto[]> {
    const res = await apiClient.get<Proyecto[]>('/proyectos', { params });
    return res.data;
  },

  async getProyectoById(id: string): Promise<Proyecto> {
    const res = await apiClient.get<Proyecto>(`/proyectos/${id}`);
    return res.data;
  },

  async proposeProject(payload: ProposeProjectPayload): Promise<Proyecto> {
    const res = await apiClient.post<Proyecto>('/proyectos', payload);
    return res.data;
  },

  async reviewProject(
    id: string,
    payload: { estado: 'aprobado' | 'rechazado' | 'pendiente_revision'; motivo_rechazo?: string }
  ): Promise<Proyecto> {
    const res = await apiClient.patch<Proyecto>(`/proyectos/${id}/revision`, payload);
    return res.data;
  },

  // Organizaciones
  async getOrganizaciones(): Promise<Organizacion[]> {
    const res = await apiClient.get<Organizacion[]>('/organizaciones');
    return res.data;
  },

  async createOrganizacion(payload: Partial<Organizacion>): Promise<Organizacion> {
    const res = await apiClient.post<Organizacion>('/organizaciones', payload);
    return res.data;
  },

  // Postulaciones
  async submitApplication(payload: CreatePostulantePayload): Promise<{
    message: string;
    postulacion_id: string;
    postulante_id: string;
  }> {
    const res = await apiClient.post('/postulaciones', payload);
    return res.data;
  },

  async trackApplication(busqueda: string): Promise<
    Array<{
      postulante: Postulante;
      postulacion: {
        id: string;
        estado_general: string;
        es_reenganche: boolean;
        created_at: string;
        updated_at: string;
        proyecto: {
          id: string;
          titulo: string;
          ubicacion: string;
          portada_url?: string;
          organizacion_nombre?: string;
        };
        etapas: EvaluacionEtapa[];
      };
    }>
  > {
    const res = await apiClient.get('/postulaciones/tracking', {
      params: { busqueda },
    });
    return res.data;
  },

  async getAdminApplications(params?: {
    estado?: string;
    proyecto_id?: string;
    reenganche?: boolean;
    q?: string;
  }): Promise<Postulacion[]> {
    const res = await apiClient.get<Postulacion[]>('/postulaciones', {
      params: {
        ...params,
        reenganche: params?.reenganche ? 'true' : undefined,
      },
    });
    return res.data;
  },

  async getApplicantsPool(params?: { q?: string; profesion?: string }): Promise<
    Array<
      Postulante & {
        total_postulaciones: number;
        ultima_postulacion?: string;
      }
    >
  > {
    const res = await apiClient.get('/postulantes', { params });
    return res.data;
  },

  async updateEvaluationStage(
    id: string,
    payload: {
      estado: 'pendiente' | 'en_curso' | 'aprobada' | 'rechazada';
      comentarios?: string;
      evaluador?: string;
    }
  ): Promise<EvaluacionEtapa> {
    const res = await apiClient.patch<EvaluacionEtapa>(`/evaluaciones/${id}`, payload);
    return res.data;
  },

  async manageReenganche(
    id: string,
    payload: {
      nuevo_proyecto_id?: string;
      es_reenganche?: boolean;
    }
  ): Promise<Postulacion> {
    const res = await apiClient.patch<Postulacion>(`/postulaciones/${id}/reenganche`, payload);
    return res.data;
  },

  async updateApplicationStatus(
    id: string,
    payload: { estado_general: string }
  ): Promise<Postulacion> {
    const res = await apiClient.patch<Postulacion>(`/postulaciones/${id}/status`, payload);
    return res.data;
  },

  // Donaciones
  async getDonaciones(): Promise<Donacion[]> {
    const res = await apiClient.get<Donacion[]>('/donaciones');
    return res.data;
  },

  async createDonacion(payload: CreateDonationPayload): Promise<Donacion> {
    const res = await apiClient.post<Donacion>('/donaciones', payload);
    return res.data;
  },

  // Métricas
  async getMetrics(): Promise<DashboardMetrics> {
    const res = await apiClient.get<DashboardMetrics>('/metrics');
    return res.data;
  },
};
