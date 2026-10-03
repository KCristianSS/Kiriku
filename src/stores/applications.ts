import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/client';
import type {
  Postulacion,
  Postulante,
  CreatePostulantePayload,
  EvaluacionEtapa,
} from '../types';

export const useApplicationsStore = defineStore('applications', () => {
  const applications = ref<Postulacion[]>([]);
  const trackingResults = ref<any[]>([]);
  const applicantsPool = ref<Array<Postulante & { total_postulaciones: number; ultima_postulacion?: string }>>([]);
  const loading = ref(false);
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

  async function trackApplication(busqueda: string) {
    loading.value = true;
    error.value = null;
    try {
      const results = await api.trackApplication(busqueda);
      trackingResults.value = results;
      return results;
    } catch (err: any) {
      error.value = err?.response?.data?.error || 'Error al rastrear postulación';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function fetchAdminApplications(params?: {
    estado?: string;
    proyecto_id?: string;
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

  async function fetchApplicantsPool(params?: { q?: string; profesion?: string }) {
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
    etapaId: string,
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
          const idx = app.etapas.findIndex((e) => e.id === etapaId);
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

  async function manageReenganche(
    postulacionId: string,
    payload: { nuevo_proyecto_id?: string; es_reenganche?: boolean }
  ) {
    try {
      const updated = await api.manageReenganche(postulacionId, payload);
      const idx = applications.value.findIndex((a) => a.id === postulacionId);
      if (idx !== -1) {
        applications.value[idx] = { ...applications.value[idx], ...updated };
      }
      return updated;
    } catch (err: any) {
      throw err;
    }
  }

  return {
    applications,
    trackingResults,
    applicantsPool,
    loading,
    error,
    submitApplication,
    trackApplication,
    fetchAdminApplications,
    fetchApplicantsPool,
    updateEvaluationStage,
    manageReenganche,
  };
});
