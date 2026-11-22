<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api } from '../../api/client';
import type {
  EvaluacionPersonalCriterios,
  EvaluacionPersonalItem,
  Proyecto,
  RegistrarEvaluacionPersonalPayload,
} from '../../types';
import { ArrowLeft, CheckCircle2, Clock3, MessageCircle, RefreshCw, Search, ShieldAlert, UserRound, X } from 'lucide-vue-next';

const CRITERIA: Array<{ key: keyof EvaluacionPersonalCriterios; label: string; description: string }> = [
  { key: 'motivacion_servicio', label: 'Motivación y vocación de servicio', description: 'Explica su interés por el voluntariado y su afinidad con la misión del proyecto.' },
  { key: 'compromiso_responsabilidad', label: 'Compromiso y responsabilidad', description: 'Demuestra responsabilidad, constancia y disposición para cumplir acuerdos.' },
  { key: 'comunicacion_interpersonal', label: 'Comunicación interpersonal', description: 'Se expresa con respeto, claridad y escucha activa.' },
  { key: 'disponibilidad', label: 'Disponibilidad y constancia', description: 'Cuenta con tiempo y disponibilidad real para las actividades.' },
  { key: 'madurez_autocuidado', label: 'Madurez y autocuidado', description: 'Reconoce límites, recibe retroalimentación y cuida su bienestar.' },
];

const evaluations = ref<EvaluacionPersonalItem[]>([]);
const projects = ref<Proyecto[]>([]);
const loading = ref(false);
const error = ref('');
const success = ref('');
const query = ref('');
const selectedProject = ref('todos');
const selectedFilter = ref('pendientes');
const selectedItem = ref<EvaluacionPersonalItem | null>(null);
const decision = ref<RegistrarEvaluacionPersonalPayload['estado']>('aprobado');
const evaluator = ref('Comité de Entrevista Personal');
const comments = ref('');
const scores = ref<EvaluacionPersonalCriterios>({
  motivacion_servicio: 3,
  compromiso_responsabilidad: 3,
  comunicacion_interpersonal: 3,
  disponibilidad: 3,
  madurez_autocuidado: 3,
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
  return [item.postulante.nombres, item.postulante.apellidos, item.postulante.ci,
    item.postulante.profesion_ocupacion || '', item.proyecto.titulo]
    .some((value) => value.toLocaleLowerCase().includes(term));
}));

const scoreAverage = computed(() => {
  const values = Object.values(scores.value);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
});

async function loadData() {
  loading.value = true;
  error.value = '';
  try {
    const [items, projectList] = await Promise.all([
      api.getPersonalEvaluations({
        estado: selectedFilter.value,
        proyecto_id: selectedProject.value === 'todos' ? undefined : selectedProject.value,
        q: query.value.trim() || undefined,
      }),
      api.getProyectos({ estado: 'aprobado' }).catch(() => []),
    ]);
    evaluations.value = items;
    projects.value = projectList;
  } catch (err: any) {
    error.value = err?.response?.data?.error || 'No se pudieron cargar las entrevistas personales.';
  } finally {
    loading.value = false;
  }
}

onMounted(loadData);

function openEvaluation(item: EvaluacionPersonalItem) {
  if (!item.puede_evaluar) return;
  selectedItem.value = item;
  decision.value = item.etapa_estado === 'observado' || item.etapa_estado === 'rechazado'
    ? item.etapa_estado
    : 'aprobado';
  evaluator.value = item.evaluador || 'Comité de Entrevista Personal';
  comments.value = item.comentarios || '';
  scores.value = {
    motivacion_servicio: item.detalle_criterios_personales?.motivacion_servicio || 3,
    compromiso_responsabilidad: item.detalle_criterios_personales?.compromiso_responsabilidad || 3,
    comunicacion_interpersonal: item.detalle_criterios_personales?.comunicacion_interpersonal || 3,
    disponibilidad: item.detalle_criterios_personales?.disponibilidad || 3,
    madurez_autocuidado: item.detalle_criterios_personales?.madurez_autocuidado || 3,
  };
  formError.value = '';
}

async function saveEvaluation() {
  if (!selectedItem.value || saving.value) return;
  if (!evaluator.value.trim()) {
    formError.value = 'Indique el nombre de quien realiza la entrevista.';
    return;
  }
  if (decision.value !== 'aprobado' && comments.value.trim().length < 5) {
    formError.value = 'Detalle el motivo de la observación o rechazo (mínimo 5 caracteres).';
    return;
  }

  saving.value = true;
  formError.value = '';
  try {
    await api.submitPersonalEvaluation(selectedItem.value.postulacion_id, {
      estado: decision.value,
      evaluador: evaluator.value.trim(),
      comentarios: comments.value.trim(),
      criterios: { ...scores.value },
    });
    success.value = `Entrevista registrada para ${selectedItem.value.postulante.nombres} ${selectedItem.value.postulante.apellidos}.`;
    selectedItem.value = null;
    await loadData();
    window.setTimeout(() => { success.value = ''; }, 4000);
  } catch (err: any) {
    formError.value = err?.response?.data?.error || 'No se pudo guardar la entrevista.';
  } finally {
    saving.value = false;
  }
}

function statusLabel(status: string) {
  return ({ pendiente: 'Pendiente', en_revision: 'En revisión', aprobado: 'Aprobado', observado: 'Observado', rechazado: 'Rechazado' } as Record<string, string>)[status] || status;
}
function statusClass(status: string) {
  return ({ pendiente: 'bg-stone-100 text-stone-700', en_revision: 'bg-amber-100 text-amber-800', aprobado: 'bg-emerald-100 text-emerald-800', observado: 'bg-orange-100 text-orange-800', rechazado: 'bg-rose-100 text-rose-800' } as Record<string, string>)[status] || 'bg-stone-100 text-stone-700';
}
</script>

<template>
  <main class="min-h-screen bg-stone-50 py-8 px-4 sm:px-6 lg:px-8">
    <div class="max-w-7xl mx-auto space-y-6">
      <header class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-stone-200 pb-5">
        <div>
          <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sky-700 mb-1">
            <MessageCircle class="w-4 h-4" /><span>Etapa 3 · KIR-26</span>
          </div>
          <h1 class="text-3xl font-extrabold text-stone-900 tracking-tight">Evaluación Personal</h1>
          <p class="text-stone-600 text-sm mt-1">Registra la entrevista y valora motivación, compromiso y disponibilidad.</p>
        </div>
        <div class="flex gap-3">
          <router-link to="/admin" class="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-stone-700 bg-white border border-stone-300 rounded-xl hover:bg-stone-100"><ArrowLeft class="w-4 h-4" /> Panel General</router-link>
          <button @click="loadData" :disabled="loading" class="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-xl disabled:opacity-50"><RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" /> Actualizar</button>
        </div>
      </header>

      <div v-if="success" role="status" class="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-2"><CheckCircle2 class="w-5 h-5" /> {{ success }}</div>
      <div v-if="error" role="alert" class="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">{{ error }}</div>

      <section class="bg-white rounded-2xl border border-stone-200 p-4 shadow-xs grid grid-cols-1 md:grid-cols-3 gap-3">
        <label class="relative"><Search class="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" /><input v-model="query" @input="loadData" placeholder="Buscar persona o proyecto" class="w-full pl-9 pr-3 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" /></label>
        <select v-model="selectedProject" @change="loadData" class="px-3 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-sm"><option value="todos">Todos los proyectos</option><option v-for="project in projects" :key="project.id" :value="String(project.id)">{{ project.titulo }}</option></select>
        <select v-model="selectedFilter" @change="loadData" class="px-3 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-sm"><option v-for="filter in filters" :key="filter.value" :value="filter.value">{{ filter.label }}</option></select>
      </section>
      <nav class="flex flex-wrap gap-2" aria-label="Filtrar entrevistas">
        <button v-for="filter in filters" :key="filter.value" @click="selectedFilter = filter.value; loadData()" :class="['px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors', selectedFilter === filter.value ? 'bg-sky-700 text-white border-sky-700' : 'bg-white text-stone-600 border-stone-200 hover:border-sky-300']">{{ filter.label }}</button>
      </nav>

      <div v-if="loading" class="py-14 text-center text-sm text-stone-500">Cargando entrevistas personales...</div>
      <section v-else-if="visibleEvaluations.length" class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <article v-for="item in visibleEvaluations" :key="item.etapa_id" class="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-start gap-3"><div class="w-10 h-10 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center shrink-0"><UserRound class="w-5 h-5" /></div><div><h2 class="font-bold text-stone-900">{{ item.postulante.nombres }} {{ item.postulante.apellidos }}</h2><p class="text-xs text-stone-500">{{ item.postulante.profesion_ocupacion || 'Ocupación no especificada' }}</p></div></div>
            <span :class="['px-2.5 py-1 rounded-full text-xs font-semibold', statusClass(item.etapa_estado)]">{{ statusLabel(item.etapa_estado) }}</span>
          </div>
          <div class="mt-4 p-3 rounded-xl bg-stone-50 text-sm"><p class="font-semibold text-stone-800">{{ item.proyecto.titulo }}</p><p class="text-xs text-stone-500 mt-0.5">{{ item.proyecto.ubicacion }}<span v-if="item.proyecto.organizacion_nombre"> · {{ item.proyecto.organizacion_nombre }}</span></p></div>
          <div class="mt-4 flex flex-wrap gap-2 text-xs"><span :class="['px-2 py-1 rounded-md', statusClass(item.tecnica_estado)]">Técnica: {{ statusLabel(item.tecnica_estado) }}</span><span v-if="item.puntaje_promedio !== null" class="px-2 py-1 rounded-md bg-sky-50 text-sky-800 font-semibold">Promedio {{ item.puntaje_promedio }}/5</span></div>
          <p v-if="!item.puede_evaluar" class="mt-3 text-xs text-amber-800 flex items-center gap-1.5"><ShieldAlert class="w-4 h-4" /> Requiere aprobación de la etapa técnica.</p>
          <p v-else-if="item.etapa_estado === 'pendiente' || item.etapa_estado === 'en_revision'" class="mt-3 text-xs text-sky-700 flex items-center gap-1.5"><Clock3 class="w-4 h-4" /> Lista para entrevista.</p>
          <div class="mt-4 flex justify-end"><button @click="openEvaluation(item)" :disabled="!item.puede_evaluar" class="px-4 py-2 text-xs font-semibold rounded-lg bg-sky-700 text-white hover:bg-sky-800 disabled:bg-stone-200 disabled:text-stone-500 disabled:cursor-not-allowed">{{ item.etapa_estado === 'pendiente' || item.etapa_estado === 'en_revision' ? 'Evaluar entrevista' : 'Ver / editar evaluación' }}</button></div>
        </article>
      </section>
      <section v-else class="bg-white rounded-2xl border border-stone-200 p-10 text-center"><MessageCircle class="w-10 h-10 text-stone-300 mx-auto mb-3" /><h2 class="font-bold text-stone-800">No hay postulaciones para mostrar</h2><p class="text-sm text-stone-500 mt-1">Cambia los filtros o confirma que la etapa técnica esté aprobada.</p></section>
    </div>

    <div v-if="selectedItem" class="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm overflow-y-auto p-4 flex items-start justify-center">
      <section role="dialog" aria-modal="true" aria-labelledby="personal-title" class="bg-white rounded-2xl max-w-2xl w-full my-6 shadow-2xl border border-stone-200">
        <header class="px-6 py-5 border-b border-stone-100 flex justify-between gap-4"><div><p class="text-xs text-sky-700 font-semibold uppercase tracking-wide">Rúbrica de entrevista personal</p><h2 id="personal-title" class="text-xl font-bold text-stone-900 mt-1">{{ selectedItem.postulante.nombres }} {{ selectedItem.postulante.apellidos }}</h2><p class="text-sm text-stone-500">{{ selectedItem.proyecto.titulo }}</p></div><button @click="selectedItem = null" aria-label="Cerrar" class="h-9 w-9 rounded-lg text-stone-500 hover:bg-stone-100 flex items-center justify-center"><X class="w-5 h-5" /></button></header>
        <div class="p-6 space-y-5">
          <div class="space-y-3"><label v-for="criterion in CRITERIA" :key="criterion.key" class="block p-3 rounded-xl border border-stone-200"><span class="flex items-center justify-between gap-3"><span><span class="block text-sm font-semibold text-stone-800">{{ criterion.label }}</span><span class="block text-xs text-stone-500 mt-0.5">{{ criterion.description }}</span></span><select v-model.number="scores[criterion.key]" class="w-20 px-2 py-2 rounded-lg border border-stone-300 text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-sky-500" :aria-label="`Puntuación: ${criterion.label}`"><option v-for="score in [1, 2, 3, 4, 5]" :key="score" :value="score">{{ score }}</option></select></span><span class="flex justify-between text-[10px] text-stone-400 mt-2"><span>1 · Requiere apoyo</span><span>5 · Sobresaliente</span></span></label></div>
          <div class="p-3 rounded-xl bg-sky-50 text-sky-900 text-sm font-semibold flex justify-between"><span>Promedio de la entrevista</span><span>{{ scoreAverage.toFixed(2) }} / 5</span></div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3"><label class="text-xs font-semibold text-stone-700">Decisión<select v-model="decision" class="mt-1 block w-full px-3 py-2.5 rounded-lg border border-stone-300 bg-white text-sm"><option value="aprobado">Aprobar</option><option value="observado">Observar</option><option value="rechazado">Rechazar</option></select></label><label class="text-xs font-semibold text-stone-700">Evaluador<input v-model="evaluator" required class="mt-1 block w-full px-3 py-2.5 rounded-lg border border-stone-300 text-sm" /></label></div>
          <label class="block text-xs font-semibold text-stone-700">Comentarios {{ decision !== 'aprobado' ? '(obligatorios)' : '(opcional)' }}<textarea v-model="comments" rows="3" class="mt-1 block w-full px-3 py-2.5 rounded-lg border border-stone-300 text-sm" placeholder="Síntesis y observaciones de la entrevista..."></textarea></label>
          <p v-if="formError" role="alert" class="text-sm text-rose-700">{{ formError }}</p>
          <footer class="flex justify-end gap-2"><button @click="selectedItem = null" class="px-4 py-2 rounded-lg border border-stone-300 text-sm font-medium text-stone-700">Cancelar</button><button @click="saveEvaluation" :disabled="saving" class="px-4 py-2 rounded-lg bg-sky-700 text-white text-sm font-semibold hover:bg-sky-800 disabled:opacity-50">{{ saving ? 'Guardando...' : 'Guardar entrevista' }}</button></footer>
        </div>
      </section>
    </div>
  </main>
</template>
