import axios from 'axios';
import { supabaseAuth } from '../auth';
import type {
  Proyecto,
  Organizacion,
  Postulacion,
  PostulacionTrackingItem,
  Postulante,
  PostulanteBancoItem,
  PostulanteMetricasResumen,
  EvaluacionEtapa,
  EvaluacionInicialItem,
  RegistrarEvaluacionInicialPayload,
  EvaluacionTecnicaItem,
  EvaluacionCompetenciasItem,
  RegistrarEvaluacionCompetenciasPayload,
  EvaluacionPersonalItem,
  RegistrarEvaluacionPersonalPayload,
  RegistrarEvaluacionTecnicaPayload,
  EvaluacionSaludItem,
  RegistrarEvaluacionSaludPayload,
  Donacion,
  Donante,
  Receptor,
  DonacionTrazabilidad,
  CreatePostulantePayload,
  PostulacionRegistroResponse,
  ValidarEdadPayload,
  ValidarEdadResponse,
  ProposeProjectPayload,
  CreateDonationPayload,
  DonationNeedRequestPayload,
  DonationNeedRequestResponse,
  DonationHistoryResponse,
  OfferDonationPayload,
  ConfirmDonationReceiptPayload,
  RegisterDeliveryPayload,
  UpdateDeliveryStatusPayload,
  DashboardMetrics,
  CacheStats,
  SystemLogsResponse,
  ExportModulo,
} from '../types';



export const apiClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(async (config) => {
  try {
    const { data } = (await supabaseAuth?.auth.getSession()) ?? { data: { session: null } };
    if (data.session?.access_token) {
      config.headers.Authorization = `Bearer ${data.session.access_token}`;
    } else {
      // Para desarrollo/pruebas locales de administración
      const savedToken = localStorage.getItem('kiriku_admin_token');
      if (savedToken) {
        config.headers.Authorization = `Bearer ${savedToken}`;
      }
    }
  } catch (err) {
    // Si no hay sesión o auth no está disponible, continuar sin header
  }
  return config;
});

export const api = {
  async getStatus(): Promise<{ databaseConfigured: boolean }> {
    const res = await apiClient.get<{ databaseConfigured: boolean }>('/status');
    return res.data;
  },

  // Autenticación Administrativa
  async login(payload: { email: string; password: string }): Promise<{ token: string; user: any; message: string }> {
    const res = await apiClient.post('/auth/login', payload);
    return res.data;
  },

  async getMe(): Promise<{ userId: string; rol: string; nombre: string; email: string; permissions: string[] }> {
    const res = await apiClient.get('/auth/me');
    return res.data;
  },

  // Roles y Permisos (KIR-11 & KIR-6)
  async getRoles(): Promise<any[]> {
    const res = await apiClient.get('/roles');
    return res.data;
  },

  async getRolePermissions(): Promise<any[]> {
    const res = await apiClient.get('/roles/permissions');
    return res.data;
  },

  async createRole(payload: { code: string; name: string; description: string; permission_codes: string[] }): Promise<any> {
    const res = await apiClient.post('/roles', payload);
    return res.data;
  },

  async updateRole(
    id: number,
    payload: { name: string; description: string; active: boolean; permission_codes: string[] }
  ): Promise<any> {
    const res = await apiClient.patch(`/roles/${id}`, payload);
    return res.data;
  },

  async getRoleUsers(q = ''): Promise<any[]> {
    const res = await apiClient.get('/roles/users', { params: { q } });
    return res.data;
  },

  async registerRoleUser(payload: { name: string; email: string; role_id: number }): Promise<any> {
    const res = await apiClient.post('/roles/users', payload);
    return res.data;
  },

  async assignRole(userId: string, roleId: number): Promise<any> {
    const res = await apiClient.put(`/roles/users/${userId}`, { role_id: roleId });
    return res.data;
  },

  // Proyectos
  async getProyectos(params?: {
    estado?: string;
    publicado?: boolean | string;
    ubicacion?: string;
    organizacion_id?: string;
    categoria?: string;
    cupos_min?: number | string;
    cupos_max?: number | string;
    ordenar?: string;
    q?: string;
  }): Promise<Proyecto[]> {
    const res = await apiClient.get<Proyecto[]>('/proyectos', { params });
    return res.data;
  },

  // KIR-22: Listado público de proyectos aprobados y publicados (KIR-79 & KIR-80)
  async getPublishedProjects(params?: {
    ubicacion?: string;
    organizacion_id?: string;
    categoria?: string;
    cupos_min?: number | string;
    cupos_max?: number | string;
    ordenar?: string;
    q?: string;
  }): Promise<Proyecto[]> {
    const res = await apiClient.get<Proyecto[]>('/proyectos/publicados', { params });
    return res.data;
  },

  async getProyectoById(id: number | string): Promise<Proyecto> {
    const res = await apiClient.get<Proyecto>(`/proyectos/${id}`);
    return res.data;
  },

  async proposeProject(payload: ProposeProjectPayload): Promise<{ message?: string; proyecto: Proyecto }> {
    const res = await apiClient.post('/proyectos', payload);
    return res.data;
  },

  // KIR-23 (KIR-75): Consultar seguimiento de proyectos inscritos por organización
  async trackProjectProposals(
    busqueda: string,
    params?: {
      estado?: string;
      cupos_min?: number | string;
      cupos_max?: number | string;
      ordenar?: string;
    }
  ): Promise<Array<{
    id: number | string;
    titulo: string;
    ubicacion: string;
    cupos_disponibles?: number;
    estado: 'pendiente_revision' | 'aprobado' | 'rechazado';
    publicado?: boolean;
    fecha_publicacion?: string | null;
    motivo_rechazo?: string | null;
    created_at?: string;
    updated_at?: string;
    organizacion_nombre: string;
    organizacion_tipo?: string | null;
  }>> {
    const res = await apiClient.get('/proyectos/tracking', { params: { busqueda, ...params } });
    return res.data;
  },

  async reviewProject(
    id: number | string,
    payload: { estado: 'aprobado' | 'rechazado' | 'pendiente_revision'; motivo_rechazo?: string }
  ): Promise<Proyecto> {
    const res = await apiClient.patch<Proyecto>(`/proyectos/${id}/revision`, payload);
    return res.data;
  },

  // KIR-22: Servicio de publicación/visibilidad de proyectos aprobados (KIR-79)
  async publishProject(
    id: number | string,
    payload: { publicado: boolean }
  ): Promise<{ message?: string; proyecto: Proyecto }> {
    const res = await apiClient.patch(`/proyectos/${id}/publicacion`, payload);
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

  // Postulaciones (KIR-16 & KIR-17)
  async validateAge(payload: ValidarEdadPayload): Promise<ValidarEdadResponse> {
    const res = await apiClient.post<ValidarEdadResponse>('/postulaciones/validar-edad', payload);
    return res.data;
  },

  async submitApplication(payload: CreatePostulantePayload): Promise<PostulacionRegistroResponse> {
    const res = await apiClient.post<PostulacionRegistroResponse>('/postulaciones', payload);
    return res.data;
  },

  async trackApplication(
    busqueda: string,
    params?: {
      estado?: string;
      avance_min?: number | string;
      avance_max?: number | string;
      ordenar?: string;
    }
  ): Promise<PostulacionTrackingItem[]> {
    const res = await apiClient.get<PostulacionTrackingItem[]>('/postulaciones/tracking', {
      params: { busqueda, ...params },
    });
    return res.data;
  },

  async getApplicationStatus(id: number | string): Promise<PostulacionTrackingItem> {
    const res = await apiClient.get<PostulacionTrackingItem>(`/postulaciones/${id}/estado`);
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

  // KIR-18: Gestión del Banco de Postulantes por Perfil
  async getApplicantsPool(params?: {
    q?: string;
    profesion?: string;
    categoria?: string;
    estado?: string;
    proyecto_id?: number | string;
    avance_min?: number | string;
    avance_max?: number | string;
    ordenar?: string;
  }): Promise<PostulanteBancoItem[]> {
    const res = await apiClient.get<PostulanteBancoItem[]>('/postulantes', { params });
    return res.data;
  },

  async getPostulantePerfil(id: number | string): Promise<any> {
    const res = await apiClient.get(`/postulantes/${id}`);
    return res.data;
  },

  async getPostulantesMetricas(): Promise<PostulanteMetricasResumen> {
    const res = await apiClient.get<PostulanteMetricasResumen>('/postulantes/metricas/resumen');
    return res.data;
  },

  // KIR-24: Gestión de Evaluación Inicial (KIR-71)
  async getInitialEvaluations(params?: {
    estado?: string;
    proyecto_id?: number | string;
    categoria?: string;
    puntaje_min?: number | string;
    puntaje_max?: number | string;
    ordenar?: string;
    q?: string;
  }): Promise<EvaluacionInicialItem[]> {
    const res = await apiClient.get<EvaluacionInicialItem[]>('/evaluaciones/inicial', { params });
    return res.data;
  },

  async getInitialEvaluationsMetrics(): Promise<{
    total: number;
    pendientes: number;
    aprobados: number;
    observados: number;
    rechazados: number;
  }> {
    const res = await apiClient.get('/evaluaciones/inicial/metricas');
    return res.data;
  },

  async submitInitialEvaluation(
    postulacionId: number | string,
    payload: RegistrarEvaluacionInicialPayload
  ): Promise<any> {
    const res = await apiClient.post(`/evaluaciones/inicial/${postulacionId}`, payload);
    return res.data;
  },

  // KIR-25: Gestión de Evaluación Técnica - Socio Territorial (KIR-67)
  async getTechnicalEvaluations(params?: {
    estado?: string;
    proyecto_id?: number | string;
    categoria?: string;
    puntaje_min?: number | string;
    puntaje_max?: number | string;
    ordenar?: string;
    q?: string;
  }): Promise<EvaluacionTecnicaItem[]> {
    const res = await apiClient.get<EvaluacionTecnicaItem[]>('/evaluaciones/tecnica', { params });
    return res.data;
  },

  async getTechnicalEvaluationsMetrics(): Promise<{
    total: number;
    disponibles: number;
    bloqueadas: number;
    pendientes: number;
    aprobados: number;
    observados: number;
    rechazados: number;
  }> {
    const res = await apiClient.get('/evaluaciones/tecnica/metricas');
    return res.data;
  },

  async submitTechnicalEvaluation(
    postulacionId: number | string,
    payload: RegistrarEvaluacionTecnicaPayload
  ): Promise<any> {
    const res = await apiClient.post(`/evaluaciones/tecnica/${postulacionId}`, payload);
    return res.data;
  },

  // KIR-59: Gestión de la evaluación por competencias.
  async getCompetencyEvaluations(params?: {
    estado?: string;
    proyecto_id?: number | string;
    categoria?: string;
    puntaje_min?: number | string;
    puntaje_max?: number | string;
    ordenar?: string;
    q?: string;
  }): Promise<EvaluacionCompetenciasItem[]> {
    const res = await apiClient.get<EvaluacionCompetenciasItem[]>('/evaluaciones/competencias', { params });
    return res.data;
  },

  async submitCompetencyEvaluation(
    postulacionId: number | string,
    payload: RegistrarEvaluacionCompetenciasPayload
  ): Promise<{ message: string; puntaje_promedio: number; estado_general: string }> {
    const res = await apiClient.post(`/evaluaciones/competencias/${postulacionId}`, payload);
    return res.data;
  },

  // KIR-63: Gestión de la entrevista personal.
  async getPersonalEvaluations(params?: {
    estado?: string;
    proyecto_id?: number | string;
    categoria?: string;
    puntaje_min?: number | string;
    puntaje_max?: number | string;
    ordenar?: string;
    q?: string;
  }): Promise<EvaluacionPersonalItem[]> {
    const res = await apiClient.get<EvaluacionPersonalItem[]>('/evaluaciones/personal', { params });
    return res.data;
  },

  async submitPersonalEvaluation(
    postulacionId: number | string,
    payload: RegistrarEvaluacionPersonalPayload
  ): Promise<{ message: string; puntaje_promedio: number; estado_general: string }> {
    const res = await apiClient.post(`/evaluaciones/personal/${postulacionId}`, payload);
    return res.data;
  },

  // KIR-28: Gestión de Evaluación de Salud Física y Psicológica (KIR-55 & KIR-56)
  async getHealthEvaluations(params?: {
    estado?: string;
    proyecto_id?: number | string;
    categoria?: string;
    puntaje_min?: number | string;
    puntaje_max?: number | string;
    ordenar?: string;
    q?: string;
  }): Promise<EvaluacionSaludItem[]> {
    const res = await apiClient.get<EvaluacionSaludItem[]>('/evaluaciones/salud', { params });
    return res.data;
  },

  async getHealthEvaluationsMetrics(): Promise<{
    total: number;
    disponibles: number;
    bloqueadas: number;
    pendientes: number;
    aprobados: number;
    observados: number;
    rechazados: number;
  }> {
    const res = await apiClient.get('/evaluaciones/salud/metricas');
    return res.data;
  },

  async submitHealthEvaluation(
    postulacionId: number | string,
    payload: RegistrarEvaluacionSaludPayload
  ): Promise<any> {
    const res = await apiClient.post(`/evaluaciones/salud/${postulacionId}`, payload);
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

  // Donaciones y Trazabilidad (KIR-32)
  async getDonaciones(params?: {
    q?: string;
    tipo?: string;
    categoria?: string;
    estado_entrega?: string;
    monto_min?: number | string;
    monto_max?: number | string;
    ordenar?: string;
  }): Promise<Donacion[]> {
    const res = await apiClient.get<Donacion[]>('/donaciones', { params });
    return res.data;
  },

  async createDonacion(payload: CreateDonationPayload): Promise<Donacion> {
    const res = await apiClient.post<Donacion>('/donaciones', payload);
    return res.data;
  },

  // KIR-31 (KIR-43): Registrar necesidad y receptor de donación
  async createDonationNeedRequest(
    payload: DonationNeedRequestPayload
  ): Promise<DonationNeedRequestResponse> {
    const res = await apiClient.post<DonationNeedRequestResponse>('/necesidades-donacion', payload);
    return res.data;
  },

  async getDonationNeeds(params?: {
    q?: string;
    tipo?: string;
    categoria?: string;
    monto_min?: number | string;
    monto_max?: number | string;
    ordenar?: string;
  }): Promise<DonationNeedRequestResponse[]> {
    const res = await apiClient.get<DonationNeedRequestResponse[]>('/necesidades-donacion', { params });
    return res.data;
  },

  // KIR-33 (KIR-35): Consultar historial de donaciones con filtros y paginación
  async getDonationHistory(params?: {
    q?: string;
    tipo?: 'economica' | 'especie';
    categoria?: string;
    proyecto_destino_id?: number | string;
    fecha_desde?: string;
    fecha_hasta?: string;
    monto_min?: number | string;
    monto_max?: number | string;
    ordenar?: string;
    pagina?: number;
    limite?: number;
  }): Promise<DonationHistoryResponse> {
    const res = await apiClient.get<DonationHistoryResponse>('/donaciones/historial', { params });
    return res.data;
  },

  // KIR-30 / KIR-47: Registrar donación ofrecida directamente por un donante
  async offerDonation(
    payload: OfferDonationPayload
  ): Promise<{ message: string; donacion: Donacion }> {
    const res = await apiClient.post<{ message: string; donacion: Donacion }>(
      '/donaciones/ofrecer',
      payload
    );
    return res.data;
  },

  async confirmDonationReceipt(
    donacionId: number | string,
    payload: ConfirmDonationReceiptPayload
  ): Promise<{ message: string; donacion: Donacion }> {
    const res = await apiClient.patch<{ message: string; donacion: Donacion }>(
      `/donaciones/${donacionId}/confirmar-recepcion`,
      payload
    );
    return res.data;
  },

  async getDonantes(): Promise<Donante[]> {
    const res = await apiClient.get<Donante[]>('/donaciones/donantes');
    return res.data;
  },

  async getReceptores(): Promise<Receptor[]> {
    const res = await apiClient.get<Receptor[]>('/donaciones/receptores');
    return res.data;
  },

  async getDonationTraceability(id: number | string): Promise<DonacionTrazabilidad> {
    const res = await apiClient.get<DonacionTrazabilidad>(`/donaciones/${id}/trazabilidad`);
    return res.data;
  },

  async registerDonationDelivery(
    donacionId: number | string,
    payload: RegisterDeliveryPayload
  ): Promise<{
    message: string;
    entrega: any;
    donacion_estado_entrega: string;
    saldo_disponible_bob: number;
  }> {
    const res = await apiClient.post(`/donaciones/${donacionId}/entregas`, payload);
    return res.data;
  },

  async updateDeliveryStatus(
    entregaId: number | string,
    payload: UpdateDeliveryStatusPayload
  ): Promise<{
    message: string;
    entrega: any;
    donacion_estado_entrega: string;
  }> {
    const res = await apiClient.patch(`/donaciones/entregas/${entregaId}`, payload);
    return res.data;
  },

  // Métricas
  async getMetrics(): Promise<DashboardMetrics> {
    const res = await apiClient.get<DashboardMetrics>('/metrics');
    return res.data;
  },

  async getDashboardMetrics(): Promise<DashboardMetrics> {
    return this.getMetrics();
  },

  // Auditoría, Caché y Exportaciones CSV (Sprint 1)
  async getCacheStats(): Promise<CacheStats> {
    const res = await apiClient.get<CacheStats>('/cache/stats');
    return res.data;
  },

  async getSystemLogs(params?: {
    module?: string;
    action?: string;
    status?: string;
    q?: string;
    fecha_desde?: string;
    fecha_hasta?: string;
    ordenar?: string;
    pagina?: number;
    limite?: number;
  }): Promise<SystemLogsResponse> {
    const res = await apiClient.get<SystemLogsResponse>('/logs', { params });
    return res.data;
  },

  async exportCsvReport(
    modulo: ExportModulo,
    params?: Record<string, unknown>
  ): Promise<{ filename: string; sizeBytes: number }> {
    try {
      const cleanParams: Record<string, unknown> = {};
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          if (v !== undefined && v !== null && String(v).trim() !== '') {
            cleanParams[k] = v;
          }
        }
      }
      const res = await apiClient.get<Blob>(`/exports/${modulo}`, {
        params: cleanParams,
        responseType: 'blob',
      });
      const blob = res.data;
      const disposition = String(res.headers['content-disposition'] || '');
      const match = /filename="?([^";]+)"?/i.exec(disposition);
      const filename = match?.[1] || `kiriku_${modulo}_${new Date().toISOString().slice(0, 10)}.csv`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      return { filename, sizeBytes: blob.size };
    } catch (err: any) {
      if (err?.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const parsed = JSON.parse(text);
          throw new Error(parsed?.error || 'No se pudo exportar el reporte CSV');
        } catch (parseErr: any) {
          if (parseErr instanceof Error && parseErr.message !== 'Unexpected token') {
            throw parseErr;
          }
        }
      }
      throw new Error(err?.response?.data?.error || err?.message || 'Error al exportar el reporte CSV');
    }
  },
};
