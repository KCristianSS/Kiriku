<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useApplicationsStore } from '../stores/applications';
import EvaluationStepper from '../components/EvaluationStepper.vue';
import {
  Search,
  Sparkles,
  Building2,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  FileText,
  ArrowRight,
  RefreshCw,
  MapPin,
  Compass,
  Info,
} from 'lucide-vue-next';
import type { ProcesoSeveridad } from '../types';

const route = useRoute();
const router = useRouter();
const applicationsStore = useApplicationsStore();

const searchInput = ref('');
const hasSearched = ref(false);
const autoRefreshEnabled = ref(false);
let pollingTimer: ReturnType<typeof setInterval> | null = null;

async function performSearch() {
  const query = searchInput.value.trim();
  if (!query) return;
  hasSearched.value = true;

  if (route.query.busqueda !== query) {
    router.replace({ query: { ...route.query, busqueda: query } });
  }

  try {
    await applicationsStore.trackApplication(query);
  } catch (err) {
    console.error('Error tracking application:', err);
  }
}

async function manualRefresh() {
  const query = searchInput.value.trim();
  if (!query) return;
  try {
    await applicationsStore.refreshTracking(query);
  } catch (err) {
    console.error('Error refreshing tracking:', err);
  }
}

function stopPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
}

function startPolling() {
  stopPolling();
  pollingTimer = setInterval(() => {
    if (searchInput.value.trim() && applicationsStore.trackingResults.length > 0 && !applicationsStore.refreshing) {
      applicationsStore.refreshTracking(searchInput.value.trim()).catch(() => {});
    }
  }, 30000);
}

watch(autoRefreshEnabled, (enabled) => {
  if (enabled) {
    startPolling();
  } else {
    stopPolling();
  }
});

function getStatusBadgeClasses(severidad?: ProcesoSeveridad) {
  switch (severidad) {
    case 'success':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'danger':
      return 'bg-rose-100 text-rose-800 border-rose-200';
    case 'warning':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    default:
      return 'bg-[#E8F6F8] text-[#1E7B85] border-[#289EAB]/30';
  }
}

function getCalloutClasses(severidad?: ProcesoSeveridad) {
  switch (severidad) {
    case 'success':
      return 'bg-emerald-50/70 border-emerald-200 text-emerald-900';
    case 'danger':
      return 'bg-rose-50/70 border-rose-200 text-rose-900';
    case 'warning':
      return 'bg-amber-50/80 border-amber-300 text-amber-950';
    default:
      return 'bg-[#E8F6F8]/60 border-[#289EAB]/25 text-stone-800';
  }
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Pendiente';
  const d = new Date(value);
  if (isNaN(d.getTime())) return 'Pendiente';
  return d.toLocaleString('es-BO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatLastChecked(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

onMounted(() => {
  if (route.query.busqueda && typeof route.query.busqueda === 'string') {
    searchInput.value = route.query.busqueda;
    performSearch();
  }
});

onUnmounted(() => {
  stopPolling();
});
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-12 space-y-8">
    <!-- Header Banner -->
    <div class="relative bg-white border border-stone-200 rounded-3xl p-6 sm:p-10 shadow-xs overflow-hidden">
      <div class="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#289EAB] via-[#F58F38] to-[#EB455F]"></div>

      <div class="max-w-2xl">
        <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E8F6F8] text-[#1E7B85] text-xs font-semibold mb-3">
          <Sparkles class="w-3.5 h-3.5 text-[#289EAB]" />
          <span>Seguimiento de Postulación · KIR-29</span>
        </div>

        <h1 class="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight mb-2">
          Consultar Estado y Avance del Proceso
        </h1>
        <p class="text-stone-600 text-xs sm:text-sm leading-relaxed mb-6">
          Ingresa tu número de Cédula de Identidad (CI), Correo Electrónico o Código de Seguimiento (ej. <span class="font-mono font-semibold text-stone-800">KIR-12</span>) para monitorear periódicamente el avance en las 5 etapas de evaluación.
        </p>

        <!-- Search input box -->
        <form @submit.prevent="performSearch" class="flex flex-col sm:flex-row gap-3">
          <div class="relative flex-1">
            <Search class="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              v-model="searchInput"
              type="text"
              required
              placeholder="Ej. 8492019 LP, correo@ejemplo.com o KIR-12"
              aria-label="Cédula de identidad, correo electrónico o código de seguimiento"
              class="w-full pl-10 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#289EAB] focus:bg-white transition-all font-mono"
            />
          </div>

          <button
            type="submit"
            :disabled="applicationsStore.loading || !searchInput.trim()"
            class="px-6 py-3 bg-[#289EAB] hover:bg-[#1E7B85] text-white text-sm font-semibold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:bg-stone-200 disabled:text-stone-400 disabled:cursor-not-allowed"
          >
            <span v-if="applicationsStore.loading">Consultando...</span>
            <span v-else>Consultar Estado</span>
            <ArrowRight v-if="!applicationsStore.loading" class="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>

    <!-- Error state -->
    <div
      v-if="applicationsStore.error"
      class="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-center gap-3"
    >
      <AlertCircle class="w-5 h-5 text-rose-600 shrink-0" />
      <span>{{ applicationsStore.error }}</span>
    </div>

    <!-- Loading state -->
    <div v-if="applicationsStore.loading" class="py-16 text-center">
      <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-stone-200 border-t-[#289EAB] mb-3"></div>
      <p class="text-sm text-stone-500 font-medium">Consultando estado y avance de tu postulación...</p>
    </div>

    <!-- No results state -->
    <div
      v-else-if="hasSearched && applicationsStore.trackingResults.length === 0"
      class="bg-white rounded-3xl border border-stone-200 p-8 sm:p-12 text-center"
    >
      <div class="w-16 h-16 bg-stone-100 text-stone-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <FileText class="w-8 h-8" />
      </div>
      <h3 class="text-base sm:text-lg font-bold text-stone-900 mb-1">No se encontraron postulaciones</h3>
      <p class="text-xs sm:text-sm text-stone-600 max-w-md mx-auto mb-6">
        No encontramos registros asociados a "{{ searchInput }}". Verifica que el CI, correo o código de seguimiento coincidan con los que registraste al postularte.
      </p>
      <router-link
        to="/postular"
        class="inline-flex items-center gap-2 px-5 py-2.5 bg-[#289EAB] text-white text-xs sm:text-sm font-semibold rounded-xl hover:bg-[#1E7B85] transition-colors"
      >
        <span>Ir al Formulario de Postulación</span>
        <ArrowRight class="w-4 h-4" />
      </router-link>
    </div>

    <!-- Results list + Periodic Refresh Toolbar -->
    <div v-else-if="applicationsStore.trackingResults.length > 0" class="space-y-6">
      <!-- Periodic Tracking Bar -->
      <div class="bg-white border border-stone-200 rounded-2xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-3 text-xs text-stone-600">
          <span class="font-semibold text-stone-900">
            {{ applicationsStore.trackingResults.length }}
            {{ applicationsStore.trackingResults.length === 1 ? 'postulación encontrada' : 'postulaciones encontradas' }}
          </span>
          <span class="text-stone-300">·</span>
          <span class="font-mono tabular-nums">
            Última consulta: {{ formatLastChecked(applicationsStore.lastCheckedAt) }}
          </span>
        </div>

        <div class="flex flex-wrap items-center gap-2.5">
          <label class="inline-flex items-center gap-2 text-xs text-stone-700 bg-stone-50 border border-stone-200 rounded-xl px-3 py-1.5 cursor-pointer select-none">
            <input
              v-model="autoRefreshEnabled"
              type="checkbox"
              class="rounded border-stone-300 text-[#289EAB] focus:ring-[#289EAB]"
            />
            <span>Actualización automática (30s)</span>
          </label>

          <button
            type="button"
            @click="manualRefresh"
            :disabled="applicationsStore.refreshing"
            class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-[#289EAB]/40 bg-[#E8F6F8] hover:bg-[#d7eff2] text-[#1E7B85] text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60"
          >
            <RefreshCw :class="['w-3.5 h-3.5', applicationsStore.refreshing ? 'animate-spin' : '']" />
            <span>{{ applicationsStore.refreshing ? 'Actualizando...' : 'Actualizar ahora' }}</span>
          </button>
        </div>
      </div>

      <div
        v-for="item in applicationsStore.trackingResults"
        :key="item.postulacion.id"
        class="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-xs"
      >
        <!-- Card Header with Applicant & Project Info -->
        <div class="p-6 sm:p-8 border-b border-stone-100 bg-stone-50/50 space-y-5">
          <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div class="space-y-1.5">
              <div class="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                <span class="inline-flex items-center gap-1 font-semibold text-[#1E7B85] bg-[#E8F6F8] px-2.5 py-0.5 rounded-md">
                  <Building2 class="w-3.5 h-3.5" />
                  {{ item.postulacion.proyecto?.organizacion_nombre || 'Kirikú' }}
                </span>
                <span class="font-mono font-semibold text-stone-700 bg-white border border-stone-200 px-2 py-0.5 rounded-md">
                  {{ item.postulacion.codigo_seguimiento || `KIR-${item.postulacion.id}` }}
                </span>
                <span class="font-mono">
                  Postulado el {{ new Date(item.postulacion.created_at).toLocaleDateString('es-BO') }}
                </span>
              </div>

              <h2 class="text-xl sm:text-2xl font-bold text-stone-900">
                {{ item.postulacion.proyecto?.titulo }}
              </h2>

              <p v-if="item.postulacion.proyecto?.ubicacion" class="inline-flex items-center gap-1.5 text-xs text-stone-500">
                <MapPin class="w-3.5 h-3.5 text-[#F58F38]" />
                <span>{{ item.postulacion.proyecto.ubicacion }}</span>
              </p>
            </div>

            <!-- Visible Process Status Badge (KIR-50) -->
            <div class="self-start sm:self-center shrink-0">
              <span
                :class="[
                  'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border',
                  getStatusBadgeClasses(item.avance?.estado_visible?.severidad)
                ]"
              >
                <CheckCircle2 v-if="item.avance?.estado_visible?.severidad === 'success'" class="w-3.5 h-3.5" />
                <XCircle v-else-if="item.avance?.estado_visible?.severidad === 'danger'" class="w-3.5 h-3.5" />
                <AlertCircle v-else-if="item.avance?.estado_visible?.severidad === 'warning'" class="w-3.5 h-3.5" />
                <Clock v-else class="w-3.5 h-3.5" />
                <span>{{ item.avance?.estado_visible?.etiqueta || item.postulacion.estado_general }}</span>
              </span>
            </div>
          </div>

          <!-- Progress Bar & Stage Counters (KIR-50 & KIR-52) -->
          <div v-if="item.avance" class="bg-white rounded-2xl p-4 sm:p-5 border border-stone-200 space-y-4">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span class="text-xs font-semibold uppercase tracking-wider text-stone-400 block">
                  Avance General del Proceso
                </span>
                <p class="text-sm font-bold text-stone-900">
                  {{ item.avance.etapas_aprobadas }} de {{ item.avance.etapas_totales }} etapas aprobadas
                </p>
              </div>
              <div class="text-right">
                <span class="text-2xl font-extrabold text-[#1E7B85] font-mono tabular-nums">
                  {{ item.avance.porcentaje }}%
                </span>
              </div>
            </div>

            <!-- Progress Track -->
            <div class="w-full h-3 bg-stone-100 rounded-full overflow-hidden border border-stone-200/70">
              <div
                :class="[
                  'h-full rounded-full transition-all duration-500',
                  item.avance.estado_visible.severidad === 'danger'
                    ? 'bg-rose-500'
                    : item.avance.estado_visible.severidad === 'success'
                    ? 'bg-emerald-500'
                    : item.avance.estado_visible.severidad === 'warning'
                    ? 'bg-amber-500'
                    : 'bg-[#289EAB]'
                ]"
                :style="{ width: `${Math.max(item.avance.porcentaje, item.avance.etapas_en_revision > 0 ? 8 : 0)}%` }"
              ></div>
            </div>

            <!-- Stage counts -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div class="px-3 py-2 rounded-xl bg-emerald-50/70 border border-emerald-200/70 flex items-center justify-between">
                <span class="text-emerald-800 font-medium">Aprobadas</span>
                <strong class="font-mono tabular-nums text-emerald-900">{{ item.avance.etapas_aprobadas }}</strong>
              </div>
              <div class="px-3 py-2 rounded-xl bg-blue-50/70 border border-blue-200/70 flex items-center justify-between">
                <span class="text-blue-800 font-medium">En Revisión</span>
                <strong class="font-mono tabular-nums text-blue-900">{{ item.avance.etapas_en_revision }}</strong>
              </div>
              <div class="px-3 py-2 rounded-xl bg-amber-50/70 border border-amber-200/70 flex items-center justify-between">
                <span class="text-amber-800 font-medium">Observadas</span>
                <strong class="font-mono tabular-nums text-amber-900">{{ item.avance.etapas_observadas }}</strong>
              </div>
              <div class="px-3 py-2 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between">
                <span class="text-stone-600 font-medium">Pendientes</span>
                <strong class="font-mono tabular-nums text-stone-800">{{ item.avance.etapas_pendientes }}</strong>
              </div>
            </div>

            <!-- Next Step / Active Stage Callout -->
            <div
              :class="[
                'rounded-xl border p-3.5 text-xs space-y-1',
                getCalloutClasses(item.avance.estado_visible.severidad)
              ]"
            >
              <div class="flex flex-wrap items-center justify-between gap-2 font-bold">
                <span class="inline-flex items-center gap-1.5">
                  <Compass class="w-4 h-4 shrink-0" />
                  <span>
                    {{ item.avance.etapa_actual ? `Etapa actual: ${item.avance.etapa_actual.nombre}` : 'Estado del proceso' }}
                  </span>
                </span>
                <span class="font-mono font-normal opacity-80">
                  Actualizado: {{ formatDateTime(item.avance.ultima_actualizacion) }}
                </span>
              </div>
              <p class="leading-relaxed opacity-90">
                {{ item.avance.siguiente_paso }}
              </p>
            </div>
          </div>

          <!-- Applicant metadata details -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-white rounded-2xl p-4 border border-stone-200">
            <div>
              <span class="text-stone-400 block mb-0.5">Postulante:</span>
              <strong class="text-stone-800">{{ item.postulante.nombres }} {{ item.postulante.apellidos }}</strong>
            </div>
            <div>
              <span class="text-stone-400 block mb-0.5">Cédula (CI):</span>
              <strong class="font-mono text-stone-800">{{ item.postulante.ci }}</strong>
            </div>
            <div>
              <span class="text-stone-400 block mb-0.5">Correo:</span>
              <span class="font-mono text-stone-700 truncate block">{{ item.postulante.email }}</span>
            </div>
            <div>
              <span class="text-stone-400 block mb-0.5">Profesión / Ocupación:</span>
              <span class="text-stone-700">{{ item.postulante.profesion_ocupacion || 'No especificada' }}</span>
            </div>
          </div>
        </div>

        <!-- Stepper Component (5 stages from DB) -->
        <div class="p-6 sm:p-8">
          <h3 class="text-sm font-bold text-stone-900 mb-6 flex items-center gap-2">
            <Clock class="w-4 h-4 text-[#289EAB]" />
            <span>Detalle de las 5 Etapas de Evaluación</span>
          </h3>

          <EvaluationStepper
            :etapas="item.postulacion.etapas || []"
            :interactive="false"
            :auto-expand-active="true"
          />
        </div>
      </div>

      <!-- Legend of Visible States (KIR-50) -->
      <div class="bg-white border border-stone-200 rounded-2xl p-5 space-y-3">
        <div class="flex items-center gap-2 text-xs font-bold text-stone-800 uppercase tracking-wider">
          <Info class="w-4 h-4 text-[#289EAB]" />
          <span>Guía de Estados Visibles del Proceso</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-5 gap-2.5 text-xs">
          <div class="p-2.5 rounded-xl bg-stone-50 border border-stone-200">
            <span class="font-bold text-stone-700 block">Pendiente</span>
            <span class="text-stone-500">Se habilitará al aprobar la etapa previa.</span>
          </div>
          <div class="p-2.5 rounded-xl bg-blue-50 border border-blue-200">
            <span class="font-bold text-blue-800 block">En Revisión</span>
            <span class="text-blue-700">El equipo evaluador está revisando esta etapa.</span>
          </div>
          <div class="p-2.5 rounded-xl bg-amber-50 border border-amber-200">
            <span class="font-bold text-amber-800 block">Observada</span>
            <span class="text-amber-700">Requiere subsanación o comentario adicional.</span>
          </div>
          <div class="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
            <span class="font-bold text-emerald-800 block">Aprobada</span>
            <span class="text-emerald-700">Etapa superada con éxito hacia el 100%.</span>
          </div>
          <div class="p-2.5 rounded-xl bg-rose-50 border border-rose-200">
            <span class="font-bold text-rose-800 block">No Aprobada</span>
            <span class="text-rose-700">Etapa concluida sin aprobación del comité.</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
