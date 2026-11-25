<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '../../api/client';
import type { Proyecto } from '../../types';
import {
  Globe,
  EyeOff,
  CheckCircle2,
  Clock,
  Lock,
  Search,
  Building2,
  MapPin,
  Calendar,
  Users,
  ArrowLeft,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  Sparkles,
  Send,
  Download,
} from 'lucide-vue-next';
import { useAuthAccess, validateNumericBoundsClient } from '../../composables/useAuthAccess';

const { canExport, exporting, exportNotice, refreshAccess, downloadCsv } = useAuthAccess();

const projects = ref<Proyecto[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const successNotice = ref<string | null>(null);

// Filters
const selectedTab = ref<'sin_publicar' | 'publicados' | 'todos'>('sin_publicar');
const searchQuery = ref('');
const selectedCategory = ref('');
const cuposMin = ref('');
const cuposMax = ref('');
const sortOrder = ref<'recientes' | 'titulo_asc' | 'titulo_desc' | 'cupos_desc' | 'cupos_asc'>('recientes');
const rangeError = ref<string | null>(null);

// Confirmation modal state
const targetProject = ref<Proyecto | null>(null);
const targetPublishState = ref<boolean>(true);
const isUpdating = ref(false);

async function loadProjects() {
  const err = validateNumericBoundsClient(cuposMin.value, cuposMax.value, {
    label: 'cupos',
    integerOnly: true,
    maxAllowed: 100000,
  });
  rangeError.value = err;
  if (err) return;

  loading.value = true;
  error.value = null;
  try {
    projects.value = await api.getProyectos({
      categoria: selectedCategory.value || undefined,
      cupos_min: cuposMin.value !== '' ? cuposMin.value : undefined,
      cupos_max: cuposMax.value !== '' ? cuposMax.value : undefined,
      ordenar: sortOrder.value,
      q: searchQuery.value.trim() || undefined,
    });
  } catch (err: any) {
    error.value = err?.response?.data?.error || 'No se pudieron cargar los proyectos.';
  } finally {
    loading.value = false;
  }
}

async function handleExportPublished() {
  const err = validateNumericBoundsClient(cuposMin.value, cuposMax.value, {
    label: 'cupos',
    integerOnly: true,
    maxAllowed: 100000,
  });
  rangeError.value = err;
  if (err) return;

  await downloadCsv('proyectos', {
    estado: selectedTab.value !== 'todos' ? 'aprobado' : undefined,
    publicado: selectedTab.value === 'publicados' ? 'true' : selectedTab.value === 'sin_publicar' ? 'false' : undefined,
    categoria: selectedCategory.value || undefined,
    cupos_min: cuposMin.value !== '' ? cuposMin.value : undefined,
    cupos_max: cuposMax.value !== '' ? cuposMax.value : undefined,
    ordenar: sortOrder.value,
    q: searchQuery.value.trim() || undefined,
  });
}

onMounted(() => {
  refreshAccess();
  loadProjects();
});

// Metrics
const approvedReadyToPublish = computed(() =>
  projects.value.filter((p) => p.estado === 'aprobado' && !p.publicado)
);
const approvedPublished = computed(() =>
  projects.value.filter((p) => p.estado === 'aprobado' && Boolean(p.publicado))
);
const nonApprovedLocked = computed(() =>
  projects.value.filter((p) => p.estado !== 'aprobado')
);

const filteredProjects = computed(() => {
  return projects.value.filter((p) => {
    if (selectedTab.value === 'sin_publicar') {
      if (p.estado !== 'aprobado' || p.publicado) return false;
    } else if (selectedTab.value === 'publicados') {
      if (p.estado !== 'aprobado' || !p.publicado) return false;
    }
    return true;
  });
});

function openPublishModal(project: Proyecto, publish: boolean) {
  targetProject.value = project;
  targetPublishState.value = publish;
}

async function confirmPublicationToggle() {
  if (!targetProject.value || isUpdating.value) return;
  isUpdating.value = true;
  error.value = null;
  successNotice.value = null;

  try {
    const res = await api.publishProject(targetProject.value.id, {
      publicado: targetPublishState.value,
    });
    successNotice.value =
      res.message ||
      (targetPublishState.value
        ? `Proyecto "${targetProject.value.titulo}" publicado con éxito.`
        : `Proyecto "${targetProject.value.titulo}" ocultado del catálogo.`);
    targetProject.value = null;
    await loadProjects();
    setTimeout(() => {
      successNotice.value = null;
    }, 4500);
  } catch (err: any) {
    error.value = err?.response?.data?.error || 'No se pudo actualizar la visibilidad del proyecto.';
    targetProject.value = null;
  } finally {
    isUpdating.value = false;
  }
}

function formatDate(dateStr?: string | null) {
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
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8">
    <!-- Top Bar -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <router-link
        to="/admin"
        class="inline-flex items-center gap-2 text-xs font-semibold text-stone-600 hover:text-stone-900 transition-colors"
      >
        <ArrowLeft class="w-4 h-4" />
        <span>Volver al Panel de Administración</span>
      </router-link>

      <div class="flex items-center gap-2">
        <button
          v-if="canExport"
          type="button"
          @click="handleExportPublished"
          :disabled="exporting"
          class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#289EAB] hover:bg-[#1E7B85] text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-60"
        >
          <Download class="w-3.5 h-3.5" />
          <span>{{ exporting ? 'Exportando...' : 'Exportar CSV' }}</span>
        </button>

        <router-link
          to="/"
          class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#E8F6F8] text-[#1E7B85] border border-[#289EAB]/30 text-xs font-semibold hover:bg-[#d7eff3] transition-colors"
        >
          <ExternalLink class="w-3.5 h-3.5" />
          <span>Ver Catálogo Público</span>
        </router-link>

        <button
          @click="loadProjects"
          :disabled="loading"
          class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white border border-stone-200 text-xs font-semibold text-stone-700 hover:bg-stone-50 transition-colors cursor-pointer shadow-2xs"
        >
          <RefreshCw :class="['w-3.5 h-3.5', loading ? 'animate-spin' : '']" />
          <span>Actualizar</span>
        </button>
      </div>
    </div>

    <!-- Header Banner (KIR-22) -->
    <div class="relative bg-white border border-stone-200 rounded-3xl p-6 sm:p-8 shadow-xs overflow-hidden">
      <div class="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#289EAB] via-emerald-500 to-[#F58F38]"></div>

      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-semibold mb-2 border border-emerald-200">
            <Globe class="w-3.5 h-3.5 text-emerald-600" />
            <span>Módulo de Visibilidad (Historia KIR-22 · Épica KIR-3)</span>
          </div>
          <h1 class="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight">
            Publicar Proyectos Aprobados
          </h1>
          <p class="text-xs sm:text-sm text-stone-600 mt-1 max-w-2xl">
            Controla qué proyectos previamente aprobados se encuentran publicados y visibles en el catálogo público para postulaciones de voluntarios.
          </p>
        </div>

        <!-- Metric Cards -->
        <div class="grid grid-cols-3 gap-2.5 shrink-0">
          <button
            @click="selectedTab = 'sin_publicar'"
            :class="[
              'p-3 rounded-2xl border text-center cursor-pointer transition-all',
              selectedTab === 'sin_publicar'
                ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-400/30'
                : 'bg-stone-50 border-stone-200 hover:bg-stone-100',
            ]"
          >
            <span class="text-[11px] font-bold text-amber-800 uppercase tracking-wider block">Sin Publicar</span>
            <span class="text-xl font-extrabold text-amber-700 font-mono">{{ approvedReadyToPublish.length }}</span>
          </button>

          <button
            @click="selectedTab = 'publicados'"
            :class="[
              'p-3 rounded-2xl border text-center cursor-pointer transition-all',
              selectedTab === 'publicados'
                ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-400/30'
                : 'bg-stone-50 border-stone-200 hover:bg-stone-100',
            ]"
          >
            <span class="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block">Publicados</span>
            <span class="text-xl font-extrabold text-emerald-700 font-mono">{{ approvedPublished.length }}</span>
          </button>

          <button
            @click="selectedTab = 'todos'"
            :class="[
              'p-3 rounded-2xl border text-center cursor-pointer transition-all',
              selectedTab === 'todos'
                ? 'bg-stone-900 border-stone-900 text-white'
                : 'bg-stone-50 border-stone-200 hover:bg-stone-100 text-stone-700',
            ]"
          >
            <span class="text-[11px] font-bold uppercase tracking-wider block opacity-80">Total</span>
            <span class="text-xl font-extrabold font-mono">{{ projects.length }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Feedback Notices -->
    <div
      v-if="successNotice"
      class="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl text-xs sm:text-sm font-semibold flex items-center gap-2.5 shadow-xs"
    >
      <CheckCircle2 class="w-5 h-5 text-emerald-600 shrink-0" />
      <span>{{ successNotice }}</span>
    </div>

    <div
      v-if="error"
      class="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-2xl text-xs sm:text-sm font-semibold flex items-center gap-2.5"
    >
      <AlertTriangle class="w-5 h-5 text-rose-600 shrink-0" />
      <span>{{ error }}</span>
    </div>

    <div
      v-if="exportNotice"
      role="status"
      :class="['p-3.5 rounded-2xl border text-xs sm:text-sm', exportNotice.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800']"
    >
      {{ exportNotice.text }}
    </div>

    <!-- Search & Tabs Toolbar -->
    <form @submit.prevent="loadProjects" class="bg-white rounded-2xl border border-stone-200 p-4 shadow-xs space-y-3">
      <div class="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            @click="selectedTab = 'sin_publicar'"
            :class="[
              'px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer',
              selectedTab === 'sin_publicar'
                ? 'bg-amber-500 text-white shadow-2xs'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200',
            ]"
          >
            Listos para Publicar ({{ approvedReadyToPublish.length }})
          </button>

          <button
            type="button"
            @click="selectedTab = 'publicados'"
            :class="[
              'px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer',
              selectedTab === 'publicados'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200',
            ]"
          >
            Publicados ({{ approvedPublished.length }})
          </button>

          <button
            type="button"
            @click="selectedTab = 'todos'"
            :class="[
              'px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer',
              selectedTab === 'todos'
                ? 'bg-stone-900 text-white shadow-2xs'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200',
            ]"
          >
            Todos ({{ projects.length }})
          </button>
        </div>

        <div class="relative w-full sm:w-72">
          <Search class="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Buscar proyecto u organización..."
            class="w-full pl-9 pr-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#289EAB] focus:bg-white"
          />
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-stone-100 text-xs">
        <div class="flex flex-wrap items-center gap-2">
          <select
            v-model="selectedCategory"
            @change="loadProjects"
            class="px-3 py-1.5 rounded-lg border border-stone-200 bg-stone-50 text-xs text-stone-700"
          >
            <option value="">Todas las categorías</option>
            <option value="ONG">ONG</option>
            <option value="Fundación">Fundación</option>
            <option value="Empresa">Empresa</option>
            <option value="Institución Educativa">Institución Educativa</option>
            <option value="Colectivo Social">Colectivo Social</option>
          </select>

          <input
            v-model="cuposMin"
            type="number"
            min="0"
            step="1"
            placeholder="Cupos mín."
            class="w-24 px-2.5 py-1.5 rounded-lg border border-stone-200 bg-stone-50 text-xs tabular-nums"
          />
          <input
            v-model="cuposMax"
            type="number"
            min="0"
            step="1"
            placeholder="Cupos máx."
            class="w-24 px-2.5 py-1.5 rounded-lg border border-stone-200 bg-stone-50 text-xs tabular-nums"
          />

          <select
            v-model="sortOrder"
            @change="loadProjects"
            class="px-3 py-1.5 rounded-lg border border-stone-200 bg-stone-50 text-xs text-stone-700"
          >
            <option value="recientes">Más recientes</option>
            <option value="titulo_asc">Título (A-Z)</option>
            <option value="titulo_desc">Título (Z-A)</option>
            <option value="cupos_desc">Mayor cupos</option>
            <option value="cupos_asc">Menor cupos</option>
          </select>
        </div>

        <button
          type="submit"
          class="px-4 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
        >
          Aplicar filtros
        </button>
      </div>

      <p v-if="rangeError" role="alert" class="text-xs font-medium text-rose-700">{{ rangeError }}</p>
    </form>

    <!-- Loading -->
    <div v-if="loading" class="py-16 text-center bg-white rounded-3xl border border-stone-200">
      <RefreshCw class="w-7 h-7 text-[#289EAB] animate-spin mx-auto mb-2" />
      <p class="text-xs text-stone-500 font-medium">Cargando proyectos para gestión de publicación...</p>
    </div>

    <!-- Empty -->
    <div v-else-if="filteredProjects.length === 0" class="py-16 text-center bg-white rounded-3xl border border-stone-200 p-8">
      <div class="w-12 h-12 bg-stone-100 text-stone-400 rounded-2xl flex items-center justify-center mx-auto mb-3">
        <Globe class="w-6 h-6" />
      </div>
      <h3 class="text-base font-bold text-stone-800 mb-1">
        No hay proyectos en esta categoría
      </h3>
      <p class="text-xs text-stone-500 max-w-md mx-auto">
        <template v-if="selectedTab === 'sin_publicar'">
          Todos los proyectos aprobados ya han sido publicados, o aún hay propuestas pendientes en el módulo de Revisión (KIR-21).
        </template>
        <template v-else>
          No se encontraron proyectos con los filtros aplicados.
        </template>
      </p>
    </div>

    <!-- Projects List -->
    <div v-else class="space-y-4">
      <article
        v-for="project in filteredProjects"
        :key="project.id"
        class="bg-white rounded-3xl border border-stone-200 p-5 sm:p-6 shadow-xs hover:border-stone-300 transition-all"
      >
        <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div class="space-y-2.5 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <!-- Approval Badge -->
              <span
                :class="[
                  'inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border',
                  project.estado === 'aprobado'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : project.estado === 'rechazado'
                    ? 'bg-rose-50 text-rose-800 border-rose-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200',
                ]"
              >
                <CheckCircle2 v-if="project.estado === 'aprobado'" class="w-3 h-3" />
                <Clock v-else class="w-3 h-3" />
                <span>
                  {{
                    project.estado === 'aprobado'
                      ? 'Aprobado'
                      : project.estado === 'rechazado'
                      ? 'Rechazado'
                      : 'Pendiente de Revisión'
                  }}
                </span>
              </span>

              <!-- Publication Badge (KIR-78) -->
              <span
                v-if="project.estado === 'aprobado' && project.publicado"
                class="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#E8F6F8] text-[#1E7B85] border border-[#289EAB]/30"
              >
                <Globe class="w-3 h-3" />
                <span>Publicado en Catálogo</span>
              </span>

              <span
                v-else-if="project.estado === 'aprobado' && !project.publicado"
                class="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-700 border border-stone-200"
              >
                <EyeOff class="w-3 h-3" />
                <span>Oculto / Sin Publicar</span>
              </span>

              <span
                v-else
                class="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-500 border border-stone-200"
              >
                <Lock class="w-3 h-3" />
                <span>Requiere aprobación previa (KIR-21)</span>
              </span>

              <span class="text-[10px] font-mono text-stone-400">#PROY-{{ project.id }}</span>
            </div>

            <h2 class="text-lg font-bold text-stone-900">{{ project.titulo }}</h2>

            <div class="flex flex-wrap items-center gap-3 text-xs text-stone-500">
              <span class="inline-flex items-center gap-1 font-semibold text-[#1E7B85]">
                <Building2 class="w-3.5 h-3.5 text-[#289EAB]" />
                {{ project.organizacion_nombre || project.organizacion?.nombre || 'Iniciativa Kirikú' }}
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
              <template v-if="project.publicado && project.fecha_publicacion">
                <span>·</span>
                <span class="inline-flex items-center gap-1 text-emerald-700 font-medium">
                  <Calendar class="w-3.5 h-3.5" />
                  Publicado: {{ formatDate(project.fecha_publicacion) }}
                </span>
              </template>
            </div>

            <p class="text-xs text-stone-600 line-clamp-2">{{ project.descripcion }}</p>
          </div>

          <!-- Action Column -->
          <div class="flex flex-col sm:flex-row lg:flex-col gap-2 shrink-0 lg:w-52">
            <template v-if="project.estado === 'aprobado'">
              <button
                v-if="!project.publicado"
                @click="openPublishModal(project, true)"
                class="w-full px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Globe class="w-4 h-4" />
                <span>Publicar en Catálogo</span>
              </button>

              <button
                v-else
                @click="openPublishModal(project, false)"
                class="w-full px-4 py-2.5 rounded-xl bg-stone-100 hover:bg-amber-50 hover:text-amber-900 hover:border-amber-200 border border-stone-200 text-stone-700 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <EyeOff class="w-4 h-4" />
                <span>Ocultar del Catálogo</span>
              </button>
            </template>

            <router-link
              v-else
              to="/admin/revision"
              class="w-full px-4 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold transition-all flex items-center justify-center gap-1.5"
            >
              <Lock class="w-3.5 h-3.5" />
              <span>Ir a Revisión</span>
            </router-link>
          </div>
        </div>
      </article>
    </div>

    <!-- CONFIRMATION MODAL (KIR-79) -->
    <div
      v-if="targetProject"
      class="fixed inset-0 z-50 bg-stone-900/50 backdrop-blur-xs flex items-center justify-center p-4"
      @click.self="targetProject = null"
    >
      <div class="bg-white rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl border border-stone-200">
        <div class="text-center">
          <div
            :class="[
              'w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3',
              targetPublishState ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700',
            ]"
          >
            <Globe v-if="targetPublishState" class="w-6 h-6" />
            <EyeOff v-else class="w-6 h-6" />
          </div>
          <h3 class="text-lg font-bold text-stone-900">
            {{ targetPublishState ? '¿Publicar proyecto en el catálogo?' : '¿Ocultar proyecto del catálogo?' }}
          </h3>
          <p class="text-xs text-stone-500 mt-1">
            Proyecto: <strong class="text-stone-800">"{{ targetProject.titulo }}"</strong>
          </p>
        </div>

        <div class="bg-stone-50 rounded-2xl p-4 text-xs text-stone-600 border border-stone-200 space-y-1">
          <template v-if="targetPublishState">
            <p class="font-bold text-stone-800">Al publicar este proyecto aprobado:</p>
            <ul class="list-disc list-inside space-y-1 text-[11px]">
              <li>Pasará a ser visible inmediatamente en el <strong>Catálogo Público</strong>.</li>
              <li>Se habilitará en el selector de <strong>Postulación de Voluntarios</strong>.</li>
              <li>Se registrará la fecha y hora oficial de publicación.</li>
            </ul>
          </template>
          <template v-else>
            <p class="font-bold text-stone-800">Al ocultar este proyecto:</p>
            <ul class="list-disc list-inside space-y-1 text-[11px]">
              <li>Dejará de aparecer en el Catálogo Público para nuevos postulantes.</li>
              <li>Conservará su estado <strong>Aprobado</strong> para poder republicarlo cuando sea necesario.</li>
            </ul>
          </template>
        </div>

        <div class="flex items-center gap-3 pt-1">
          <button
            type="button"
            @click="targetProject = null"
            :disabled="isUpdating"
            class="flex-1 py-2.5 rounded-xl border border-stone-300 text-xs font-semibold text-stone-700 hover:bg-stone-100 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            @click="confirmPublicationToggle"
            :disabled="isUpdating"
            :class="[
              'flex-1 py-2.5 rounded-xl text-white text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50',
              targetPublishState ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700',
            ]"
          >
            <Send class="w-3.5 h-3.5" />
            <span>
              {{
                isUpdating
                  ? 'Procesando…'
                  : targetPublishState
                  ? 'Sí, Publicar Ahora'
                  : 'Sí, Ocultar'
              }}
            </span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
