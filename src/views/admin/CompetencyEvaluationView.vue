<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api } from '../../api/client';
import type {
  EvaluacionCompetenciasCriterios,
  EvaluacionCompetenciasItem,
  Proyecto,
  RegistrarEvaluacionCompetenciasPayload,
} from '../../types';
import {
  ArrowLeft,
  Brain,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Search,
  ShieldAlert,
  UserRound,
  X,
  Download,
} from 'lucide-vue-next';
import { useAuthAccess, validateNumericBoundsClient } from '../../composables/useAuthAccess';

const { canExport, exporting, exportNotice, refreshAccess, downloadCsv } = useAuthAccess();

const CRITERIA: Array<{ key: keyof EvaluacionCompetenciasCriterios; label: string; description: string }> = [
  { key: 'trabajo_equipo', label: 'Trabajo en equipo', description: 'Colabora, escucha y contribuye al logro compartido.' },
  { key: 'comunicacion', label: 'Comunicación', description: 'Expresa ideas con claridad y escucha activamente.' },
  { key: 'liderazgo', label: 'Liderazgo e iniciativa', description: 'Toma iniciativa y facilita el trabajo del grupo.' },
  { key: 'resolucion_problemas', label: 'Resolución de problemas', description: 'Analiza situaciones y propone soluciones constructivas.' },
  { key: 'empatia_adaptabilidad', label: 'Empatía y adaptabilidad', description: 'Considera otras perspectivas y se adapta al contexto.' },
];

const evaluations = ref<EvaluacionCompetenciasItem[]>([]);
const projects = ref<Proyecto[]>([]);
const loading = ref(false);
const error = ref('');
const success = ref('');
const query = ref('');
const selectedProject = ref('todos');
const selectedFilter = ref('pendientes');
const selectedCategory = ref('');
const puntajeMin = ref('');
const puntajeMax = ref('');
const sortOrder = ref<'recientes' | 'nombre_asc' | 'puntaje_desc' | 'puntaje_asc'>('recientes');
const rangeError = ref<string | null>(null);
const selectedItem = ref<EvaluacionCompetenciasItem | null>(null);
const decision = ref<RegistrarEvaluacionCompetenciasPayload['estado']>('aprobado');
const evaluator = ref('Comité de Evaluación por Competencias');
const comments = ref('');
const scores = ref<EvaluacionCompetenciasCriterios>({
  trabajo_equipo: 3,
  comunicacion: 3,
  liderazgo: 3,
  resolucion_problemas: 3,
  empatia_adaptabilidad: 3,
});
const saving = ref(false);
const formError = ref('');

const filters = [
  { value: 'pendientes', label: 'Pendientes' },
  { value: 'aprobados', label: 'Aprobados' },
  { value: 'observados', label: 'Observados' },
  { value: 'rechazados', label: 'Rechazados' },
  { value: 'bloqueadas', label: 'Bloqueados' },
  { value: 'todos', label: 'Todos' },
];

const visibleEvaluations = computed(() => evaluations.value.filter((item) => {
  if (selectedProject.value !== 'todos' && String(item.proyecto.id) !== selectedProject.value) return false;
  const term = query.value.trim().toLocaleLowerCase();
  if (!term) return true;
  return [
    item.postulante.nombres,
    item.postulante.apellidos,
    item.postulante.ci,
    item.postulante.profesion_ocupacion || '',
    item.proyecto.titulo,
  ].some((value) => value.toLocaleLowerCase().includes(term));
}));

const scoreAverage = computed(() => {
  const values = Object.values(scores.value);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
});

async function loadData() {
  const boundsErr = validateNumericBoundsClient(puntajeMin.value, puntajeMax.value, {
    label: 'puntaje / promedio',
    maxAllowed: 100,
  });
  rangeError.value = boundsErr;
  if (boundsErr) return;

  loading.value = true;
  error.value = '';
  try {
    const [items, projectList] = await Promise.all([
      api.getCompetencyEvaluations({
        estado: selectedFilter.value,
        proyecto_id: selectedProject.value === 'todos' ? undefined : selectedProject.value,
        categoria: selectedCategory.value || undefined,
        puntaje_min: puntajeMin.value !== '' ? puntajeMin.value : undefined,
        puntaje_max: puntajeMax.value !== '' ? puntajeMax.value : undefined,
        ordenar: sortOrder.value,
        q: query.value.trim() || undefined,
      }),
      api.getProyectos({ estado: 'aprobado' }).catch(() => []),
    ]);
    evaluations.value = items;
    projects.value = projectList;
  } catch (err: any) {
    error.value = err?.response?.data?.error || 'No se pudieron cargar las evaluaciones por competencias.';
  } finally {
    loading.value = false;
  }
}

async function handleExportCompetencies() {
  const boundsErr = validateNumericBoundsClient(puntajeMin.value, puntajeMax.value, {
    label: 'puntaje / promedio',
    maxAllowed: 100,
  });
  rangeError.value = boundsErr;
  if (boundsErr) return;

  await downloadCsv('evaluacion-competencias', {
    estado: selectedFilter.value,
    proyecto_id: selectedProject.value === 'todos' ? undefined : selectedProject.value,
    categoria: selectedCategory.value || undefined,
    puntaje_min: puntajeMin.value !== '' ? puntajeMin.value : undefined,
    puntaje_max: puntajeMax.value !== '' ? puntajeMax.value : undefined,
    ordenar: sortOrder.value,
    q: query.value.trim() || undefined,
  });
}

onMounted(() => {
  refreshAccess();
  loadData();
});

function openEvaluation(item: EvaluacionCompetenciasItem) {
  if (!item.puede_evaluar) return;
  selectedItem.value = item;
  decision.value = item.etapa_estado === 'observado' || item.etapa_estado === 'rechazado'
    ? item.etapa_estado
    : 'aprobado';
  evaluator.value = item.evaluador || 'Comité de Evaluación por Competencias';
  comments.value = item.comentarios || '';
  scores.value = {
    trabajo_equipo: item.detalle_criterios?.trabajo_equipo || 3,
    comunicacion: item.detalle_criterios?.comunicacion || 3,
    liderazgo: item.detalle_criterios?.liderazgo || 3,
    resolucion_problemas: item.detalle_criterios?.resolucion_problemas || 3,
    empatia_adaptabilidad: item.detalle_criterios?.empatia_adaptabilidad || 3,
  };
  formError.value = '';
}

async function saveEvaluation() {
  if (!selectedItem.value || saving.value) return;
  if (!evaluator.value.trim()) {
    formError.value = 'Indique el nombre de quien evalúa.';
    return;
  }
  if (decision.value !== 'aprobado' && comments.value.trim().length < 5) {
    formError.value = 'Detalle el motivo de la observación o rechazo (mínimo 5 caracteres).';
    return;
  }

  saving.value = true;
  formError.value = '';
  try {
    await api.submitCompetencyEvaluation(selectedItem.value.postulacion_id, {
      estado: decision.value,
      evaluador: evaluator.value.trim(),
      comentarios: comments.value.trim(),
      criterios: { ...scores.value },
    });
    success.value = `Evaluación registrada para ${selectedItem.value.postulante.nombres} ${selectedItem.value.postulante.apellidos}.`;
    selectedItem.value = null;
    await loadData();
    window.setTimeout(() => { success.value = ''; }, 4000);
  } catch (err: any) {
    formError.value = err?.response?.data?.error || 'No se pudo guardar la evaluación.';
  } finally {
    saving.value = false;
  }
}

function statusLabel(status: string) {
  return ({
    pendiente: 'Pendiente',
    en_revision: 'En revisión',
    aprobado: 'Aprobado',
    observado: 'Observado',
    rechazado: 'Rechazado',
  } as Record<string, string>)[status] || status;
}

function statusClass(status: string) {
  return ({
    pendiente: 'bg-stone-100 text-stone-700',
    en_revision: 'bg-amber-100 text-amber-800',
    aprobado: 'bg-emerald-100 text-emerald-800',
    observado: 'bg-orange-100 text-orange-800',
    rechazado: 'bg-rose-100 text-rose-800',
  } as Record<string, string>)[status] || 'bg-stone-100 text-stone-700';
}
</script>

<template>
  <main class="min-h-screen bg-stone-50 py-8 px-4 sm:px-6 lg:px-8">
    <div class="max-w-7xl mx-auto space-y-6">
      <header class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-stone-200 pb-5">
        <div>
          <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-violet-700 mb-1">
            <Brain class="w-4 h-4" />
            <span>Etapa 4 · KIR-27</span>
          </div>
          <h1 class="text-3xl font-extrabold text-stone-900 tracking-tight">Evaluación por Competencias</h1>
          <p class="text-stone-600 text-sm mt-1">Registra una rúbrica de cinco criterios para valorar el desempeño en dinámicas grupales.</p>
        </div>
        <div class="flex flex-wrap gap-3">
          <router-link to="/admin" class="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-stone-700 bg-white border border-stone-300 rounded-xl hover:bg-stone-100 whitespace-nowrap shrink-0">
            <ArrowLeft class="w-4 h-4" /> Panel General
          </router-link>
          <button v-if="canExport" type="button" @click="handleExportCompetencies" :disabled="exporting" class="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#289EAB] hover:bg-[#1E7B85] rounded-xl disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0">
            <Download class="w-4 h-4" /> {{ exporting ? 'Exportando...' : 'Exportar CSV' }}
          </button>
          <button @click="loadData" :disabled="loading" class="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-violet-700 hover:bg-violet-800 rounded-xl disabled:opacity-50 whitespace-nowrap shrink-0">
            <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" /> Actualizar
          </button>
        </div>
      </header>

      <div v-if="exportNotice" role="status" :class="['p-4 rounded-xl border text-sm font-medium', exportNotice.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800']">
        {{ exportNotice.text }}
      </div>
      <div v-if="success" role="status" class="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-2">
        <CheckCircle2 class="w-5 h-5" /> {{ success }}
      </div>
      <div v-if="error" role="alert" class="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">{{ error }}</div>

      <section class="bg-white rounded-2xl border border-stone-200 p-4 shadow-xs space-y-3">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label class="relative">
            <Search class="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input v-model="query" @input="loadData" placeholder="Buscar persona o proyecto" class="w-full pl-9 pr-3 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
          </label>
          <select v-model="selectedProject" @change="loadData" class="px-3 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-sm">
            <option value="todos">Todos los proyectos</option>
            <option v-for="project in projects" :key="project.id" :value="String(project.id)">{{ project.titulo }}</option>
          </select>
          <select v-model="selectedFilter" @change="loadData" class="px-3 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-sm">
            <option v-for="filter in filters" :key="filter.value" :value="filter.value">{{ filter.label }}</option>
          </select>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-stone-100 text-xs">
          <div class="flex flex-wrap items-center gap-2">
            <select v-model="selectedCategory" @change="loadData" class="px-3 py-1.5 rounded-lg border border-stone-200 bg-stone-50 text-xs text-stone-700 font-medium">
              <option value="">Todas las categorías</option>
              <option value="ONG">ONG</option>
              <option value="Fundación">Fundación</option>
              <option value="Empresa">Empresa</option>
              <option value="Institución Educativa">Institución Educativa</option>
              <option value="Colectivo Social">Colectivo Social</option>
            </select>
            <input v-model="puntajeMin" type="number" min="0" max="100" placeholder="Puntaje mín." class="w-32 px-3 py-1.5 rounded-lg border border-stone-200 bg-stone-50 text-xs tabular-nums" />
            <input v-model="puntajeMax" type="number" min="0" max="100" placeholder="Puntaje máx." class="w-32 px-3 py-1.5 rounded-lg border border-stone-200 bg-stone-50 text-xs tabular-nums" />
            <button type="button" @click="loadData" class="px-3 py-1.5 rounded-lg bg-violet-700 hover:bg-violet-800 text-white font-semibold cursor-pointer">Filtrar</button>
          </div>
          <select v-model="sortOrder" @change="loadData" class="px-3 py-1.5 rounded-lg border border-stone-200 bg-stone-50 text-xs text-stone-700 font-medium">
            <option value="recientes">Ordenar: Más recientes</option>
            <option value="nombre_asc">Nombre (A - Z)</option>
            <option value="puntaje_desc">Mayor puntaje</option>
            <option value="puntaje_asc">Menor puntaje</option>
          </select>
        </div>
        <p v-if="rangeError" role="alert" class="text-xs font-semibold text-rose-700">{{ rangeError }}</p>
      </section>

      <nav class="flex flex-wrap gap-2" aria-label="Filtrar evaluaciones">
        <button v-for="filter in filters" :key="filter.value" @click="selectedFilter = filter.value; loadData()"
          :class="['px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors', selectedFilter === filter.value ? 'bg-violet-700 text-white border-violet-700' : 'bg-white text-stone-600 border-stone-200 hover:border-violet-300']">
          {{ filter.label }}
        </button>
      </nav>

      <div v-if="loading" class="py-14 text-center text-sm text-stone-500">Cargando evaluaciones...</div>
      <section v-else-if="visibleEvaluations.length" class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <article v-for="item in visibleEvaluations" :key="item.etapa_id" class="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-start gap-3">
              <div class="w-10 h-10 rounded-xl bg-violet-50 text-violet-700 flex items-center justify-center shrink-0"><UserRound class="w-5 h-5" /></div>
              <div>
                <h2 class="font-bold text-stone-900">{{ item.postulante.nombres }} {{ item.postulante.apellidos }}</h2>
                <p class="text-xs text-stone-500">{{ item.postulante.profesion_ocupacion || 'Ocupación no especificada' }}</p>
              </div>
            </div>
            <span :class="['px-2.5 py-1 rounded-full text-xs font-semibold', statusClass(item.etapa_estado)]">{{ statusLabel(item.etapa_estado) }}</span>
          </div>
          <div class="mt-4 p-3 rounded-xl bg-stone-50 text-sm">
            <p class="font-semibold text-stone-800">{{ item.proyecto.titulo }}</p>
            <p class="text-xs text-stone-500 mt-0.5">{{ item.proyecto.ubicacion }}<span v-if="item.proyecto.organizacion_nombre"> · {{ item.proyecto.organizacion_nombre }}</span></p>
          </div>
          <div class="mt-4 flex flex-wrap gap-2 text-xs">
            <span :class="['px-2 py-1 rounded-md', statusClass(item.tecnica_estado)]">Técnica: {{ statusLabel(item.tecnica_estado) }}</span>
            <span :class="['px-2 py-1 rounded-md', statusClass(item.personal_estado)]">Personal: {{ statusLabel(item.personal_estado) }}</span>
            <span v-if="item.puntaje_promedio !== null" class="px-2 py-1 rounded-md bg-violet-50 text-violet-800 font-semibold">Promedio {{ item.puntaje_promedio }}/5</span>
          </div>
          <p v-if="!item.puede_evaluar" class="mt-3 text-xs text-amber-800 flex items-center gap-1.5"><ShieldAlert class="w-4 h-4" /> Requiere aprobación técnica y personal para continuar.</p>
          <p v-else-if="item.etapa_estado === 'pendiente' || item.etapa_estado === 'en_revision'" class="mt-3 text-xs text-violet-700 flex items-center gap-1.5"><Clock3 class="w-4 h-4" /> Lista para evaluar.</p>
          <div class="mt-4 flex justify-end">
            <button @click="openEvaluation(item)" :disabled="!item.puede_evaluar" class="px-4 py-2 text-xs font-semibold rounded-lg bg-violet-700 text-white hover:bg-violet-800 disabled:bg-stone-200 disabled:text-stone-500 disabled:cursor-not-allowed">
              {{ item.etapa_estado === 'pendiente' || item.etapa_estado === 'en_revision' ? 'Evaluar competencias' : 'Ver / editar evaluación' }}
            </button>
          </div>
        </article>
      </section>
      <section v-else class="bg-white rounded-2xl border border-stone-200 p-10 text-center">
        <Brain class="w-10 h-10 text-stone-300 mx-auto mb-3" />
        <h2 class="font-bold text-stone-800">No hay postulaciones para mostrar</h2>
        <p class="text-sm text-stone-500 mt-1">Cambia los filtros o confirma que las etapas previas estén registradas.</p>
      </section>
    </div>

    <div v-if="selectedItem" class="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm overflow-y-auto p-4 flex items-start justify-center">
      <section role="dialog" aria-modal="true" aria-labelledby="evaluation-title" class="bg-white rounded-2xl max-w-2xl w-full my-6 shadow-2xl border border-stone-200">
        <header class="px-6 py-5 border-b border-stone-100 flex justify-between gap-4">
          <div>
            <p class="text-xs text-violet-700 font-semibold uppercase tracking-wide">Rúbrica de competencias</p>
            <h2 id="evaluation-title" class="text-xl font-bold text-stone-900 mt-1">{{ selectedItem.postulante.nombres }} {{ selectedItem.postulante.apellidos }}</h2>
            <p class="text-sm text-stone-500">{{ selectedItem.proyecto.titulo }}</p>
          </div>
          <button @click="selectedItem = null" aria-label="Cerrar" class="h-9 w-9 rounded-lg text-stone-500 hover:bg-stone-100 flex items-center justify-center"><X class="w-5 h-5" /></button>
        </header>
        <div class="p-6 space-y-5">
          <div class="space-y-3">
            <label v-for="criterion in CRITERIA" :key="criterion.key" class="block p-3 rounded-xl border border-stone-200">
              <span class="flex items-center justify-between gap-3">
                <span>
                  <span class="block text-sm font-semibold text-stone-800">{{ criterion.label }}</span>
                  <span class="block text-xs text-stone-500 mt-0.5">{{ criterion.description }}</span>
                </span>
                <select v-model.number="scores[criterion.key]" class="w-20 px-2 py-2 rounded-lg border border-stone-300 text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-violet-500" :aria-label="`Puntuación: ${criterion.label}`">
                  <option v-for="score in [1, 2, 3, 4, 5]" :key="score" :value="score">{{ score }}</option>
                </select>
              </span>
              <span class="flex justify-between text-[10px] text-stone-400 mt-2"><span>1 · Requiere apoyo</span><span>5 · Sobresaliente</span></span>
            </label>
          </div>

          <div class="p-3 rounded-xl bg-violet-50 text-violet-900 text-sm font-semibold flex justify-between">
            <span>Promedio de la rúbrica</span><span>{{ scoreAverage.toFixed(2) }} / 5</span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label class="text-xs font-semibold text-stone-700">Decisión
              <select v-model="decision" class="mt-1 block w-full px-3 py-2.5 rounded-lg border border-stone-300 bg-white text-sm">
                <option value="aprobado">Aprobar</option>
                <option value="observado">Observar</option>
                <option value="rechazado">Rechazar</option>
              </select>
            </label>
            <label class="text-xs font-semibold text-stone-700">Evaluador
              <input v-model="evaluator" required class="mt-1 block w-full px-3 py-2.5 rounded-lg border border-stone-300 text-sm" />
            </label>
          </div>
          <label class="block text-xs font-semibold text-stone-700">Comentarios {{ decision !== 'aprobado' ? '(obligatorios)' : '(opcional)' }}
            <textarea v-model="comments" rows="3" class="mt-1 block w-full px-3 py-2.5 rounded-lg border border-stone-300 text-sm" placeholder="Observaciones de la dinámica grupal..."></textarea>
          </label>
          <p v-if="formError" role="alert" class="text-sm text-rose-700">{{ formError }}</p>
          <footer class="flex justify-end gap-2">
            <button @click="selectedItem = null" class="px-4 py-2 rounded-lg border border-stone-300 text-sm font-medium text-stone-700">Cancelar</button>
            <button @click="saveEvaluation" :disabled="saving" class="px-4 py-2 rounded-lg bg-violet-700 text-white text-sm font-semibold hover:bg-violet-800 disabled:opacity-50">{{ saving ? 'Guardando...' : 'Guardar evaluación' }}</button>
          </footer>
        </div>
      </section>
    </div>
  </main>
</template>
