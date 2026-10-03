import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/client';
import type { Donacion, CreateDonationPayload, DashboardMetrics } from '../types';

export const useDonationsStore = defineStore('donations', () => {
  const donations = ref<Donacion[]>([]);
  const metrics = ref<DashboardMetrics | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchDonations() {
    loading.value = true;
    error.value = null;
    try {
      donations.value = await api.getDonaciones();
    } catch (err: any) {
      error.value = err?.response?.data?.error || 'Error al cargar donaciones';
    } finally {
      loading.value = false;
    }
  }

  async function recordDonation(payload: CreateDonationPayload) {
    loading.value = true;
    error.value = null;
    try {
      const res = await api.createDonacion(payload);
      donations.value.unshift(res);
      await fetchMetrics();
      return res;
    } catch (err: any) {
      error.value = err?.response?.data?.error || 'Error al registrar donación';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function fetchMetrics() {
    try {
      metrics.value = await api.getMetrics();
    } catch (err: any) {
      console.error('Error fetching metrics:', err);
    }
  }

  return {
    donations,
    metrics,
    loading,
    error,
    fetchDonations,
    recordDonation,
    fetchMetrics,
  };
});
