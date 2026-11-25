<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '../../api/client';
import type { EvaluacionTecnicaItem, Proyecto } from '../../types';
import {
  Wrench,
  Search,
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  Building2,
  MapPin,
  ShieldCheck,
  Lock,
  ChevronRight,
  Send,
  CheckSquare,
  Award,
  Briefcase,
  Download,
} from 'lucide-vue-next';
import { useAuthAccess, validateNumericBoundsClient } from '../../composables/useAuthAccess';

const { canExport, exporting, exportNotice, refreshAccess, downloadCsv } = useAuthAccess();

// State
const evaluations = ref<EvaluacionTecnicaItem[]>([]);
const projects = ref<Proyecto[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const successNotice = ref<string | null>(null);

// Metrics (KIR-67)
const metrics = ref({
  total: 0,
  disponibles: 0,
  bloqueadas: 0,
  pendientes: 0,
  aprobados: 0,
  observados: 0,
  rechazados: 0,
});

// Filters
const selectedFilter = ref<'pendientes' | 'aprobado' | 'observado' | 'rechazado' | 'bloqueadas' | 'todos'>('pendientes');
const selectedProject = ref('todos');
const selectedCategory = ref('');
const puntajeMin = ref('');
const puntajeMax = ref('');
const sortOrder = ref<'recientes' | 'nombre_asc' | 'puntaje_desc' | 'puntaje_asc'>('recientes');
const rangeError = ref<string | null>(null);
const searchQuery = ref('');

// Evaluation Modal State (KIR-68)
const selectedItem = ref<EvaluacionTecnicaItem | null>(null);
const decisionEstado = ref<'aprobado' | 'observado' | 'rechazado'>('aprobado');
const evaluadorNombre = ref('Socio Territorial / Coordinador de Proyecto');
const puntajeTecnico = ref<number>(85);
const observacionesTexto = ref('');
const isSubmitting = ref(false);
const modalError = ref<string | null>(null);

// Technical Checklist (KIR-66 & KIR-68)
const checkExperienciaAfin = ref(true);
const checkDisponibilidadTerritorial = ref(true);
const checkCompetenciasTecnicas = ref(true);
const checkTrabajoCampo = ref(true);

const quickPresets = [
  'El perfil profesional y habilidades técnicas son altamente compatibles con el proyecto territorial.',
  'Cuenta con disponibilidad operativa para las jornadas en territorio y trabajo comunitario.',
  'Se requiere ampliar información sobre experiencia práctica en el área técnica solicitada.',
  'Las competencias técnicas actuales no se ajustan a los requerimientos operativos del proyecto.',
];

async function loadData() {
  const boundsErr = validateNumericBoundsClient(puntajeMin.value, puntajeMax.value, {
    label: 'puntaje técnico',
    maxAllowed: 100,
  });
  rangeError.value = boundsErr;
  if (boundsErr) return;

  loading.value = true;
  error.value = null;
  try {
    const [evalsData, metricsData, projsData] = await Promise.all([
      api.getTechnicalEvaluations({
        estado: selectedFilter.value,
        proyecto_id: selectedProject.value !== 'todos' ? selectedProject.value : undefined,
        categoria: selectedCategory.value || undefined,
        puntaje_min: puntajeMin.value !== '' ? puntajeMin.value : undefined,
        puntaje_max: puntajeMax.value !== '' ? puntajeMax.value : undefined,
        ordenar: sortOrder.value,
        q: searchQuery.value.trim() || undefined,
      }),
      api.getTechnicalEvaluationsMetrics(),
      api.getProyectos({ estado: 'aprobado' }).catch(() => []),
    ]);

    evaluations.value = evalsData;
    metrics.value = metricsData;
    projects.value = projsData;
  } catch (err: any) {
    error.value = err?.response?.data?.error || 'No se pudieron cargar las evaluaciones técnicas.';
  } finally {
    loading.value = false;
  }
}

async function handleExportTechnical() {
  const boundsErr = validateNumericBoundsClient(puntajeMin.value, puntajeMax.value, {
    label: 'puntaje técnico',
    maxAllowed: 100,
  });
  rangeError.value = boundsErr;
  if (boundsErr) return;

  await downloadCsv('evaluacion-tecnica', {
    estado: selectedFilter.value,
    proyecto_id: selectedProject.value !== 'todos' ? selectedProject.value : undefined,
    categoria: selectedCategory.value || undefined,
    puntaje_min: puntajeMin.value !== '' ? puntajeMin.value : undefined,
    puntaje_max: puntajeMax.value !== '' ? puntajeMax.value : undefined,
    ordenar: sortOrder.value,
    q: searchQuery.value.trim() || undefined,
  });
}

onMounted(() => {
  refreshAccess();
  loadData();
});

const filteredEvaluations = computed(() => {
  return evaluations.value.filter((item) => {
    if (selectedProject.value !== 'todos' && String(item.proyecto.id) !== selectedProject.value) {
      return false;
    }
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase();
      const matchName = `${item.postulante.nombres} ${item.postulante.apellidos}`.toLowerCase().includes(q);
      const matchCi = item.postulante.ci.toLowerCase().includes(q);
      const matchProf = (item.postulante.profesion_ocupacion || '').toLowerCase().includes(q);
      const matchSkills = (item.postulante.habilidades || '').toLowerCase().includes(q);
      const matchProj = item.proyecto.titulo.toLowerCase().includes(q);
      const matchOrg = (item.proyecto.organizacion_nombre || '').toLowerCase().includes(q);
      return matchName || matchCi || matchProf || matchSkills || matchProj || matchOrg;
    }
    return true;
  });
});

function getStageBadgeClass(item: EvaluacionTecnicaItem) {
  if (!item.puede_evaluar && item.etapa_estado === 'pendiente') {
    return 'bg-stone-100 text-stone-600 border-stone-200';
  }
  switch (item.etapa_estado) {
    case 'aprobado':
      return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    case 'en_revision':
    case 'pendiente':
      return 'bg-amber-100 text-amber-800 border-amber-300';
    case 'observado':
      return 'bg-orange-100 text-orange-800 border-orange-300';
    case 'rechazado':
      return 'bg-rose-100 text-rose-800 border-rose-300';
    default:
      return 'bg-stone-100 text-stone-700 border-stone-200';
  }
}

function getStageLabel(item: EvaluacionTecnicaItem) {
  if (!item.puede_evaluar && item.etapa_estado === 'pendiente') {
    return 'Esperando Etapa Inicial';
  }
  switch (item.etapa_estado) {
    case 'aprobado':
      return 'Aprobado Técnicamente';
    case 'en_revision':
    case 'pendiente':
      return 'Lista para Evaluar';
    case 'observado':
      return 'Observado';
    case 'rechazado':
      return 'No Apto Técnicamente';
    default:
      return item.etapa_estado;
  }
}

function openEvaluationModal(item: EvaluacionTecnicaItem) {
  selectedItem.value = item;
  modalError.value = null;

  if (item.etapa_estado === 'rechazado') {
    decisionEstado.value = 'rechazado';
  } else if (item.etapa_estado === 'observado') {
    decisionEstado.value = 'observado';
  } else {
    decisionEstado.value = 'aprobado';
  }

  evaluadorNombre.value = item.evaluador || 'Socio Territorial / Coordinador de Proyecto';
  observacionesTexto.value = item.comentarios || '';
  puntajeTecnico.value = 85;
  checkExperienciaAfin.value = true;
  checkDisponibilidadTerritorial.value = true;
  checkCompetenciasTecnicas.value = true;
  checkTrabajoCampo.value = true;
}

function closeEvaluationModal() {
  selectedItem.value = null;
  modalError.value = null;
}

async function handleSaveEvaluation() {
  if (!selectedItem.value || isSubmitting.value) return;

  if (!selectedItem.value.puede_evaluar) {
    modalError.value = 'La etapa inicial debe estar aprobada antes de registrar la evaluación técnica.';
    return;
  }

  if (
    (decisionEstado.value === 'rechazado' || decisionEstado.value === 'observado') &&
    observacionesTexto.value.trim().length < 5
  ) {
    modalError.value = `Debe detallar las observaciones técnicas o el motivo ${decisionEstado.value === 'rechazado' ? 'del rechazo' : 'de la observación'} (mínimo 5 caracteres).`;
    return;
  }

  isSubmitting.value = true;
  modalError.value = null;

  try {
    await api.submitTechnicalEvaluation(selectedItem.value.postulacion_id, {
      estado: decisionEstado.value,
      evaluador: evaluadorNombre.value.trim(),
      comentarios: observacionesTexto.value.trim(),
      puntaje_tecnico: Number(puntajeTecnico.value),
      criterios: {
        experiencia_afin: checkExperienciaAfin.value,
        disponibilidad_territorial: checkDisponibilidadTerritorial.value,
        competencias_tecnicas: checkCompetenciasTecnicas.value,
        capacidad_trabajo_campo: checkTrabajoCampo.value,
      },
    });

    successNotice.value = `Evaluación técnica registrada para ${selectedItem.value.postulante.nombres} ${selectedItem.value.postulante.apellidos} (${decisionEstado.value.toUpperCase()}).`;
    closeEvaluationModal();
    await loadData();

    setTimeout(() => {
      successNotice.value = null;
    }, 4500);
  } catch (err: any) {
    modalError.value = err?.response?.data?.error || 'No se pudo guardar la evaluación técnica.';
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen bg-stone-50 py-8 px-4 sm:px-6 lg:px-8">
    <div class="max-w-7xl mx-auto space-y-6">
      <!-- Header -->
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-stone-200 pb-5">
        <div>
          <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#F58F38] mb-1">
            <Wrench class="w-4 h-4" />
            <span>Módulo Socio Territorial • KIR-25 (Épica KIR-4)</span>
          </div>
          <h1 class="text-3xl font-extrabold text-stone-900 tracking-tight">
            Gestionar Evaluación Técnica
          </h1>
          <p class="text-stone-600 text-sm mt-1">
            Evaluación de Etapa 2 a cargo del Socio Territorial: validación de habilidades específicas, experiencia afín y compatibilidad operativa en territorio para habilitar la entrevista personal.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <router-link
            to="/admin"
            class="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-stone-700 bg-white border border-stone-300 rounded-xl hover:bg-stone-100 transition-colors shadow-xs whitespace-nowrap shrink-0"
          >
            <ArrowLeft class="w-4 h-4" />
            Panel General
          </router-link>

          <button
            v-if="canExport"
            type="button"
            @click="handleExportTechnical"
            :disabled="exporting"
            class="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#0D9488] hover:bg-[#0F766E] rounded-xl transition-all shadow-xs disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download class="w-4 h-4" />
            <span>{{ exporting ? 'Exportando...' : 'Exportar CSV' }}</span>
          </button>

          <button
            @click="loadData"
            :disabled="loading"
            class="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#289EAB] hover:bg-[#1E7B85] rounded-xl transition-all shadow-xs disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
          >
            <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      <!-- Metrics Ribbon (KIR-67) -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div class="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs flex items-center gap-3.5">
          <div class="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Clock class="w-6 h-6" />
          </div>
          <div>
            <div class="text-2xl font-bold text-amber-900 leading-none">{{ metrics.pendientes }}</div>
            <div class="text-xs text-stone-500 font-medium mt-1">Listos para Evaluar</div>
          </div>
        </div>

        <div class="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs flex items-center gap-3.5">
          <div class="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 class="w-6 h-6" />
          </div>
          <div>
            <div class="text-2xl font-bold text-emerald-900 leading-none">{{ metrics.aprobados }}</div>
            <div class="text-xs text-stone-500 font-medium mt-1">Aprobados Técnicos</div>
          </div>
        </div>

        <div class="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs flex items-center gap-3.5">
          <div class="w-11 h-11 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
            <AlertTriangle class="w-6 h-6" />
          </div>
          <div>
            <div class="text-2xl font-bold text-orange-900 leading-none">{{ metrics.observados }}</div>
            <div class="text-xs text-stone-500 font-medium mt-1">Observados</div>
          </div>
        </div>

        <div class="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs flex items-center gap-3.5">
          <div class="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <XCircle class="w-6 h-6" />
          </div>
          <div>
            <div class="text-2xl font-bold text-rose-900 leading-none">{{ metrics.rechazados }}</div>
            <div class="text-xs text-stone-500 font-medium mt-1">Rechazados</div>
          </div>
        </div>

        <div class="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs flex items-center gap-3.5 col-span-2 sm:col-span-1">
          <div class="w-11 h-11 rounded-xl bg-stone-100 text-stone-600 flex items-center justify-center shrink-0">
            <Lock class="w-6 h-6" />
          </div>
          <div>
            <div class="text-2xl font-bold text-stone-800 leading-none">{{ metrics.bloqueadas }}</div>
            <div class="text-xs text-stone-500 font-medium mt-1">En Etapa Inicial</div>
          </div>
        </div>
      </div>

      <!-- Export & Success Notifications -->
      <div
        v-if="exportNotice"
        role="status"
        :class="[
          'p-4 rounded-2xl border text-sm font-medium shadow-xs',
          exportNotice.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-rose-50 border-rose-200 text-rose-800',
        ]"
      >
        {{ exportNotice.text }}
      </div>

      <div
        v-if="successNotice"
        class="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl text-sm font-semibold flex items-center gap-2.5 shadow-xs"
      >
        <CheckCircle2 class="w-5 h-5 text-emerald-600 shrink-0" />
        <span>{{ successNotice }}</span>
      </div>

      <!-- Filter Tabs & Search -->
      <div class="bg-white rounded-2xl border border-stone-200 p-4 sm:p-5 shadow-xs space-y-4">
        <div class="flex flex-wrap items-center gap-2 border-b border-stone-100 pb-3">
          <button
            @click="selectedFilter = 'pendientes'; loadData()"
            :class="selectedFilter === 'pendientes' ? 'bg-amber-500 text-white font-bold shadow-xs' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'"
            class="px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer"
          >
            <span>Listos para Evaluar</span>
            <span class="px-1.5 py-0.5 rounded-md text-[10px] bg-white/20 font-mono">{{ metrics.pendientes }}</span>
          </button>

          <button
            @click="selectedFilter = 'aprobado'; loadData()"
            :class="selectedFilter === 'aprobado' ? 'bg-emerald-600 text-white font-bold shadow-xs' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'"
            class="px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer"
          >
            <span>Aprobados</span>
            <span class="px-1.5 py-0.5 rounded-md text-[10px] bg-white/20 font-mono">{{ metrics.aprobados }}</span>
          </button>

          <button
            @click="selectedFilter = 'observado'; loadData()"
            :class="selectedFilter === 'observado' ? 'bg-orange-500 text-white font-bold shadow-xs' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'"
            class="px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer"
          >
            <span>Observados</span>
            <span class="px-1.5 py-0.5 rounded-md text-[10px] bg-white/20 font-mono">{{ metrics.observados }}</span>
          </button>

          <button
            @click="selectedFilter = 'rechazado'; loadData()"
            :class="selectedFilter === 'rechazado' ? 'bg-rose-600 text-white font-bold shadow-xs' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'"
            class="px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer"
          >
            <span>Rechazados</span>
            <span class="px-1.5 py-0.5 rounded-md text-[10px] bg-white/20 font-mono">{{ metrics.rechazados }}</span>
          </button>

          <button
            @click="selectedFilter = 'bloqueadas'; loadData()"
            :class="selectedFilter === 'bloqueadas' ? 'bg-stone-700 text-white font-bold shadow-xs' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'"
            class="px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer"
          >
            <span>Bloqueadas (Etapa 1)</span>
            <span class="px-1.5 py-0.5 rounded-md text-[10px] bg-white/20 font-mono">{{ metrics.bloqueadas }}</span>
          </button>

          <button
            @click="selectedFilter = 'todos'; loadData()"
            :class="selectedFilter === 'todos' ? 'bg-stone-900 text-white font-bold shadow-xs' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'"
            class="px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer"
          >
            <span>Todas</span>
            <span class="px-1.5 py-0.5 rounded-md text-[10px] bg-white/20 font-mono">{{ metrics.total }}</span>
          </button>
        </div>

        <div class="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div class="relative w-full sm:flex-1">
            <Search class="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              v-model="searchQuery"
              @input="loadData"
              type="text"
              placeholder="Buscar por postulante, habilidades, profesión u organización..."
              class="w-full pl-10 pr-4 py-2 text-sm bg-stone-50 border border-stone-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#289EAB]"
            />
          </div>

          <div class="w-full sm:w-auto">
            <select
              v-model="selectedProject"
              @change="loadData"
              class="w-full sm:w-64 text-sm bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-stone-700 font-medium focus:outline-none focus:ring-2 focus:ring-[#289EAB]"
            >
              <option value="todos">Todos los Proyectos</option>
              <option v-for="p in projects" :key="p.id" :value="String(p.id)">
                {{ p.titulo }}
              </option>
            </select>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-stone-100 text-xs">
          <div class="flex flex-wrap items-center gap-2">
            <select
              v-model="selectedCategory"
              @change="loadData"
              class="px-3 py-1.5 rounded-lg border border-stone-300 bg-stone-50 text-xs text-stone-700 font-medium"
            >
              <option value="">Todas las categorías</option>
              <option value="ONG">ONG</option>
              <option value="Fundación">Fundación</option>
              <option value="Empresa">Empresa</option>
              <option value="Institución Educativa">Institución Educativa</option>
              <option value="Colectivo Social">Colectivo Social</option>
            </select>

            <input
              v-model="puntajeMin"
              type="number"
              min="0"
              max="100"
              placeholder="Puntaje mín. (0-100)"
              class="w-40 px-3 py-1.5 rounded-lg border border-stone-300 bg-stone-50 text-xs text-stone-700 tabular-nums"
            />
            <input
              v-model="puntajeMax"
              type="number"
              min="0"
              max="100"
              placeholder="Puntaje máx. (0-100)"
              class="w-40 px-3 py-1.5 rounded-lg border border-stone-300 bg-stone-50 text-xs text-stone-700 tabular-nums"
            />
            <button
              type="button"
              @click="loadData"
              class="px-3 py-1.5 rounded-lg bg-[#289EAB] hover:bg-[#1E7B85] text-white font-semibold cursor-pointer whitespace-nowrap"
            >
              Filtrar
            </button>
          </div>

          <select
            v-model="sortOrder"
            @change="loadData"
            class="px-3 py-1.5 rounded-lg border border-stone-300 bg-stone-50 text-xs text-stone-700 font-medium"
          >
            <option value="recientes">Ordenar: Más recientes</option>
            <option value="nombre_asc">Nombre (A - Z)</option>
            <option value="puntaje_desc">Mayor puntaje técnico</option>
            <option value="puntaje_asc">Menor puntaje técnico</option>
          </select>
        </div>

        <p v-if="rangeError" role="alert" class="text-xs font-semibold text-rose-700">{{ rangeError }}</p>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="py-20 text-center bg-white rounded-2xl border border-stone-200 shadow-xs">
        <RefreshCw class="w-8 h-8 text-[#289EAB] animate-spin mx-auto mb-3" />
        <h3 class="text-base font-semibold text-stone-800">Cargando bandeja técnica de socio territorial...</h3>
      </div>

      <!-- Error -->
      <div v-else-if="error" class="bg-rose-50 border border-rose-200 text-rose-800 p-6 rounded-2xl text-center space-y-3">
        <AlertTriangle class="w-8 h-8 text-rose-500 mx-auto" />
        <p class="font-medium text-sm">{{ error }}</p>
        <button @click="loadData" class="px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-semibold hover:bg-rose-700">
          Reintentar
        </button>
      </div>

      <!-- Empty -->
      <div v-else-if="filteredEvaluations.length === 0" class="bg-white rounded-2xl border border-stone-200 p-12 text-center shadow-xs">
        <div class="w-14 h-14 bg-stone-100 text-stone-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Wrench class="w-7 h-7" />
        </div>
        <h3 class="text-lg font-bold text-stone-800 mb-1">No hay postulaciones en esta bandeja</h3>
        <p class="text-sm text-stone-500 max-w-md mx-auto">
          Las postulaciones se habilitan automáticamente para evaluación técnica cuando superan la Evaluación Inicial (KIR-24).
        </p>
      </div>

      <!-- Cards Grid (KIR-68) -->
      <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div
          v-for="item in filteredEvaluations"
          :key="item.etapa_id"
          class="bg-white rounded-2xl border border-stone-200/90 hover:border-[#289EAB]/60 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4"
        >
          <div class="space-y-3">
            <!-- Applicant Header -->
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-center gap-3">
                <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-[#F58F38] to-[#EB455F] text-white font-extrabold flex items-center justify-center text-base shadow-xs shrink-0">
                  {{ item.postulante.nombres.charAt(0) }}{{ item.postulante.apellidos.charAt(0) }}
                </div>
                <div>
                  <h3 class="text-base font-bold text-stone-900 leading-tight">
                    {{ item.postulante.nombres }} {{ item.postulante.apellidos }}
                  </h3>
                  <div class="flex flex-wrap items-center gap-2 mt-1">
                    <span class="text-xs font-mono text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded">
                      CI: {{ item.postulante.ci }}
                    </span>
                    <span v-if="item.postulante.profesion_ocupacion" class="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1E7B85] bg-[#E8F6F8] px-2 py-0.5 rounded-full">
                      <Briefcase class="w-3 h-3" />
                      {{ item.postulante.profesion_ocupacion }}
                    </span>
                  </div>
                </div>
              </div>

              <span
                class="text-xs font-semibold px-2.5 py-1 rounded-full border shrink-0"
                :class="getStageBadgeClass(item)"
              >
                {{ getStageLabel(item) }}
              </span>
            </div>

            <!-- Project & Territorial Partner -->
            <div class="bg-stone-50 p-3 rounded-xl border border-stone-100 space-y-1">
              <div class="flex items-center justify-between text-[11px]">
                <span class="font-semibold text-stone-400 uppercase tracking-wider">Proyecto & Socio Territorial</span>
                <span
                  :class="item.inicial_estado === 'aprobado' ? 'text-emerald-700 font-bold' : 'text-amber-700 font-semibold'"
                >
                  Etapa Inicial: {{ item.inicial_estado }}
                </span>
              </div>
              <div class="text-xs font-bold text-stone-800 line-clamp-1">
                {{ item.proyecto.titulo }}
              </div>
              <div class="text-[11px] text-stone-500 flex flex-wrap items-center gap-2">
                <span class="inline-flex items-center gap-1 font-semibold text-[#1E7B85]">
                  <Building2 class="w-3 h-3 text-[#289EAB]" />
                  {{ item.proyecto.organizacion_nombre || 'Socio Territorial Kirikú' }}
                </span>
                <span>·</span>
                <span class="inline-flex items-center gap-1">
                  <MapPin class="w-3 h-3 text-stone-400" />
                  {{ item.proyecto.ubicacion }}
                </span>
              </div>
            </div>

            <!-- Technical Skills & Profile -->
            <div class="space-y-1">
              <div class="text-[11px] font-semibold text-stone-400 uppercase tracking-wider">
                Habilidades y Competencias Declaradas
              </div>
              <p class="text-xs text-stone-700 bg-stone-50/70 p-2.5 rounded-xl border border-stone-100 line-clamp-2">
                {{ item.postulante.habilidades || 'Sin habilidades técnicas detalladas en el perfil.' }}
              </p>
            </div>

            <!-- Previous Technical Feedback -->
            <div v-if="item.comentarios" class="text-xs text-stone-600 bg-[#E8F6F8]/60 p-2.5 rounded-xl border border-[#289EAB]/20">
              <span class="font-semibold text-[#1E7B85]">Dictamen técnico:</span>
              <p class="mt-0.5 text-stone-700">{{ item.comentarios }}</p>
              <div class="text-[10px] text-stone-400 mt-1">
                Evaluador: {{ item.evaluador || 'Socio Territorial' }}
              </div>
            </div>
          </div>

          <!-- Action Footer -->
          <div class="pt-3 border-t border-stone-100 flex items-center justify-between">
            <span class="text-[11px] text-stone-400">
              Postulación #{{ item.postulacion_id }}
            </span>

            <button
              v-if="item.puede_evaluar"
              @click="openEvaluationModal(item)"
              class="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
              :class="item.etapa_estado === 'aprobado' ? 'bg-stone-100 hover:bg-stone-200 text-stone-800' : 'bg-[#289EAB] hover:bg-[#1E7B85] text-white'"
            >
              <span>{{ item.etapa_estado === 'aprobado' ? 'Actualizar Evaluación' : 'Evaluar Técnicamente' }}</span>
              <ChevronRight class="w-3.5 h-3.5" />
            </button>

            <router-link
              v-else
              to="/admin/evaluacion-inicial"
              class="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors"
            >
              <Lock class="w-3.5 h-3.5" />
              <span>Completar Etapa 1</span>
            </router-link>
          </div>
        </div>
      </div>

      <!-- MODAL EVALUACIÓN TÉCNICA SOCIO TERRITORIAL (KIR-68) -->
      <div
        v-if="selectedItem"
        class="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
        @click.self="closeEvaluationModal"
      >
        <div class="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-stone-200 overflow-hidden my-auto max-h-[92vh] flex flex-col">
          <div class="bg-gradient-to-r from-[#1E4867] to-[#289EAB] text-white p-6 relative">
            <button
              @click="closeEvaluationModal"
              class="absolute top-5 right-5 text-white/80 hover:text-white p-1.5 rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
            >
              ✕
            </button>

            <div class="flex items-center gap-2 text-xs font-semibold text-amber-300 mb-1">
              <ShieldCheck class="w-4 h-4" />
              <span>Etapa 2: Evaluación Técnica • Socio Territorial</span>
            </div>

            <h2 class="text-xl sm:text-2xl font-bold text-white">
              {{ selectedItem.postulante.nombres }} {{ selectedItem.postulante.apellidos }}
            </h2>
            <div class="text-xs text-white/80 mt-1 flex flex-wrap items-center gap-2">
              <span>{{ selectedItem.proyecto.titulo }}</span>
              <span>•</span>
              <span>{{ selectedItem.proyecto.organizacion_nombre || 'Socio Territorial' }}</span>
            </div>
          </div>

          <div class="p-6 overflow-y-auto space-y-6 flex-1">
            <div
              v-if="modalError"
              class="bg-rose-50 border border-rose-200 text-rose-800 p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2"
            >
              <AlertTriangle class="w-4 h-4 text-rose-600 shrink-0" />
              <span>{{ modalError }}</span>
            </div>

            <!-- Checklist Técnico (KIR-66) -->
            <div class="space-y-3">
              <h4 class="text-xs font-bold text-stone-400 uppercase tracking-wider flex items-center gap-1.5">
                <CheckSquare class="w-3.5 h-3.5 text-[#289EAB]" />
                <span>Criterios de Evaluación Técnica del Socio Territorial</span>
              </h4>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <label
                  class="flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer"
                  :class="checkExperienciaAfin ? 'bg-emerald-50/50 border-emerald-200' : 'bg-stone-50 border-stone-200'"
                >
                  <input type="checkbox" v-model="checkExperienciaAfin" class="mt-0.5 rounded text-[#289EAB]" />
                  <div>
                    <div class="text-xs font-bold text-stone-900">Experiencia / Perfil Afín</div>
                    <div class="text-[11px] text-stone-500">
                      {{ selectedItem.postulante.profesion_ocupacion || 'Alineación con el rol del proyecto' }}
                    </div>
                  </div>
                </label>

                <label
                  class="flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer"
                  :class="checkCompetenciasTecnicas ? 'bg-emerald-50/50 border-emerald-200' : 'bg-stone-50 border-stone-200'"
                >
                  <input type="checkbox" v-model="checkCompetenciasTecnicas" class="mt-0.5 rounded text-[#289EAB]" />
                  <div>
                    <div class="text-xs font-bold text-stone-900">Competencias Técnicas</div>
                    <div class="text-[11px] text-stone-500">Habilidades operativas requeridas</div>
                  </div>
                </label>

                <label
                  class="flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer"
                  :class="checkDisponibilidadTerritorial ? 'bg-emerald-50/50 border-emerald-200' : 'bg-stone-50 border-stone-200'"
                >
                  <input type="checkbox" v-model="checkDisponibilidadTerritorial" class="mt-0.5 rounded text-[#289EAB]" />
                  <div>
                    <div class="text-xs font-bold text-stone-900">Disponibilidad Territorial</div>
                    <div class="text-[11px] text-stone-500">Viabilidad en {{ selectedItem.proyecto.ubicacion }}</div>
                  </div>
                </label>

                <label
                  class="flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer"
                  :class="checkTrabajoCampo ? 'bg-emerald-50/50 border-emerald-200' : 'bg-stone-50 border-stone-200'"
                >
                  <input type="checkbox" v-model="checkTrabajoCampo" class="mt-0.5 rounded text-[#289EAB]" />
                  <div>
                    <div class="text-xs font-bold text-stone-900">Aptitud en Trabajo de Campo</div>
                    <div class="text-[11px] text-stone-500">Adecuación al contexto comunitario</div>
                  </div>
                </label>
              </div>
            </div>

            <!-- Puntaje Técnico -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between text-xs font-bold text-stone-700">
                <label class="inline-flex items-center gap-1.5">
                  <Award class="w-4 h-4 text-[#F58F38]" />
                  <span>Puntuación de Compatibilidad Técnica (0 - 100)</span>
                </label>
                <span class="font-mono text-sm text-[#1E7B85]">{{ puntajeTecnico }}/100</span>
              </div>
              <input
                v-model.number="puntajeTecnico"
                type="range"
                min="0"
                max="100"
                step="5"
                class="w-full accent-[#289EAB] cursor-pointer"
              />
            </div>

            <!-- Decisión -->
            <div class="space-y-2">
              <label class="text-xs font-bold text-stone-700 block">
                Dictamen del Socio Territorial <span class="text-rose-500">*</span>
              </label>

              <div class="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  @click="decisionEstado = 'aprobado'"
                  class="p-3 rounded-xl border text-center transition-all cursor-pointer"
                  :class="decisionEstado === 'aprobado' ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-200 text-emerald-900 font-bold' : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'"
                >
                  <CheckCircle2 class="w-5 h-5 mx-auto mb-1 text-emerald-600" />
                  <div class="text-xs">Aprobar</div>
                  <div class="text-[10px] text-stone-400 font-normal">Habilita Entrevista</div>
                </button>

                <button
                  type="button"
                  @click="decisionEstado = 'observado'"
                  class="p-3 rounded-xl border text-center transition-all cursor-pointer"
                  :class="decisionEstado === 'observado' ? 'bg-orange-50 border-orange-500 ring-2 ring-orange-200 text-orange-900 font-bold' : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'"
                >
                  <AlertTriangle class="w-5 h-5 mx-auto mb-1 text-orange-600" />
                  <div class="text-xs">Observar</div>
                  <div class="text-[10px] text-stone-400 font-normal">Requiere ajuste</div>
                </button>

                <button
                  type="button"
                  @click="decisionEstado = 'rechazado'"
                  class="p-3 rounded-xl border text-center transition-all cursor-pointer"
                  :class="decisionEstado === 'rechazado' ? 'bg-rose-50 border-rose-500 ring-2 ring-rose-200 text-rose-900 font-bold' : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'"
                >
                  <XCircle class="w-5 h-5 mx-auto mb-1 text-rose-600" />
                  <div class="text-xs">Rechazar</div>
                  <div class="text-[10px] text-stone-400 font-normal">Cierra postulación</div>
                </button>
              </div>
            </div>

            <!-- Socio Territorial Responsable -->
            <div class="space-y-1.5">
              <label class="text-xs font-bold text-stone-700 block">
                Responsable / Socio Territorial Evaluador
              </label>
              <input
                v-model="evaluadorNombre"
                type="text"
                class="w-full px-3.5 py-2 text-sm bg-stone-50 border border-stone-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#289EAB]"
                placeholder="Ej. Socio Territorial - Coordinador de Campo"
              />
            </div>

            <!-- Observaciones -->
            <div class="space-y-2">
              <div class="flex justify-between items-center text-xs font-bold text-stone-700">
                <label>
                  Observaciones Técnicas
                  <span v-if="decisionEstado === 'rechazado' || decisionEstado === 'observado'" class="text-rose-500">*</span>
                </label>
                <span class="text-stone-400 font-normal">{{ observacionesTexto.length }}/300</span>
              </div>

              <textarea
                v-model="observacionesTexto"
                rows="3"
                maxlength="300"
                class="w-full px-3.5 py-2 text-sm bg-stone-50 border border-stone-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#289EAB]"
                placeholder="Detalla la valoración técnica y compatibilidad territorial..."
              ></textarea>

              <div class="space-y-1">
                <span class="text-[11px] text-stone-500 font-semibold">Plantillas rápidas:</span>
                <div class="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    v-for="(p, idx) in quickPresets"
                    :key="idx"
                    @click="observacionesTexto = p"
                    class="text-[11px] text-stone-600 bg-stone-100 hover:bg-stone-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer text-left"
                  >
                    {{ p.substring(0, 48) }}...
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="bg-stone-50 p-4 sm:p-5 border-t border-stone-200 flex items-center justify-end gap-3">
            <button
              @click="closeEvaluationModal"
              class="px-4 py-2 text-sm font-semibold text-stone-600 bg-white border border-stone-300 rounded-xl hover:bg-stone-100 transition-colors cursor-pointer"
            >
              Cancelar
            </button>

            <button
              @click="handleSaveEvaluation"
              :disabled="isSubmitting"
              class="px-6 py-2 text-sm font-bold text-white bg-[#289EAB] hover:bg-[#1E7B85] rounded-xl transition-all shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Send class="w-4 h-4" />
              <span>{{ isSubmitting ? 'Guardando...' : 'Guardar Evaluación Técnica' }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
