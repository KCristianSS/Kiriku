import axios from 'axios';
import { supabaseAuth } from '../auth';
import type {
  Proyecto,
  Organizacion,
  Postulacion,
  Postulante,
  EvaluacionEtapa,
  Donacion,
  CreatePostulantePayload,
  PostulacionRegistroResponse,
  ValidarEdadPayload,
  ValidarEdadResponse,
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

apiClient.interceptors.request.use(async (config) => {
  const { data } = await supabaseAuth?.auth.getSession() ?? { data: { session: null } };
  if (data.session?.access_token) config.headers.Authorization = `Bearer ${data.session.access_token}`;
  return config;
});

export const api = {
  async getRoles() {
    return (await apiClient.get('/roles')).data;
  },
  async getRolePermissions() {
    return (await apiClient.get('/roles/permissions')).data;
  },
  async createRole(payload: { code: string; name: string; description: string; permission_codes: string[] }) {
    return (await apiClient.post('/roles', payload)).data;
  },
  async updateRole(id: number, payload: { name: string; description: string; active: boolean; permission_codes: string[] }) {
    return (await apiClient.patch(`/roles/${id}`, payload)).data;
  },
  async getRoleUsers(q = '') {
    return (await apiClient.get('/roles/users', { params: { q } })).data;
  },
  async registerRoleUser(payload: { name: string; email: string; role_id: number }) {
    return (await apiClient.post('/roles/users', payload)).data;
  },
  async assignRole(userId: string, roleId: number) {
    return (await apiClient.put(`/roles/users/${userId}`, { role_id: roleId })).data;
  },
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

  async getProyectoById(id: number | string): Promise<Proyecto> {
    const res = await apiClient.get<Proyecto>(`/proyectos/${id}`);
    return res.data;
  },

  async proposeProject(payload: ProposeProjectPayload): Promise<Proyecto> {
    const res = await apiClient.post<Proyecto>('/proyectos', payload);
    return res.data;
  },

  async reviewProject(
    id: number | string,
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
  async validateAge(payload: ValidarEdadPayload): Promise<ValidarEdadResponse> {
    const res = await apiClient.post<ValidarEdadResponse>('/postulaciones/validar-edad', payload);
    return res.data;
  },

  async submitApplication(payload: CreatePostulantePayload): Promise<PostulacionRegistroResponse> {
    const res = await apiClient.post<PostulacionRegistroResponse>('/postulaciones', payload);
    return res.data;
  },

  async trackApplication(busqueda: string): Promise<
    Array<{
      postulante: Postulante;
      postulacion: {
        id: number | string;
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
    proyecto_id?: number | string;
    reasignacion?: boolean;
    reenganche?: boolean;
    q?: string;
  }): Promise<Postulacion[]> {
    const isReassigned = params?.reasignacion || params?.reenganche;
    const res = await apiClient.get<Postulacion[]>('/postulaciones', {
      params: {
        ...params,
        reasignacion: isReassigned ? 'true' : undefined,
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
    id: number | string,
    payload: {
      estado: 'pendiente' | 'en_curso' | 'aprobada' | 'rechazada';
      comentarios?: string;
      evaluador?: string;
    }
  ): Promise<EvaluacionEtapa> {
    const res = await apiClient.patch<EvaluacionEtapa>(`/evaluaciones/${id}`, payload);
    return res.data;
  },

  async manageReasignacion(
    id: number | string,
    payload: {
      nuevo_proyecto_id?: number | string;
      es_reasignacion?: boolean;
      es_reenganche?: boolean;
    }
  ): Promise<Postulacion> {
    const res = await apiClient.patch<Postulacion>(`/postulaciones/${id}/reasignacion`, payload);
    return res.data;
  },

  async manageReenganche(
    id: number | string,
    payload: {
      nuevo_proyecto_id?: number | string;
      es_reenganche?: boolean;
    }
  ): Promise<Postulacion> {
    return this.manageReasignacion(id, payload);
  },

  async updateApplicationStatus(
    id: number | string,
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
