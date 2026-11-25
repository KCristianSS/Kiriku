<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useProjectsStore } from '../stores/projects';
import ProjectCard from '../components/ProjectCard.vue';
import AdultWarningModal from '../components/AdultWarningModal.vue';
import type { Proyecto } from '../types';
import {
  Search,
  MapPin,
  Sparkles,
  ArrowRight,
  Layers,
  AlertCircle,
  RefreshCw,
  Download,
  SlidersHorizontal,
} from 'lucide-vue-next';
import { api } from '../api/client';
import { useAuthAccess, validateNumericBoundsClient } from '../composables/useAuthAccess';

const router = useRouter();
const projectsStore = useProjectsStore();
const { canExport, exporting, exportNotice, refreshAccess, downloadCsv } = useAuthAccess();

const searchQuery = ref('');
const locationFilter = ref('');
const categoryFilter = ref('');
const cuposMin = ref('');
const cuposMax = ref('');
const sortOrder = ref<'recientes' | 'titulo_asc' | 'titulo_desc' | 'cupos_desc' | 'cupos_asc'>('recientes');
const rangeError = ref<string | null>(null);
const modalProject = ref<Proyecto | null>(null);
const isModalOpen = ref(false);

async function applyCatalogFilters() {
  const err = validateNumericBoundsClient(cuposMin.value, cuposMax.value, {
    label: 'cupos',
    integerOnly: true,
    maxAllowed: 100000,
  });
  rangeError.value = err;
  if (err) return;

  projectsStore.searchQuery = searchQuery.value.trim();
  projectsStore.selectedLocation = locationFilter.value;
  projectsStore.selectedCategory = categoryFilter.value;
  projectsStore.cuposMin = cuposMin.value;
  projectsStore.cuposMax = cuposMax.value;
  projectsStore.sortOrder = sortOrder.value;
  await projectsStore.fetchPublishedProjects();
}

async function resetCatalogFilters() {
  searchQuery.value = '';
  locationFilter.value = '';
  categoryFilter.value = '';
  cuposMin.value = '';
  cuposMax.value = '';
  sortOrder.value = 'recientes';
  rangeError.value = null;
  await applyCatalogFilters();
}

async function handleExportCatalog() {
  const err = validateNumericBoundsClient(cuposMin.value, cuposMax.value, {
    label: 'cupos',
    integerOnly: true,
    maxAllowed: 100000,
  });
  rangeError.value = err;
  if (err) return;

  await downloadCsv('catalogo', {
    q: searchQuery.value.trim() || undefined,
    ubicacion: locationFilter.value || undefined,
    categoria: categoryFilter.value || undefined,
    cupos_min: cuposMin.value !== '' ? cuposMin.value : undefined,
    cupos_max: cuposMax.value !== '' ? cuposMax.value : undefined,
    ordenar: sortOrder.value,
  });
}

async function loadCatalog() {
  projectsStore.error = null;
  try {
    const status = await api.getStatus();
    if (!status.databaseConfigured) {
      projectsStore.error =
        'Conexión a Supabase pendiente: agrega tu variable DATABASE_URL en los Secretos del proyecto (Settings → Secrets) o en tu archivo .env local y vuelve a intentar.';
      return;
    }
  } catch {
    // Continuar con la carga normal si /status no responde
  }
  await Promise.all([
    projectsStore.fetchPublishedProjects(),
    projectsStore.fetchOrganizations(),
    refreshAccess(),
  ]);
}

onMounted(async () => {
  await loadCatalog();
});

// KIR-80: Listado exclusivo de proyectos aprobados y publicados (refinado localmente + respaldado en servidor)
const filteredProjects = computed(() => {
  return projectsStore.projects.filter((p) => p.estado === 'aprobado' && p.publicado);
});

const uniqueLocations = computed(() => {
  const locs = new Set<string>();
  projectsStore.projects.forEach((p) => {
    if (p.ubicacion) locs.add(p.ubicacion);
  });
  return Array.from(locs);
});

const uniqueCategories = computed(() => {
  const cats = new Set<string>(['ONG', 'Fundación', 'Empresa', 'Institución Educativa', 'Colectivo Social']);
  projectsStore.organizations.forEach((o) => {
    if (o.tipo) cats.add(o.tipo);
  });
  projectsStore.projects.forEach((p) => {
    const t = p.organizacion_tipo || p.organizacion?.tipo;
    if (t) cats.add(t);
  });
  return Array.from(cats);
});

// Handle apply button click on project card
function handleApply(project: Proyecto) {
  if (project.es_mayor_edad) {
    modalProject.value = project;
    isModalOpen.value = true;
  } else {
    router.push(`/postular/${project.id}`);
  }
}

// Confirm adult modal and proceed to application form
function handleConfirmAdult(payload?: { confirmedDate?: string }) {
  isModalOpen.value = false;
  if (modalProject.value) {
    router.push({
      path: `/postular/${modalProject.value.id}`,
      query: payload?.confirmedDate ? { fecha: payload.confirmedDate } : undefined,
    });
  }
}
</script>

<template>
  <div class="space-y-10 pb-16">
    <!-- Hero Header with Kirikú branding -->
    <section class="relative bg-white border-b border-stone-200 overflow-hidden py-12 sm:py-16">
      <div class="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#289EAB] via-[#F58F38] to-[#EB455F]"></div>

      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="max-w-3xl">
          <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E8F6F8] text-[#1E7B85] text-xs font-semibold mb-4">
            <Sparkles class="w-3.5 h-3.5 text-[#F58F38]" />
            <span>Voluntariado Comunitario y Social</span>
          </div>

          <h1 class="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-stone-900 tracking-tight leading-tight mb-1.5">
            Jaimawi
          </h1>

          <p class="text-base sm:text-lg font-bold text-stone-700 mb-3">
            Transformando vidas con <span class="text-[#289EAB]">Kirikú</span>
          </p>

          <p class="text-stone-600 text-sm sm:text-base leading-relaxed mb-6">
            Explora las iniciativas activas de voluntariado, postúlate a proyectos comunitarios y forma parte de un proceso transparente de evaluación en 5 etapas.
          </p>

          <div class="flex flex-wrap items-center gap-3">
            <router-link
              to="/postular"
              class="px-5 py-2.5 bg-[#289EAB] hover:bg-[#1E7B85] text-white text-sm font-semibold rounded-xl shadow-xs transition-colors inline-flex items-center gap-2 cursor-pointer"
            >
              <span>Formulario de Postulación</span>
              <ArrowRight class="w-4 h-4" />
            </router-link>

            <router-link
              to="/seguimiento"
              class="px-5 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-sm font-semibold rounded-xl transition-colors inline-flex items-center gap-2 cursor-pointer"
            >
              <span>Consultar mi Estado</span>
            </router-link>
          </div>
        </div>
      </div>
    </section>

    <!-- Filters and Projects Catalog -->
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
      <!-- Search and Filter Bar -->
      <form @submit.prevent="applyCatalogFilters" class="bg-white rounded-2xl border border-stone-200 p-4 shadow-xs space-y-3">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div class="relative">
            <Search class="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Buscar proyectos por título o descripción..."
              class="w-full pl-10 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs sm:text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#289EAB] focus:bg-white transition-all"
            />
          </div>

          <div class="relative">
            <MapPin class="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <select
              v-model="locationFilter"
              @change="applyCatalogFilters"
              class="w-full pl-8 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs sm:text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-[#289EAB] cursor-pointer"
            >
              <option value="">Todas las ubicaciones</option>
              <option v-for="loc in uniqueLocations" :key="loc" :value="loc">
                {{ loc }}
              </option>
            </select>
          </div>

          <div class="relative">
            <SlidersHorizontal class="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <select
              v-model="categoryFilter"
              @change="applyCatalogFilters"
              class="w-full pl-8 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs sm:text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-[#289EAB] cursor-pointer"
            >
              <option value="">Todas las categorías</option>
              <option v-for="cat in uniqueCategories" :key="cat" :value="cat">
                {{ cat }}
              </option>
            </select>
          </div>

          <select
            v-model="sortOrder"
            @change="applyCatalogFilters"
            class="px-3.5 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs sm:text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-[#289EAB] cursor-pointer"
          >
            <option value="recientes">Ordenar: Más recientes</option>
            <option value="titulo_asc">Título (A-Z)</option>
            <option value="titulo_desc">Título (Z-A)</option>
            <option value="cupos_desc">Mayor cantidad de cupos</option>
            <option value="cupos_asc">Menor cantidad de cupos</option>
          </select>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-stone-100">
          <div class="flex flex-wrap items-center gap-2 text-xs text-stone-600">
            <span class="font-medium">Rango de cupos:</span>
            <input
              v-model="cuposMin"
              type="number"
              min="0"
              step="1"
              placeholder="Mín."
              aria-label="Cupos mínimos"
              class="w-24 px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-xs tabular-nums focus:outline-none focus:ring-2 focus:ring-[#289EAB]"
            />
            <span>–</span>
            <input
              v-model="cuposMax"
              type="number"
              min="0"
              step="1"
              placeholder="Máx."
              aria-label="Cupos máximos"
              class="w-24 px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-xs tabular-nums focus:outline-none focus:ring-2 focus:ring-[#289EAB]"
            />
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              @click="resetCatalogFilters"
              class="px-3.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Limpiar
            </button>
            <button
              type="submit"
              class="px-4 py-1.5 bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Filtrar catálogo
            </button>
            <button
              v-if="canExport"
              type="button"
              @click="handleExportCatalog"
              :disabled="exporting"
              class="px-4 py-1.5 bg-[#289EAB] hover:bg-[#1E7B85] text-white text-xs font-semibold rounded-xl transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              <Download class="w-3.5 h-3.5" />
              <span>{{ exporting ? 'Exportando...' : 'Exportar CSV' }}</span>
            </button>
          </div>
        </div>

        <p v-if="rangeError" role="alert" class="text-xs font-medium text-rose-700">
          {{ rangeError }}
        </p>
        <p
          v-if="exportNotice"
          role="status"
          :class="['text-xs font-medium', exportNotice.type === 'success' ? 'text-emerald-700' : 'text-rose-700']"
        >
          {{ exportNotice.text }}
        </p>
      </form>

      <!-- Projects Grid from Real Supabase Data -->
      <div v-if="projectsStore.loading" class="py-16 text-center">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-stone-200 border-t-[#289EAB] mb-3"></div>
        <p class="text-sm text-stone-500 font-medium">Cargando proyectos desde Supabase...</p>
      </div>

      <div
        v-else-if="projectsStore.error"
        role="alert"
        class="py-12 text-center bg-white rounded-3xl border border-amber-200 p-8 space-y-3"
      >
        <div class="w-12 h-12 bg-amber-50 text-amber-700 rounded-2xl flex items-center justify-center mx-auto">
          <AlertCircle class="w-6 h-6" />
        </div>
        <h3 class="text-base font-bold text-stone-900">Conexión a base de datos pendiente</h3>
        <p class="text-xs sm:text-sm text-stone-600 max-w-lg mx-auto leading-relaxed">
          {{ projectsStore.error }}
        </p>
        <button
          @click="loadCatalog"
          class="px-4 py-2 bg-[#289EAB] hover:bg-[#1E7B85] text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <RefreshCw class="w-3.5 h-3.5" />
          <span>Reintentar conexión</span>
        </button>
      </div>

      <div v-else-if="filteredProjects.length === 0" class="py-16 text-center bg-white rounded-3xl border border-stone-200 p-8">
        <div class="w-14 h-14 bg-stone-100 text-stone-400 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <Layers class="w-7 h-7" />
        </div>
        <h3 class="text-base font-bold text-stone-800 mb-1">No se encontraron proyectos</h3>
        <p class="text-xs text-stone-500 max-w-sm mx-auto">
          Prueba cambiando el texto de búsqueda o los filtros aplicados.
        </p>
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <ProjectCard
          v-for="project in filteredProjects"
          :key="project.id"
          :project="project"
          @apply="handleApply"
        />
      </div>
    </div>

    <!-- Adult Warning Modal Component -->
    <AdultWarningModal
      :is-open="isModalOpen"
      :project-title="modalProject?.titulo"
      :project-location="modalProject?.ubicacion"
      :project-org="modalProject?.organizacion?.nombre || 'Iniciativa Kirikú'"
      @confirm="handleConfirmAdult"
      @close="isModalOpen = false"
    />
  </div>
</template>
