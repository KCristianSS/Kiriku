<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '../../api/client';
import type { Proyecto } from '../../types';
import {
  CheckSquare,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  Filter,
  Building2,
  MapPin,
  Calendar,
  Users,
  ShieldCheck,
  ArrowLeft,
  RefreshCw,
  Eye,
  MessageSquare,
  ExternalLink,
  RotateCcw,
} from 'lucide-vue-next';

const projects = ref<Proyecto[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const successNotice = ref<string | null>(null);

// Filters
const selectedFilter = ref<'pendiente_revision' | 'aprobado' | 'rechazado' | 'todos'>('pendiente_revision');
const searchQuery = ref('');

// Modal States
const projectToReject = ref<Proyecto | null>(null);
const rejectionReason = ref('');
const rejectError = ref<string | null>(null);
const isSubmittingDecision = ref(false);

const projectToApprove = ref<Proyecto | null>(null);
const projectDetailModal = ref<Proyecto | null>(null);

// Quick rejection reasons
const quickReasons = [
  'Falta detallar el plan de logística y seguridad para los voluntarios.',
  'Las fechas de inicio y finalización no son consistentes con la propuesta.',
  'Se requiere acreditar personería jurídica o convenio institucional vigente.',
  'La descripción de actividades comunitarias es insuficiente o poco clara.',
  'El número de cupos solicitados no cuenta con respaldo de supervisores.',
];

async function loadProjects() {
  loading.value = true;
  error.value = null;
  try {
    const data = await api.getProyectos();
    projects.value = data;
  } catch (err: any) {
    error.value = err?.response?.data?.error || 'No se pudieron cargar los proyectos para revisión.';
  } finally {
    loading.value = false;
  }
}

// Metrics
const countPending = computed(() => projects.value.filter((p) => p.estado === 'pendiente_revision').length);
const countApproved = computed(() => projects.value.filter((p) => p.estado === 'aprobado').length);
const countRejected = computed(() => projects.value.filter((p) => p.estado === 'rechazado').length);
const countTotal = computed(() => projects.value.length);

// Filtered projects
const filteredProjects = computed(() => {
  return projects.value.filter((p) => {
    // Status filter
    if (selectedFilter.value !== 'todos' && p.estado !== selectedFilter.value) {
      return false;
    }
    // Search query
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase();
      const matchTitle = p.titulo?.toLowerCase().includes(q);
      const matchDesc = p.descripcion?.toLowerCase().includes(q);
      const matchLoc = p.ubicacion?.toLowerCase().includes(q);
      const matchOrg = p.organizacion_nombre?.toLowerCase().includes(q);
      return matchTitle || matchDesc || matchLoc || matchOrg;
    }
    return true;
  });
});

// Decision Handlers
function openApproveModal(project: Proyecto) {
  projectToApprove.value = project;
}

async function confirmApprove() {
  if (!projectToApprove.value) return;
  isSubmittingDecision.value = true;
  error.value = null;
  successNotice.value = null;
  try {
    await api.reviewProject(projectToApprove.value.id, {
      estado: 'aprobado',
    });
    successNotice.value = `¡Proyecto "${projectToApprove.value.titulo}" aprobado con éxito! Ya está disponible en el catálogo público.`;
    projectToApprove.value = null;
    await loadProjects();
  } catch (err: any) {
    error.value = err?.response?.data?.error || 'Error al aprobar el proyecto.';
  } finally {
    isSubmittingDecision.value = false;
  }
}

function openRejectModal(project: Proyecto) {
  projectToReject.value = project;
  rejectionReason.value = project.motivo_rechazo || '';
  rejectError.value = null;
}

function applyQuickReason(reason: string) {
  rejectionReason.value = reason;
}

async function confirmReject() {
  if (!projectToReject.value) return;
  if (!rejectionReason.value.trim() || rejectionReason.value.trim().length < 10) {
    rejectError.value = 'El motivo de rechazo es obligatorio y debe tener al menos 10 caracteres.';
    return;
  }

  isSubmittingDecision.value = true;
  rejectError.value = null;
  error.value = null;
  successNotice.value = null;
  try {
    await api.reviewProject(projectToReject.value.id, {
      estado: 'rechazado',
      motivo_rechazo: rejectionReason.value.trim(),
    });
    successNotice.value = `Proyecto "${projectToReject.value.titulo}" marcado como rechazado. El motivo fue registrado en el expediente.`;
    projectToReject.value = null;
    rejectionReason.value = '';
    await loadProjects();
  } catch (err: any) {
    rejectError.value = err?.response?.data?.error || 'Error al registrar el rechazo del proyecto.';
  } finally {
    isSubmittingDecision.value = false;
  }
}

async function reopenProject(project: Proyecto) {
  isSubmittingDecision.value = true;
  error.value = null;
  successNotice.value = null;
  try {
    await api.reviewProject(project.id, {
      estado: 'pendiente_revision',
    });
    successNotice.value = `Proyecto "${project.titulo}" restablecido a estado pendiente de revisión.`;
    await loadProjects();
  } catch (err: any) {
    error.value = err?.response?.data?.error || 'Error al restablecer estado del proyecto.';
  } finally {
    isSubmittingDecision.value = false;
  }
}

function openDetailModal(project: Proyecto) {
  projectDetailModal.value = project;
}

function formatDate(dateStr?: string) {
  if (!dateStr) return 'No definida';
  try {
    return new Date(dateStr).toLocaleDateString('es-BO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

onMounted(() => {
  loadProjects();
});
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8">
    <!-- Top Bar Navigation -->
    <div class="flex items-center justify-between">
      <router-link
        to="/admin"
        class="inline-flex items-center gap-2 text-xs font-semibold text-stone-600 hover:text-stone-900 transition-colors"
      >
        <ArrowLeft class="w-4 h-4" />
        <span>Volver al Panel de Administración</span>
      </router-link>

      <button
        @click="loadProjects"
        :disabled="loading"
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-stone-200 text-xs font-semibold text-stone-700 hover:bg-stone-50 transition-colors cursor-pointer shadow-2xs"
      >
        <RefreshCw :class="['w-3.5 h-3.5', loading ? 'animate-spin' : '']" />
        <span>Actualizar lista</span>
      </button>
    </div>

    <!-- Header Banner (KIR-21) -->
    <div class="relative bg-white border border-stone-200 rounded-3xl p-6 sm:p-8 shadow-xs overflow-hidden">
      <div class="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#289EAB] via-[#F58F38] to-[#EB455F]"></div>

      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E8F6F8] text-[#1E7B85] text-xs font-semibold mb-2">
            <ShieldCheck class="w-3.5 h-3.5 text-[#289EAB]" />
            <span>Módulo de Auditoría (Historia KIR-21)</span>
          </div>
          <h1 class="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight">
            Revisar Proyecto Antes de Publicarlo
          </h1>
          <p class="text-xs sm:text-sm text-stone-600 mt-1 max-w-2xl">
            Evalúa cada iniciativa propuesta por organizaciones sociales y comunitarias. Aprueba proyectos con estándares de impacto o registra el motivo formal de rechazo.
          </p>
        </div>

        <!-- Metric Pills -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
          <div
            @click="selectedFilter = 'pendiente_revision'"
            :class="[
              'p-3 rounded-2xl border text-center cursor-pointer transition-all',
              selectedFilter === 'pendiente_revision'
                ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-400/30'
                : 'bg-stone-50 border-stone-200 hover:bg-stone-100'
            ]"
          >
            <span class="text-[11px] font-bold text-amber-800 uppercase tracking-wider block">Pendientes</span>
            <span class="text-xl font-extrabold text-amber-700 font-mono">{{ countPending }}</span>
          </div>

          <div
            @click="selectedFilter = 'aprobado'"
            :class="[
              'p-3 rounded-2xl border text-center cursor-pointer transition-all',
              selectedFilter === 'aprobado'
                ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-400/30'
                : 'bg-stone-50 border-stone-200 hover:bg-stone-100'
            ]"
          >
            <span class="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block">Aprobados</span>
            <span class="text-xl font-extrabold text-emerald-700 font-mono">{{ countApproved }}</span>
          </div>

          <div
            @click="selectedFilter = 'rechazado'"
            :class="[
              'p-3 rounded-2xl border text-center cursor-pointer transition-all',
              selectedFilter === 'rechazado'
                ? 'bg-red-50 border-red-300 ring-2 ring-red-400/30'
                : 'bg-stone-50 border-stone-200 hover:bg-stone-100'
            ]"
          >
            <span class="text-[11px] font-bold text-red-800 uppercase tracking-wider block">Rechazados</span>
            <span class="text-xl font-extrabold text-red-700 font-mono">{{ countRejected }}</span>
          </div>

          <div
            @click="selectedFilter = 'todos'"
            :class="[
              'p-3 rounded-2xl border text-center cursor-pointer transition-all',
              selectedFilter === 'todos'
                ? 'bg-stone-200 border-stone-400 ring-2 ring-stone-400/30'
                : 'bg-stone-50 border-stone-200 hover:bg-stone-100'
            ]"
          >
            <span class="text-[11px] font-bold text-stone-600 uppercase tracking-wider block">Todos</span>
            <span class="text-xl font-extrabold text-stone-800 font-mono">{{ countTotal }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Alert Notices -->
    <div
      v-if="successNotice"
      role="status"
      class="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl text-xs sm:text-sm flex items-center justify-between shadow-2xs"
    >
      <div class="flex items-center gap-2.5">
        <CheckCircle2 class="w-5 h-5 text-emerald-600 shrink-0" />
        <span>{{ successNotice }}</span>
      </div>
      <button @click="successNotice = null" class="text-emerald-700 hover:text-emerald-900 font-bold ml-4 cursor-pointer">
        ✕
      </button>
    </div>

    <div
      v-if="error"
      role="alert"
      class="bg-red-50 border border-red-200 text-red-800 p-4 rounded-2xl text-xs sm:text-sm flex items-center justify-between shadow-2xs"
    >
      <div class="flex items-center gap-2.5">
        <AlertTriangle class="w-5 h-5 text-red-600 shrink-0" />
        <span>{{ error }}</span>
      </div>
      <button @click="error = null" class="text-red-700 hover:text-red-900 font-bold ml-4 cursor-pointer">
        ✕
      </button>
    </div>

    <!-- Search & Filters Toolbar -->
    <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-stone-200 shadow-xs">
      <!-- Search Input -->
      <div class="relative flex-1">
        <Search class="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          v-model="searchQuery"
          type="search"
          placeholder="Buscar por título, ubicación u organización..."
          class="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-xl border border-stone-200 focus:border-[#289EAB] focus:outline-none"
        />
      </div>

      <!-- Status Tabs -->
      <div class="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
        <button
          @click="selectedFilter = 'pendiente_revision'"
          :class="[
            'px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer',
            selectedFilter === 'pendiente_revision'
              ? 'bg-amber-600 text-white shadow-2xs'
              : 'text-stone-600 hover:bg-stone-100'
          ]"
        >
          Pendientes ({{ countPending }})
        </button>

        <button
          @click="selectedFilter = 'aprobado'"
          :class="[
            'px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer',
            selectedFilter === 'aprobado'
              ? 'bg-emerald-600 text-white shadow-2xs'
              : 'text-stone-600 hover:bg-stone-100'
          ]"
        >
          Aprobados ({{ countApproved }})
        </button>

        <button
          @click="selectedFilter = 'rechazado'"
          :class="[
            'px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer',
            selectedFilter === 'rechazado'
              ? 'bg-red-600 text-white shadow-2xs'
              : 'text-stone-600 hover:bg-stone-100'
          ]"
        >
          Rechazados ({{ countRejected }})
        </button>

        <button
          @click="selectedFilter = 'todos'"
          :class="[
            'px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer',
            selectedFilter === 'todos'
              ? 'bg-stone-800 text-white shadow-2xs'
              : 'text-stone-600 hover:bg-stone-100'
          ]"
        >
          Todos ({{ countTotal }})
        </button>
      </div>
    </div>

    <!-- Projects List Cards (KIR-84: Interfaz de revisión) -->
    <div v-if="loading && !projects.length" class="py-20 text-center text-xs text-stone-500">
      <RefreshCw class="w-6 h-6 animate-spin mx-auto mb-2 text-[#289EAB]" />
      <span>Consultando proyectos en Supabase...</span>
    </div>

    <div v-else-if="!filteredProjects.length" class="bg-white rounded-3xl border border-stone-200 p-12 text-center shadow-xs">
      <div class="w-12 h-12 bg-stone-100 text-stone-400 rounded-2xl flex items-center justify-center mx-auto mb-3">
        <CheckSquare class="w-6 h-6" />
      </div>
      <h3 class="text-base font-bold text-stone-900">No se encontraron proyectos</h3>
      <p class="text-xs text-stone-500 mt-1 max-w-sm mx-auto">
        No hay iniciativas que coincidan con el filtro
        <span class="font-bold text-stone-700">"{{ selectedFilter }}"</span>
        {{ searchQuery ? `o la búsqueda "${searchQuery}"` : '' }}.
      </p>
    </div>

    <div v-else class="space-y-4">
      <article
        v-for="project in filteredProjects"
        :key="project.id"
        :class="[
          'bg-white rounded-3xl border p-6 sm:p-7 shadow-xs transition-all hover:border-stone-300',
          project.estado === 'pendiente_revision'
            ? 'border-amber-200 ring-1 ring-amber-100'
            : project.estado === 'aprobado'
            ? 'border-emerald-200'
            : 'border-red-200'
        ]"
      >
        <div class="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <!-- Main Info Column -->
          <div class="flex-1 space-y-3">
            <!-- Badges Bar -->
            <div class="flex flex-wrap items-center gap-2">
              <!-- Status Badge -->
              <span
                v-if="project.estado === 'pendiente_revision'"
                class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 text-[11px] font-bold border border-amber-200"
              >
                <Clock class="w-3.5 h-3.5 text-amber-600" />
                <span>Pendiente de Revisión</span>
              </span>

              <span
                v-else-if="project.estado === 'aprobado'"
                class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 text-[11px] font-bold border border-emerald-200"
              >
                <CheckCircle2 class="w-3.5 h-3.5 text-emerald-600" />
                <span>Aprobado para Catálogo Público</span>
              </span>

              <span
                v-else-if="project.estado === 'rechazado'"
                class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 text-red-800 text-[11px] font-bold border border-red-200"
              >
                <XCircle class="w-3.5 h-3.5 text-red-600" />
                <span>Rechazado con Observación</span>
              </span>

              <!-- Age Badge -->
              <span
                v-if="project.es_mayor_edad"
                class="inline-flex items-center px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 text-[10px] font-bold"
              >
                +18 Años Excluyente
              </span>

              <!-- Project ID -->
              <span class="text-[10px] font-mono text-stone-400">
                #PROY-{{ project.id }}
              </span>
            </div>

            <!-- Title & Organization -->
            <div>
              <h2 class="text-lg sm:text-xl font-bold text-stone-900 tracking-tight">
                {{ project.titulo }}
              </h2>
              <div class="flex flex-wrap items-center gap-3 text-xs text-stone-500 mt-1">
                <span class="inline-flex items-center gap-1 font-semibold text-[#1E7B85]">
                  <Building2 class="w-3.5 h-3.5 text-[#289EAB]" />
                  {{ project.organizacion_nombre || 'Organización Social Comunitaria' }}
                </span>
                <span>·</span>
                <span class="inline-flex items-center gap-1">
                  <MapPin class="w-3.5 h-3.5 text-stone-400" />
                  {{ project.ubicacion }}
                </span>
                <span>·</span>
                <span class="inline-flex items-center gap-1">
                  <Users class="w-3.5 h-3.5 text-stone-400" />
                  {{ project.cupos_disponibles }} cupos
                </span>
                <span>·</span>
                <span class="inline-flex items-center gap-1">
                  <Calendar class="w-3.5 h-3.5 text-stone-400" />
                  {{ formatDate(project.fecha_inicio) }} - {{ formatDate(project.fecha_fin) }}
                </span>
              </div>
            </div>

            <!-- Description -->
            <p class="text-xs sm:text-sm text-stone-600 line-clamp-3">
              {{ project.descripcion }}
            </p>

            <!-- Rejection Reason Warning Box (if rejected) -->
            <div
              v-if="project.estado === 'rechazado' && project.motivo_rechazo"
              class="bg-red-50/80 border border-red-200 rounded-2xl p-4 text-xs space-y-1"
            >
              <div class="flex items-center gap-1.5 font-bold text-red-800 uppercase tracking-wider text-[10px]">
                <AlertTriangle class="w-3.5 h-3.5 text-red-600" />
                <span>Motivo formal de rechazo registrado:</span>
              </div>
              <p class="text-red-900 italic font-serif text-xs">
                "{{ project.motivo_rechazo }}"
              </p>
            </div>
          </div>

          <!-- Action Buttons Column (KIR-83) -->
          <div class="flex flex-col sm:flex-row lg:flex-col gap-2 shrink-0 lg:w-48 pt-4 lg:pt-0 border-t lg:border-t-0 border-stone-100">
            <!-- View Details Button -->
            <button
              @click="openDetailModal(project)"
              class="w-full px-3.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Eye class="w-3.5 h-3.5 text-stone-500" />
              <span>Ver expediente</span>
            </button>

            <!-- Pending Actions -->
            <template v-if="project.estado === 'pendiente_revision'">
              <button
                @click="openApproveModal(project)"
                class="w-full px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <CheckCircle2 class="w-3.5 h-3.5" />
                <span>Aprobar Proyecto</span>
              </button>

              <button
                @click="openRejectModal(project)"
                class="w-full px-3.5 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <XCircle class="w-3.5 h-3.5 text-red-600" />
                <span>Rechazar con motivo</span>
              </button>
            </template>

            <!-- Decided Actions (Re-evaluación) -->
            <template v-else>
              <button
                @click="reopenProject(project)"
                class="w-full px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                title="Restablecer para una nueva auditoría"
              >
                <RotateCcw class="w-3.5 h-3.5 text-amber-600" />
                <span>Reabrir revisión</span>
              </button>
            </template>
          </div>
        </div>
      </article>
    </div>

    <!-- MODAL 1: APROBAR PROYECTO (KIR-83) -->
    <div
      v-if="projectToApprove"
      class="fixed inset-0 z-50 bg-stone-900/50 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div class="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 space-y-5 shadow-2xl border border-stone-200 animate-in fade-in zoom-in-95">
        <div class="text-center">
          <div class="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 class="w-6 h-6" />
          </div>
          <h3 class="text-lg font-bold text-stone-900">¿Aprobar iniciativa comunitaria?</h3>
          <p class="text-xs text-stone-500 mt-1">
            Estás a punto de aprobar el proyecto
            <strong class="text-stone-800 font-semibold">"{{ projectToApprove.titulo }}"</strong>.
          </p>
        </div>

        <div class="bg-stone-50 rounded-2xl p-4 text-xs text-stone-600 space-y-1.5 border border-stone-200">
          <div class="font-bold text-stone-800">Efectos inmediatos de la aprobación:</div>
          <ul class="list-disc list-inside space-y-1 text-stone-600 text-[11px]">
            <li>El proyecto cambiará su estado a <span class="font-bold text-emerald-700">"aprobado"</span>.</li>
            <li>Se publicará automáticamente en el <strong>catálogo público de voluntarios</strong>.</li>
            <li>Quedará habilitado para que los ciudadanos postulen al cupo de {{ projectToApprove.cupos_disponibles }} voluntarios.</li>
          </ul>
        </div>

        <div class="flex items-center gap-3 pt-2">
          <button
            type="button"
            @click="projectToApprove = null"
            :disabled="isSubmittingDecision"
            class="flex-1 py-2.5 rounded-xl border border-stone-300 text-xs font-semibold text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            @click="confirmApprove"
            :disabled="isSubmittingDecision"
            class="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <CheckCircle2 class="w-4 h-4" />
            <span>{{ isSubmittingDecision ? 'Aprobando…' : 'Sí, Aprobar' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL 2: RECHAZAR CON MOTIVO FORMAL (KIR-83 / KIR-84) -->
    <div
      v-if="projectToReject"
      class="fixed inset-0 z-50 bg-stone-900/50 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div class="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 space-y-5 shadow-2xl border border-stone-200 animate-in fade-in zoom-in-95">
        <div class="flex items-center justify-between pb-3 border-b border-stone-100">
          <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 bg-red-100 text-red-700 rounded-xl flex items-center justify-center">
              <XCircle class="w-5 h-5" />
            </div>
            <div>
              <h3 class="text-base font-bold text-stone-900">Rechazar propuesta de proyecto</h3>
              <p class="text-xs text-stone-500 truncate max-w-xs">{{ projectToReject.titulo }}</p>
            </div>
          </div>
          <button @click="projectToReject = null" class="text-stone-400 hover:text-stone-700 font-bold cursor-pointer">
            ✕
          </button>
        </div>

        <div class="space-y-3">
          <div>
            <label class="block text-xs font-bold text-stone-800 mb-1">
              Motivo formal de rechazo * (Obligatorio)
            </label>
            <textarea
              v-model="rejectionReason"
              rows="3"
              placeholder="Escribe de forma clara y fundamentada la razón por la cual no procede esta iniciativa..."
              class="w-full rounded-2xl border border-stone-300 p-3 text-xs focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-100"
            ></textarea>
            <div class="flex items-center justify-between text-[11px] text-stone-400 mt-1">
              <span>Mínimo 10 caracteres</span>
              <span :class="rejectionReason.length < 10 ? 'text-amber-600 font-bold' : 'text-stone-600'">
                {{ rejectionReason.length }} caracteres
              </span>
            </div>
          </div>

          <!-- Quick Reasons Shortcuts -->
          <div class="space-y-1.5">
            <span class="text-[11px] font-bold text-stone-600 block">Motivos frecuentes (haz clic para usar):</span>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="r in quickReasons"
                :key="r"
                type="button"
                @click="applyQuickReason(r)"
                class="text-[10px] px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-left transition-colors cursor-pointer"
              >
                {{ r }}
              </button>
            </div>
          </div>

          <p v-if="rejectError" class="text-xs font-semibold text-red-700 bg-red-50 p-2.5 rounded-xl border border-red-200">
            {{ rejectError }}
          </p>
        </div>

        <div class="flex items-center gap-3 pt-2">
          <button
            type="button"
            @click="projectToReject = null"
            :disabled="isSubmittingDecision"
            class="flex-1 py-2.5 rounded-xl border border-stone-300 text-xs font-semibold text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            @click="confirmReject"
            :disabled="isSubmittingDecision || rejectionReason.trim().length < 10"
            class="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <XCircle class="w-4 h-4" />
            <span>{{ isSubmittingDecision ? 'Guardando…' : 'Confirmar Rechazo' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL 3: EXPEDIENTE COMPLETO DEL PROYECTO -->
    <div
      v-if="projectDetailModal"
      class="fixed inset-0 z-50 bg-stone-900/50 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div class="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl border border-stone-200 max-h-[90vh] overflow-y-auto">
        <div class="flex items-start justify-between gap-4 pb-4 border-b border-stone-100">
          <div>
            <div class="flex items-center gap-2 mb-1">
              <span class="text-xs font-mono font-bold text-[#1E7B85] bg-[#E8F6F8] px-2 py-0.5 rounded-md">
                Expediente #PROY-{{ projectDetailModal.id }}
              </span>
              <span
                :class="[
                  'text-[11px] font-bold px-2 py-0.5 rounded-md',
                  projectDetailModal.estado === 'aprobado'
                    ? 'bg-emerald-100 text-emerald-800'
                    : projectDetailModal.estado === 'rechazado'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-amber-100 text-amber-800'
                ]"
              >
                {{ projectDetailModal.estado }}
              </span>
            </div>
            <h2 class="text-xl font-extrabold text-stone-900">{{ projectDetailModal.titulo }}</h2>
          </div>
          <button @click="projectDetailModal = null" class="text-stone-400 hover:text-stone-700 font-bold cursor-pointer text-lg">
            ✕
          </button>
        </div>

        <div class="space-y-4 text-xs sm:text-sm">
          <div>
            <span class="text-xs font-bold text-stone-500 uppercase tracking-wider block mb-1">Descripción del Proyecto</span>
            <p class="text-stone-700 leading-relaxed bg-stone-50 p-4 rounded-2xl border border-stone-200 whitespace-pre-line">
              {{ projectDetailModal.descripcion }}
            </p>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="p-3 rounded-2xl bg-stone-50 border border-stone-200">
              <span class="text-[11px] text-stone-400 block font-semibold">Organización Proponente</span>
              <span class="font-bold text-stone-800">{{ projectDetailModal.organizacion_nombre || 'No especificada' }}</span>
            </div>

            <div class="p-3 rounded-2xl bg-stone-50 border border-stone-200">
              <span class="text-[11px] text-stone-400 block font-semibold">Ubicación Territorial</span>
              <span class="font-bold text-stone-800">{{ projectDetailModal.ubicacion }}</span>
            </div>

            <div class="p-3 rounded-2xl bg-stone-50 border border-stone-200">
              <span class="text-[11px] text-stone-400 block font-semibold">Cupos para Voluntarios</span>
              <span class="font-bold text-stone-800">{{ projectDetailModal.cupos_disponibles }} personas</span>
            </div>

            <div class="p-3 rounded-2xl bg-stone-50 border border-stone-200">
              <span class="text-[11px] text-stone-400 block font-semibold">Vigencia del Proyecto</span>
              <span class="font-bold text-stone-800">
                {{ formatDate(projectDetailModal.fecha_inicio) }} - {{ formatDate(projectDetailModal.fecha_fin) }}
              </span>
            </div>
          </div>

          <div v-if="projectDetailModal.motivo_rechazo" class="p-4 rounded-2xl bg-red-50 border border-red-200">
            <span class="text-xs font-bold text-red-800 block mb-1">Observación / Motivo de rechazo:</span>
            <p class="text-xs text-red-900 italic font-serif">"{{ projectDetailModal.motivo_rechazo }}"</p>
          </div>
        </div>

        <div class="flex items-center justify-end gap-3 pt-4 border-t border-stone-100">
          <button
            type="button"
            @click="projectDetailModal = null"
            class="px-5 py-2.5 rounded-xl bg-stone-900 text-white text-xs font-bold cursor-pointer hover:bg-stone-800 transition-colors"
          >
            Cerrar Expediente
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
