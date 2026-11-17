<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '../../api/client';
import type { EvaluacionInicialItem, Proyecto, EtapaEstado } from '../../types';
import {
  Users,
  Search,
  Filter,
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  Building2,
  MapPin,
  Calendar,
  ShieldCheck,
  UserCheck,
  FileText,
  Mail,
  Phone,
  Sparkles,
  ChevronRight,
  Send,
  HelpCircle,
  CheckSquare,
  Square,
  Award,
} from 'lucide-vue-next';

// State
const evaluations = ref<EvaluacionInicialItem[]>([]);
const projects = ref<Proyecto[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const successNotice = ref<string | null>(null);

// Metrics
const metrics = ref({
  total: 0,
  pendientes: 0,
  aprobados: 0,
  observados: 0,
  rechazados: 0,
});

// Filters
const selectedFilter = ref<'pendientes' | 'aprobados' | 'observados' | 'rechazados' | 'todos'>('pendientes');
const selectedProject = ref('todos');
const searchQuery = ref('');

// Evaluation Modal State
const selectedItem = ref<EvaluacionInicialItem | null>(null);
const decisionEstado = ref<'aprobado' | 'observado' | 'rechazado'>('aprobado');
const evaluadorNombre = ref('Comité de Admisiones Kirikú');
const observacionesTexto = ref('');
const isSubmitting = ref(false);
const modalError = ref<string | null>(null);

// Verification Checklist (KIR-70 & KIR-72)
const checkMayoriaEdad = ref(true);
const checkIdentidad = ref(true);
const checkMotivacion = ref(true);
const checkDisponibilidad = ref(true);

// Quick observation presets
const quickPresets = [
  'Cumple satisfactoriamente con la mayoría de edad y perfil de motivación para la iniciativa comunitaria.',
  'El documento de identidad o cédula requiere verificación adicional de fecha de nacimiento.',
  'La disponibilidad horaria declarada no se ajusta a las actividades requeridas en campo.',
  'Carta de motivación idónea y perfil compatible con trabajo territorial.',
  'No cumple con los requisitos iniciales ni mayoría de edad exigida.',
];

async function loadData() {
  loading.value = true;
  error.value = null;
  try {
    const [evalsData, metricsData, projsData] = await Promise.all([
      api.getInitialEvaluations({
        estado: selectedFilter.value,
        proyecto_id: selectedProject.value !== 'todos' ? selectedProject.value : undefined,
        q: searchQuery.value.trim() || undefined,
      }),
      api.getInitialEvaluationsMetrics(),
      api.getProyectos({ estado: 'aprobado' }).catch(() => []),
    ]);

    evaluations.value = evalsData;
    metrics.value = metricsData;
    projects.value = projsData;
  } catch (err: any) {
    error.value = err?.response?.data?.error || 'No se pudieron cargar las evaluaciones iniciales.';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadData();
});

// Filtered evaluations
const filteredEvaluations = computed(() => {
  return evaluations.value.filter((item) => {
    if (selectedProject.value !== 'todos' && String(item.proyecto.id) !== selectedProject.value) {
      return false;
    }
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase();
      const matchName = `${item.postulante.nombres} ${item.postulante.apellidos}`.toLowerCase().includes(q);
      const matchCi = item.postulante.ci.toLowerCase().includes(q);
      const matchEmail = item.postulante.email.toLowerCase().includes(q);
      const matchProj = item.proyecto.titulo.toLowerCase().includes(q);
      return matchName || matchCi || matchEmail || matchProj;
    }
    return true;
  });
});

function getStageBadgeClass(estado: string) {
  switch (estado) {
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

function getStageLabel(estado: string) {
  switch (estado) {
    case 'aprobado':
      return 'Aprobado';
    case 'en_revision':
      return 'En Revisión Inicial';
    case 'pendiente':
      return 'Pendiente';
    case 'observado':
      return 'Observado';
    case 'rechazado':
      return 'Rechazado';
    default:
      return estado;
  }
}

// Modal Handlers
function openEvaluationModal(item: EvaluacionInicialItem) {
  selectedItem.value = item;
  modalError.value = null;

  // Set default decision based on current state or default to 'aprobado'
  if (item.etapa_estado === 'rechazado') {
    decisionEstado.value = 'rechazado';
  } else if (item.etapa_estado === 'observado') {
    decisionEstado.value = 'observado';
  } else {
    decisionEstado.value = 'aprobado';
  }

  evaluadorNombre.value = item.evaluador || 'Comité de Admisiones Kirikú';
  observacionesTexto.value = item.comentarios || '';

  // Initialize checklist based on applicant age
  checkMayoriaEdad.value = item.postulante.es_mayor_edad;
  checkIdentidad.value = true;
  checkMotivacion.value = true;
  checkDisponibilidad.value = true;
}

function closeEvaluationModal() {
  selectedItem.value = null;
  modalError.value = null;
}

async function handleSaveEvaluation() {
  if (!selectedItem.value || isSubmitting.value) return;

  // Validation
  if (
    (decisionEstado.value === 'rechazado' || decisionEstado.value === 'observado') &&
    observacionesTexto.value.trim().length < 5
  ) {
    modalError.value = `Debe especificar las observaciones o causal ${decisionEstado.value === 'rechazado' ? 'del rechazo' : 'de la observación'} (mínimo 5 caracteres).`;
    return;
  }

  isSubmitting.value = true;
  modalError.value = null;

  try {
    const res = await api.submitInitialEvaluation(selectedItem.value.postulacion_id, {
      estado: decisionEstado.value,
      evaluador: evaluadorNombre.value.trim(),
      comentarios: observacionesTexto.value.trim(),
      criterios: {
        mayoria_edad_verificada: checkMayoriaEdad.value,
        identidad_ci_valida: checkIdentidad.value,
        carta_motivacion_apta: checkMotivacion.value,
        disponibilidad_confirmada: checkDisponibilidad.value,
      },
    });

    successNotice.value = `Evaluación inicial guardada con éxito para ${selectedItem.value.postulante.nombres} ${selectedItem.value.postulante.apellidos} (${decisionEstado.value.toUpperCase()}).`;
    closeEvaluationModal();
    loadData();

    setTimeout(() => {
      successNotice.value = null;
    }, 4000);
  } catch (err: any) {
    modalError.value = err?.response?.data?.error || 'No se pudo guardar la evaluación inicial.';
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen bg-stone-50 py-8 px-4 sm:px-6 lg:px-8">
    <div class="max-w-7xl mx-auto space-y-6">
      
      <!-- Top Breadcrumbs & Header -->
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-stone-200 pb-5">
        <div>
          <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#289EAB] mb-1">
            <UserCheck class="w-4 h-4" />
            <span>Módulo Kirikú • KIR-24 (Épica KIR-4)</span>
          </div>
          <h1 class="text-3xl font-extrabold text-stone-900 tracking-tight">
            Gestionar Evaluación Inicial
          </h1>
          <p class="text-stone-600 text-sm mt-1">
            Verificación y calificación de la Etapa 1 de postulaciones: cumplimiento de mayoría de edad (+18), identidad y motivación para habilitar la etapa técnica.
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

      <!-- Quick Metrics Ribbon (KIR-71) -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <!-- Total -->
        <div class="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs flex items-center gap-3.5">
          <div class="w-11 h-11 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
            <Users class="w-6 h-6" />
          </div>
          <div>
            <div class="text-2xl font-bold text-stone-900 leading-none">
              {{ metrics.total }}
            </div>
            <div class="text-xs text-stone-500 font-medium mt-1">Total Postulaciones</div>
          </div>
        </div>

        <!-- Pendientes / En Revisión -->
        <div class="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs flex items-center gap-3.5">
          <div class="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Clock class="w-6 h-6" />
          </div>
          <div>
            <div class="text-2xl font-bold text-amber-900 leading-none">
              {{ metrics.pendientes }}
            </div>
            <div class="text-xs text-stone-500 font-medium mt-1">Pendientes de Revisión</div>
          </div>
        </div>

        <!-- Aprobados (Avanzan a técnica) -->
        <div class="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs flex items-center gap-3.5">
          <div class="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 class="w-6 h-6" />
          </div>
          <div>
            <div class="text-2xl font-bold text-emerald-900 leading-none">
              {{ metrics.aprobados }}
            </div>
            <div class="text-xs text-stone-500 font-medium mt-1">Aprobados / Aptos</div>
          </div>
        </div>

        <!-- Observados -->
        <div class="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs flex items-center gap-3.5">
          <div class="w-11 h-11 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
            <AlertTriangle class="w-6 h-6" />
          </div>
          <div>
            <div class="text-2xl font-bold text-orange-900 leading-none">
              {{ metrics.observados }}
            </div>
            <div class="text-xs text-stone-500 font-medium mt-1">Observados</div>
          </div>
        </div>

        <!-- Rechazados -->
        <div class="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs flex items-center gap-3.5 col-span-2 sm:col-span-1">
          <div class="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <XCircle class="w-6 h-6" />
          </div>
          <div>
            <div class="text-2xl font-bold text-rose-900 leading-none">
              {{ metrics.rechazados }}
            </div>
            <div class="text-xs text-stone-500 font-medium mt-1">Rechazados</div>
          </div>
        </div>
      </div>

      <!-- Success Notification Banner -->
      <div
        v-if="successNotice"
        class="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl text-sm font-semibold flex items-center gap-2.5 shadow-xs animate-fade-in"
      >
        <CheckCircle2 class="w-5 h-5 text-emerald-600 shrink-0" />
        <span>{{ successNotice }}</span>
      </div>

      <!-- Filter Tabs & Search Bar (KIR-72) -->
      <div class="bg-white rounded-2xl border border-stone-200 p-4 sm:p-5 shadow-xs space-y-4">
        
        <!-- Filter Tabs -->
        <div class="flex flex-wrap items-center gap-2 border-b border-stone-100 pb-3">
          <button
            @click="selectedFilter = 'pendientes'; loadData()"
            :class="selectedFilter === 'pendientes' ? 'bg-amber-500 text-white font-bold shadow-xs' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'"
            class="px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer"
          >
            <span>Pendientes de Revisión</span>
            <span class="px-1.5 py-0.5 rounded-md text-[10px] bg-white/20 font-mono">
              {{ metrics.pendientes }}
            </span>
          </button>

          <button
            @click="selectedFilter = 'aprobados'; loadData()"
            :class="selectedFilter === 'aprobados' ? 'bg-emerald-600 text-white font-bold shadow-xs' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'"
            class="px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer"
          >
            <span>Aprobados</span>
            <span class="px-1.5 py-0.5 rounded-md text-[10px] bg-white/20 font-mono">
              {{ metrics.aprobados }}
            </span>
          </button>

          <button
            @click="selectedFilter = 'observados'; loadData()"
            :class="selectedFilter === 'observados' ? 'bg-orange-500 text-white font-bold shadow-xs' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'"
            class="px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer"
          >
            <span>Observados</span>
            <span class="px-1.5 py-0.5 rounded-md text-[10px] bg-white/20 font-mono">
              {{ metrics.observados }}
            </span>
          </button>

          <button
            @click="selectedFilter = 'rechazados'; loadData()"
            :class="selectedFilter === 'rechazados' ? 'bg-rose-600 text-white font-bold shadow-xs' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'"
            class="px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer"
          >
            <span>Rechazados</span>
            <span class="px-1.5 py-0.5 rounded-md text-[10px] bg-white/20 font-mono">
              {{ metrics.rechazados }}
            </span>
          </button>

          <button
            @click="selectedFilter = 'todos'; loadData()"
            :class="selectedFilter === 'todos' ? 'bg-stone-900 text-white font-bold shadow-xs' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'"
            class="px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer"
          >
            <span>Todas</span>
            <span class="px-1.5 py-0.5 rounded-md text-[10px] bg-white/20 font-mono">
              {{ metrics.total }}
            </span>
          </button>
        </div>

        <!-- Search & Project Select -->
        <div class="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div class="relative w-full sm:flex-1">
            <Search class="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              v-model="searchQuery"
              @input="loadData"
              type="text"
              placeholder="Buscar por nombre, CI, correo o proyecto..."
              class="w-full pl-10 pr-4 py-2 text-sm bg-stone-50 border border-stone-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
            />
          </div>

          <div class="w-full sm:w-auto">
            <select
              v-model="selectedProject"
              @change="loadData"
              class="w-full sm:w-60 text-sm bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-stone-700 font-medium focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
            >
              <option value="todos">Todos los Proyectos</option>
              <option v-for="p in projects" :key="p.id" :value="String(p.id)">
                {{ p.titulo }}
              </option>
            </select>
          </div>
        </div>

      </div>

      <!-- Loading State -->
      <div v-if="loading" class="py-20 text-center bg-white rounded-2xl border border-stone-200 shadow-xs">
        <RefreshCw class="w-8 h-8 text-[#0D9488] animate-spin mx-auto mb-3" />
        <h3 class="text-base font-semibold text-stone-800">Cargando evaluaciones iniciales...</h3>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="bg-rose-50 border border-rose-200 text-rose-800 p-6 rounded-2xl text-center space-y-3">
        <AlertTriangle class="w-8 h-8 text-rose-500 mx-auto" />
        <p class="font-medium text-sm">{{ error }}</p>
        <button
          @click="loadData"
          class="px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-semibold hover:bg-rose-700"
        >
          Reintentar
        </button>
      </div>

      <!-- Empty State -->
      <div v-else-if="filteredEvaluations.length === 0" class="bg-white rounded-2xl border border-stone-200 p-12 text-center shadow-xs">
        <div class="w-14 h-14 bg-stone-100 text-stone-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <UserCheck class="w-7 h-7" />
        </div>
        <h3 class="text-lg font-bold text-stone-800 mb-1">No hay postulaciones en esta bandeja</h3>
        <p class="text-sm text-stone-500 max-w-md mx-auto">
          No se encontraron registros que coincidan con el estado "{{ selectedFilter }}" o los filtros de búsqueda aplicados.
        </p>
      </div>

      <!-- Evaluation Queue List (KIR-72) -->
      <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div
          v-for="item in filteredEvaluations"
          :key="item.etapa_id"
          class="bg-white rounded-2xl border border-stone-200/90 hover:border-teal-300 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4"
        >
          <div class="space-y-3">
            
            <!-- Card Header: Volunteer Info & Status -->
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-center gap-3">
                <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-[#289EAB] to-[#1E4867] text-white font-extrabold flex items-center justify-center text-base shadow-xs shrink-0">
                  {{ item.postulante.nombres.charAt(0) }}{{ item.postulante.apellidos.charAt(0) }}
                </div>
                <div>
                  <h3 class="text-base font-bold text-stone-900 leading-tight">
                    {{ item.postulante.nombres }} {{ item.postulante.apellidos }}
                  </h3>
                  <div class="flex items-center gap-2 mt-1">
                    <span class="text-xs font-mono text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded">
                      CI: {{ item.postulante.ci }}
                    </span>
                    <span
                      class="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                      :class="item.postulante.es_mayor_edad ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'"
                    >
                      {{ item.postulante.edad }} años ({{ item.postulante.es_mayor_edad ? '+18 Mayor' : 'Menor de edad' }})
                    </span>
                  </div>
                </div>
              </div>

              <!-- Stage Status Badge -->
              <span
                class="text-xs font-semibold px-2.5 py-1 rounded-full border shrink-0"
                :class="getStageBadgeClass(item.etapa_estado)"
              >
                {{ getStageLabel(item.etapa_estado) }}
              </span>
            </div>

            <!-- Project Details -->
            <div class="bg-stone-50 p-3 rounded-xl border border-stone-100 space-y-1">
              <div class="text-[11px] font-semibold text-stone-400 uppercase tracking-wider">
                Proyecto Postulado
              </div>
              <div class="text-xs font-bold text-stone-800 line-clamp-1">
                {{ item.proyecto.titulo }}
              </div>
              <div class="text-[11px] text-stone-500 flex items-center gap-1">
                <MapPin class="w-3 h-3 text-stone-400 shrink-0" />
                <span class="truncate">{{ item.proyecto.ubicacion }}</span>
                <span v-if="item.proyecto.organizacion_nombre">• {{ item.proyecto.organizacion_nombre }}</span>
              </div>
            </div>

            <!-- Motivation letter preview -->
            <div class="space-y-1">
              <div class="text-[11px] font-semibold text-stone-400 uppercase tracking-wider">
                Motivación del Voluntario
              </div>
              <p class="text-xs text-stone-700 italic bg-stone-50/60 p-2.5 rounded-xl border border-stone-100 line-clamp-2">
                "{{ item.postulante.motivacion || 'Sin carta de motivación específica.' }}"
              </p>
            </div>

            <!-- Previous Evaluation Feedback (if evaluated) -->
            <div v-if="item.comentarios" class="text-xs text-stone-600 bg-teal-50/50 p-2.5 rounded-xl border border-teal-100">
              <span class="font-semibold text-teal-800">Observaciones del Evaluador:</span>
              <p class="mt-0.5 text-stone-700">{{ item.comentarios }}</p>
              <div class="text-[10px] text-stone-400 mt-1">
                Evaluador: {{ item.evaluador || 'Comité Kirikú' }}
              </div>
            </div>

          </div>

          <!-- Card Action Button -->
          <div class="pt-3 border-t border-stone-100 flex items-center justify-between">
            <span class="text-[11px] text-stone-400">
              Postulación: {{ new Date(item.postulacion_fecha).toLocaleDateString() }}
            </span>

            <button
              @click="openEvaluationModal(item)"
              class="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
              :class="item.etapa_estado === 'aprobado' ? 'bg-stone-100 hover:bg-stone-200 text-stone-800' : 'bg-[#0D9488] hover:bg-[#0F766E] text-white'"
            >
              <span>{{ item.etapa_estado === 'aprobado' ? 'Re-evaluar Etapa' : 'Evaluar Postulación' }}</span>
              <ChevronRight class="w-3.5 h-3.5" />
            </button>
          </div>

        </div>
      </div>

      <!-- MODAL FORMULARIO DE EVALUACIÓN INICIAL (KIR-72) -->
      <div
        v-if="selectedItem"
        class="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
        @click.self="closeEvaluationModal"
      >
        <div class="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-stone-200 overflow-hidden my-auto max-h-[92vh] flex flex-col">
          
          <!-- Modal Header -->
          <div class="bg-gradient-to-r from-stone-900 to-stone-800 text-white p-6 relative">
            <button
              @click="closeEvaluationModal"
              class="absolute top-5 right-5 text-stone-400 hover:text-white p-1.5 rounded-xl hover:bg-stone-700 transition-colors"
            >
              ✕
            </button>

            <div class="flex items-center gap-2 text-xs font-semibold text-teal-400 mb-1">
              <ShieldCheck class="w-4 h-4" />
              <span>Etapa 1: Admisión & Verificación Inicial</span>
            </div>

            <h2 class="text-xl sm:text-2xl font-bold text-white">
              Evaluar a {{ selectedItem.postulante.nombres }} {{ selectedItem.postulante.apellidos }}
            </h2>
            <div class="text-xs text-stone-300 mt-1 flex items-center gap-2">
              <span>CI: {{ selectedItem.postulante.ci }}</span>
              <span>•</span>
              <span>{{ selectedItem.postulante.edad }} años</span>
              <span>•</span>
              <span>Proyecto: {{ selectedItem.proyecto.titulo }}</span>
            </div>
          </div>

          <!-- Modal Body (Scrollable) -->
          <div class="p-6 overflow-y-auto space-y-6 flex-1">
            
            <!-- Error in Modal -->
            <div
              v-if="modalError"
              class="bg-rose-50 border border-rose-200 text-rose-800 p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2"
            >
              <AlertTriangle class="w-4 h-4 text-rose-600 shrink-0" />
              <span>{{ modalError }}</span>
            </div>

            <!-- SECCIÓN 1: CHECKLIST DE VERIFICACIÓN INICIAL (KIR-70 & KIR-72) -->
            <div class="space-y-3">
              <h4 class="text-xs font-bold text-stone-400 uppercase tracking-wider flex items-center gap-1.5">
                <CheckSquare class="w-3.5 h-3.5 text-teal-600" />
                <span>Checklist de Verificación de Requisitos Iniciales</span>
              </h4>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <!-- Checklist 1: Mayoría de edad -->
                <label
                  class="flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer"
                  :class="checkMayoriaEdad ? 'bg-emerald-50/50 border-emerald-200' : 'bg-stone-50 border-stone-200'"
                >
                  <input type="checkbox" v-model="checkMayoriaEdad" class="mt-0.5 rounded text-teal-600" />
                  <div>
                    <div class="text-xs font-bold text-stone-900">Mayoría de Edad (+18 años)</div>
                    <div class="text-[11px] text-stone-500">
                      Calculada: {{ selectedItem.postulante.edad }} años ({{ selectedItem.postulante.es_mayor_edad ? 'Cumple requisito' : 'Menor de 18' }})
                    </div>
                  </div>
                </label>

                <!-- Checklist 2: Identidad & CI -->
                <label
                  class="flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer"
                  :class="checkIdentidad ? 'bg-emerald-50/50 border-emerald-200' : 'bg-stone-50 border-stone-200'"
                >
                  <input type="checkbox" v-model="checkIdentidad" class="mt-0.5 rounded text-teal-600" />
                  <div>
                    <div class="text-xs font-bold text-stone-900">Cédula de Identidad & Contacto</div>
                    <div class="text-[11px] text-stone-500">
                      CI: {{ selectedItem.postulante.ci }} y teléfono verificables
                    </div>
                  </div>
                </label>

                <!-- Checklist 3: Motivación -->
                <label
                  class="flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer"
                  :class="checkMotivacion ? 'bg-emerald-50/50 border-emerald-200' : 'bg-stone-50 border-stone-200'"
                >
                  <input type="checkbox" v-model="checkMotivacion" class="mt-0.5 rounded text-teal-600" />
                  <div>
                    <div class="text-xs font-bold text-stone-900">Carta de Motivación Apta</div>
                    <div class="text-[11px] text-stone-500">
                      Coherencia con los valores del voluntariado
                    </div>
                  </div>
                </label>

                <!-- Checklist 4: Disponibilidad -->
                <label
                  class="flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer"
                  :class="checkDisponibilidad ? 'bg-emerald-50/50 border-emerald-200' : 'bg-stone-50 border-stone-200'"
                >
                  <input type="checkbox" v-model="checkDisponibilidad" class="mt-0.5 rounded text-teal-600" />
                  <div>
                    <div class="text-xs font-bold text-stone-900">Compromiso & Disponibilidad</div>
                    <div class="text-[11px] text-stone-500">
                      Aceptación de jornadas del proyecto
                    </div>
                  </div>
                </label>
              </div>
            </div>

            <!-- SECCIÓN 2: DECISIÓN DEL EVALUADOR -->
            <div class="space-y-2">
              <label class="text-xs font-bold text-stone-700 block">
                Resultado de la Evaluación Inicial <span class="text-rose-500">*</span>
              </label>

              <div class="grid grid-cols-3 gap-3">
                <!-- Aprobar -->
                <button
                  type="button"
                  @click="decisionEstado = 'aprobado'"
                  class="p-3 rounded-xl border text-center transition-all cursor-pointer"
                  :class="decisionEstado === 'aprobado' ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-200 text-emerald-900 font-bold' : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'"
                >
                  <CheckCircle2 class="w-5 h-5 mx-auto mb-1 text-emerald-600" />
                  <div class="text-xs">Aprobar</div>
                  <div class="text-[10px] text-stone-400 font-normal">Habilita Técnica</div>
                </button>

                <!-- Observar -->
                <button
                  type="button"
                  @click="decisionEstado = 'observado'"
                  class="p-3 rounded-xl border text-center transition-all cursor-pointer"
                  :class="decisionEstado === 'observado' ? 'bg-orange-50 border-orange-500 ring-2 ring-orange-200 text-orange-900 font-bold' : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'"
                >
                  <AlertTriangle class="w-5 h-5 mx-auto mb-1 text-orange-600" />
                  <div class="text-xs">Observar</div>
                  <div class="text-[10px] text-stone-400 font-normal">Pide corrección</div>
                </button>

                <!-- Rechazar -->
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

            <!-- SECCIÓN 3: EVALUADOR RESPONSABLE -->
            <div class="space-y-1.5">
              <label class="text-xs font-bold text-stone-700 block">
                Nombre del Evaluador o Comité
              </label>
              <input
                v-model="evaluadorNombre"
                type="text"
                class="w-full px-3.5 py-2 text-sm bg-stone-50 border border-stone-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
                placeholder="Ej. Comité de Admisiones Kirikú"
              />
            </div>

            <!-- SECCIÓN 4: OBSERVACIONES & MOTIVO -->
            <div class="space-y-2">
              <div class="flex justify-between items-center text-xs font-bold text-stone-700">
                <label>
                  Observaciones & Retroalimentación
                  <span v-if="decisionEstado === 'rechazado' || decisionEstado === 'observado'" class="text-rose-500">*</span>
                </label>
                <span class="text-stone-400 font-normal">{{ observacionesTexto.length }}/300</span>
              </div>

              <textarea
                v-model="observacionesTexto"
                rows="3"
                maxlength="300"
                class="w-full px-3.5 py-2 text-sm bg-stone-50 border border-stone-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
                placeholder="Escribe las notas u observaciones oficiales de la evaluación inicial..."
              ></textarea>

              <!-- Quick presets -->
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
                    {{ p.substring(0, 45) }}...
                  </button>
                </div>
              </div>
            </div>

          </div>

          <!-- Modal Footer -->
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
              class="px-6 py-2 text-sm font-bold text-white bg-[#0D9488] hover:bg-[#0F766E] rounded-xl transition-all shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Send class="w-4 h-4" />
              <span>{{ isSubmitting ? 'Guardando...' : 'Guardar Decisión' }}</span>
            </button>
          </div>

        </div>
      </div>

    </div>
  </div>
</template>
