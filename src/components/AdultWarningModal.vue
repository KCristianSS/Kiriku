<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import {
  ShieldAlert,
  Check,
  X,
  Info,
  Calendar,
  Building2,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  FileCheck2,
} from 'lucide-vue-next';

interface Props {
  isOpen: boolean;
  projectTitle?: string;
  projectLocation?: string;
  projectOrg?: string;
  initialBirthDate?: string;
}

const props = withDefaults(defineProps<Props>(), {
  isOpen: false,
  projectTitle: '',
  projectLocation: '',
  projectOrg: '',
  initialBirthDate: '',
});

const emit = defineEmits<{
  (e: 'confirm', payload?: { confirmedDate?: string }): void;
  (e: 'close'): void;
}>();

const acceptedTerms = ref(false);
const testBirthDate = ref(props.initialBirthDate || '');

watch(
  () => props.initialBirthDate,
  (val) => {
    if (val) testBirthDate.value = val;
  }
);

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      acceptedTerms.value = false;
      if (props.initialBirthDate) {
        testBirthDate.value = props.initialBirthDate;
      }
    }
  }
);

// Calculated age in modal
const modalCalculatedAge = computed<number | null>(() => {
  if (!testBirthDate.value) return null;
  const birth = new Date(testBirthDate.value);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
});

const isUnderage = computed(() => {
  if (modalCalculatedAge.value === null) return false;
  return modalCalculatedAge.value < 18;
});

const canConfirm = computed(() => {
  if (!acceptedTerms.value) return false;
  if (isUnderage.value) return false;
  return true;
});

function handleConfirm() {
  if (canConfirm.value) {
    emit('confirm', { confirmedDate: testBirthDate.value });
  }
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 overflow-y-auto bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 transition-all"
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-headline"
  >
    <div
      class="relative bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl border border-stone-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
    >
      <!-- Top color banner accent (Kirikú Brand Stripe) -->
      <div class="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#289EAB] via-[#F58F38] to-[#EB455F]"></div>

      <!-- Close button -->
      <button
        @click="emit('close')"
        class="absolute top-5 right-5 text-stone-400 hover:text-stone-700 p-1.5 rounded-full hover:bg-stone-100 transition-colors cursor-pointer"
        aria-label="Cerrar modal"
      >
        <X class="w-5 h-5" />
      </button>

      <!-- Icon & Title Header -->
      <div class="flex items-start gap-4 mb-5">
        <div class="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0 shadow-xs">
          <ShieldAlert class="w-7 h-7" />
        </div>
        <div>
          <div class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold mb-1">
            <AlertTriangle class="w-3.5 h-3.5 text-amber-600" />
            <span>KIR-98: Requisito Excluyente</span>
          </div>
          <h3 id="modal-headline" class="text-xl sm:text-2xl font-extrabold text-stone-900 tracking-tight">
            Aviso de Mayoría de Edad (+18 Años)
          </h3>
          <p class="text-xs sm:text-sm text-stone-500 mt-0.5">
            Verificación legal y de seguridad previa a la postulación de voluntariado.
          </p>
        </div>
      </div>

      <!-- Project context card -->
      <div v-if="projectTitle" class="bg-gradient-to-br from-stone-50 to-[#E8F6F8]/30 rounded-2xl p-4 border border-stone-200 mb-5 text-xs text-stone-600">
        <div class="flex items-center justify-between gap-2 mb-1">
          <span class="font-bold text-stone-900 text-sm truncate">{{ projectTitle }}</span>
          <span class="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0">
            +18 Años Obligatorio
          </span>
        </div>
        <div class="flex flex-wrap items-center gap-3 text-stone-500 mt-1">
          <span v-if="projectOrg" class="flex items-center gap-1 font-medium text-[#1E7B85]">
            <Building2 class="w-3.5 h-3.5" />
            {{ projectOrg }}
          </span>
          <span v-if="projectLocation" class="flex items-center gap-1">
            <MapPin class="w-3.5 h-3.5 text-stone-400" />
            {{ projectLocation }}
          </span>
        </div>
      </div>

      <!-- Conditions explanation boxes -->
      <div class="space-y-2.5 text-xs text-stone-700 mb-5">
        <div class="flex items-start gap-3 p-3 rounded-xl bg-stone-50 border border-stone-200">
          <Info class="w-4 h-4 text-[#289EAB] shrink-0 mt-0.5" />
          <div>
            <strong class="text-stone-900 block mb-0.5">Marco de Seguridad y Voluntariado en Campo:</strong>
            <span>
              Este proyecto contempla actividades de campo, logística o interacción comunitaria que, por normativa de prevención y cobertura de seguro voluntario, exigen tener 18 años cumplidos.
            </span>
          </div>
        </div>

        <div class="flex items-start gap-3 p-3 rounded-xl bg-stone-50 border border-stone-200">
          <FileCheck2 class="w-4 h-4 text-[#F58F38] shrink-0 mt-0.5" />
          <div>
            <strong class="text-stone-900 block mb-0.5">Verificación de Cédula de Identidad (CI):</strong>
            <span>
              La edad declarada se contrastará formalmente con tu CI en la Etapa 1 (Admisión Inicial). Postulaciones de menores de edad serán rechazadas automáticamente por el sistema.
            </span>
          </div>
        </div>
      </div>

      <!-- Quick Pre-Check Tool (KIR-99) inside modal -->
      <div class="bg-amber-50/60 rounded-2xl p-4 border border-amber-200 mb-5">
        <div class="flex items-center justify-between mb-2">
          <label for="modal-birthdate" class="text-xs font-bold text-stone-800 flex items-center gap-1.5">
            <Calendar class="w-3.5 h-3.5 text-amber-700" />
            <span>Verifica tu edad antes de continuar (Opcional):</span>
          </label>
          <span v-if="modalCalculatedAge !== null" class="font-mono text-xs font-bold text-stone-800">
            {{ modalCalculatedAge }} años
          </span>
        </div>

        <input
          id="modal-birthdate"
          v-model="testBirthDate"
          type="date"
          class="w-full px-3 py-2 bg-white border border-amber-300 rounded-xl text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#289EAB] font-mono"
        />

        <div v-if="modalCalculatedAge !== null" class="mt-2 text-xs">
          <div
            v-if="isUnderage"
            class="flex items-center gap-1.5 text-rose-700 bg-rose-50 px-2.5 py-1.5 rounded-lg border border-rose-200 font-semibold"
          >
            <AlertTriangle class="w-4 h-4 shrink-0 text-rose-600" />
            <span>Edad calculada: {{ modalCalculatedAge }} años. No cumples el requisito mínimo de +18 para este proyecto.</span>
          </div>
          <div
            v-else
            class="flex items-center gap-1.5 text-emerald-800 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200 font-medium"
          >
            <CheckCircle2 class="w-4 h-4 shrink-0 text-emerald-600" />
            <span>Edad calculada: {{ modalCalculatedAge }} años. Cumples con la mayoría de edad habilitada.</span>
          </div>
        </div>
      </div>

      <!-- Sworn statement checkbox -->
      <label
        :class="[
          'flex items-start gap-3 p-3.5 rounded-xl border transition-all cursor-pointer mb-6',
          acceptedTerms
            ? 'border-[#289EAB] bg-[#E8F6F8]/40 text-stone-900'
            : 'border-stone-200 hover:bg-stone-50 text-stone-700'
        ]"
      >
        <input
          type="checkbox"
          v-model="acceptedTerms"
          :disabled="isUnderage"
          class="mt-1 w-4 h-4 rounded text-[#289EAB] border-stone-300 focus:ring-[#289EAB] cursor-pointer disabled:cursor-not-allowed"
        />
        <span class="text-xs font-medium leading-relaxed">
          <strong class="text-stone-900">Declaración Jurada:</strong> Confirmo bajo juramento que tengo <strong>18 años o más</strong> a la fecha de inicio del proyecto y acepto presentar mi documento de identidad en la verificación inicial.
        </span>
      </label>

      <!-- Action buttons -->
      <div class="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2 border-t border-stone-100">
        <button
          type="button"
          @click="emit('close')"
          class="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 rounded-xl transition-colors cursor-pointer"
        >
          Cancelar / Ver Otros Proyectos
        </button>

        <button
          type="button"
          @click="handleConfirm"
          :disabled="!canConfirm"
          :class="[
            'w-full sm:w-auto px-5 py-2.5 text-xs font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer',
            canConfirm
              ? 'bg-[#289EAB] hover:bg-[#1E7B85] text-white active:scale-98 shadow-sm'
              : 'bg-stone-200 text-stone-400 cursor-not-allowed shadow-none'
          ]"
        >
          <Check class="w-4 h-4" />
          <span>Continuar a la Postulación</span>
          <ArrowRight class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  </div>
</template>
