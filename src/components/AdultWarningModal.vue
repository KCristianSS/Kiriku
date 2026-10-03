<script setup lang="ts">
import { ref } from 'vue';
import { ShieldAlert, Check, X, Info } from 'lucide-vue-next';

interface Props {
  isOpen: boolean;
  projectTitle?: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'confirm'): void;
  (e: 'close'): void;
}>();

const acceptedTerms = ref(false);

function handleConfirm() {
  if (acceptedTerms.value) {
    emit('confirm');
  }
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 overflow-y-auto bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
  >
    <div class="relative bg-white rounded-2xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-stone-200">
      <!-- Close button -->
      <button
        @click="emit('close')"
        class="absolute top-4 right-4 text-stone-400 hover:text-stone-600 p-1 rounded-lg hover:bg-stone-100"
        aria-label="Cerrar modal"
      >
        <X class="w-5 h-5" />
      </button>

      <!-- Icon Header -->
      <div class="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mb-5">
        <ShieldAlert class="w-6 h-6" />
      </div>

      <h3 class="text-xl font-bold text-stone-900 tracking-tight mb-2">
        Aviso de Mayoría de Edad
      </h3>

      <p class="text-sm text-stone-600 mb-4 leading-relaxed">
        El proyecto <strong class="text-stone-900">{{ projectTitle || 'seleccionado' }}</strong> requiere la participación de voluntarios con <strong>18 años o más</strong> para las actividades de voluntariado en campo.
      </p>

      <div class="bg-stone-50 rounded-xl p-4 border border-stone-200 mb-5 space-y-2 text-xs text-stone-700">
        <div class="flex items-start gap-2.5">
          <Info class="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
          <span>Verificación de Cédula de Identidad (CI) en las etapas de evaluación.</span>
        </div>
        <div class="flex items-start gap-2.5">
          <Info class="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
          <span>Cobertura de inducción y protocolo de prevención de riesgos en terreno.</span>
        </div>
        <div class="flex items-start gap-2.5">
          <Info class="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
          <span>Compromiso de conducta ética y respeto a las comunidades beneficiarias.</span>
        </div>
      </div>

      <!-- Checkbox Confirmation -->
      <label class="flex items-start gap-3 p-3 rounded-lg border border-stone-200 hover:bg-stone-50 cursor-pointer mb-6 transition-colors">
        <input
          type="checkbox"
          v-model="acceptedTerms"
          class="mt-1 w-4 h-4 rounded text-emerald-700 border-stone-300 focus:ring-emerald-600"
        />
        <span class="text-xs font-medium text-stone-800 leading-snug">
          Confirmo bajo juramento que tengo 18 años o más a la fecha de postulación y acepto las condiciones de seguridad y evaluación de Kirikú.
        </span>
      </label>

      <!-- Actions -->
      <div class="flex items-center justify-end gap-3">
        <button
          type="button"
          @click="emit('close')"
          class="px-4 py-2 text-sm font-medium text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors cursor-pointer"
        >
          Cancelar
        </button>
        <button
          type="button"
          @click="handleConfirm"
          :disabled="!acceptedTerms"
          :class="[
            'px-5 py-2 text-sm font-semibold rounded-lg shadow-sm transition-all flex items-center gap-2 cursor-pointer',
            acceptedTerms
              ? 'bg-emerald-700 hover:bg-emerald-800 text-white active:scale-95'
              : 'bg-stone-200 text-stone-400 cursor-not-allowed'
          ]"
        >
          <Check class="w-4 h-4" />
          Continuar a la Postulación
        </button>
      </div>
    </div>
  </div>
</template>
