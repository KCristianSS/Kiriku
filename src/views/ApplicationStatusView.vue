<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useApplicationsStore } from '../stores/applications';
import EvaluationStepper from '../components/EvaluationStepper.vue';
import {
  Search,
  Sparkles,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  User,
  ArrowRight,
} from 'lucide-vue-next';

const route = useRoute();
const applicationsStore = useApplicationsStore();

const searchInput = ref('');
const hasSearched = ref(false);

async function performSearch() {
  const query = searchInput.value.trim();
  if (!query) return;
  hasSearched.value = true;
  try {
    await applicationsStore.trackApplication(query);
  } catch (err) {
    console.error('Error tracking application:', err);
  }
}

onMounted(() => {
  if (route.query.busqueda && typeof route.query.busqueda === 'string') {
    searchInput.value = route.query.busqueda;
    performSearch();
  }
});
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-12 space-y-8">
    <!-- Header Banner -->
    <div class="relative bg-white border border-stone-200 rounded-3xl p-6 sm:p-10 shadow-xs overflow-hidden">
      <div class="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#289EAB] via-[#F58F38] to-[#EB455F]"></div>

      <div class="max-w-2xl">
        <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E8F6F8] text-[#1E7B85] text-xs font-semibold mb-3">
          <Sparkles class="w-3.5 h-3.5 text-[#289EAB]" />
          <span>Consulta en Tiempo Real</span>
        </div>

        <h1 class="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight mb-2">
          Seguimiento de Postulación
        </h1>
        <p class="text-stone-600 text-xs sm:text-sm leading-relaxed mb-6">
          Ingresa tu número de Cédula de Identidad (CI) o Correo Electrónico registrado para consultar en qué etapa de evaluación se encuentra tu postulación.
        </p>

        <!-- Search input box -->
        <form @submit.prevent="performSearch" class="flex flex-col sm:flex-row gap-3">
          <div class="relative flex-1">
            <Search class="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              v-model="searchInput"
              type="text"
              required
              placeholder="Ej. 8492019 LP o correo@ejemplo.com"
              class="w-full pl-10 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#289EAB] focus:bg-white transition-all font-mono"
            />
          </div>

          <button
            type="submit"
            :disabled="applicationsStore.loading || !searchInput.trim()"
            class="px-6 py-3 bg-[#289EAB] hover:bg-[#1E7B85] text-white text-sm font-semibold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:bg-stone-200 disabled:text-stone-400 disabled:cursor-not-allowed"
          >
            <span v-if="applicationsStore.loading">Consultando...</span>
            <span v-else>Consultar Estado</span>
            <ArrowRight v-if="!applicationsStore.loading" class="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>

    <!-- Error state -->
    <div
      v-if="applicationsStore.error"
      class="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-center gap-3"
    >
      <AlertCircle class="w-5 h-5 text-rose-600 shrink-0" />
      <span>{{ applicationsStore.error }}</span>
    </div>

    <!-- Loading state -->
    <div v-if="applicationsStore.loading" class="py-16 text-center">
      <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-stone-200 border-t-[#289EAB] mb-3"></div>
      <p class="text-sm text-stone-500 font-medium">Buscando postulación en la base de datos...</p>
    </div>

    <!-- No results state -->
    <div
      v-else-if="hasSearched && applicationsStore.trackingResults.length === 0"
      class="bg-white rounded-3xl border border-stone-200 p-8 sm:p-12 text-center"
    >
      <div class="w-16 h-16 bg-stone-100 text-stone-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <FileText class="w-8 h-8" />
      </div>
      <h3 class="text-base sm:text-lg font-bold text-stone-900 mb-1">No se encontraron postulaciones</h3>
      <p class="text-xs sm:text-sm text-stone-600 max-w-md mx-auto mb-6">
        No encontramos registros asociados al CI o correo "{{ searchInput }}". Verifica que los datos coincidan con los que registraste al postularte.
      </p>
      <router-link
        to="/postular"
        class="inline-flex items-center gap-2 px-5 py-2.5 bg-[#289EAB] text-white text-xs sm:text-sm font-semibold rounded-xl hover:bg-[#1E7B85] transition-colors"
      >
        <span>Ir al Formulario de Postulación</span>
        <ArrowRight class="w-4 h-4" />
      </router-link>
    </div>

    <!-- Results list -->
    <div v-else-if="applicationsStore.trackingResults.length > 0" class="space-y-8">
      <div
        v-for="item in applicationsStore.trackingResults"
        :key="item.postulacion.id"
        class="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-xs"
      >
        <!-- Card Header with Applicant & Project Info -->
        <div class="p-6 sm:p-8 border-b border-stone-100 bg-stone-50/50">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div>
              <div class="flex items-center gap-2 text-xs text-stone-500 mb-1">
                <span class="inline-flex items-center gap-1 font-semibold text-[#1E7B85] bg-[#E8F6F8] px-2 py-0.5 rounded-md">
                  <Building2 class="w-3.5 h-3.5" />
                  {{ item.postulacion.proyecto?.organizacion_nombre || 'Kirikú' }}
                </span>
                <span>·</span>
                <span class="font-mono">{{ new Date(item.postulacion.created_at).toLocaleDateString('es-BO') }}</span>
              </div>
              <h2 class="text-xl sm:text-2xl font-bold text-stone-900">
                {{ item.postulacion.proyecto?.titulo }}
              </h2>
            </div>

            <!-- General Status Badge -->
            <div class="self-start sm:self-center">
              <span
                :class="[
                  'px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider',
                  item.postulacion.estado_general === 'aprobado'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : item.postulacion.estado_general === 'rechazado'
                    ? 'bg-rose-100 text-rose-800 border border-rose-200'
                    : 'bg-amber-100 text-amber-800 border border-amber-200'
                ]"
              >
                {{ item.postulacion.estado_general === 'en_proceso' ? 'En Proceso de Evaluación' : item.postulacion.estado_general }}
              </span>
            </div>
          </div>

          <!-- Applicant metadata details -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-white rounded-2xl p-4 border border-stone-200">
            <div>
              <span class="text-stone-400 block mb-0.5">Postulante:</span>
              <strong class="text-stone-800">{{ item.postulante.nombres }} {{ item.postulante.apellidos }}</strong>
            </div>
            <div>
              <span class="text-stone-400 block mb-0.5">Cédula (CI):</span>
              <strong class="font-mono text-stone-800">{{ item.postulante.ci }}</strong>
            </div>
            <div>
              <span class="text-stone-400 block mb-0.5">Correo:</span>
              <span class="font-mono text-stone-700 truncate block">{{ item.postulante.email }}</span>
            </div>
            <div>
              <span class="text-stone-400 block mb-0.5">Profesión / Ocupación:</span>
              <span class="text-stone-700">{{ item.postulante.profesion_ocupacion || 'No especificada' }}</span>
            </div>
          </div>
        </div>

        <!-- Stepper Component (5 stages from DB) -->
        <div class="p-6 sm:p-8">
          <h3 class="text-sm font-bold text-stone-900 mb-6 flex items-center gap-2">
            <Clock class="w-4 h-4 text-[#289EAB]" />
            <span>Progreso en las 5 Etapas de Evaluación</span>
          </h3>

          <EvaluationStepper :etapas="item.postulacion.etapas || []" :interactive="false" />
        </div>
      </div>
    </div>
  </div>
</template>
