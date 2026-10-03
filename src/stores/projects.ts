import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/client';
import type { Proyecto, Organizacion, ProposeProjectPayload } from '../types';

export const useProjectsStore = defineStore('projects', () => {
  const projects = ref<Proyecto[]>([]);
  const organizations = ref<Organizacion[]>([]);
  const currentProject = ref<Proyecto | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Filters
  const selectedLocation = ref('');
  const selectedOrgId = ref('');
  const searchQuery = ref('');

  async function fetchProjects(estado: string = 'aprobado') {
    loading.value = true;
    error.value = null;
    try {
      projects.value = await api.getProyectos({
        estado,
        ubicacion: selectedLocation.value || undefined,
        organizacion_id: selectedOrgId.value || undefined,
        q: searchQuery.value || undefined,
      });
    } catch (err: any) {
      error.value = err?.response?.data?.error || 'Error al cargar proyectos';
    } finally {
      loading.value = false;
    }
  }

  async function fetchAllProjectsForAdmin() {
    loading.value = true;
    error.value = null;
    try {
      projects.value = await api.getProyectos();
    } catch (err: any) {
      error.value = err?.response?.data?.error || 'Error al cargar proyectos para revisión';
    } finally {
      loading.value = false;
    }
  }

  async function fetchOrganizations() {
    try {
      organizations.value = await api.getOrganizaciones();
    } catch (err: any) {
      console.error('Error fetching organizations:', err);
    }
  }

  async function fetchProjectById(id: string) {
    loading.value = true;
    try {
      currentProject.value = await api.getProyectoById(id);
    } catch (err: any) {
      error.value = err?.response?.data?.error || 'Proyecto no encontrado';
    } finally {
      loading.value = false;
    }
  }

  async function proposeProject(payload: ProposeProjectPayload) {
    loading.value = true;
    error.value = null;
    try {
      const res = await api.proposeProject(payload);
      return res;
    } catch (err: any) {
      error.value = err?.response?.data?.error || 'Error al enviar propuesta';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function reviewProject(
    id: string,
    estado: 'aprobado' | 'rechazado' | 'pendiente_revision',
    motivo_rechazo?: string
  ) {
    try {
      const updated = await api.reviewProject(id, { estado, motivo_rechazo });
      const idx = projects.value.findIndex((p) => p.id === id);
      if (idx !== -1) {
        projects.value[idx] = { ...projects.value[idx], ...updated };
      }
      return updated;
    } catch (err: any) {
      throw err;
    }
  }

  return {
    projects,
    organizations,
    currentProject,
    loading,
    error,
    selectedLocation,
    selectedOrgId,
    searchQuery,
    fetchProjects,
    fetchAllProjectsForAdmin,
    fetchOrganizations,
    fetchProjectById,
    proposeProject,
    reviewProject,
  };
});
