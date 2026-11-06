<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '../../api/client';
import type { PostulanteBancoItem, PostulanteMetricasResumen, Proyecto, EtapaEstado } from '../../types';
import {
  Users,
  Search,
  Filter,
  ArrowLeft,
  RefreshCw,
  Eye,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  Briefcase,
  GraduationCap,
  Calendar,
  MapPin,
  Mail,
  Phone,
  Sparkles,
  LayoutGrid,
  List,
  Check,
  Copy,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  UserCheck,
} from 'lucide-vue-next';

// State
const applicants = ref<PostulanteBancoItem[]>([]);
const metrics = ref<PostulanteMetricasResumen | null>(null);
const projects = ref<Proyecto[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const copiedNotice = ref<string | null>(null);

// Filters
const searchQuery = ref('');
const selectedProfession = ref('todas');
const selectedStatus = ref('todos');
const selectedProject = ref('todos');
const selectedSort = ref<'recientes' | 'nombre_asc' | 'avance_desc' | 'avance_asc'>('recientes');
const viewMode = ref<'grid' | 'table'>('grid');

// Profile & Avance Parcial Modal
const selectedApplicant = ref<PostulanteBancoItem | null>(null);
const fullProfileData = ref<any | null>(null);
const loadingProfile = ref(false);
const activeProfileTab = ref<'evaluacion' | 'personal' | 'historial'>('evaluacion');

// Stage evaluation quick update state
const isUpdatingStage = ref(false);
const stageSuccessNotice = ref<string | null>(null);

const etapaLabels: Record<string, { label: string; desc: string }> = {
  inicial: {
    label: '1. Verificación Inicial',
    desc: 'Revisión de requisitos legales, CI y mayoría de edad',
  },
  tecnica: {
    label: '2. Evaluación Técnica',
    desc: 'Aptitud de habilidades específicas para el proyecto',
  },
  personal: {
    label: '3. Entrevista Personal',
    desc: 'Compromiso social, disponibilidad y motivación',
  },
  competencias: {
    label: '4. Dinámica Grupal',
    desc: 'Trabajo en equipo, liderazgo y resolución de problemas',
  },
  salud_fisica_psicologica: {
    label: '5. Aptitud Psicológica & Salud',
    desc: 'Certificación médica y validación para trabajo en campo',
  },
};

async function loadData() {
  loading.value = true;
  error.value = null;
  try {
    const [appsData, metricsData, projsData] = await Promise.all([
      api.getApplicantsPool({
        q: searchQuery.value || undefined,
        profesion: selectedProfession.value !== 'todas' ? selectedProfession.value : undefined,
        estado: selectedStatus.value !== 'todos' ? selectedStatus.value : undefined,
        proyecto_id: selectedProject.value !== 'todos' ? selectedProject.value : undefined,
        ordenar: selectedSort.value,
      }),
      api.getPostulantesMetricas().catch(() => null),
      api.getProyectos({ estado: 'aprobado' }).catch(() => []),
    ]);

    applicants.value = appsData;
    metrics.value = metricsData;
    projects.value = projsData;
  } catch (err: any) {
    error.value = err?.response?.data?.error || 'No se pudo cargar la información del banco de postulantes.';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadData();
});

// Dynamic filtered applicants (client-side fallback + server results)
const filteredApplicants = computed(() => {
  return applicants.value;
});

// Unique professions list for filter
const availableProfessions = computed(() => {
  if (metrics.value?.profesiones && metrics.value.profesiones.length > 0) {
    return metrics.value.profesiones;
  }
  const set = new Set<string>();
  applicants.value.forEach((a) => {
    if (a.profesion_ocupacion?.trim()) {
      set.add(a.profesion_ocupacion.trim());
    }
  });
  return Array.from(set).sort();
});

// Helper for skill badges
function parseSkills(skillsString?: string | null): string[] {
  if (!skillsString) return [];
  return skillsString
    .split(/[,;\n•]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
}

// Stage badge formatting
function getStageBadgeClass(estado: EtapaEstado | string) {
  switch (estado) {
    case 'aprobado':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'en_revision':
    case 'en_curso':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'rechazado':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'observado':
      return 'bg-orange-50 text-orange-700 border-orange-200';
    default:
      return 'bg-stone-50 text-stone-600 border-stone-200';
  }
}

function getStatusBadgeClass(estado?: string) {
  switch (estado) {
    case 'aprobado':
      return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    case 'en_proceso':
      return 'bg-sky-100 text-sky-800 border-sky-300';
    case 'rechazado':
      return 'bg-rose-100 text-rose-800 border-rose-300';
    case 'reasignacion':
      return 'bg-purple-100 text-purple-800 border-purple-300';
    default:
      return 'bg-stone-100 text-stone-700 border-stone-200';
  }
}

function getStatusLabel(estado?: string) {
  switch (estado) {
    case 'aprobado':
      return 'Aprobado / Apto';
    case 'en_proceso':
      return 'En Evaluación';
    case 'rechazado':
      return 'No Calificado';
    case 'reasignacion':
      return 'En Reasignación';
    case 'sin_postulacion':
      return 'Sin Proyecto Asignado';
    default:
      return estado || 'Registrado';
  }
}

function copyToClipboard(text: string, type: string) {
  navigator.clipboard.writeText(text);
  copiedNotice.value = `¡${type} copiado al portapapeles!`;
  setTimeout(() => {
    copiedNotice.value = null;
  }, 2500);
}

// Open Detail Dossier Modal
async function openProfileModal(applicant: PostulanteBancoItem) {
  selectedApplicant.value = applicant;
  activeProfileTab.value = 'evaluacion';
  loadingProfile.value = true;
  fullProfileData.value = null;
  try {
    const data = await api.getPostulantePerfil(applicant.id);
    fullProfileData.value = data;
  } catch (err) {
    console.error('Error fetching deep profile:', err);
    fullProfileData.value = applicant;
  } finally {
    loadingProfile.value = false;
  }
}

function closeProfileModal() {
  selectedApplicant.value = null;
  fullProfileData.value = null;
}

// Quick stage approval or status change from modal
async function handleQuickStageUpdate(stageId: number | string, nuevoEstado: 'aprobado' | 'en_curso' | 'rechazada') {
  isUpdatingStage.value = true;
  stageSuccessNotice.value = null;
  try {
    await api.updateEvaluationStage(stageId, {
      estado: nuevoEstado,
      comentarios: `Etapa calificada desde el Banco de Postulantes por el comité revisor.`,
      evaluador: 'Comité Central Kirikú',
    });

    stageSuccessNotice.value = 'Etapa actualizada exitosamente.';
    // Reload applicant detail
    if (selectedApplicant.value) {
      const refreshed = await api.getPostulantePerfil(selectedApplicant.value.id);
      fullProfileData.value = refreshed;
    }
    // Reload list in background
    loadData();
    setTimeout(() => {
      stageSuccessNotice.value = null;
    }, 3000);
  } catch (err: any) {
    alert(err?.response?.data?.error || 'No se pudo actualizar la etapa de evaluación');
  } finally {
    isUpdatingStage.value = false;
  }
}

function resetFilters() {
  searchQuery.value = '';
  selectedProfession.value = 'todas';
  selectedStatus.value = 'todos';
  selectedProject.value = 'todos';
  selectedSort.value = 'recientes';
  loadData();
}
</script>

<template>
  <div class="min-h-screen bg-stone-50 py-8 px-4 sm:px-6 lg:px-8">
    <div class="max-w-7xl mx-auto space-y-6">
      
      <!-- Top Breadcrumbs & Header -->
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-stone-200 pb-5">
        <div>
          <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#289EAB] mb-1">
            <Users class="w-4 h-4" />
            <span>Módulo Kirikú • KIR-18 (Épica KIR-2)</span>
          </div>
          <h1 class="text-3xl font-extrabold text-stone-900 tracking-tight">
            Banco de Postulantes por Perfil
          </h1>
          <p class="text-stone-600 text-sm mt-1">
            Gestión integral de voluntarios postulantes, consulta filtrada por competencias y seguimiento del avance parcial de evaluación.
          </p>
        </div>

        <div class="flex items-center gap-3">
          <router-link
            to="/admin"
            class="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-stone-700 bg-white border border-stone-300 rounded-xl hover:bg-stone-100 transition-colors shadow-xs"
          >
            <ArrowLeft class="w-4 h-4" />
            Panel General
          </router-link>

          <button
            @click="loadData"
            :disabled="loading"
            class="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#0D9488] hover:bg-[#0F766E] rounded-xl transition-all shadow-xs disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      <!-- Quick Metrics Ribbon (KIR-94 & KIR-96) -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <!-- Total -->
        <div class="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs flex items-center gap-3.5">
          <div class="w-11 h-11 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
            <Users class="w-6 h-6" />
          </div>
          <div>
            <div class="text-2xl font-bold text-stone-900 leading-none">
              {{ metrics?.totalPostulantes ?? applicants.length }}
            </div>
            <div class="text-xs text-stone-500 font-medium mt-1">Total en Banco</div>
          </div>
        </div>

        <!-- En Proceso -->
        <div class="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs flex items-center gap-3.5">
          <div class="w-11 h-11 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
            <Clock class="w-6 h-6" />
          </div>
          <div>
            <div class="text-2xl font-bold text-sky-900 leading-none">
              {{ metrics?.enProceso ?? applicants.filter(a => a.estado_general === 'en_proceso').length }}
            </div>
            <div class="text-xs text-stone-500 font-medium mt-1">En Evaluación</div>
          </div>
        </div>

        <!-- Aprobados / Aptos -->
        <div class="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs flex items-center gap-3.5">
          <div class="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <UserCheck class="w-6 h-6" />
          </div>
          <div>
            <div class="text-2xl font-bold text-emerald-900 leading-none">
              {{ metrics?.aprobados ?? applicants.filter(a => a.estado_general === 'aprobado').length }}
            </div>
            <div class="text-xs text-stone-500 font-medium mt-1">Aptos / Aprobados</div>
          </div>
        </div>

        <!-- En Reasignación -->
        <div class="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs flex items-center gap-3.5">
          <div class="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <Sparkles class="w-6 h-6" />
          </div>
          <div>
            <div class="text-2xl font-bold text-purple-900 leading-none">
              {{ metrics?.reasignaciones ?? applicants.filter(a => a.es_reasignacion).length }}
            </div>
            <div class="text-xs text-stone-500 font-medium mt-1">En Reasignación</div>
          </div>
        </div>

        <!-- Promedio de Avance -->
        <div class="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs flex items-center gap-3.5 col-span-2 sm:col-span-1">
          <div class="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <ShieldCheck class="w-6 h-6" />
          </div>
          <div class="w-full">
            <div class="flex items-baseline justify-between">
              <span class="text-2xl font-bold text-amber-900 leading-none">
                {{ metrics?.promedioAvance ?? 35 }}%
              </span>
              <span class="text-[10px] text-amber-700 font-semibold uppercase">Promedio</span>
            </div>
            <div class="text-xs text-stone-500 font-medium mt-1">Avance de Etapas</div>
          </div>
        </div>
      </div>

      <!-- Feedback Banner (Copied Notice) -->
      <div
        v-if="copiedNotice"
        class="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 shadow-xs transition-all animate-fade-in"
      >
        <Check class="w-4 h-4 text-emerald-600" />
        <span>{{ copiedNotice }}</span>
      </div>

      <!-- Search & Filters Toolbar (KIR-95) -->
      <div class="bg-white rounded-2xl border border-stone-200/90 p-4 sm:p-5 shadow-xs space-y-4">
        <div class="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
          
          <!-- Search input -->
          <div class="relative flex-1">
            <Search class="w-5 h-5 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              v-model="searchQuery"
              @input="loadData"
              type="text"
              placeholder="Buscar por nombre, CI, profesión, habilidades o correo..."
              class="w-full pl-11 pr-4 py-2.5 text-sm bg-stone-50/70 border border-stone-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0D9488] focus:border-transparent transition-all placeholder:text-stone-400"
            />
            <button
              v-if="searchQuery"
              @click="searchQuery = ''; loadData()"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 text-xs px-1.5 py-0.5 rounded-md hover:bg-stone-200 transition-colors"
            >
              Limpiar
            </button>
          </div>

          <!-- Secondary Filters Row -->
          <div class="flex flex-wrap sm:flex-nowrap items-center gap-2.5">
            <!-- Filter by Status -->
            <div class="w-full sm:w-auto">
              <select
                v-model="selectedStatus"
                @change="loadData"
                class="w-full sm:w-44 text-sm bg-stone-50/70 border border-stone-300 rounded-xl px-3 py-2.5 text-stone-700 font-medium focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
              >
                <option value="todos">Todos los Estados</option>
                <option value="en_proceso">En Evaluación</option>
                <option value="aprobado">Aprobado / Apto</option>
                <option value="reasignacion">En Reasignación</option>
                <option value="rechazado">No Calificado</option>
                <option value="sin_postulacion">Sin Postulación</option>
              </select>
            </div>

            <!-- Filter by Project -->
            <div class="w-full sm:w-auto">
              <select
                v-model="selectedProject"
                @change="loadData"
                class="w-full sm:w-48 text-sm bg-stone-50/70 border border-stone-300 rounded-xl px-3 py-2.5 text-stone-700 font-medium focus:outline-none focus:ring-2 focus:ring-[#0D9488] truncate"
              >
                <option value="todos">Todos los Proyectos</option>
                <option v-for="p in projects" :key="p.id" :value="p.id">
                  {{ p.titulo }}
                </option>
              </select>
            </div>

            <!-- Sort By -->
            <div class="w-full sm:w-auto">
              <select
                v-model="selectedSort"
                @change="loadData"
                class="w-full sm:w-44 text-sm bg-stone-50/70 border border-stone-300 rounded-xl px-3 py-2.5 text-stone-700 font-medium focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
              >
                <option value="recientes">Más Recientes</option>
                <option value="nombre_asc">Nombre (A - Z)</option>
                <option value="avance_desc">Mayor Avance (%)</option>
                <option value="avance_asc">Menor Avance (%)</option>
              </select>
            </div>

            <!-- View Mode Switcher -->
            <div class="hidden sm:flex items-center border border-stone-200 rounded-xl p-1 bg-stone-100">
              <button
                @click="viewMode = 'grid'"
                :class="viewMode === 'grid' ? 'bg-white shadow-xs text-stone-900' : 'text-stone-500 hover:text-stone-800'"
                class="p-1.5 rounded-lg transition-all"
                title="Vista en Cuadrícula"
              >
                <LayoutGrid class="w-4 h-4" />
              </button>
              <button
                @click="viewMode = 'table'"
                :class="viewMode === 'table' ? 'bg-white shadow-xs text-stone-900' : 'text-stone-500 hover:text-stone-800'"
                class="p-1.5 rounded-lg transition-all"
                title="Vista en Lista"
              >
                <List class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <!-- Filter by Profession Chips -->
        <div v-if="availableProfessions.length > 0" class="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs pt-2 border-t border-stone-100">
          <span class="text-stone-400 font-semibold shrink-0 mr-1 flex items-center gap-1">
            <Filter class="w-3.5 h-3.5" /> Profesión:
          </span>
          <button
            @click="selectedProfession = 'todas'; loadData()"
            :class="selectedProfession === 'todas' ? 'bg-[#0D9488] text-white font-semibold' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'"
            class="px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            Todas ({{ applicants.length }})
          </button>
          <button
            v-for="prof in availableProfessions"
            :key="prof"
            @click="selectedProfession = prof; loadData()"
            :class="selectedProfession === prof ? 'bg-[#0D9488] text-white font-semibold' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'"
            class="px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            {{ prof }}
          </button>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="py-20 text-center bg-white rounded-2xl border border-stone-200 shadow-xs">
        <RefreshCw class="w-8 h-8 text-[#0D9488] animate-spin mx-auto mb-3" />
        <h3 class="text-base font-semibold text-stone-800">Consultando Banco de Postulantes...</h3>
        <p class="text-xs text-stone-500 mt-1">Cargando perfiles, etapas y avance parcial</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="bg-rose-50 border border-rose-200 text-rose-800 p-6 rounded-2xl text-center space-y-3">
        <AlertTriangle class="w-8 h-8 text-rose-500 mx-auto" />
        <p class="font-medium text-sm">{{ error }}</p>
        <button
          @click="loadData"
          class="px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-semibold hover:bg-rose-700 transition-colors"
        >
          Reintentar consulta
        </button>
      </div>

      <!-- Empty State -->
      <div v-else-if="filteredApplicants.length === 0" class="bg-white rounded-2xl border border-stone-200 p-12 text-center shadow-xs">
        <div class="w-14 h-14 bg-stone-100 text-stone-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Users class="w-7 h-7" />
        </div>
        <h3 class="text-lg font-bold text-stone-800 mb-1">No se encontraron postulantes</h3>
        <p class="text-sm text-stone-500 max-w-md mx-auto mb-5">
          No hay registros que coincidan con los filtros aplicados (búsqueda, profesión, proyecto o estado).
        </p>
        <button
          @click="resetFilters"
          class="px-4 py-2 text-sm font-semibold text-[#0D9488] bg-teal-50 hover:bg-teal-100 rounded-xl transition-colors cursor-pointer"
        >
          Restablecer todos los filtros
        </button>
      </div>

      <!-- Main Content: GRID VIEW (KIR-94 & KIR-96) -->
      <div v-else-if="viewMode === 'grid'" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        <div
          v-for="applicant in filteredApplicants"
          :key="applicant.id"
          class="bg-white rounded-2xl border border-stone-200/90 hover:border-teal-300 hover:shadow-md transition-all p-5 flex flex-col justify-between group"
        >
          <div class="space-y-4">
            
            <!-- Card Header: Avatar, Name & General Status -->
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-center gap-3">
                <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white font-bold flex items-center justify-center text-base shadow-xs shrink-0">
                  {{ applicant.nombres.charAt(0) }}{{ applicant.apellidos.charAt(0) }}
                </div>
                <div>
                  <h3 class="text-base font-bold text-stone-900 group-hover:text-teal-700 transition-colors leading-tight">
                    {{ applicant.nombres }} {{ applicant.apellidos }}
                  </h3>
                  <div class="flex items-center gap-2 mt-1">
                    <span class="text-xs font-mono text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded">
                      CI: {{ applicant.ci }}
                    </span>
                    <span
                      class="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                      :class="applicant.es_mayor_edad ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'"
                    >
                      {{ applicant.edad }} años
                    </span>
                  </div>
                </div>
              </div>

              <!-- Status Badge -->
              <span
                class="text-xs font-semibold px-2.5 py-1 rounded-full border shrink-0"
                :class="getStatusBadgeClass(applicant.estado_general)"
              >
                {{ getStatusLabel(applicant.estado_general) }}
              </span>
            </div>

            <!-- Profession & Skills -->
            <div class="space-y-2 pt-1 border-t border-stone-100">
              <div class="flex items-center gap-2 text-xs text-stone-700 font-medium">
                <Briefcase class="w-3.5 h-3.5 text-stone-400 shrink-0" />
                <span class="truncate">{{ applicant.profesion_ocupacion || 'Profesión no especificada' }}</span>
              </div>

              <!-- Skills tags -->
              <div v-if="parseSkills(applicant.habilidades).length > 0" class="flex flex-wrap gap-1.5 pt-1">
                <span
                  v-for="(skill, idx) in parseSkills(applicant.habilidades).slice(0, 3)"
                  :key="idx"
                  class="text-[11px] bg-teal-50 text-teal-800 px-2 py-0.5 rounded-md font-medium"
                >
                  {{ skill }}
                </span>
                <span
                  v-if="parseSkills(applicant.habilidades).length > 3"
                  class="text-[11px] bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded-md"
                >
                  +{{ parseSkills(applicant.habilidades).length - 3 }}
                </span>
              </div>
            </div>

            <!-- Project Affiliation -->
            <div class="bg-stone-50/80 rounded-xl p-3 border border-stone-100 space-y-1">
              <div class="text-[11px] font-semibold text-stone-400 uppercase tracking-wider">
                Proyecto Postulado
              </div>
              <div class="text-xs font-bold text-stone-800 line-clamp-1">
                {{ applicant.proyecto_titulo || 'Sin proyecto asignado' }}
              </div>
              <div v-if="applicant.proyecto_ubicacion" class="flex items-center gap-1 text-[11px] text-stone-500">
                <MapPin class="w-3 h-3 text-stone-400" />
                <span class="truncate">{{ applicant.proyecto_ubicacion }}</span>
              </div>
            </div>

            <!-- AVANCE PARCIAL DE LAS 5 ETAPAS (KIR-96) -->
            <div class="space-y-2 pt-1">
              <div class="flex items-center justify-between text-xs font-semibold">
                <span class="text-stone-600 flex items-center gap-1">
                  <ShieldCheck class="w-3.5 h-3.5 text-teal-600" /> Avance de Evaluación
                </span>
                <span class="text-teal-700 font-bold">
                  {{ applicant.porcentaje_avance }}% ({{ applicant.etapas_aprobadas }}/5 etapas)
                </span>
              </div>

              <!-- Progress bar -->
              <div class="w-full h-2 bg-stone-100 rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-500"
                  :class="applicant.porcentaje_avance === 100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-teal-500 to-emerald-500'"
                  :style="{ width: `${applicant.porcentaje_avance}%` }"
                ></div>
              </div>

              <!-- 5-Stage Stepper Pills -->
              <div class="grid grid-cols-5 gap-1 pt-1">
                <div
                  v-for="(stage, idx) in applicant.etapas"
                  :key="stage.id || idx"
                  class="text-center py-1 rounded text-[10px] font-bold border transition-colors"
                  :class="getStageBadgeClass(stage.estado)"
                  :title="`${etapaLabels[stage.etapa]?.label || stage.etapa}: ${stage.estado}`"
                >
                  E{{ idx + 1 }}
                </div>
                <!-- Fill empty stages if not yet initiated -->
                <div
                  v-for="idx in Math.max(0, 5 - applicant.etapas.length)"
                  :key="'empty-' + idx"
                  class="text-center py-1 rounded text-[10px] font-semibold bg-stone-100 text-stone-400 border border-stone-200"
                >
                  -
                </div>
              </div>
            </div>

          </div>

          <!-- Card Footer Action -->
          <div class="pt-4 mt-4 border-t border-stone-100 flex items-center justify-between">
            <div class="flex items-center gap-2 text-stone-400">
              <button
                @click="copyToClipboard(applicant.email, 'Correo')"
                title="Copiar Correo"
                class="p-1.5 rounded-lg hover:bg-stone-100 hover:text-stone-700 transition-colors"
              >
                <Mail class="w-4 h-4" />
              </button>
              <button
                v-if="applicant.telefono"
                @click="copyToClipboard(applicant.telefono, 'Teléfono')"
                title="Copiar Teléfono"
                class="p-1.5 rounded-lg hover:bg-stone-100 hover:text-stone-700 transition-colors"
              >
                <Phone class="w-4 h-4" />
              </button>
            </div>

            <button
              @click="openProfileModal(applicant)"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-xl transition-colors cursor-pointer group-hover:bg-[#0D9488] group-hover:text-white"
            >
              <span>Ver Perfil & Avance</span>
              <ChevronRight class="w-3.5 h-3.5" />
            </button>
          </div>

        </div>
      </div>

      <!-- Main Content: TABLE VIEW (KIR-95 & KIR-96) -->
      <div v-else class="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm text-stone-600">
            <thead class="bg-stone-50 border-b border-stone-200 text-xs uppercase font-semibold text-stone-500">
              <tr>
                <th class="px-5 py-3.5">Postulante</th>
                <th class="px-4 py-3.5">Profesión / Ocupación</th>
                <th class="px-4 py-3.5">Proyecto Asignado</th>
                <th class="px-4 py-3.5">Estado</th>
                <th class="px-4 py-3.5">Avance Parcial (5 Etapas)</th>
                <th class="px-5 py-3.5 text-right">Acción</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-stone-100">
              <tr
                v-for="applicant in filteredApplicants"
                :key="applicant.id"
                class="hover:bg-stone-50/70 transition-colors"
              >
                <!-- Postulante -->
                <td class="px-5 py-4">
                  <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-lg bg-teal-600 text-white font-bold flex items-center justify-center text-xs shrink-0">
                      {{ applicant.nombres.charAt(0) }}{{ applicant.apellidos.charAt(0) }}
                    </div>
                    <div>
                      <div class="font-bold text-stone-900 leading-tight">
                        {{ applicant.nombres }} {{ applicant.apellidos }}
                      </div>
                      <div class="text-xs text-stone-500 mt-0.5">
                        CI: {{ applicant.ci }} • {{ applicant.edad }} años
                      </div>
                    </div>
                  </div>
                </td>

                <!-- Profesión -->
                <td class="px-4 py-4">
                  <div class="text-stone-800 font-medium text-xs">
                    {{ applicant.profesion_ocupacion || 'No especificada' }}
                  </div>
                  <div class="text-[11px] text-stone-400 truncate max-w-xs">
                    {{ applicant.habilidades || '-' }}
                  </div>
                </td>

                <!-- Proyecto -->
                <td class="px-4 py-4">
                  <div class="text-xs font-semibold text-stone-800 max-w-xs truncate">
                    {{ applicant.proyecto_titulo || 'Sin proyecto' }}
                  </div>
                  <div class="text-[11px] text-stone-500">
                    {{ applicant.organizacion_nombre || applicant.proyecto_ubicacion || '-' }}
                  </div>
                </td>

                <!-- Estado -->
                <td class="px-4 py-4">
                  <span
                    class="text-xs font-semibold px-2.5 py-0.5 rounded-full border inline-block"
                    :class="getStatusBadgeClass(applicant.estado_general)"
                  >
                    {{ getStatusLabel(applicant.estado_general) }}
                  </span>
                </td>

                <!-- Avance Parcial -->
                <td class="px-4 py-4">
                  <div class="space-y-1.5 w-44">
                    <div class="flex justify-between text-xs font-bold text-stone-700">
                      <span>{{ applicant.porcentaje_avance }}%</span>
                      <span class="text-stone-400 font-normal">{{ applicant.etapas_aprobadas }}/5 etapas</span>
                    </div>
                    <div class="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden">
                      <div
                        class="h-full bg-teal-600 rounded-full"
                        :style="{ width: `${applicant.porcentaje_avance}%` }"
                      ></div>
                    </div>
                  </div>
                </td>

                <!-- Acción -->
                <td class="px-5 py-4 text-right">
                  <button
                    @click="openProfileModal(applicant)"
                    class="px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-xl transition-colors cursor-pointer"
                  >
                    Ver Perfil
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- MODAL DE DETALLE DE PERFIL Y AVANCE PARCIAL (KIR-96) -->
      <div
        v-if="selectedApplicant"
        class="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
        @click.self="closeProfileModal"
      >
        <div class="bg-white rounded-3xl max-w-3xl w-full shadow-2xl border border-stone-200 overflow-hidden my-auto max-h-[90vh] flex flex-col">
          
          <!-- Modal Header -->
          <div class="bg-gradient-to-r from-stone-900 to-stone-800 text-white p-6 relative">
            <button
              @click="closeProfileModal"
              class="absolute top-5 right-5 text-stone-400 hover:text-white p-1.5 rounded-xl hover:bg-stone-700/50 transition-colors"
            >
              ✕
            </button>

            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div class="flex items-center gap-4">
                <div class="w-16 h-16 rounded-2xl bg-gradient-to-tr from-teal-400 to-emerald-400 text-stone-900 font-extrabold flex items-center justify-center text-2xl shadow-md shrink-0">
                  {{ selectedApplicant.nombres.charAt(0) }}{{ selectedApplicant.apellidos.charAt(0) }}
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-400/20 text-teal-300 border border-teal-400/30">
                      Postulante Kirikú
                    </span>
                    <span class="text-xs text-stone-400">CI: {{ selectedApplicant.ci }}</span>
                  </div>
                  <h2 class="text-2xl font-bold text-white mt-1">
                    {{ selectedApplicant.nombres }} {{ selectedApplicant.apellidos }}
                  </h2>
                  <div class="text-xs text-stone-300 mt-0.5 flex items-center gap-2">
                    <span>{{ selectedApplicant.profesion_ocupacion || 'Voluntario' }}</span>
                    <span>•</span>
                    <span>{{ selectedApplicant.edad }} años ({{ selectedApplicant.es_mayor_edad ? '+18 Mayor de edad' : 'Menor de edad' }})</span>
                  </div>
                </div>
              </div>

              <!-- Quick Status in Modal Header -->
              <div class="text-right sm:self-center">
                <div class="text-xs text-stone-400">Avance de Admisión</div>
                <div class="text-2xl font-black text-teal-400">
                  {{ selectedApplicant.porcentaje_avance }}%
                </div>
                <div class="text-[11px] text-stone-300">
                  {{ selectedApplicant.etapas_aprobadas }} de 5 etapas aprobadas
                </div>
              </div>
            </div>

            <!-- Tabs in Modal -->
            <div class="flex items-center gap-2 mt-6 border-t border-stone-700/70 pt-3">
              <button
                @click="activeProfileTab = 'evaluacion'"
                :class="activeProfileTab === 'evaluacion' ? 'bg-white/10 text-white font-semibold' : 'text-stone-400 hover:text-stone-200'"
                class="px-3.5 py-1.5 rounded-xl text-xs transition-colors cursor-pointer"
              >
                1. Avance Parcial (5 Etapas)
              </button>
              <button
                @click="activeProfileTab = 'personal'"
                :class="activeProfileTab === 'personal' ? 'bg-white/10 text-white font-semibold' : 'text-stone-400 hover:text-stone-200'"
                class="px-3.5 py-1.5 rounded-xl text-xs transition-colors cursor-pointer"
              >
                2. Perfil y Competencias
              </button>
              <button
                @click="activeProfileTab = 'historial'"
                :class="activeProfileTab === 'historial' ? 'bg-white/10 text-white font-semibold' : 'text-stone-400 hover:text-stone-200'"
                class="px-3.5 py-1.5 rounded-xl text-xs transition-colors cursor-pointer"
              >
                3. Proyectos & Historial
              </button>
            </div>
          </div>

          <!-- Modal Body (Scrollable) -->
          <div class="p-6 overflow-y-auto space-y-6 flex-1">
            
            <!-- Update Stage Banner Notification -->
            <div
              v-if="stageSuccessNotice"
              class="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl text-xs font-semibold flex items-center gap-2"
            >
              <CheckCircle2 class="w-4 h-4 text-emerald-600" />
              <span>{{ stageSuccessNotice }}</span>
            </div>

            <!-- TAB 1: AVANCE PARCIAL (5 ETAPAS) -->
            <div v-if="activeProfileTab === 'evaluacion'" class="space-y-4">
              <div class="flex items-center justify-between pb-2 border-b border-stone-200">
                <div>
                  <h4 class="text-sm font-bold text-stone-900">
                    Proceso de Evaluación en 5 Etapas Secuenciales
                  </h4>
                  <p class="text-xs text-stone-500">
                    Supervisión y auditoría del avance de postulación para el proyecto actual.
                  </p>
                </div>
                <div class="text-xs font-bold text-stone-600 bg-stone-100 px-2.5 py-1 rounded-lg">
                  Estado: {{ getStatusLabel(selectedApplicant.estado_general) }}
                </div>
              </div>

              <!-- Stages List -->
              <div class="space-y-3">
                <div
                  v-for="(stage, idx) in selectedApplicant.etapas"
                  :key="stage.id || idx"
                  class="p-4 rounded-2xl border transition-all"
                  :class="stage.estado === 'aprobado' ? 'bg-emerald-50/40 border-emerald-200' : 'bg-white border-stone-200'"
                >
                  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div class="flex items-center gap-3">
                      <div
                        class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                        :class="stage.estado === 'aprobado' ? 'bg-emerald-600 text-white' : 'bg-stone-200 text-stone-700'"
                      >
                        {{ idx + 1 }}
                      </div>
                      <div>
                        <div class="text-sm font-bold text-stone-900">
                          {{ etapaLabels[stage.etapa]?.label || stage.etapa }}
                        </div>
                        <div class="text-xs text-stone-500">
                          {{ etapaLabels[stage.etapa]?.desc }}
                        </div>
                      </div>
                    </div>

                    <div class="flex items-center gap-2">
                      <span
                        class="text-xs font-semibold px-2.5 py-0.5 rounded-full border"
                        :class="getStageBadgeClass(stage.estado)"
                      >
                        {{ stage.estado.toUpperCase() }}
                      </span>

                      <!-- Quick action to mark as approved if pending -->
                      <button
                        v-if="stage.estado !== 'aprobado'"
                        @click="handleQuickStageUpdate(stage.id, 'aprobado')"
                        :disabled="isUpdatingStage"
                        class="text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                        title="Aprobar esta etapa"
                      >
                        Aprobar
                      </button>
                    </div>
                  </div>

                  <!-- Evaluator & Comments -->
                  <div class="mt-3 pt-3 border-t border-stone-100/80 text-xs grid grid-cols-1 sm:grid-cols-2 gap-2 text-stone-600">
                    <div>
                      <span class="font-semibold text-stone-500">Evaluador:</span>
                      <span class="ml-1 text-stone-800">{{ stage.evaluador || 'Asignado automáticamente' }}</span>
                    </div>
                    <div>
                      <span class="font-semibold text-stone-500">Fecha:</span>
                      <span class="ml-1 text-stone-800">
                        {{ stage.fecha_evaluacion ? new Date(stage.fecha_evaluacion).toLocaleDateString() : 'Pendiente' }}
                      </span>
                    </div>
                    <div v-if="stage.comentarios" class="sm:col-span-2 bg-stone-50 p-2.5 rounded-xl border border-stone-100 text-stone-700 mt-1">
                      <span class="font-semibold text-stone-500">Observaciones:</span> {{ stage.comentarios }}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- TAB 2: PERFIL Y COMPETENCIAS (KIR-94) -->
            <div v-else-if="activeProfileTab === 'personal'" class="space-y-5">
              
              <!-- Personal Details Grid -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-stone-50 p-4 rounded-2xl border border-stone-200">
                <div>
                  <div class="text-xs text-stone-500 font-semibold">Correo Electrónico</div>
                  <div class="text-sm font-bold text-stone-800 flex items-center gap-1.5 mt-0.5">
                    <span>{{ selectedApplicant.email }}</span>
                    <button
                      @click="copyToClipboard(selectedApplicant.email, 'Correo')"
                      class="text-stone-400 hover:text-stone-700"
                    >
                      <Copy class="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <div class="text-xs text-stone-500 font-semibold">Teléfono / WhatsApp</div>
                  <div class="text-sm font-bold text-stone-800 flex items-center gap-1.5 mt-0.5">
                    <span>{{ selectedApplicant.telefono || 'No registrado' }}</span>
                    <button
                      v-if="selectedApplicant.telefono"
                      @click="copyToClipboard(selectedApplicant.telefono, 'Teléfono')"
                      class="text-stone-400 hover:text-stone-700"
                    >
                      <Copy class="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <div class="text-xs text-stone-500 font-semibold">Cédula de Identidad</div>
                  <div class="text-sm font-bold text-stone-800 mt-0.5">
                    {{ selectedApplicant.ci }}
                  </div>
                </div>

                <div>
                  <div class="text-xs text-stone-500 font-semibold">Fecha de Nacimiento</div>
                  <div class="text-sm font-bold text-stone-800 mt-0.5">
                    {{ new Date(selectedApplicant.fecha_nacimiento).toLocaleDateString() }} ({{ selectedApplicant.edad }} años)
                  </div>
                </div>
              </div>

              <!-- Skills & Habilidades -->
              <div class="space-y-2">
                <h4 class="text-sm font-bold text-stone-900 flex items-center gap-1.5">
                  <Sparkles class="w-4 h-4 text-teal-600" /> Competencias & Habilidades Registradas
                </h4>
                <div v-if="parseSkills(selectedApplicant.habilidades).length > 0" class="flex flex-wrap gap-2">
                  <span
                    v-for="(skill, idx) in parseSkills(selectedApplicant.habilidades)"
                    :key="idx"
                    class="px-3 py-1 bg-teal-50 text-teal-800 text-xs font-medium rounded-xl border border-teal-200"
                  >
                    {{ skill }}
                  </span>
                </div>
                <p v-else class="text-xs text-stone-500 italic">No se registraron habilidades específicas.</p>
              </div>

              <!-- Motivation Statement -->
              <div class="space-y-2">
                <h4 class="text-sm font-bold text-stone-900">
                  Carta de Motivación & Compromiso
                </h4>
                <div class="bg-stone-50 p-4 rounded-2xl border border-stone-200 text-stone-700 text-sm leading-relaxed">
                  {{ selectedApplicant.motivacion || 'El voluntario no incluyó una carta de motivación específica.' }}
                </div>
              </div>
            </div>

            <!-- TAB 3: PROYECTOS & HISTORIAL (KIR-96) -->
            <div v-else-if="activeProfileTab === 'historial'" class="space-y-4">
              <h4 class="text-sm font-bold text-stone-900">
                Historial de Postulaciones en la Plataforma Kirikú
              </h4>

              <div
                v-if="fullProfileData?.postulaciones && fullProfileData.postulaciones.length > 0"
                class="space-y-3"
              >
                <div
                  v-for="post in fullProfileData.postulaciones"
                  :key="post.id"
                  class="p-4 rounded-2xl border border-stone-200 bg-white space-y-2"
                >
                  <div class="flex items-center justify-between">
                    <span class="text-xs font-bold text-stone-800">{{ post.proyecto_titulo }}</span>
                    <span
                      class="text-xs font-semibold px-2.5 py-0.5 rounded-full border"
                      :class="getStatusBadgeClass(post.estado_general)"
                    >
                      {{ getStatusLabel(post.estado_general) }}
                    </span>
                  </div>
                  <div class="text-xs text-stone-500 flex items-center gap-3">
                    <span v-if="post.organizacion_nombre">Org: {{ post.organizacion_nombre }}</span>
                    <span v-if="post.proyecto_ubicacion">Ubicación: {{ post.proyecto_ubicacion }}</span>
                    <span>Fecha: {{ new Date(post.created_at).toLocaleDateString() }}</span>
                  </div>
                </div>
              </div>

              <div v-else class="text-center py-8 text-stone-500 text-xs">
                No hay historial adicional de postulaciones.
              </div>
            </div>

          </div>

          <!-- Modal Footer -->
          <div class="bg-stone-50 p-4 border-t border-stone-200 flex items-center justify-end gap-3">
            <button
              @click="closeProfileModal"
              class="px-5 py-2 text-sm font-semibold text-stone-700 bg-white border border-stone-300 rounded-xl hover:bg-stone-100 transition-colors shadow-xs cursor-pointer"
            >
              Cerrar
            </button>
          </div>

        </div>
      </div>

    </div>
  </div>
</template>
