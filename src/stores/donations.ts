import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/client';
import type {
  Donacion,
  Donante,
  Receptor,
  DonacionTrazabilidad,
  CreateDonationPayload,
  OfferDonationPayload,
  ConfirmDonationReceiptPayload,
  RegisterDeliveryPayload,
  UpdateDeliveryStatusPayload,
  DashboardMetrics,
} from '../types';

export const useDonationsStore = defineStore('donations', () => {
  const donations = ref<Donacion[]>([]);
  const donantes = ref<Donante[]>([]);
  const receptores = ref<Receptor[]>([]);
  const activeTraceability = ref<DonacionTrazabilidad | null>(null);
  const metrics = ref<DashboardMetrics | null>(null);
  const loading = ref(false);
  const submitting = ref(false);
  const error = ref<string | null>(null);

  async function fetchDonations(params?: { q?: string; tipo?: string; estado_entrega?: string }) {
    loading.value = true;
    error.value = null;
    try {
      donations.value = await api.getDonaciones(params);
    } catch (err: any) {
      error.value = err?.response?.data?.error || 'Error al cargar donaciones';
    } finally {
      loading.value = false;
    }
  }

  async function fetchCatalogs() {
    try {
      const [donList, recList] = await Promise.all([api.getDonantes(), api.getReceptores()]);
      donantes.value = donList;
      receptores.value = recList;
    } catch (err: any) {
      console.error('Error loading donor/recipient catalogs:', err);
    }
  }

  async function recordDonation(payload: CreateDonationPayload) {
    submitting.value = true;
    error.value = null;
    try {
      const res = await api.createDonacion(payload);
      donations.value.unshift(res);
      await Promise.all([fetchMetrics(), fetchCatalogs()]);
      return res;
    } catch (err: any) {
      error.value = err?.response?.data?.error || 'Error al registrar donación';
      throw err;
    } finally {
      submitting.value = false;
    }
  }

  async function offerDonation(payload: OfferDonationPayload) {
    submitting.value = true;
    error.value = null;
    try {
      const res = await api.offerDonation(payload);
      if (res.donacion) {
        donations.value.unshift(res.donacion);
      }
      return res;
    } catch (err: any) {
      error.value = err?.response?.data?.error || 'Error al registrar la donación ofrecida';
      throw err;
    } finally {
      submitting.value = false;
    }
  }

  async function confirmDonationReceipt(
    donacionId: number | string,
    payload: ConfirmDonationReceiptPayload
  ) {
    submitting.value = true;
    error.value = null;
    try {
      const res = await api.confirmDonationReceipt(donacionId, payload);
      await Promise.all([fetchDonations(), fetchMetrics()]);
      return res;
    } catch (err: any) {
      error.value = err?.response?.data?.error || 'Error al confirmar recepción de donación';
      throw err;
    } finally {
      submitting.value = false;
    }
  }

  async function fetchTraceability(id: number | string) {
    loading.value = true;
    error.value = null;
    try {
      activeTraceability.value = await api.getDonationTraceability(id);
      return activeTraceability.value;
    } catch (err: any) {
      error.value = err?.response?.data?.error || 'Error al consultar trazabilidad';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function registerDelivery(donacionId: number | string, payload: RegisterDeliveryPayload) {
    submitting.value = true;
    error.value = null;
    try {
      const res = await api.registerDonationDelivery(donacionId, payload);
      await Promise.all([fetchDonations(), fetchMetrics(), fetchCatalogs()]);
      if (activeTraceability.value && String(activeTraceability.value.donacion.id) === String(donacionId)) {
        await fetchTraceability(donacionId);
      }
      return res;
    } catch (err: any) {
      error.value = err?.response?.data?.error || 'Error al registrar entrega';
      throw err;
    } finally {
      submitting.value = false;
    }
  }

  async function updateDeliveryStatus(
    entregaId: number | string,
    donacionId: number | string,
    payload: UpdateDeliveryStatusPayload
  ) {
    submitting.value = true;
    error.value = null;
    try {
      const res = await api.updateDeliveryStatus(entregaId, payload);
      await Promise.all([fetchDonations(), fetchMetrics()]);
      if (activeTraceability.value && String(activeTraceability.value.donacion.id) === String(donacionId)) {
        await fetchTraceability(donacionId);
      }
      return res;
    } catch (err: any) {
      error.value = err?.response?.data?.error || 'Error al actualizar estado de entrega';
      throw err;
    } finally {
      submitting.value = false;
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
    donantes,
    receptores,
    activeTraceability,
    metrics,
    loading,
    submitting,
    error,
    fetchDonations,
    fetchCatalogs,
    recordDonation,
    offerDonation,
    confirmDonationReceipt,
    fetchTraceability,
    registerDelivery,
    updateDeliveryStatus,
    fetchMetrics,
  };
});
