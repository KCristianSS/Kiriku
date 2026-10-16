import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/client';
import type { Usuario, CreateUsuarioPayload, UpdateUsuarioPayload } from '../types';

export const useUsersStore = defineStore('users', () => {
  const users = ref<Usuario[]>([]);
  const currentUser = ref<Usuario | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchUsers(params?: { rol?: string; activo?: boolean; q?: string }) {
    loading.value = true;
    error.value = null;
    try {
      users.value = await api.getUsuarios(params);
    } catch (err: any) {
      error.value = err?.response?.data?.error || 'Error al cargar usuarios';
    } finally {
      loading.value = false;
    }
  }

  async function fetchUserById(id: string) {
    loading.value = true;
    error.value = null;
    try {
      currentUser.value = await api.getUsuarioById(id);
    } catch (err: any) {
      error.value = err?.response?.data?.error || 'Usuario no encontrado';
    } finally {
      loading.value = false;
    }
  }

  async function createUser(payload: CreateUsuarioPayload) {
    loading.value = true;
    error.value = null;
    try {
      const res = await api.createUsuario(payload);
      users.value.push(res);
      return res;
    } catch (err: any) {
      error.value = err?.response?.data?.error || 'Error al registrar usuario';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function updateUser(id: string, payload: UpdateUsuarioPayload) {
    loading.value = true;
    error.value = null;
    try {
      const updated = await api.updateUsuario(id, payload);
      const idx = users.value.findIndex((u) => u.id === id);
      if (idx !== -1) {
        users.value[idx] = { ...users.value[idx], ...updated };
      }
      if (currentUser.value?.id === id) {
        currentUser.value = { ...currentUser.value, ...updated };
      }
      return updated;
    } catch (err: any) {
      error.value = err?.response?.data?.error || 'Error al actualizar usuario';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function deleteUser(id: string) {
    loading.value = true;
    error.value = null;
    try {
      await api.deleteUsuario(id);
      users.value = users.value.filter((u) => u.id !== id);
      if (currentUser.value?.id === id) {
        currentUser.value = null;
      }
    } catch (err: any) {
      error.value = err?.response?.data?.error || 'Error al eliminar usuario';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  function clearError() {
    error.value = null;
  }

  return {
    users,
    currentUser,
    loading,
    error,
    fetchUsers,
    fetchUserById,
    createUser,
    updateUser,
    deleteUser,
    clearError,
  };
});
