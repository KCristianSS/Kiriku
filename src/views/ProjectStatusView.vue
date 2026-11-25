<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '../api/client';
import { useAuthAccess, validateNumericBoundsClient } from '../composables/useAuthAccess';
import {
  Search,
  Building2,
  Clock3,
  CheckCircle2,
  XCircle,
  AlertCircle,
  CalendarDays,
  Globe,
  EyeOff,
  MapPin,
  Users,
  Download,
} from 'lucide-vue-next';

type ProjectProposal = Awaited<ReturnType<typeof api.trackProjectProposals>>[number];

const { canExport, exporting, exportNotice, refreshAccess, downloadCsv } = useAuthAccess();

const email = ref('');
const filterEstado = ref('');
const cuposMin = ref('');
const cuposMax = ref('');
const sortOrder = ref<'recientes' | 'titulo_asc' | 'cupos_desc' | 'cupos_asc'>('recientes');
const rangeError = ref<string | null>(null);
const proposals = ref<ProjectProposal[]>([]);
const loading = ref(false);
const searched = ref(false);
const error = ref('');

// KIR-74: Definición de estados visibles del proyecto para organizaciones aliadas
function getVisibleStatus(project: ProjectProposal) {
  if (project.estado === 'rechazado') {
    return {
      label: 'Rechazado',
      style: 'bg-rose-50 text-rose-800 border-rose-200',
      icon: XCircle,
      message: 'La propuesta no fue aprobada en la revisión administrativa.',
      badgePub: null,
    };
  }

  if (project.estado === 'aprobado' && project.publicado) {
    return {
      label: 'Aprobado y publicado',
      style: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      icon: Globe,
      message: 'Tu proyecto fue aprobado y ya se encuentra publicado en el catálogo público para postulaciones.',
      badgePub: 'Visible en catálogo',
    };
  }

  if (project.estado === 'aprobado') {
    return {
      label: 'Aprobado · Sin publicar',
      style: 'bg-[#E8F6F8] text-[#1E7B85] border-[#289EAB]/30',
      icon: CheckCircle2,
      message: 'La propuesta fue aprobada en auditoría y está lista para ser publicada en el catálogo oficial.',
      badgePub: 'Pendiente de publicación',
    };
  }

  return {
    label: 'En revisión',
    style: 'bg-amber-50 text-amber-800 border-amber-200',
    icon: Clock3,
    message: 'El equipo de Kirikú todavía está revisando esta propuesta.',
    badgePub: null,
  };
}

async function search() {
  const query = email.value.trim();
  if (!query) return;

  const rangeErr = validateNumericBoundsClient(cuposMin.value, cuposMax.value, {
    label: 'cupos',
    integerOnly: true,
    maxAllowed: 100000,
  });
  rangeError.value = rangeErr;
  if (rangeErr) return;

  loading.value = true;
  searched.value = true;
  error.value = '';
  proposals.value = [];
  try {
    proposals.value = await api.trackProjectProposals(query, {
      estado: filterEstado.value || undefined,
      cupos_min: cuposMin.value !== '' ? cuposMin.value : undefined,
      cupos_max: cuposMax.value !== '' ? cuposMax.value : undefined,
      ordenar: sortOrder.value,
    });
  } catch (err: any) {
    error.value = err?.response?.data?.error || 'No se pudo consultar el seguimiento. Intenta nuevamente.';
  } finally {
    loading.value = false;
  }
}

async function handleExportProposals() {
  const query = email.value.trim();
  if (!query) return;
  const rangeErr = validateNumericBoundsClient(cuposMin.value, cuposMax.value, {
    label: 'cupos',
    integerOnly: true,
    maxAllowed: 100000,
  });
  rangeError.value = rangeErr;
  if (rangeErr) return;

  await downloadCsv('proyectos-seguimiento', {
    busqueda: query,
    estado: filterEstado.value || undefined,
    cupos_min: cuposMin.value !== '' ? cuposMin.value : undefined,
    cupos_max: cuposMax.value !== '' ? cuposMax.value : undefined,
    ordenar: sortOrder.value,
  });
}

function formatDate(value?: string | null) {
  if (!value) return 'Sin fecha registrada';
  return new Date(value).toLocaleDateString('es-BO', { year: 'numeric', month: 'long', day: 'numeric' });
}

onMounted(() => {
  refreshAccess();
});
</script>

<template>
  <main class="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-12 space-y-6">
    <section class="relative bg-white border border-stone-200 rounded-3xl p-6 sm:p-10 shadow-xs overflow-hidden">
      <div class="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#289EAB] via-[#F58F38] to-[#EB455F]"></div>
      <div class="max-w-2xl">
        <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E8F6F8] text-[#1E7B85] text-xs font-semibold mb-3">
          <Building2 class="w-3.5 h-3.5" />
          <span>Organizaciones aliadas · KIR-23</span>
        </div>
        <h1 class="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight mb-2">
          Seguimiento de proyecto inscrito
        </h1>
        <p class="text-stone-600 text-sm leading-relaxed mb-6">
          Consulta el estado de revisión y publicación de los proyectos enviados con el correo de contacto registrado para tu organización.
        </p>

        <form @submit.prevent="search" class="space-y-3">
          <div class="flex flex-col sm:flex-row gap-3">
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
              class="px-6 py-3 bg-[#289EAB] hover:bg-[#1E7B85] text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:bg-stone-200 disabled:text-stone-400 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
            >
              <Search class="w-4 h-4" />
              {{ loading ? 'Consultando...' : 'Consultar proyectos' }}
            </button>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-stone-100 text-xs">
            <div class="flex flex-wrap items-center gap-2">
              <select
                v-model="filterEstado"
                @change="email.trim() && search()"
                class="px-3 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-xs text-stone-700 focus:outline-none focus:ring-2 focus:ring-[#289EAB]"
              >
                <option value="">Todos los estados</option>
                <option value="pendiente_revision">En revisión</option>
                <option value="aprobado">Aprobados</option>
                <option value="rechazado">Rechazados</option>
              </select>

              <input
                v-model="cuposMin"
                type="number"
                min="0"
                step="1"
                placeholder="Cupos mín."
                aria-label="Cupos mínimos"
                class="w-24 px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-xs tabular-nums"
              />
              <input
                v-model="cuposMax"
                type="number"
                min="0"
                step="1"
                placeholder="Cupos máx."
                aria-label="Cupos máximos"
                class="w-24 px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-xs tabular-nums"
              />

              <select
                v-model="sortOrder"
                @change="email.trim() && search()"
                class="px-3 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-xs text-stone-700 focus:outline-none focus:ring-2 focus:ring-[#289EAB]"
              >
                <option value="recientes">Más recientes</option>
                <option value="titulo_asc">Título (A-Z)</option>
                <option value="cupos_desc">Mayor cupos</option>
                <option value="cupos_asc">Menor cupos</option>
              </select>
            </div>

            <button
              v-if="canExport && email.trim()"
              type="button"
              @click="handleExportProposals"
              :disabled="exporting"
              class="px-3.5 py-1.5 bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold rounded-xl transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              <Download class="w-3.5 h-3.5" />
              <span>{{ exporting ? 'Exportando...' : 'Exportar CSV' }}</span>
            </button>
          </div>

          <p v-if="rangeError" role="alert" class="text-xs font-medium text-rose-700">{{ rangeError }}</p>
          <p
            v-if="exportNotice"
            role="status"
            :class="['text-xs font-medium', exportNotice.type === 'success' ? 'text-emerald-700' : 'text-rose-700']"
          >
            {{ exportNotice.text }}
          </p>
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
      <article
        v-for="project in proposals"
        :key="project.id"
        class="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-xs"
      >
        <div class="p-6 sm:p-8">
          <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <p class="text-xs text-[#1E7B85] font-semibold mb-1">{{ project.organizacion_nombre }}</p>
              <h2 class="text-xl font-bold text-stone-900">{{ project.titulo }}</h2>
              <div class="flex flex-wrap items-center gap-3 text-xs text-stone-500 mt-1.5">
                <span class="inline-flex items-center gap-1">
                  <MapPin class="w-3.5 h-3.5 text-stone-400" />
                  {{ project.ubicacion }}
                </span>
                <span v-if="project.cupos_disponibles" class="inline-flex items-center gap-1">
                  <Users class="w-3.5 h-3.5 text-stone-400" />
                  {{ project.cupos_disponibles }} cupos
                </span>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2 self-start">
              <span
                :class="[
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold',
                  getVisibleStatus(project).style,
                ]"
              >
                <component :is="getVisibleStatus(project).icon" class="w-4 h-4" />
                {{ getVisibleStatus(project).label }}
              </span>

              <span
                v-if="project.estado === 'aprobado' && !project.publicado"
                class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-stone-100 text-stone-600 border border-stone-200 text-[11px] font-semibold"
              >
                <EyeOff class="w-3 h-3" />
                <span>Oculto en catálogo</span>
              </span>
            </div>
          </div>

          <p class="text-sm text-stone-600 mt-5">
            {{ getVisibleStatus(project).message }}
          </p>

          <p v-if="project.estado === 'rechazado' && project.motivo_rechazo" class="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800">
            <strong>Motivo:</strong> {{ project.motivo_rechazo }}
          </p>

          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-5 pt-4 border-t border-stone-100 text-xs text-stone-500">
            <span class="inline-flex items-center gap-1.5">
              <CalendarDays class="w-4 h-4" />
              Inscrito el {{ formatDate(project.created_at) }}
            </span>
            <span v-if="project.updated_at">· Actualizado el {{ formatDate(project.updated_at) }}</span>
            <span v-if="project.publicado && project.fecha_publicacion" class="text-emerald-700 font-medium">
              · Publicado el {{ formatDate(project.fecha_publicacion) }}
            </span>
          </div>
        </div>
      </article>
    </section>
  </main>
</template>
