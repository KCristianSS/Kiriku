<script setup lang="ts">
import { ref } from 'vue';
import {
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  FileCheck,
  UserCheck,
  Brain,
  Activity,
  Award,
  ChevronDown,
  ChevronUp,
} from 'lucide-vue-next';
import type { EvaluacionEtapa, EtapaNombre, EtapaEstado } from '../types';

interface Props {
  etapas: EvaluacionEtapa[];
  interactive?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  interactive: false,
});

const emit = defineEmits<{
  (
    e: 'update-stage',
    payload: {
      etapaId: string;
      estado: EtapaEstado;
      comentarios?: string;
      evaluador?: string;
    }
  ): void;
}>();

const stageMetadata: Record<
  EtapaNombre,
  { label: string; short: string; description: string; icon: any }
> = {
  inicial: {
    label: '1. Etapa Inicial',
    short: 'Inicial',
    description: 'Recepción y verificación de CI, mayoría de edad y requisitos formales.',
    icon: FileCheck,
  },
  tecnica: {
    label: '2. Evaluación Técnica',
    short: 'Técnica',
    description: 'Validación por el socio territorial de capacidades y perfil de voluntariado.',
    icon: Award,
  },
  personal: {
    label: '3. Entrevista Personal',
    short: 'Personal',
    description: 'Entrevista individual de motivación, compromiso y disponibilidad horaria.',
    icon: UserCheck,
  },
  competencias: {
    label: '4. Evaluación de Competencias',
    short: 'Competencias',
    description: 'Taller de dinámica grupal, resolución de dilemas éticos y trabajo en equipo.',
    icon: Brain,
  },
  salud_fisica_psicologica: {
    label: '5. Salud Física y Psicológica',
    short: 'Salud Integral',
    description: 'Dictamen de aptitud física y bienestar psicológico para actividades comunitarias.',
    icon: Activity,
  },
};

const expandedStage = ref<string | null>(null);
const editForm = ref<{
  etapaId: string;
  estado: EtapaEstado;
  comentarios: string;
  evaluador: string;
} | null>(null);

function getStageMeta(etapa: EtapaNombre) {
  return (
    stageMetadata[etapa] || {
      label: etapa,
      short: etapa,
      description: '',
      icon: FileCheck,
    }
  );
}

function getStatusBadge(estado: EtapaEstado) {
  switch (estado) {
    case 'aprobado':
      return {
        text: 'Aprobada',
        bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        icon: CheckCircle2,
      };
    case 'en_revision':
      return {
        text: 'En Revisión',
        bg: 'bg-blue-50 text-blue-800 border-blue-200',
        icon: Clock,
      };
    case 'observado':
      return {
        text: 'Observada',
        bg: 'bg-amber-50 text-amber-800 border-amber-200',
        icon: AlertCircle,
      };
    case 'rechazado':
      return {
        text: 'No Aprobada',
        bg: 'bg-rose-50 text-rose-800 border-rose-200',
        icon: XCircle,
      };
    default:
      return {
        text: 'Pendiente',
        bg: 'bg-stone-50 text-stone-600 border-stone-200',
        icon: AlertCircle,
      };
  }
}

function toggleExpand(id: string) {
  expandedStage.value = expandedStage.value === id ? null : id;
}

function openEdit(stage: EvaluacionEtapa) {
  editForm.value = {
    etapaId: stage.id,
    estado: stage.estado,
    comentarios: stage.comentarios || '',
    evaluador: stage.evaluador || 'Equipo Kirikú',
  };
}

function saveEdit() {
  if (!editForm.value) return;
  emit('update-stage', {
    etapaId: editForm.value.etapaId,
    estado: editForm.value.estado,
    comentarios: editForm.value.comentarios,
    evaluador: editForm.value.evaluador,
  });
  editForm.value = null;
}
</script>

<template>
  <div class="space-y-3">
    <!-- Stepper horizontal bar for desktop -->
    <div class="hidden sm:grid grid-cols-5 gap-2 pb-3 border-b border-stone-200">
      <div
        v-for="stage in etapas"
        :key="stage.id"
        :class="[
          'p-2.5 rounded-xl border text-center transition-all',
          stage.estado === 'aprobado'
            ? 'border-emerald-300 bg-emerald-50/50'
            : stage.estado === 'en_revision'
            ? 'border-blue-400 bg-blue-50/50 shadow-xs ring-1 ring-blue-300'
            : stage.estado === 'observado'
            ? 'border-amber-300 bg-amber-50/50'
            : stage.estado === 'rechazado'
            ? 'border-rose-300 bg-rose-50/50'
            : 'border-stone-200 bg-stone-50/40 opacity-75'
        ]"
      >
        <div class="flex items-center justify-center mb-1">
          <component
            :is="getStatusBadge(stage.estado).icon"
            :class="[
              'w-5 h-5',
              stage.estado === 'aprobado'
                ? 'text-emerald-700'
                : stage.estado === 'en_revision'
                ? 'text-blue-700 animate-pulse'
                : stage.estado === 'observado'
                ? 'text-amber-700'
                : stage.estado === 'rechazado'
                ? 'text-rose-700'
                : 'text-stone-400'
            ]"
          />
        </div>
        <div class="text-xs font-bold text-stone-900 truncate">
          {{ getStageMeta(stage.etapa).short }}
        </div>
        <div
          :class="[
            'text-[10px] font-semibold uppercase tracking-wider',
            stage.estado === 'aprobado'
              ? 'text-emerald-700'
              : stage.estado === 'en_revision'
              ? 'text-blue-700'
              : stage.estado === 'observado'
              ? 'text-amber-700'
              : stage.estado === 'rechazado'
              ? 'text-rose-700'
              : 'text-stone-500'
          ]"
        >
          {{ getStatusBadge(stage.estado).text }}
        </div>
      </div>
    </div>

    <!-- Detailed List View for each Stage -->
    <div class="space-y-2">
      <div
        v-for="(stage, idx) in etapas"
        :key="stage.id"
        class="border border-stone-200 rounded-xl bg-white overflow-hidden transition-all"
      >
        <div
          @click="toggleExpand(stage.id)"
          class="p-3.5 flex items-center justify-between cursor-pointer hover:bg-stone-50 transition-colors"
        >
          <div class="flex items-center gap-3">
            <div
              :class="[
                'w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold',
                stage.estado === 'aprobado'
                  ? 'bg-emerald-100 text-emerald-800'
                  : stage.estado === 'en_revision'
                  ? 'bg-blue-100 text-blue-800 ring-2 ring-blue-300'
                  : stage.estado === 'observado'
                  ? 'bg-amber-100 text-amber-800'
                  : stage.estado === 'rechazado'
                  ? 'bg-rose-100 text-rose-800'
                  : 'bg-stone-100 text-stone-500'
              ]"
            >
              {{ idx + 1 }}
            </div>
            <div>
              <h4 class="text-sm font-bold text-stone-900 leading-tight">
                {{ getStageMeta(stage.etapa).label }}
              </h4>
              <p class="text-xs text-stone-500 line-clamp-1">
                {{ getStageMeta(stage.etapa).description }}
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <span
              :class="[
                'text-xs font-semibold px-2.5 py-0.5 rounded-full border flex items-center gap-1',
                getStatusBadge(stage.estado).bg
              ]"
            >
              <component :is="getStatusBadge(stage.estado).icon" class="w-3.5 h-3.5" />
              {{ getStatusBadge(stage.estado).text }}
            </span>
            <component
              :is="expandedStage === stage.id ? ChevronUp : ChevronDown"
              class="w-4 h-4 text-stone-400"
            />
          </div>
        </div>

        <!-- Expanded Detail Area -->
        <div v-if="expandedStage === stage.id" class="px-4 pb-4 pt-1 bg-stone-50 border-t border-stone-100 text-xs space-y-2">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div>
              <span class="text-stone-400 block font-medium">Evaluador asignado:</span>
              <span class="text-stone-800 font-medium">{{ stage.evaluador || 'Por asignar' }}</span>
            </div>
            <div>
              <span class="text-stone-400 block font-medium">Última actualización:</span>
              <span class="text-stone-800 font-mono tabular-nums">
                {{ stage.fecha_evaluacion ? new Date(stage.fecha_evaluacion).toLocaleString('es-BO') : 'Pendiente' }}
              </span>
            </div>
          </div>

          <div class="pt-1">
            <span class="text-stone-400 block font-medium">Observaciones y Comentarios:</span>
            <p class="text-stone-700 bg-white p-2.5 rounded-lg border border-stone-200 mt-1">
              {{ stage.comentarios || 'Sin observaciones registradas todavía.' }}
            </p>
          </div>

          <!-- Admin Quick Action Trigger -->
          <div v-if="interactive" class="pt-2 flex justify-end">
            <button
              @click.stop="openEdit(stage)"
              class="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-semibold text-xs transition-colors cursor-pointer"
            >
              Calificar esta Etapa
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Admin Evaluation Modal / Form -->
    <div
      v-if="editForm"
      class="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-stone-200">
        <h3 class="text-lg font-bold text-stone-900 mb-1">
          Calificar Etapa de Evaluación
        </h3>
        <p class="text-xs text-stone-500 mb-4">
          Actualice el estado y documente observaciones conforme al protocolo de Kirikú.
        </p>

        <div class="space-y-3">
          <div>
            <label class="block text-xs font-semibold text-stone-700 mb-1">Estado de la Etapa</label>
            <select
              v-model="editForm.estado"
              class="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 bg-white text-stone-900 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
            >
              <option value="pendiente">Pendiente</option>
              <option value="en_revision">En Revisión</option>
              <option value="aprobado">Aprobada</option>
              <option value="observado">Observada</option>
              <option value="rechazado">Rechazada</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-semibold text-stone-700 mb-1">Nombre del Evaluador</label>
            <input
              type="text"
              v-model="editForm.evaluador"
              class="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
              placeholder="Ej: Lic. María Flores (Psicología)"
            />
          </div>

          <div>
            <label class="block text-xs font-semibold text-stone-700 mb-1">Observaciones / Feedback</label>
            <textarea
              v-model="editForm.comentarios"
              rows="3"
              class="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
              placeholder="Escriba comentarios sobre el desempeño o motivos de la decisión..."
            ></textarea>
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 mt-5">
          <button
            type="button"
            @click="editForm = null"
            class="px-3.5 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 rounded-lg cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            @click="saveEdit"
            class="px-4 py-1.5 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg shadow-sm cursor-pointer"
          >
            Guardar Calificación
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
