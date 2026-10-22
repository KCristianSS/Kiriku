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
  Building2,
  Sparkles,
  ArrowRight,
  Filter,
  CheckCircle2,
  HeartHandshake,
  Layers,
} from 'lucide-vue-next';

const router = useRouter();
const projectsStore = useProjectsStore();

const searchQuery = ref('');
const locationFilter = ref('');
const modalProject = ref<Proyecto | null>(null);
const isModalOpen = ref(false);

onMounted(async () => {
  await projectsStore.fetchProjects('aprobado');
  await projectsStore.fetchOrganizations();
});

// Filter approved projects
const filteredProjects = computed(() => {
  return projectsStore.projects.filter((p) => {
    if (p.estado !== 'aprobado') return false;

    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase();
      const matchTitle = p.titulo.toLowerCase().includes(q);
      const matchDesc = p.descripcion.toLowerCase().includes(q);
      const matchOrg = p.organizacion?.nombre.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc && !matchOrg) return false;
    }

    if (locationFilter.value && p.ubicacion !== locationFilter.value) {
      return false;
    }

    return true;
  });
});

// Unique locations from projects
const uniqueLocations = computed(() => {
  const locs = new Set<string>();
  projectsStore.projects.forEach((p) => {
    if (p.ubicacion) locs.add(p.ubicacion);
  });
  return Array.from(locs);
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

          <h1 class="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-stone-900 tracking-tight leading-tight mb-4">
            Transforma vidas con <span class="text-[#289EAB]">Kirikú</span>
          </h1>

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
      <div class="bg-white rounded-2xl border border-stone-200 p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <!-- Search Input -->
        <div class="relative w-full sm:flex-1">
          <Search class="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Buscar proyectos por título o descripción..."
            class="w-full pl-10 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs sm:text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#289EAB] focus:bg-white transition-all"
          />
        </div>

        <!-- Location Filter -->
        <div class="w-full sm:w-auto flex items-center gap-2">
          <div class="relative w-full sm:w-48">
            <MapPin class="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <select
              v-model="locationFilter"
              class="w-full pl-8 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs sm:text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-[#289EAB] cursor-pointer"
            >
              <option value="">Todas las ubicaciones</option>
              <option v-for="loc in uniqueLocations" :key="loc" :value="loc">
                {{ loc }}
              </option>
            </select>
          </div>
        </div>
      </div>

      <!-- Projects Grid from Real Supabase Data -->
      <div v-if="projectsStore.loading" class="py-16 text-center">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-stone-200 border-t-[#289EAB] mb-3"></div>
        <p class="text-sm text-stone-500 font-medium">Cargando proyectos desde Supabase...</p>
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
