<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { api } from '../api/client';
import type { DonationHistoryResponse, DonationNeedRequestPayload, DonationNeedRequestResponse, Proyecto } from '../types';
import { AlertCircle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Heart, History, RefreshCw, Search, Send, Sparkles } from 'lucide-vue-next';

const projects = ref<Proyecto[]>([]);
const loadingProjects = ref(false);
const submitting = ref(false);
const error = ref('');
const result = ref<DonationNeedRequestResponse | null>(null);
const history = ref<DonationHistoryResponse | null>(null);
const historyLoading = ref(false);
const historyError = ref('');
const historyQuery = ref('');
const historyType = ref('');
const historyProject = ref('');
const historyFrom = ref('');
const historyTo = ref('');
const historyPage = ref(1);

const form = reactive<DonationNeedRequestPayload>({
  receptor_nombre: '',
  receptor_email: '',
  receptor_telefono: '',
  receptor_organizacion: '',
  tipo_necesidad: 'especie',
  titulo: '',
  descripcion: '',
  monto_objetivo: null,
  cantidad_objetivo: null,
  unidad_medida: '',
  fecha_necesaria: '',
  proyecto_destino_id: null,
});

const isCashNeed = computed(() => form.tipo_necesidad === 'economica');

onMounted(async () => {
  loadingProjects.value = true;
  try {
    projects.value = await api.getProyectos({ estado: 'aprobado' });
  } catch {
    // El proyecto destino es opcional; el formulario puede usarse si el catálogo no está disponible.
  } finally {
    loadingProjects.value = false;
  }
  await loadHistory();
});

async function loadHistory(page = 1) {
  historyLoading.value = true;
  historyError.value = '';
  try {
    history.value = await api.getDonationHistory({
      q: historyQuery.value.trim() || undefined,
      tipo: historyType.value ? historyType.value as 'economica' | 'especie' : undefined,
      proyecto_destino_id: historyProject.value || undefined,
      fecha_desde: historyFrom.value || undefined,
      fecha_hasta: historyTo.value || undefined,
      pagina: page,
      limite: 10,
    });
    historyPage.value = page;
  } catch (err: any) {
    historyError.value = err?.response?.data?.error || 'No se pudo cargar el historial de donaciones.';
  } finally {
    historyLoading.value = false;
  }
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('es-BO', { year: 'numeric', month: 'long', day: 'numeric' });
}

function resetForm() {
  form.receptor_nombre = '';
  form.receptor_email = '';
  form.receptor_telefono = '';
  form.receptor_organizacion = '';
  form.tipo_necesidad = 'especie';
  form.titulo = '';
  form.descripcion = '';
  form.monto_objetivo = null;
  form.cantidad_objetivo = null;
  form.unidad_medida = '';
  form.fecha_necesaria = '';
  form.proyecto_destino_id = null;
}

async function submitRequest() {
  if (submitting.value) return;
  submitting.value = true;
  error.value = '';
  result.value = null;

  const payload: DonationNeedRequestPayload = {
    ...form,
    receptor_nombre: form.receptor_nombre.trim(),
    receptor_email: form.receptor_email.trim(),
    receptor_telefono: form.receptor_telefono.trim(),
    receptor_organizacion: form.receptor_organizacion?.trim() || undefined,
    titulo: form.titulo.trim(),
    descripcion: form.descripcion.trim(),
    monto_objetivo: isCashNeed.value ? Number(form.monto_objetivo) : null,
    cantidad_objetivo: !isCashNeed.value && form.cantidad_objetivo ? Number(form.cantidad_objetivo) : null,
    unidad_medida: !isCashNeed.value ? form.unidad_medida?.trim() || undefined : undefined,
    fecha_necesaria: form.fecha_necesaria || undefined,
    proyecto_destino_id: form.proyecto_destino_id || null,
  };

  try {
    result.value = await api.createDonationNeedRequest(payload);
    resetForm();
  } catch (err: any) {
    error.value = err?.response?.data?.error || 'No se pudo registrar la solicitud. Intenta nuevamente.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <main class="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-12 space-y-6">
    <section class="relative bg-white border border-[#EB455F]/30 rounded-3xl p-6 sm:p-9 shadow-sm overflow-hidden">
      <div class="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#EB455F] via-[#F58F38] to-[#289EAB]"></div>
      <div class="flex items-start gap-4">
        <div class="w-12 h-12 bg-[#FDECEF] text-[#EB455F] rounded-2xl flex items-center justify-center shrink-0"><Heart class="w-6 h-6" /></div>
        <div>
          <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FDECEF] text-[#C9334B] text-xs font-semibold mb-2"><Sparkles class="w-3.5 h-3.5 text-[#F58F38]" /><span>Solidaridad & Apoyo</span></div>
          <h1 class="text-2xl sm:text-3xl font-extrabold text-stone-900">Registrar una necesidad de donación</h1>
          <p class="text-stone-600 text-sm mt-2 max-w-2xl">Organizaciones y comunidades pueden registrar qué apoyo necesitan y quién recibirá la donación. El equipo Kirikú revisará la solicitud.</p>
        </div>
      </div>
    </section>

    <div v-if="result" role="status" class="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start gap-3">
      <CheckCircle2 class="w-5 h-5 text-emerald-700 mt-0.5 shrink-0" />
      <div><p class="font-semibold">Solicitud registrada correctamente.</p><p class="text-sm mt-1">Código: <strong>#{{ result.id }}</strong> · Estado: {{ result.estado }}. Guardamos el contacto del receptor para dar seguimiento.</p></div>
    </div>
    <div v-if="error" role="alert" class="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center gap-3"><AlertCircle class="w-5 h-5 shrink-0" />{{ error }}</div>

    <form @submit.prevent="submitRequest" class="bg-white rounded-3xl border border-stone-200 shadow-xs divide-y divide-stone-100">
      <section class="p-5 sm:p-7 space-y-4">
        <div><h2 class="font-bold text-stone-900">Datos del receptor</h2><p class="text-xs text-stone-500 mt-1">Persona u organización responsable de recibir el apoyo.</p></div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label class="text-xs font-semibold text-stone-700">Nombre de contacto *<input v-model="form.receptor_nombre" required maxlength="160" autocomplete="name" class="mt-1 block w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#EB455F]" placeholder="Nombre y apellido" /></label>
          <label class="text-xs font-semibold text-stone-700">Organización o comunidad<input v-model="form.receptor_organizacion" maxlength="180" autocomplete="organization" class="mt-1 block w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#EB455F]" placeholder="Nombre de la organización" /></label>
          <label class="text-xs font-semibold text-stone-700">Correo electrónico *<input v-model="form.receptor_email" required type="email" maxlength="254" autocomplete="email" class="mt-1 block w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#EB455F]" placeholder="contacto@organizacion.org" /></label>
          <label class="text-xs font-semibold text-stone-700">Teléfono *<input v-model="form.receptor_telefono" required type="tel" maxlength="40" autocomplete="tel" class="mt-1 block w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#EB455F]" placeholder="+591 ..." /></label>
        </div>
      </section>

      <section class="p-5 sm:p-7 space-y-4">
        <div><h2 class="font-bold text-stone-900">Detalle de la necesidad</h2><p class="text-xs text-stone-500 mt-1">Indica el tipo y describe con claridad el apoyo requerido.</p></div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label class="text-xs font-semibold text-stone-700">Tipo de necesidad *<select v-model="form.tipo_necesidad" required class="mt-1 block w-full px-3.5 py-2.5 rounded-xl border border-stone-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#EB455F]"><option value="especie">Donación en especie</option><option value="economica">Apoyo económico</option></select></label>
          <label class="text-xs font-semibold text-stone-700">Proyecto relacionado (opcional)<select v-model="form.proyecto_destino_id" :disabled="loadingProjects" class="mt-1 block w-full px-3.5 py-2.5 rounded-xl border border-stone-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#EB455F]"><option :value="null">Necesidad general</option><option v-for="project in projects" :key="project.id" :value="project.id">{{ project.titulo }}</option></select></label>
          <label class="text-xs font-semibold text-stone-700 sm:col-span-2">Título de la necesidad *<input v-model="form.titulo" required maxlength="180" class="mt-1 block w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#EB455F]" placeholder="Ej. Material escolar para el centro comunitario" /></label>
          <label class="text-xs font-semibold text-stone-700 sm:col-span-2">Descripción *<textarea v-model="form.descripcion" required maxlength="3000" minlength="10" rows="4" class="mt-1 block w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#EB455F]" placeholder="Describe para quién es, por qué se necesita y cómo se utilizará el apoyo..."></textarea><span class="text-[11px] text-stone-400 font-normal">{{ form.descripcion.length }}/3000 caracteres</span></label>
          <label v-if="isCashNeed" class="text-xs font-semibold text-stone-700">Monto objetivo (Bs.) *<input v-model.number="form.monto_objetivo" required type="number" min="0.01" step="0.01" class="mt-1 block w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#EB455F]" placeholder="0.00" /></label>
          <template v-else>
            <label class="text-xs font-semibold text-stone-700">Cantidad requerida (opcional)<input v-model.number="form.cantidad_objetivo" type="number" min="0.01" step="0.01" class="mt-1 block w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#EB455F]" placeholder="Ej. 30" /></label>
            <label class="text-xs font-semibold text-stone-700">Unidad de medida<input v-model="form.unidad_medida" maxlength="60" class="mt-1 block w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#EB455F]" placeholder="Unidades, cajas, kits..." /></label>
          </template>
          <label class="text-xs font-semibold text-stone-700">Fecha en que se necesita (opcional)<input v-model="form.fecha_necesaria" type="date" class="mt-1 block w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#EB455F]" /></label>
        </div>
      </section>

      <footer class="p-5 sm:px-7 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p class="text-xs text-stone-500">Los campos con * son obligatorios. El envío queda pendiente de revisión.</p>
        <button type="submit" :disabled="submitting" class="inline-flex items-center justify-center gap-2 px-5 py-3 bg-[#EB455F] hover:bg-[#C9334B] text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-wait"><Send class="w-4 h-4" />{{ submitting ? 'Enviando solicitud...' : 'Registrar necesidad' }}</button>
      </footer>
    </form>

    <section class="space-y-5 pt-4" aria-labelledby="donation-history-title">
      <div class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div class="inline-flex items-center gap-1.5 text-xs font-semibold text-[#C9334B] mb-1"><History class="w-4 h-4" /> Transparencia y trazabilidad</div>
          <h2 id="donation-history-title" class="text-2xl font-extrabold text-stone-900">Historial de donaciones</h2>
          <p class="text-sm text-stone-600 mt-1">Consulta los aportes registrados, la fecha de recepción y el proyecto al que fueron destinados.</p>
        </div>
        <button type="button" @click="loadHistory(historyPage)" :disabled="historyLoading" class="inline-flex items-center gap-2 px-4 py-2 bg-white border border-stone-300 rounded-xl text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50"><RefreshCw class="w-4 h-4" :class="{ 'animate-spin': historyLoading }" />Actualizar historial</button>
      </div>

      <div v-if="history" class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="bg-white rounded-2xl border border-stone-200 p-4"><p class="text-xs text-stone-500">Aportes con estos filtros</p><p class="text-2xl font-extrabold text-stone-900 mt-1">{{ history.resumen.total_aportes }}</p></div>
        <div class="bg-white rounded-2xl border border-stone-200 p-4"><p class="text-xs text-stone-500">Aportes económicos</p><p class="text-2xl font-extrabold text-[#C9334B] mt-1">{{ history.resumen.monto_economico_bob.toLocaleString('es-BO', { minimumFractionDigits: 2 }) }} Bs.</p></div>
        <div class="bg-white rounded-2xl border border-stone-200 p-4"><p class="text-xs text-stone-500">Aportes en especie</p><p class="text-2xl font-extrabold text-stone-900 mt-1">{{ history.resumen.aportes_especie }}</p></div>
      </div>

      <form @submit.prevent="loadHistory(1)" class="bg-white rounded-2xl border border-stone-200 p-4 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
        <label class="relative sm:col-span-2 lg:col-span-2"><Search class="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" /><input v-model="historyQuery" maxlength="120" placeholder="Donante, proyecto o receptor" class="w-full pl-9 pr-3 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#EB455F]" aria-label="Buscar en el historial" /></label>
        <select v-model="historyType" class="px-3 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-sm" aria-label="Filtrar por tipo de donación"><option value="">Todos los tipos</option><option value="economica">Económica</option><option value="especie">En especie</option></select>
        <select v-model="historyProject" class="px-3 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-sm" aria-label="Filtrar por proyecto"><option value="">Todos los destinos</option><option v-for="project in projects" :key="project.id" :value="String(project.id)">{{ project.titulo }}</option></select>
        <label class="text-[11px] font-semibold text-stone-500">Desde<input v-model="historyFrom" type="date" class="mt-1 block w-full px-2.5 py-2 rounded-xl border border-stone-200 bg-stone-50 text-xs" /></label>
        <label class="text-[11px] font-semibold text-stone-500">Hasta<input v-model="historyTo" type="date" class="mt-1 block w-full px-2.5 py-2 rounded-xl border border-stone-200 bg-stone-50 text-xs" /></label>
        <div class="lg:col-span-6 flex justify-end"><button type="submit" :disabled="historyLoading" class="inline-flex items-center gap-2 px-5 py-2.5 bg-[#EB455F] hover:bg-[#C9334B] text-white text-sm font-semibold rounded-xl disabled:opacity-50"><Search class="w-4 h-4" />Aplicar filtros</button></div>
      </form>

      <div v-if="historyError" role="alert" class="p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800 flex items-center gap-2"><AlertCircle class="w-4 h-4" />{{ historyError }}</div>
      <div v-if="historyLoading && !history" aria-live="polite" class="py-10 text-center text-sm text-stone-500">Cargando historial...</div>
      <div v-else-if="history && history.items.length" class="space-y-3" aria-live="polite">
        <article v-for="donation in history.items" :key="donation.id" class="bg-white rounded-2xl border border-stone-200 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" :class="donation.tipo_donacion === 'economica' ? 'bg-rose-50 text-[#C9334B]' : 'bg-amber-50 text-amber-700'"><Heart v-if="donation.tipo_donacion === 'economica'" class="w-5 h-5" /><Sparkles v-else class="w-5 h-5" /></div>
            <div>
              <div class="flex flex-wrap items-center gap-2"><h3 class="font-bold text-stone-900">{{ donation.donante_nombre }}</h3><span class="px-2 py-0.5 rounded-full text-[11px] font-semibold" :class="donation.tipo_donacion === 'economica' ? 'bg-rose-50 text-rose-800' : 'bg-amber-50 text-amber-800'">{{ donation.tipo_donacion === 'economica' ? 'Aporte económico' : 'Aporte en especie' }}</span><span class="text-[11px] text-stone-400">Registro #{{ donation.id }}</span></div>
              <p class="text-sm text-stone-700 mt-1">{{ donation.tipo_donacion === 'economica' ? `${Number(donation.monto_bob).toLocaleString('es-BO', { minimumFractionDigits: 2 })} Bs.` : donation.descripcion_especie }}</p>
              <p class="text-xs text-stone-500 mt-1">{{ donation.proyecto ? `Destino: ${donation.proyecto.titulo} · ${donation.proyecto.ubicacion}` : 'Destino: Apoyo general' }}</p>
            </div>
          </div>
          <div class="sm:text-right text-xs text-stone-500 sm:min-w-44">
            <p class="inline-flex sm:justify-end items-center gap-1.5"><CalendarDays class="w-3.5 h-3.5" />{{ formatDate(donation.fecha_recepcion) }}</p>
            <p class="mt-1">Recibió: <span class="font-semibold text-stone-700">{{ donation.recibido_por }}</span></p>
          </div>
        </article>

        <footer class="flex items-center justify-between pt-2">
          <p class="text-xs text-stone-500">Página {{ history.paginacion.pagina }} de {{ Math.max(1, history.paginacion.paginas) }}</p>
          <div class="flex gap-2"><button type="button" @click="loadHistory(historyPage - 1)" :disabled="historyPage <= 1 || historyLoading" class="p-2 rounded-lg border border-stone-300 bg-white text-stone-700 disabled:opacity-40" aria-label="Página anterior"><ChevronLeft class="w-4 h-4" /></button><button type="button" @click="loadHistory(historyPage + 1)" :disabled="historyPage >= history.paginacion.paginas || historyLoading" class="p-2 rounded-lg border border-stone-300 bg-white text-stone-700 disabled:opacity-40" aria-label="Página siguiente"><ChevronRight class="w-4 h-4" /></button></div>
        </footer>
      </div>
      <div v-else-if="history && !historyLoading" class="bg-white rounded-2xl border border-stone-200 p-8 text-center"><History class="w-9 h-9 text-stone-300 mx-auto mb-2" /><h3 class="font-bold text-stone-800">No hay donaciones que coincidan</h3><p class="text-sm text-stone-500 mt-1">Prueba cambiando los filtros o consulta de nuevo más adelante.</p></div>
      <p class="text-[11px] text-stone-400">Por transparencia, el historial muestra datos del aporte y su destino. No se muestran correos electrónicos de donantes.</p>
    </section>
  </main>
</template>
