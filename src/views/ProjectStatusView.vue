<script setup lang="ts">
import { ref } from 'vue';
import { api } from '../api/client';
import { Search, Building2, Clock3, CheckCircle2, XCircle, AlertCircle, CalendarDays } from 'lucide-vue-next';

type ProjectProposal = Awaited<ReturnType<typeof api.trackProjectProposals>>[number];

const email = ref('');
const proposals = ref<ProjectProposal[]>([]);
const loading = ref(false);
const searched = ref(false);
const error = ref('');

const statusDetails = {
  pendiente_revision: {
    label: 'En revisión',
    style: 'bg-amber-50 text-amber-800 border-amber-200',
    icon: Clock3,
    message: 'El equipo de Kirikú todavía está revisando esta propuesta.',
  },
  aprobado: {
    label: 'Aprobado',
    style: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    icon: CheckCircle2,
    message: 'La propuesta fue aprobada y podrá formar parte del catálogo de proyectos.',
  },
  rechazado: {
    label: 'Rechazado',
    style: 'bg-rose-50 text-rose-800 border-rose-200',
    icon: XCircle,
    message: 'La propuesta no fue aprobada.',
  },
} as const;

async function search() {
  const query = email.value.trim();
  if (!query) return;

  loading.value = true;
  searched.value = true;
  error.value = '';
  proposals.value = [];
  try {
    proposals.value = await api.trackProjectProposals(query);
  } catch (err: any) {
    error.value = err?.response?.data?.error || 'No se pudo consultar el seguimiento. Intenta nuevamente.';
  } finally {
    loading.value = false;
  }
}

function formatDate(value?: string) {
  if (!value) return 'Sin fecha registrada';
  return new Date(value).toLocaleDateString('es-BO', { year: 'numeric', month: 'long', day: 'numeric' });
}
</script>

<template>
  <main class="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-12 space-y-6">
    <section class="relative bg-white border border-stone-200 rounded-3xl p-6 sm:p-10 shadow-xs overflow-hidden">
      <div class="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#289EAB] via-[#F58F38] to-[#EB455F]"></div>
      <div class="max-w-2xl">
        <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E8F6F8] text-[#1E7B85] text-xs font-semibold mb-3">
          <Building2 class="w-3.5 h-3.5" />
          <span>Organizaciones aliadas</span>
        </div>
        <h1 class="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight mb-2">Seguimiento de proyecto inscrito</h1>
        <p class="text-stone-600 text-sm leading-relaxed mb-6">
          Consulta el estado de revisión de los proyectos enviados con el correo de contacto registrado para la organización.
        </p>

        <form @submit.prevent="search" class="flex flex-col sm:flex-row gap-3">
          <input
            v-model="email"
            type="email"
            required
            autocomplete="email"
            placeholder="correo@organizacion.org"
            aria-label="Correo de contacto de la organización"
            class="flex-1 px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#289EAB] focus:bg-white transition-all"
          />
          <button
            type="submit"
            :disabled="loading || !email.trim()"
            class="px-6 py-3 bg-[#289EAB] hover:bg-[#1E7B85] text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:bg-stone-200 disabled:text-stone-400 disabled:cursor-not-allowed"
          >
            <Search class="w-4 h-4" />
            {{ loading ? 'Consultando...' : 'Consultar proyectos' }}
          </button>
        </form>
      </div>
    </section>

    <div v-if="error" role="alert" class="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center gap-3">
      <AlertCircle class="w-5 h-5 text-rose-600 shrink-0" />
      <span>{{ error }}</span>
    </div>

    <section v-else-if="loading" aria-live="polite" class="py-12 text-center text-sm text-stone-500">
      Consultando las propuestas registradas...
    </section>

    <section v-else-if="searched && proposals.length === 0" class="bg-white rounded-3xl border border-stone-200 p-8 text-center">
      <Building2 class="w-10 h-10 text-stone-300 mx-auto mb-3" />
      <h2 class="font-bold text-stone-900 mb-1">No encontramos proyectos inscritos</h2>
      <p class="text-sm text-stone-600">Verifica que uses el correo de contacto registrado para la organización.</p>
    </section>

    <section v-else-if="proposals.length" class="space-y-4" aria-live="polite">
      <article v-for="project in proposals" :key="project.id" class="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-xs">
        <div class="p-6 sm:p-8">
          <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <p class="text-xs text-[#1E7B85] font-semibold mb-1">{{ project.organizacion_nombre }}</p>
              <h2 class="text-xl font-bold text-stone-900">{{ project.titulo }}</h2>
              <p class="text-sm text-stone-600 mt-1">{{ project.ubicacion }}</p>
            </div>
            <span :class="['self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold', statusDetails[project.estado]?.style || 'bg-stone-50 text-stone-700 border-stone-200']">
              <component :is="statusDetails[project.estado]?.icon || AlertCircle" class="w-4 h-4" />
              {{ statusDetails[project.estado]?.label || project.estado }}
            </span>
          </div>

          <p class="text-sm text-stone-600 mt-5">
            {{ statusDetails[project.estado]?.message || 'El estado del proyecto fue actualizado.' }}
          </p>
          <p v-if="project.estado === 'rechazado' && project.motivo_rechazo" class="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800">
            <strong>Motivo:</strong> {{ project.motivo_rechazo }}
          </p>
          <div class="flex items-center gap-2 mt-5 pt-4 border-t border-stone-100 text-xs text-stone-500">
            <CalendarDays class="w-4 h-4" />
            <span>Inscrito el {{ formatDate(project.created_at) }}</span>
            <span v-if="project.updated_at">· Actualizado el {{ formatDate(project.updated_at) }}</span>
          </div>
        </div>
      </article>
    </section>
  </main>
</template>
