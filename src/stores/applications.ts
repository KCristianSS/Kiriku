import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/client';
import type {
  Postulacion,
  PostulacionTrackingItem,
  Postulante,
  CreatePostulantePayload,
} from '../types';

export const useApplicationsStore = defineStore('applications', () => {
  const applications = ref<Postulacion[]>([]);
  const trackingResults = ref<PostulacionTrackingItem[]>([]);
  const applicantsPool = ref<Array<Postulante & { total_postulaciones: number; ultima_postulacion?: string }>>([]);
  const loading = ref(false);
  const refreshing = ref(false);
  const lastCheckedAt = ref<string | null>(null);
  const error = ref<string | null>(null);

  async function submitApplication(payload: CreatePostulantePayload) {
    loading.value = true;
    error.value = null;
    try {
      const res = await api.submitApplication(payload);
      return res;
    } catch (err: any) {
      error.value = err?.response?.data?.error || 'Error al enviar postulación';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function trackApplication(
    busqueda: string,
    params?: {
      estado?: string;
      avance_min?: number | string;
      avance_max?: number | string;
      ordenar?: string;
    }
  ) {
    loading.value = true;
    error.value = null;
    try {
      const results = await api.trackApplication(busqueda, params);
      trackingResults.value = results;
      lastCheckedAt.value = new Date().toISOString();
      return results;
    } catch (err: any) {
      error.value = err?.response?.data?.error || 'Error al rastrear postulación';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function refreshTracking(busqueda: string) {
    if (!busqueda.trim()) return [];
    refreshing.value = true;
    error.value = null;
    try {
      const results = await api.trackApplication(busqueda);
      trackingResults.value = results;
      lastCheckedAt.value = new Date().toISOString();
      return results;
    } catch (err: any) {
      error.value = err?.response?.data?.error || 'Error al actualizar el seguimiento';
      throw err;
    } finally {
      refreshing.value = false;
    }
  }

  async function refreshSingleApplicationStatus(postulacionId: number | string) {
    refreshing.value = true;
    error.value = null;
    try {
      const updated = await api.getApplicationStatus(postulacionId);
      const idx = trackingResults.value.findIndex(
        (item) => String(item.postulacion.id) === String(postulacionId)
      );
      if (idx !== -1) {
        trackingResults.value[idx] = updated;
      }
      lastCheckedAt.value = new Date().toISOString();
      return updated;
    } catch (err: any) {
      error.value = err?.response?.data?.error || 'Error al actualizar estado de postulación';
      throw err;
    } finally {
      refreshing.value = false;
    }
  }

  async function fetchAdminApplications(params?: {
    estado?: string;
    proyecto_id?: number | string;
    reasignacion?: boolean;
    reenganche?: boolean;
    q?: string;
  }) {
    loading.value = true;
    error.value = null;
    try {
      applications.value = await api.getAdminApplications(params);
    } catch (err: any) {
      error.value = err?.response?.data?.error || 'Error al cargar postulaciones';
    } finally {
      loading.value = false;
    }
  }

  async function fetchApplicantsPool(params?: {
    q?: string;
    profesion?: string;
    categoria?: string;
    estado?: string;
    proyecto_id?: number | string;
    avance_min?: number | string;
    avance_max?: number | string;
    ordenar?: string;
  }) {
    loading.value = true;
    error.value = null;
    try {
      applicantsPool.value = await api.getApplicantsPool(params);
    } catch (err: any) {
      error.value = err?.response?.data?.error || 'Error al cargar banco de postulantes';
    } finally {
      loading.value = false;
    }
  }

  async function updateEvaluationStage(
    etapaId: number | string,
    payload: {
      estado: 'pendiente' | 'en_curso' | 'aprobada' | 'rechazada';
      comentarios?: string;
      evaluador?: string;
    }
  ) {
    try {
      const updatedEtapa = await api.updateEvaluationStage(etapaId, payload);
      // Update locally in applications
      for (const app of applications.value) {
        if (app.etapas) {
          const idx = app.etapas.findIndex((e) => String(e.id) === String(etapaId));
          if (idx !== -1) {
            app.etapas[idx] = { ...app.etapas[idx], ...updatedEtapa };
          }
        }
      }
      return updatedEtapa;
    } catch (err: any) {
      throw err;
    }
  }

  async function manageReasignacion(
    postulacionId: number | string,
    payload: { nuevo_proyecto_id?: number | string; es_reasignacion?: boolean; es_reenganche?: boolean }
  ) {
    try {
      const updated = await api.manageReasignacion(postulacionId, payload);
      const idx = applications.value.findIndex((a) => String(a.id) === String(postulacionId));
      if (idx !== -1) {
        applications.value[idx] = { ...applications.value[idx], ...updated };
      }
      return updated;
    } catch (err: any) {
      throw err;
    }
  }

  async function manageReenganche(
    postulacionId: number | string,
    payload: { nuevo_proyecto_id?: number | string; es_reenganche?: boolean }
  ) {
    return manageReasignacion(postulacionId, payload);
  }

  return {
    applications,
    trackingResults,
    applicantsPool,
    loading,
    refreshing,
    lastCheckedAt,
    error,
    submitApplication,
    trackApplication,
    refreshTracking,
    refreshSingleApplicationStatus,
    fetchAdminApplications,
    fetchApplicantsPool,
    updateEvaluationStage,
    manageReasignacion,
    manageReenganche,
  };
});
