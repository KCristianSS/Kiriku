<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '../../api/client';
import type { EvaluacionSaludItem, Proyecto } from '../../types';
import {
  HeartPulse,
  Brain,
  Search,
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  MapPin,
  ShieldCheck,
  ShieldAlert,
  Lock,
  ChevronRight,
  Send,
  CheckSquare,
  Activity,
  Eye,
} from 'lucide-vue-next';

// Access control state (KIR-56)
const authLoading = ref(true);
const currentUser = ref<{
  nombre: string;
  email: string;
  rol: string;
  permissions: string[];
}>({
  nombre: '',
  email: '',
  rol: '',
  permissions: [],
});

const canReadHealth = computed(() =>
  currentUser.value.permissions.includes('applications.read') ||
  currentUser.value.rol === 'administrador'
);
const canManageHealth = computed(() =>
  currentUser.value.permissions.includes('applications.manage') ||
  currentUser.value.rol === 'administrador'
);

// Queue & data state
const evaluations = ref<EvaluacionSaludItem[]>([]);
const projects = ref<Proyecto[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const accessDeniedMessage = ref<string | null>(null);
const successNotice = ref<string | null>(null);

// Metrics
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
const searchQuery = ref('');
let latestRequestId = 0;

// Evaluation Modal State (KIR-55 & KIR-56)
const selectedItem = ref<EvaluacionSaludItem | null>(null);
const decisionEstado = ref<'aprobado' | 'observado' | 'rechazado'>('aprobado');
const evaluadorNombre = ref('Equipo Médico y Bienestar Kirikú');
const puntajeBienestar = ref<number>(90);
const nivelRiesgo = ref<'bajo' | 'moderado' | 'alto'>('bajo');
const observacionesTexto = ref('');
const isSubmitting = ref(false);
const modalError = ref<string | null>(null);

// Clinical & Psychological Verification Checklist (KIR-54)
const checkAptoFisico = ref(true);
const checkAptoPsicologico = ref(true);
const checkExamenVigente = ref(true);
const checkCondicionCompatible = ref(true);

const quickPresets = [
  'Certificado médico vigente y valoración psicológica favorable para actividades comunitarias en campo.',
  'Requiere presentar certificado médico actualizado y constancia de vacunación o seguro antes de la asignación.',
  'Evaluación psicológica estable, alta tolerancia al trabajo colaborativo y manejo adecuado del estrés.',
  'Presenta contraindicación física o psicológica temporal para las exigencias operativas del proyecto.',
];

async function verifyAccessAndLoad() {
  authLoading.value = true;
  accessDeniedMessage.value = null;
  try {
    const me = await api.getMe();
    currentUser.value = {
      nombre: me.nombre,
      email: me.email,
      rol: me.rol,
      permissions: me.permissions || [],
    };
  } catch (err: any) {
    // Fallback al estado almacenado si el token aún se está validando
    const savedRole = localStorage.getItem('kiriku_user_role') || '';
    let savedPerms: string[] = [];
    try {
      savedPerms = JSON.parse(localStorage.getItem('kiriku_user_permissions') || '[]');
    } catch {}
    currentUser.value = {
      nombre: localStorage.getItem('kiriku_user_email') || 'Usuario',
      email: localStorage.getItem('kiriku_user_email') || '',
      rol: savedRole,
      permissions: Array.isArray(savedPerms) ? savedPerms : [],
    };
  } finally {
    authLoading.value = false;
  }

  if (canReadHealth.value) {
    await loadData();
  } else {
    accessDeniedMessage.value =
      'Tu rol actual (' +
      (currentUser.value.rol || 'sin rol asignado') +
      ') no tiene el permiso requerido (applications.read / applications.manage) para acceder al módulo confidencial de Salud Física y Psicológica.';
  }
}

async function loadData() {
  if (!canReadHealth.value) return;
  const requestId = ++latestRequestId;
  loading.value = true;
  error.value = null;
  try {
    const [evalsData, metricsData, projsData] = await Promise.all([
      api.getHealthEvaluations({
        estado: selectedFilter.value,
        proyecto_id: selectedProject.value !== 'todos' ? selectedProject.value : undefined,
        q: searchQuery.value.trim() || undefined,
      }),
      api.getHealthEvaluationsMetrics(),
      api.getProyectos({ estado: 'aprobado' }).catch(() => []),
    ]);

    if (requestId !== latestRequestId) return;
    evaluations.value = evalsData;
    metrics.value = metricsData;
    projects.value = projsData;
  } catch (err: any) {
    if (requestId !== latestRequestId) return;
    if (err?.response?.status === 403) {
      accessDeniedMessage.value =
        err?.response?.data?.error ||
        'Acceso denegado por control RBAC: no cuentas con permisos de consulta clínica.';
    } else {
      error.value = err?.response?.data?.error || 'No se pudieron cargar las evaluaciones de salud.';
    }
  } finally {
    if (requestId === latestRequestId) {
      loading.value = false;
    }
  }
}

onMounted(() => {
  verifyAccessAndLoad();
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
      const matchEmail = item.postulante.email.toLowerCase().includes(q);
      const matchProj = item.proyecto.titulo.toLowerCase().includes(q);
      return matchName || matchCi || matchEmail || matchProj;
    }
    return true;
  });
});

function getStageBadgeClass(item: EvaluacionSaludItem) {
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

function getStageLabel(item: EvaluacionSaludItem) {
  if (!item.puede_evaluar && item.etapa_estado === 'pendiente') {
    return 'Esperando Etapas 1–4';
  }
  switch (item.etapa_estado) {
    case 'aprobado':
      return 'Apto (Salud Aprobada)';
    case 'en_revision':
    case 'pendiente':
      return 'Listo para Salud';
    case 'observado':
      return 'Observado';
    case 'rechazado':
      return 'No Apto (Rechazado)';
    default:
      return item.etapa_estado;
  }
}

function getPrevStagePillClass(estado: string) {
  if (estado === 'aprobado') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (estado === 'rechazado') return 'bg-rose-50 text-rose-700 border-rose-200';
  if (estado === 'observado') return 'bg-orange-50 text-orange-700 border-orange-200';
  return 'bg-stone-100 text-stone-600 border-stone-200';
}

function getFilterLabel(filterKey: string) {
  switch (filterKey) {
    case 'pendientes':
      return 'Listos para Evaluar';
    case 'aprobado':
      return 'Aptos / Aprobados';
    case 'observado':
      return 'Observados';
    case 'rechazado':
      return 'Rechazados';
    case 'bloqueadas':
      return 'Bloqueadas (Etapas 1–4)';
    case 'todos':
      return 'Todas';
    default:
      return filterKey;
  }
}

function openEvaluationModal(item: EvaluacionSaludItem) {
  if (!canManageHealth.value || !item.puede_evaluar) return;
  selectedItem.value = item;
  modalError.value = null;

  if (item.etapa_estado === 'rechazado') {
    decisionEstado.value = 'rechazado';
  } else if (item.etapa_estado === 'observado') {
    decisionEstado.value = 'observado';
  } else {
    decisionEstado.value = 'aprobado';
  }

  evaluadorNombre.value =
    item.evaluador || currentUser.value.nombre || 'Equipo Médico y Bienestar Kirikú';
  observacionesTexto.value = item.comentarios || '';
  puntajeBienestar.value = 90;
  nivelRiesgo.value = 'bajo';

  checkAptoFisico.value = true;
  checkAptoPsicologico.value = true;
  checkExamenVigente.value = true;
  checkCondicionCompatible.value = true;
}

function closeEvaluationModal() {
  selectedItem.value = null;
  modalError.value = null;
}

async function handleSaveEvaluation() {
  if (!selectedItem.value || isSubmitting.value || !canManageHealth.value) return;

  if (
    (decisionEstado.value === 'rechazado' || decisionEstado.value === 'observado') &&
    observacionesTexto.value.trim().length < 5
  ) {
    modalError.value = `Debe especificar las observaciones médicas/psicológicas ${
      decisionEstado.value === 'rechazado' ? 'del rechazo' : 'de la observación'
    } (mínimo 5 caracteres).`;
    return;
  }

  isSubmitting.value = true;
  modalError.value = null;

  try {
    const res = await api.submitHealthEvaluation(selectedItem.value.postulacion_id, {
      estado: decisionEstado.value,
      evaluador: evaluadorNombre.value.trim(),
      comentarios: observacionesTexto.value.trim(),
      puntaje_bienestar: Number(puntajeBienestar.value) || 0,
      nivel_riesgo: nivelRiesgo.value,
      criterios: {
        apto_fisico: checkAptoFisico.value,
        apto_psicologico: checkAptoPsicologico.value,
        examen_medico_vigente: checkExamenVigente.value,
        condicion_especifica_atendida: checkCondicionCompatible.value,
      },
    });

    const msgExtra =
      res?.estado_general === 'aprobado'
        ? ' ¡Todas las 5 etapas completadas: postulación APROBADA!'
        : '';
    successNotice.value = `Evaluación de salud guardada para ${selectedItem.value.postulante.nombres} ${selectedItem.value.postulante.apellidos} (${decisionEstado.value.toUpperCase()}).${msgExtra}`;
    closeEvaluationModal();
    loadData();

    setTimeout(() => {
      successNotice.value = null;
    }, 5000);
  } catch (err: any) {
    modalError.value =
      err?.response?.data?.error || 'No se pudo registrar la evaluación de salud.';
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
          <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#EB455F] mb-1">
            <HeartPulse class="w-4 h-4" />
            <span>Módulo Kirikú • KIR-28 (Épica KIR-4 • Etapa 5)</span>
          </div>
          <h1 class="text-3xl font-extrabold text-stone-900 tracking-tight">
            Evaluación de Salud Física y Psicológica
          </h1>
          <p class="text-stone-600 text-sm mt-1">
            Valoración médica y bienestar psicológico confidencial con control de acceso basado en roles (RBAC) previo a la admisión final.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <!-- RBAC Access Control Status Badge (KIR-56) -->
          <div
            v-if="!authLoading"
            class="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-semibold"
            :class="
              canManageHealth
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : canReadHealth
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : 'bg-rose-50 text-rose-800 border-rose-200'
            "
          >
            <ShieldCheck v-if="canManageHealth" class="w-4 h-4 text-emerald-600 shrink-0" />
            <Eye v-else-if="canReadHealth" class="w-4 h-4 text-amber-600 shrink-0" />
            <ShieldAlert v-else class="w-4 h-4 text-rose-600 shrink-0" />
            <span>
              Rol: <strong>{{ currentUser.rol || 'usuario' }}</strong>
              •
              {{
                canManageHealth
                  ? 'Lectura y Evaluación Habilitada'
                  : canReadHealth
                  ? 'Solo Lectura (Sin permiso de registro)'
                  : 'Acceso Restringido'
              }}
            </span>
          </div>

          <router-link
            to="/admin"
            class="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-stone-700 bg-white border border-stone-300 rounded-xl hover:bg-stone-100 transition-colors shadow-xs"
          >
            <ArrowLeft class="w-4 h-4" />
            Panel General
          </router-link>

          <button
            v-if="canReadHealth"
            @click="loadData"
            :disabled="loading"
            class="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#EB455F] hover:bg-[#D1324B] rounded-xl transition-all shadow-xs disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      <!-- Verificando permisos -->
      <div v-if="authLoading" class="py-16 text-center bg-white rounded-2xl border border-stone-200 shadow-xs">
        <RefreshCw class="w-8 h-8 text-[#EB455F] animate-spin mx-auto mb-3" />
        <p class="text-sm font-semibold text-stone-700">Verificando controles de acceso y permisos RBAC...</p>
      </div>

      <!-- Acceso Denegado (KIR-56) -->
      <div
        v-else-if="!canReadHealth || accessDeniedMessage"
        class="bg-white rounded-3xl border border-rose-200 p-8 sm:p-12 text-center shadow-xs space-y-4"
      >
        <div class="w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
          <Lock class="w-8 h-8" />
        </div>
        <h2 class="text-xl font-extrabold text-stone-900">Acceso Restringido al Módulo de Salud</h2>
        <p class="text-sm text-stone-600 max-w-lg mx-auto">
          {{ accessDeniedMessage }}
        </p>
        <div class="text-xs text-stone-500 bg-stone-50 border border-stone-200 rounded-xl p-3 max-w-md mx-auto">
          Permisos necesarios: <code class="font-mono font-semibold text-stone-800">applications.read</code> (consulta) y
          <code class="font-mono font-semibold text-stone-800">applications.manage</code> (registro de dictamen).
        </div>
        <div class="pt-2">
          <router-link
            to="/admin"
            class="inline-flex items-center gap-2 px-5 py-2.5 bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold rounded-xl transition-colors"
          >
            <ArrowLeft class="w-4 h-4" />
            Volver al Panel Administrativo
          </router-link>
        </div>
      </div>

      <template v-else>
        <!-- Banner Solo Lectura (RBAC KIR-56) -->
        <div
          v-if="!canManageHealth"
          class="bg-amber-50 border border-amber-200 text-amber-900 p-4 rounded-2xl text-xs sm:text-sm flex items-center gap-3 shadow-xs"
        >
          <Lock class="w-5 h-5 text-amber-600 shrink-0" />
          <div>
            <strong>Modo Solo Lectura:</strong> Tu rol (<strong>{{ currentUser.rol }}</strong>) cuenta con permiso de consulta
            (<code class="font-mono">applications.read</code>), pero no con el permiso clínico
            (<code class="font-mono">applications.manage</code>) para registrar o modificar dictámenes de salud.
          </div>
        </div>

        <!-- Metrics Ribbon -->
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
          <div class="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-rose-50 text-[#EB455F] flex items-center justify-center shrink-0">
              <HeartPulse class="w-5 h-5" />
            </div>
            <div>
              <div class="text-2xl font-bold text-stone-900 leading-none">{{ metrics.total }}</div>
              <div class="text-[11px] text-stone-500 font-medium mt-1">Total</div>
            </div>
          </div>

          <div class="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <Clock class="w-5 h-5" />
            </div>
            <div>
              <div class="text-2xl font-bold text-amber-900 leading-none">{{ metrics.pendientes }}</div>
              <div class="text-[11px] text-stone-500 font-medium mt-1">Listos para Salud</div>
            </div>
          </div>

          <div class="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <CheckCircle2 class="w-5 h-5" />
            </div>
            <div>
              <div class="text-2xl font-bold text-emerald-900 leading-none">{{ metrics.aprobados }}</div>
              <div class="text-[11px] text-stone-500 font-medium mt-1">Aptos / Aprobados</div>
            </div>
          </div>

          <div class="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
              <AlertTriangle class="w-5 h-5" />
            </div>
            <div>
              <div class="text-2xl font-bold text-orange-900 leading-none">{{ metrics.observados }}</div>
              <div class="text-[11px] text-stone-500 font-medium mt-1">Observados</div>
            </div>
          </div>

          <div class="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
              <XCircle class="w-5 h-5" />
            </div>
            <div>
              <div class="text-2xl font-bold text-rose-900 leading-none">{{ metrics.rechazados }}</div>
              <div class="text-[11px] text-stone-500 font-medium mt-1">No Aptos</div>
            </div>
          </div>

          <div class="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-stone-100 text-stone-600 flex items-center justify-center shrink-0">
              <Lock class="w-5 h-5" />
            </div>
            <div>
              <div class="text-2xl font-bold text-stone-800 leading-none">{{ metrics.bloqueadas }}</div>
              <div class="text-[11px] text-stone-500 font-medium mt-1">En Etapas 1–4</div>
            </div>
          </div>
        </div>

        <!-- Success Banner -->
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
              <span>Aptos / Aprobados</span>
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
              <span>Bloqueadas (Etapas 1–4)</span>
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
                placeholder="Buscar por nombre, CI, correo o proyecto..."
                class="w-full pl-10 pr-4 py-2 text-sm bg-stone-50 border border-stone-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#EB455F]"
              />
            </div>

            <div class="w-full sm:w-auto">
              <select
                v-model="selectedProject"
                @change="loadData"
                class="w-full sm:w-64 text-sm bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-stone-700 font-medium focus:outline-none focus:ring-2 focus:ring-[#EB455F]"
              >
                <option value="todos">Todos los Proyectos</option>
                <option v-for="p in projects" :key="p.id" :value="String(p.id)">
                  {{ p.titulo }}
                </option>
              </select>
            </div>
          </div>
        </div>

        <!-- Loading -->
        <div v-if="loading" class="py-20 text-center bg-white rounded-2xl border border-stone-200 shadow-xs">
          <RefreshCw class="w-8 h-8 text-[#EB455F] animate-spin mx-auto mb-3" />
          <h3 class="text-base font-semibold text-stone-800">Cargando evaluaciones médicas y psicológicas...</h3>
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
            <HeartPulse class="w-7 h-7" />
          </div>
          <h3 class="text-lg font-bold text-stone-800 mb-1">No hay postulaciones en esta bandeja</h3>
          <p class="text-sm text-stone-500 max-w-md mx-auto">
            No se encontraron registros para "{{ getFilterLabel(selectedFilter) }}" con los filtros aplicados.
          </p>
        </div>

        <!-- Queue Grid -->
        <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div
            v-for="item in filteredEvaluations"
            :key="item.etapa_id"
            class="bg-white rounded-2xl border border-stone-200/90 hover:border-rose-300 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4"
          >
            <div class="space-y-3">
              <!-- Card Header -->
              <div class="flex items-start justify-between gap-3">
                <div class="flex items-center gap-3">
                  <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-[#EB455F] to-[#B91C1C] text-white font-extrabold flex items-center justify-center text-base shadow-xs shrink-0">
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
                      <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-stone-100 text-stone-700">
                        {{ item.postulante.edad }} años
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

              <!-- Project Details -->
              <div class="bg-stone-50 p-3 rounded-xl border border-stone-100 space-y-1">
                <div class="text-[11px] font-semibold text-stone-400 uppercase tracking-wider">
                  Proyecto Asignado
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

              <!-- Etapas 1 a 4 resumen -->
              <div class="grid grid-cols-4 gap-1.5 text-center">
                <div class="px-2 py-1.5 rounded-lg border text-[10px] font-semibold" :class="getPrevStagePillClass(item.inicial_estado)">
                  1. Inicial<br /><span class="uppercase">{{ item.inicial_estado }}</span>
                </div>
                <div class="px-2 py-1.5 rounded-lg border text-[10px] font-semibold" :class="getPrevStagePillClass(item.tecnica_estado)">
                  2. Técnica<br /><span class="uppercase">{{ item.tecnica_estado }}</span>
                </div>
                <div class="px-2 py-1.5 rounded-lg border text-[10px] font-semibold" :class="getPrevStagePillClass(item.personal_estado)">
                  3. Personal<br /><span class="uppercase">{{ item.personal_estado }}</span>
                </div>
                <div class="px-2 py-1.5 rounded-lg border text-[10px] font-semibold" :class="getPrevStagePillClass(item.competencias_estado)">
                  4. Compet.<br /><span class="uppercase">{{ item.competencias_estado }}</span>
                </div>
              </div>

              <!-- Clinical Feedback -->
              <div v-if="item.comentarios" class="text-xs text-stone-600 bg-rose-50/50 p-2.5 rounded-xl border border-rose-100">
                <span class="font-semibold text-rose-900">Dictamen Médico / Psicológico:</span>
                <p class="mt-0.5 text-stone-700">{{ item.comentarios }}</p>
                <div class="text-[10px] text-stone-400 mt-1">
                  Evaluador: {{ item.evaluador || 'Equipo Médico y Bienestar' }}
                </div>
              </div>
            </div>

            <!-- Action Footer -->
            <div class="pt-3 border-t border-stone-100 flex items-center justify-between gap-2">
              <span class="text-[11px] text-stone-400">
                Postulación #{{ item.postulacion_id }}
              </span>

              <button
                v-if="!canManageHealth"
                disabled
                class="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-stone-100 text-stone-400 cursor-not-allowed"
                title="Requiere permiso applications.manage"
              >
                <Lock class="w-3.5 h-3.5" />
                <span>Solo Lectura</span>
              </button>

              <button
                v-else-if="!item.puede_evaluar"
                disabled
                class="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-stone-100 text-stone-400 cursor-not-allowed"
              >
                <Lock class="w-3.5 h-3.5" />
                <span>Requiere Competencias Aprobada</span>
              </button>

              <button
                v-else
                @click="openEvaluationModal(item)"
                class="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
                :class="item.etapa_estado === 'aprobado' ? 'bg-stone-100 hover:bg-stone-200 text-stone-800' : 'bg-[#EB455F] hover:bg-[#D1324B] text-white'"
              >
                <span>{{ item.etapa_estado === 'aprobado' ? 'Actualizar Dictamen' : 'Evaluar Salud' }}</span>
                <ChevronRight class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </template>

      <!-- MODAL EVALUACIÓN SALUD FÍSICA Y PSICOLÓGICA (KIR-55 & KIR-56) -->
      <div
        v-if="selectedItem"
        class="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
        @click.self="closeEvaluationModal"
      >
        <div class="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-stone-200 overflow-hidden my-auto max-h-[92vh] flex flex-col">
          <!-- Modal Header -->
          <div class="bg-gradient-to-r from-[#881337] to-[#BE123C] text-white p-6 relative">
            <button
              @click="closeEvaluationModal"
              class="absolute top-5 right-5 text-rose-200 hover:text-white p-1.5 rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
            >
              ✕
            </button>

            <div class="flex items-center gap-2 text-xs font-semibold text-rose-200 mb-1">
              <Brain class="w-4 h-4" />
              <span>Etapa 5 Final • Salud Física y Psicológica (KIR-28)</span>
            </div>

            <h2 class="text-xl sm:text-2xl font-bold text-white">
              Evaluar a {{ selectedItem.postulante.nombres }} {{ selectedItem.postulante.apellidos }}
            </h2>
            <div class="text-xs text-rose-100 mt-1 flex flex-wrap items-center gap-2">
              <span>CI: {{ selectedItem.postulante.ci }}</span>
              <span>•</span>
              <span>{{ selectedItem.postulante.edad }} años</span>
              <span>•</span>
              <span>Proyecto: {{ selectedItem.proyecto.titulo }}</span>
            </div>
          </div>

          <!-- Modal Body -->
          <div class="p-6 overflow-y-auto space-y-5 flex-1">
            <div
              v-if="modalError"
              class="bg-rose-50 border border-rose-200 text-rose-800 p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2"
            >
              <AlertTriangle class="w-4 h-4 text-rose-600 shrink-0" />
              <span>{{ modalError }}</span>
            </div>

            <!-- Checklist Clínico y Psicológico (KIR-54) -->
            <div class="space-y-3">
              <h4 class="text-xs font-bold text-stone-400 uppercase tracking-wider flex items-center gap-1.5">
                <CheckSquare class="w-3.5 h-3.5 text-[#EB455F]" />
                <span>Criterios de Aptitud Física y Psicológica</span>
              </h4>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <label
                  class="flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer"
                  :class="checkAptoFisico ? 'bg-emerald-50/50 border-emerald-200' : 'bg-stone-50 border-stone-200'"
                >
                  <input type="checkbox" v-model="checkAptoFisico" class="mt-0.5 rounded text-rose-600" />
                  <div>
                    <div class="text-xs font-bold text-stone-900">Aptitud Física para Campo</div>
                    <div class="text-[11px] text-stone-500">Condición física acorde al esfuerzo requerido</div>
                  </div>
                </label>

                <label
                  class="flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer"
                  :class="checkAptoPsicologico ? 'bg-emerald-50/50 border-emerald-200' : 'bg-stone-50 border-stone-200'"
                >
                  <input type="checkbox" v-model="checkAptoPsicologico" class="mt-0.5 rounded text-rose-600" />
                  <div>
                    <div class="text-xs font-bold text-stone-900">Estabilidad Psicológica</div>
                    <div class="text-[11px] text-stone-500">Resiliencia emocional y manejo de estrés</div>
                  </div>
                </label>

                <label
                  class="flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer"
                  :class="checkExamenVigente ? 'bg-emerald-50/50 border-emerald-200' : 'bg-stone-50 border-stone-200'"
                >
                  <input type="checkbox" v-model="checkExamenVigente" class="mt-0.5 rounded text-rose-600" />
                  <div>
                    <div class="text-xs font-bold text-stone-900">Certificado Médico Vigente</div>
                    <div class="text-[11px] text-stone-500">Documentación médica validada y legible</div>
                  </div>
                </label>

                <label
                  class="flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer"
                  :class="checkCondicionCompatible ? 'bg-emerald-50/50 border-emerald-200' : 'bg-stone-50 border-stone-200'"
                >
                  <input type="checkbox" v-model="checkCondicionCompatible" class="mt-0.5 rounded text-rose-600" />
                  <div>
                    <div class="text-xs font-bold text-stone-900">Sin Restricciones Incompatibles</div>
                    <div class="text-[11px] text-stone-500">Alergias o condiciones debidamente contempladas</div>
                  </div>
                </label>
              </div>
            </div>

            <!-- Índice de Bienestar y Nivel de Riesgo -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-stone-50 p-4 rounded-2xl border border-stone-200">
              <div class="space-y-1.5">
                <div class="flex items-center justify-between text-xs font-bold text-stone-700">
                  <span class="flex items-center gap-1.5">
                    <Activity class="w-4 h-4 text-[#EB455F]" />
                    Índice de Bienestar (0–100)
                  </span>
                  <span class="text-base font-mono text-[#EB455F]">{{ puntajeBienestar }}/100</span>
                </div>
                <input type="range" min="0" max="100" step="5" v-model.number="puntajeBienestar" class="w-full accent-[#EB455F] cursor-pointer" />
              </div>

              <div class="space-y-1.5">
                <label class="text-xs font-bold text-stone-700 block">Nivel de Riesgo Clínico</label>
                <select
                  v-model="nivelRiesgo"
                  class="w-full px-3 py-2 text-xs font-semibold bg-white border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#EB455F]"
                >
                  <option value="bajo">Bajo — Sin observaciones limitantes</option>
                  <option value="moderado">Moderado — Requiere seguimiento o adaptación</option>
                  <option value="alto">Alto — Contraindicación para trabajo en campo</option>
                </select>
              </div>
            </div>

            <!-- Decisión -->
            <div class="space-y-2">
              <label class="text-xs font-bold text-stone-700 block">
                Dictamen Final de Salud <span class="text-rose-500">*</span>
              </label>

              <div class="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  @click="decisionEstado = 'aprobado'"
                  class="p-3 rounded-xl border text-center transition-all cursor-pointer"
                  :class="decisionEstado === 'aprobado' ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-200 text-emerald-900 font-bold' : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'"
                >
                  <CheckCircle2 class="w-5 h-5 mx-auto mb-1 text-emerald-600" />
                  <div class="text-xs">Apto / Aprobar</div>
                  <div class="text-[10px] text-stone-400 font-normal">Finaliza 5 etapas</div>
                </button>

                <button
                  type="button"
                  @click="decisionEstado = 'observado'"
                  class="p-3 rounded-xl border text-center transition-all cursor-pointer"
                  :class="decisionEstado === 'observado' ? 'bg-orange-50 border-orange-500 ring-2 ring-orange-200 text-orange-900 font-bold' : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'"
                >
                  <AlertTriangle class="w-5 h-5 mx-auto mb-1 text-orange-600" />
                  <div class="text-xs">Observar</div>
                  <div class="text-[10px] text-stone-400 font-normal">Pide certificado</div>
                </button>

                <button
                  type="button"
                  @click="decisionEstado = 'rechazado'"
                  class="p-3 rounded-xl border text-center transition-all cursor-pointer"
                  :class="decisionEstado === 'rechazado' ? 'bg-rose-50 border-rose-500 ring-2 ring-rose-200 text-rose-900 font-bold' : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'"
                >
                  <XCircle class="w-5 h-5 mx-auto mb-1 text-rose-600" />
                  <div class="text-xs">No Apto</div>
                  <div class="text-[10px] text-stone-400 font-normal">Cierra postulación</div>
                </button>
              </div>
            </div>

            <!-- Evaluador -->
            <div class="space-y-1.5">
              <label class="text-xs font-bold text-stone-700 block">
                Profesional / Equipo Responsable
              </label>
              <input
                v-model="evaluadorNombre"
                type="text"
                class="w-full px-3.5 py-2 text-sm bg-stone-50 border border-stone-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#EB455F]"
                placeholder="Ej. Equipo Médico y Bienestar Kirikú"
              />
            </div>

            <!-- Observaciones -->
            <div class="space-y-2">
              <div class="flex justify-between items-center text-xs font-bold text-stone-700">
                <label>
                  Observaciones Médicas y Psicológicas
                  <span v-if="decisionEstado === 'rechazado' || decisionEstado === 'observado'" class="text-rose-500">*</span>
                </label>
                <span class="text-stone-400 font-normal">{{ observacionesTexto.length }}/350</span>
              </div>

              <textarea
                v-model="observacionesTexto"
                rows="3"
                maxlength="350"
                class="w-full px-3.5 py-2 text-sm bg-stone-50 border border-stone-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#EB455F]"
                placeholder="Registra el dictamen médico, observaciones psicológicas o documentación requerida..."
              ></textarea>

              <div class="space-y-1">
                <span class="text-[11px] text-stone-500 font-semibold">Plantillas clínicas rápidas:</span>
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
              class="px-6 py-2 text-sm font-bold text-white bg-[#EB455F] hover:bg-[#D1324B] rounded-xl transition-all shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Send class="w-4 h-4" />
              <span>{{ isSubmitting ? 'Guardando...' : 'Guardar Dictamen' }}</span>
            </button>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>
