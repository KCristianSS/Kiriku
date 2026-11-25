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
import { ref, computed, onMounted } from 'vue';
import {
  HeartHandshake,
  Plus,
  Search,
  RefreshCw,
  ArrowRight,
  Truck,
  CheckCircle2,
  Clock,
  ShieldCheck,
  User,
  Building2,
  MapPin,
  Package,
  Coins,
  X,
  Link2,
  AlertCircle,
  Eye,
} from 'lucide-vue-next';
import { useDonationsStore } from '../stores/donations';
import { api } from '../api/client';
import type {
  Donacion,
  DonacionEstadoEntrega,
  DonacionTipo,
  DonanteTipo,
  EntregaEstado,
  Organizacion,
  Proyecto,
  ReceptorTipo,
} from '../types';

const store = useDonationsStore();

const proyectos = ref<Proyecto[]>([]);
const organizaciones = ref<Organizacion[]>([]);

// Filtros del listado
const searchQuery = ref('');
const tipoFilter = ref<'todos' | DonacionTipo>('todos');
const estadoFilter = ref<'todos' | DonacionEstadoEntrega>('todos');

// Mensajes de feedback
const feedbackSuccess = ref<string | null>(null);
const feedbackError = ref<string | null>(null);

// Modales
const showCreateModal = ref(false);
const showDeliveryModal = ref(false);
const showTraceModal = ref(false);
const showConfirmModal = ref(false);
const selectedDonationForDelivery = ref<Donacion | null>(null);
const selectedDonationForConfirm = ref<Donacion | null>(null);

const confirmForm = ref({
  recibido_por: '',
  notas_recepcion: '',
});
const selectedDonationForDelivery = ref<Donacion | null>(null);

// Formulario: Nueva Donación
const selectedExistingDonanteId = ref<string>('');
const createForm = ref({
  donante_nombre: '',
  donante_tipo: 'persona' as DonanteTipo,
  donante_documento: '',
  donante_email: '',
  donante_telefono: '',
  donante_ciudad: '',
  tipo_donacion: 'economica' as DonacionTipo,
  monto_bob: '' as string | number,
  descripcion_especie: '',
  proyecto_destino_id: '',
  recibido_por: '',
});

// Formulario: Registrar Entrega y Vínculo Receptor
const recipientMode = ref<'nuevo' | 'existente'>('nuevo');
const deliveryForm = ref({
  receptor_id: '',
  receptor_nombre: '',
  receptor_tipo: 'comunidad' as ReceptorTipo,
  receptor_documento: '',
  receptor_email: '',
  receptor_telefono: '',
  receptor_ubicacion: '',
  proyecto_id: '',
  organizacion_id: '',
  estado: 'entregada' as EntregaEstado,
  monto_entregado_bob: '' as string | number,
  detalle_bienes_entregados: '',
  responsable_entrega: '',
  recibido_por_receptor: '',
  observaciones: '',
});

const donorTypeLabels: Record<string, string> = {
  persona: 'Persona natural',
  empresa: 'Empresa privada',
  organizacion: 'Organización aliada',
  anonimo: 'Aporte anónimo',
};

const recipientTypeLabels: Record<string, string> = {
  comunidad: 'Comunidad beneficiaria',
  proyecto: 'Proyecto comunitario',
  organizacion: 'Organización receptora',
  persona: 'Beneficiario individual',
};

const donationStatusMeta: Record<
  DonacionEstadoEntrega,
  { label: string; textClass: string; bgClass: string; borderClass: string }
> = {
  ofrecida: {
    label: 'Ofrecida por donante',
    textClass: 'text-amber-900',
    bgClass: 'bg-amber-50',
    borderClass: 'border-amber-200',
  },
  recibida: {
    label: 'Recibida en custodia',
    textClass: 'text-stone-700',
    bgClass: 'bg-stone-100',
    borderClass: 'border-stone-200',
  },
  en_preparacion: {
    label: 'En preparación / ruta',
    textClass: 'text-amber-800',
    bgClass: 'bg-amber-50',
    borderClass: 'border-amber-200',
  },
  entrega_parcial: {
    label: 'Entrega parcial',
    textClass: 'text-[#1E7B85]',
    bgClass: 'bg-[#E8F6F8]',
    borderClass: 'border-[#289EAB]/30',
  },
  entregada: {
    label: 'Entregada y trazada',
    textClass: 'text-emerald-800',
    bgClass: 'bg-emerald-50',
    borderClass: 'border-emerald-200',
  },
};

const deliveryStateMeta: Record<
  EntregaEstado,
  { label: string; textClass: string; bgClass: string }
> = {
  programada: {
    label: 'Programada',
    textClass: 'text-stone-700',
    bgClass: 'bg-stone-100',
  },
  en_camino: {
    label: 'En camino',
    textClass: 'text-amber-800',
    bgClass: 'bg-amber-50',
  },
  entregada: {
    label: 'Entregada',
    textClass: 'text-[#1E7B85]',
    bgClass: 'bg-[#E8F6F8]',
  },
  verificada: {
    label: 'Verificada',
    textClass: 'text-emerald-800',
    bgClass: 'bg-emerald-50',
  },
};

const filteredDonations = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  return store.donations.filter((d) => {
    if (tipoFilter.value !== 'todos' && d.tipo_donacion !== tipoFilter.value) {
      return false;
    }
    const estado = (d.estado_entrega || 'recibida') as DonacionEstadoEntrega;
    if (estadoFilter.value !== 'todos' && estado !== estadoFilter.value) {
      return false;
    }
    if (!q) return true;
    const codigo = (d.codigo_donacion || `KIR-DON-${d.id}`).toLowerCase();
    const donante = (d.donante_nombre || '').toLowerCase();
    const especie = (d.descripcion_especie || '').toLowerCase();
    const proyecto = (d.proyecto?.titulo || '').toLowerCase();
    const receptorHit = (d.entregas || []).some(
      (e) =>
        (e.receptor?.nombre || '').toLowerCase().includes(q) ||
        (e.codigo_entrega || '').toLowerCase().includes(q)
    );
    return (
      codigo.includes(q) ||
      donante.includes(q) ||
      especie.includes(q) ||
      proyecto.includes(q) ||
      receptorHit
    );
  });
});

const kpiResumen = computed(() => {
  let totalBob = 0;
  let totalEntregadoBob = 0;
  let totalEspecie = 0;
  let totalEntregas = 0;
  let completadas = 0;

  for (const d of store.donations) {
    if (d.tipo_donacion === 'economica') {
      totalBob += Number(d.monto_bob || 0);
      totalEntregadoBob += Number(d.monto_entregado_total || 0);
    } else {
      totalEspecie += 1;
    }
    totalEntregas += Number(d.entregas_count ?? d.entregas?.length ?? 0);
    if (d.estado_entrega === 'entregada') {
      completadas += 1;
    }
  }

  return {
    totalBob,
    totalEntregadoBob,
    saldoPorEntregar: Math.max(0, totalBob - totalEntregadoBob),
    totalEspecie,
    totalEntregas,
    completadas,
  };
});

function formatCurrency(val?: number | null) {
  return Number(val || 0).toLocaleString('es-BO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(iso?: string | null) {
  if (!iso) return 'Sin fecha';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Sin fecha';
  return d.toLocaleDateString('es-BO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getProgressPercent(d: Donacion): number {
  if (d.tipo_donacion !== 'economica') {
    if (d.estado_entrega === 'entregada') return 100;
    if (d.estado_entrega === 'entrega_parcial' || d.estado_entrega === 'en_preparacion') return 50;
    return 0;
  }
  const total = Number(d.monto_bob || 0);
  if (total <= 0) return 0;
  const entregado = Number(d.monto_entregado_total || 0);
  return Math.min(100, Math.round((entregado / total) * 100));
}

function canRegisterNewDelivery(d: Donacion): boolean {
  if (d.estado_entrega === 'ofrecida') return false;
  if (d.tipo_donacion === 'economica') {
    return Number(d.saldo_disponible_bob ?? d.monto_bob ?? 0) > 0.009;
  }
  return true;
}

function formatModalityLabel(mod?: string | null): string {
  const map: Record<string, string> = {
    transferencia_qr: 'Transferencia / QR',
    entrega_centro_acopio: 'Centro de acopio',
    recojo_domicilio: 'Recojo a domicilio',
    coordinacion_directa: 'Coordinación directa',
  };
  return (mod && map[mod]) || 'Coordinación directa';
}

function showBannerSuccess(msg: string) {
  feedbackError.value = null;
  feedbackSuccess.value = msg;
  setTimeout(() => {
    if (feedbackSuccess.value === msg) feedbackSuccess.value = null;
  }, 5500);
}

function showBannerError(msg: string) {
  feedbackSuccess.value = null;
  feedbackError.value = msg;
}

async function loadInitialData() {
  feedbackError.value = null;
  try {
    const status = await api.getStatus();
    if (!status.databaseConfigured) {
      showBannerError(
        'Conexión a Supabase pendiente: agrega tu variable DATABASE_URL en los Secretos del proyecto (Settings → Secrets) o en tu archivo .env local.'
      );
      return;
    }
  } catch {
    // Continuar con carga normal si /status no responde
  }

  await Promise.all([
    store.fetchDonations(),
    store.fetchCatalogs(),
    store.fetchMetrics(),
    api
      .getProyectos({ estado: 'aprobado' })
      .then((res) => {
        proyectos.value = res;
      })
      .catch(() => {}),
    api
      .getOrganizaciones()
      .then((res) => {
        organizaciones.value = res;
      })
      .catch(() => {}),
  ]);
}

function handleSelectExistingDonante() {
  if (!selectedExistingDonanteId.value) return;
  const found = store.donantes.find(
    (dn) => String(dn.id) === String(selectedExistingDonanteId.value)
  );
  if (found) {
    createForm.value.donante_nombre = found.nombre;
    createForm.value.donante_tipo = (found.tipo_donante as DonanteTipo) || 'persona';
    createForm.value.donante_documento = found.documento_identidad || '';
    createForm.value.donante_email = found.email || '';
    createForm.value.donante_telefono = found.telefono || '';
    createForm.value.donante_ciudad = found.ciudad || '';
  }
}

function openCreateModal() {
  feedbackError.value = null;
  selectedExistingDonanteId.value = '';
  createForm.value = {
    donante_nombre: '',
    donante_tipo: 'persona',
    donante_documento: '',
    donante_email: '',
    donante_telefono: '',
    donante_ciudad: '',
    tipo_donacion: 'economica',
    monto_bob: '',
    descripcion_especie: '',
    proyecto_destino_id: '',
    recibido_por: '',
  };
  showCreateModal.value = true;
}

async function submitCreateDonation() {
  feedbackError.value = null;
  try {
    const created = await store.recordDonation({
      donante_nombre: createForm.value.donante_nombre.trim(),
      donante_tipo: createForm.value.donante_tipo,
      donante_documento: createForm.value.donante_documento.trim() || undefined,
      donante_email: createForm.value.donante_email.trim() || undefined,
      donante_telefono: createForm.value.donante_telefono.trim() || undefined,
      donante_ciudad: createForm.value.donante_ciudad.trim() || undefined,
      tipo_donacion: createForm.value.tipo_donacion,
      monto_bob:
        createForm.value.tipo_donacion === 'economica'
          ? Number(createForm.value.monto_bob)
          : undefined,
      descripcion_especie:
        createForm.value.tipo_donacion === 'especie'
          ? createForm.value.descripcion_especie.trim()
          : undefined,
      proyecto_destino_id: createForm.value.proyecto_destino_id || null,
      recibido_por: createForm.value.recibido_por.trim(),
    });
    showCreateModal.value = false;
    showBannerSuccess(
      `Donación ${created.codigo_donacion || `KIR-DON-${created.id}`} registrada con éxito. Ahora puedes vincular un receptor y registrar su entrega.`
    );
  } catch (err: any) {
    showBannerError(err?.response?.data?.error || 'No se pudo registrar la donación.');
  }
}

function openDeliveryModal(d: Donacion) {
  feedbackError.value = null;
  selectedDonationForDelivery.value = d;
  recipientMode.value = 'nuevo';

  const saldo = Number(d.saldo_disponible_bob ?? d.monto_bob ?? 0);
  deliveryForm.value = {
    receptor_id: '',
    receptor_nombre: d.proyecto?.titulo ? `Beneficiarios - ${d.proyecto.titulo}` : '',
    receptor_tipo: d.proyecto_destino_id ? 'proyecto' : 'comunidad',
    receptor_documento: '',
    receptor_email: '',
    receptor_telefono: '',
    receptor_ubicacion: d.proyecto?.ubicacion || '',
    proyecto_id: d.proyecto_destino_id ? String(d.proyecto_destino_id) : '',
    organizacion_id: '',
    estado: 'entregada',
    monto_entregado_bob: d.tipo_donacion === 'economica' && saldo > 0 ? saldo : '',
    detalle_bienes_entregados:
      d.tipo_donacion === 'especie' ? d.descripcion_especie || '' : '',
    responsable_entrega: d.recibido_por || '',
    recibido_por_receptor: '',
    observaciones: '',
  };
  showDeliveryModal.value = true;
}

function fillRemainingBalance() {
  if (!selectedDonationForDelivery.value) return;
  const saldo = Number(
    selectedDonationForDelivery.value.saldo_disponible_bob ??
      selectedDonationForDelivery.value.monto_bob ??
      0
  );
  deliveryForm.value.monto_entregado_bob = saldo;
}

async function submitRegisterDelivery() {
  if (!selectedDonationForDelivery.value) return;
  feedbackError.value = null;
  const d = selectedDonationForDelivery.value;

  try {
    const payload =
      recipientMode.value === 'existente'
        ? {
            receptor_id: deliveryForm.value.receptor_id,
            proyecto_id: deliveryForm.value.proyecto_id || null,
            organizacion_id: deliveryForm.value.organizacion_id || null,
            estado: deliveryForm.value.estado,
            monto_entregado_bob:
              d.tipo_donacion === 'economica'
                ? Number(deliveryForm.value.monto_entregado_bob)
                : null,
            detalle_bienes_entregados:
              d.tipo_donacion === 'especie'
                ? deliveryForm.value.detalle_bienes_entregados.trim()
                : undefined,
            responsable_entrega: deliveryForm.value.responsable_entrega.trim(),
            recibido_por_receptor: deliveryForm.value.recibido_por_receptor.trim(),
            observaciones: deliveryForm.value.observaciones.trim() || undefined,
          }
        : {
            receptor_nombre: deliveryForm.value.receptor_nombre.trim(),
            receptor_tipo: deliveryForm.value.receptor_tipo,
            receptor_documento: deliveryForm.value.receptor_documento.trim() || undefined,
            receptor_email: deliveryForm.value.receptor_email.trim() || undefined,
            receptor_telefono: deliveryForm.value.receptor_telefono.trim() || undefined,
            receptor_ubicacion: deliveryForm.value.receptor_ubicacion.trim() || undefined,
            proyecto_id: deliveryForm.value.proyecto_id || null,
            organizacion_id: deliveryForm.value.organizacion_id || null,
            estado: deliveryForm.value.estado,
            monto_entregado_bob:
              d.tipo_donacion === 'economica'
                ? Number(deliveryForm.value.monto_entregado_bob)
                : null,
            detalle_bienes_entregados:
              d.tipo_donacion === 'especie'
                ? deliveryForm.value.detalle_bienes_entregados.trim()
                : undefined,
            responsable_entrega: deliveryForm.value.responsable_entrega.trim(),
            recibido_por_receptor: deliveryForm.value.recibido_por_receptor.trim(),
            observaciones: deliveryForm.value.observaciones.trim() || undefined,
          };

    const res = await store.registerDelivery(d.id, payload);
    showDeliveryModal.value = false;
    showBannerSuccess(
      `Entrega ${res.entrega?.codigo_entrega || ''} registrada. Vínculo donante → receptor guardado con trazabilidad completa.`
    );
  } catch (err: any) {
    showBannerError(err?.response?.data?.error || 'Error al registrar la entrega.');
  }
}

async function openTraceabilityModal(d: Donacion) {
  feedbackError.value = null;
  try {
    await store.fetchTraceability(d.id);
    showTraceModal.value = true;
  } catch (err: any) {
    showBannerError(err?.response?.data?.error || 'No se pudo cargar la trazabilidad.');
  }
}

async function advanceDeliveryState(
  entregaId: number | string,
  donacionId: number | string,
  nextState: EntregaEstado
) {
  feedbackError.value = null;
  try {
    await store.updateDeliveryStatus(entregaId, donacionId, { estado: nextState });
    showBannerSuccess(`Estado de entrega actualizado a "${deliveryStateMeta[nextState].label}".`);
  } catch (err: any) {
    showBannerError(err?.response?.data?.error || 'Error al actualizar estado de entrega.');
  }
}

function openConfirmModal(d: Donacion) {
  feedbackError.value = null;
  selectedDonationForConfirm.value = d;
  confirmForm.value = {
    recibido_por: '',
    notas_recepcion: '',
  };
  showConfirmModal.value = true;
}

async function submitConfirmReceipt() {
  if (!selectedDonationForConfirm.value) return;
  feedbackError.value = null;
  try {
    await store.confirmDonationReceipt(selectedDonationForConfirm.value.id, {
      recibido_por: confirmForm.value.recibido_por.trim(),
      notas_recepcion: confirmForm.value.notas_recepcion.trim() || undefined,
    });
    showConfirmModal.value = false;
    showBannerSuccess(
      `Recepción confirmada para ${selectedDonationForConfirm.value.codigo_donacion || `KIR-DON-${selectedDonationForConfirm.value.id}`}. Ya puedes asignarla a un receptor.`
    );
  } catch (err: any) {
    showBannerError(err?.response?.data?.error || 'No se pudo confirmar la recepción.');
  }
}

onMounted(() => {
  loadInitialData();
});
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6">
    <!-- Header Band -->
    <div class="bg-white border border-stone-200 rounded-2xl p-6 sm:p-8 shadow-xs">
      <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
        <div class="max-w-2xl">
          <div class="flex items-center gap-2 text-xs font-medium text-stone-500 mb-2">
            <span>Gestión Solidaria</span>
            <span aria-hidden="true">·</span>
            <span>Trazabilidad de Aportes</span>
            <span aria-hidden="true">·</span>
            <span class="font-mono text-[#1E7B85]">Donante → Donación → Receptor</span>
          </div>
          <h1 class="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight">
            Donaciones y Registro de Entregas
          </h1>
          <p class="text-sm text-stone-600 mt-1.5 leading-relaxed">
            Administra cada aporte económico o en especie, vincula al donante con su receptor final y audita el ciclo completo de entrega.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            @click="loadInitialData"
            :disabled="store.loading"
            class="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs sm:text-sm font-semibold rounded-xl transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw :class="['w-4 h-4', store.loading ? 'animate-spin' : '']" />
            <span>Actualizar</span>
          </button>

          <router-link
            to="/ofrecer-donacion"
            class="px-4 py-2.5 bg-[#E8F6F8] hover:bg-[#d5eef1] text-[#1E7B85] border border-[#289EAB]/30 text-xs sm:text-sm font-semibold rounded-xl transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <HeartHandshake class="w-4 h-4" />
            <span>Formulario donantes</span>
          </router-link>

          <button
            @click="openCreateModal"
            class="px-5 py-2.5 bg-[#EB455F] hover:bg-[#d63851] text-white text-xs sm:text-sm font-semibold rounded-xl transition-colors inline-flex items-center gap-2 shadow-xs whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus class="w-4 h-4" />
            <span>Registrar donación</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Feedback banners -->
    <div
      v-if="feedbackSuccess"
      role="status"
      class="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-3"
    >
      <div class="flex items-center gap-2.5">
        <CheckCircle2 class="w-4 h-4 text-emerald-700 shrink-0" />
        <span>{{ feedbackSuccess }}</span>
      </div>
      <button @click="feedbackSuccess = null" class="text-emerald-700 hover:text-emerald-900 p-1 cursor-pointer">
        <X class="w-4 h-4" />
      </button>
    </div>

    <div
      v-if="feedbackError || store.error"
      role="alert"
      class="bg-red-50 border border-red-200 text-red-900 rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-3"
    >
      <div class="flex items-center gap-2.5">
        <AlertCircle class="w-4 h-4 text-red-700 shrink-0" />
        <span>{{ feedbackError || store.error }}</span>
      </div>
      <button @click="feedbackError = null" class="text-red-700 hover:text-red-900 p-1 cursor-pointer">
        <X class="w-4 h-4" />
      </button>
    </div>

    <!-- KPI Row (Tabular Numerals) -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="bg-white border border-stone-200 rounded-2xl p-5">
        <div class="flex items-center justify-between text-xs font-medium text-stone-500 mb-2">
          <span>Fondos Recibidos</span>
          <Coins class="w-4 h-4 text-[#EB455F]" />
        </div>
        <div class="text-2xl font-extrabold text-stone-900 font-mono tabular-nums">
          {{ formatCurrency(kpiResumen.totalBob) }} Bs.
        </div>
        <p class="text-xs text-stone-500 mt-1.5 font-mono tabular-nums">
          Saldo por entregar: {{ formatCurrency(kpiResumen.saldoPorEntregar) }} Bs.
        </p>
      </div>

      <div class="bg-white border border-stone-200 rounded-2xl p-5">
        <div class="flex items-center justify-between text-xs font-medium text-stone-500 mb-2">
          <span>Fondos Entregados</span>
          <Truck class="w-4 h-4 text-[#289EAB]" />
        </div>
        <div class="text-2xl font-extrabold text-[#1E7B85] font-mono tabular-nums">
          {{ formatCurrency(kpiResumen.totalEntregadoBob) }} Bs.
        </div>
        <p class="text-xs text-stone-500 mt-1.5">
          Asignados con vínculo a receptor
        </p>
      </div>

      <div class="bg-white border border-stone-200 rounded-2xl p-5">
        <div class="flex items-center justify-between text-xs font-medium text-stone-500 mb-2">
          <span>Aportes en Especie</span>
          <Package class="w-4 h-4 text-[#F58F38]" />
        </div>
        <div class="text-2xl font-extrabold text-stone-900 font-mono tabular-nums">
          {{ kpiResumen.totalEspecie }}
        </div>
        <p class="text-xs text-stone-500 mt-1.5">
          Bienes, insumos y equipamiento
        </p>
      </div>

      <div class="bg-white border border-stone-200 rounded-2xl p-5">
        <div class="flex items-center justify-between text-xs font-medium text-stone-500 mb-2">
          <span>Entregas Trazadas</span>
          <Link2 class="w-4 h-4 text-emerald-600" />
        </div>
        <div class="text-2xl font-extrabold text-stone-900 font-mono tabular-nums">
          {{ kpiResumen.totalEntregas }}
        </div>
        <p class="text-xs text-stone-500 mt-1.5 font-mono tabular-nums">
          {{ kpiResumen.completadas }} donaciones completadas
        </p>
      </div>
    </div>

    <!-- Filters & Search Toolbar -->
    <div class="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
      <div class="relative flex-1 max-w-md">
        <Search class="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Buscar por donante, código KIR-DON, receptor o proyecto..."
          class="w-full pl-10 pr-4 py-2 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#289EAB]/30 focus:border-[#289EAB]"
        />
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <!-- Segmented Type Filter -->
        <div class="inline-flex items-center gap-1 p-1 bg-stone-100 rounded-xl">
          <button
            v-for="opt in [
              { id: 'todos', label: 'Todas' },
              { id: 'economica', label: 'Económicas' },
              { id: 'especie', label: 'En especie' },
            ]"
            :key="opt.id"
            @click="tipoFilter = opt.id as any"
            :class="[
              'px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer',
              tipoFilter === opt.id
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-600 hover:text-stone-900',
            ]"
          >
            {{ opt.label }}
          </button>
        </div>

        <!-- Estado de Entrega Select -->
        <select
          v-model="estadoFilter"
          aria-label="Filtrar por estado de entrega"
          class="px-3.5 py-2 text-xs font-semibold bg-stone-50 border border-stone-200 rounded-xl text-stone-700 focus:outline-none focus:ring-2 focus:ring-[#289EAB]/30 focus:border-[#289EAB]"
        >
          <option value="todos">Todos los estados</option>
          <option value="ofrecida">Ofrecida por donante</option>
          <option value="recibida">Recibida en custodia</option>
          <option value="en_preparacion">En preparación / ruta</option>
          <option value="entrega_parcial">Entrega parcial</option>
          <option value="entregada">Entregada y trazada</option>
        </select>
      </div>
    </div>

    <!-- Loading Skeleton -->
    <div v-if="store.loading && !store.donations.length" class="space-y-4">
      <div
        v-for="n in 3"
        :key="n"
        class="bg-white border border-stone-200 rounded-2xl p-6 animate-pulse space-y-3"
      >
        <div class="h-4 bg-stone-200 rounded w-1/4"></div>
        <div class="h-5 bg-stone-100 rounded w-2/3"></div>
        <div class="h-4 bg-stone-100 rounded w-1/2"></div>
      </div>
    </div>


        <div class="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            @click="loadInitialData"
            :disabled="store.loading"
            class="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs sm:text-sm font-semibold rounded-xl transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw :class="['w-4 h-4', store.loading ? 'animate-spin' : '']" />
            <span>Actualizar</span>
          </button>

          <button
            @click="openCreateModal"
            class="px-5 py-2.5 bg-[#EB455F] hover:bg-[#d63851] text-white text-xs sm:text-sm font-semibold rounded-xl transition-colors inline-flex items-center gap-2 shadow-xs whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus class="w-4 h-4" />
            <span>Registrar donación</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Feedback banners -->
    <div
      v-if="feedbackSuccess"
      role="status"
      class="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-3"
    >
      <div class="flex items-center gap-2.5">
        <CheckCircle2 class="w-4 h-4 text-emerald-700 shrink-0" />
        <span>{{ feedbackSuccess }}</span>
      </div>
      <button @click="feedbackSuccess = null" class="text-emerald-700 hover:text-emerald-900 p-1 cursor-pointer">
        <X class="w-4 h-4" />
      </button>
    </div>

    <div
      v-if="feedbackError || store.error"
      role="alert"
      class="bg-red-50 border border-red-200 text-red-900 rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-3"
    >
      <div class="flex items-center gap-2.5">
        <AlertCircle class="w-4 h-4 text-red-700 shrink-0" />
        <span>{{ feedbackError || store.error }}</span>
      </div>
      <button @click="feedbackError = null" class="text-red-700 hover:text-red-900 p-1 cursor-pointer">
        <X class="w-4 h-4" />
      </button>
    </div>

    <!-- KPI Row (Tabular Numerals) -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="bg-white border border-stone-200 rounded-2xl p-5">
        <div class="flex items-center justify-between text-xs font-medium text-stone-500 mb-2">
          <span>Fondos Recibidos</span>
          <Coins class="w-4 h-4 text-[#EB455F]" />
        </div>
        <div class="text-2xl font-extrabold text-stone-900 font-mono tabular-nums">
          {{ formatCurrency(kpiResumen.totalBob) }} Bs.
        </div>
        <p class="text-xs text-stone-500 mt-1.5 font-mono tabular-nums">
          Saldo por entregar: {{ formatCurrency(kpiResumen.saldoPorEntregar) }} Bs.
        </p>
      </div>

      <div class="bg-white border border-stone-200 rounded-2xl p-5">
        <div class="flex items-center justify-between text-xs font-medium text-stone-500 mb-2">
          <span>Fondos Entregados</span>
          <Truck class="w-4 h-4 text-[#289EAB]" />
        </div>
        <div class="text-2xl font-extrabold text-[#1E7B85] font-mono tabular-nums">
          {{ formatCurrency(kpiResumen.totalEntregadoBob) }} Bs.
        </div>
        <p class="text-xs text-stone-500 mt-1.5">
          Asignados con vínculo a receptor
        </p>
      </div>

      <div class="bg-white border border-stone-200 rounded-2xl p-5">
        <div class="flex items-center justify-between text-xs font-medium text-stone-500 mb-2">
          <span>Aportes en Especie</span>
          <Package class="w-4 h-4 text-[#F58F38]" />
        </div>
        <div class="text-2xl font-extrabold text-stone-900 font-mono tabular-nums">
          {{ kpiResumen.totalEspecie }}
        </div>
        <p class="text-xs text-stone-500 mt-1.5">
          Bienes, insumos y equipamiento
        </p>
      </div>

      <div class="bg-white border border-stone-200 rounded-2xl p-5">
        <div class="flex items-center justify-between text-xs font-medium text-stone-500 mb-2">
          <span>Entregas Trazadas</span>
          <Link2 class="w-4 h-4 text-emerald-600" />
        </div>
        <div class="text-2xl font-extrabold text-stone-900 font-mono tabular-nums">
          {{ kpiResumen.totalEntregas }}
        </div>
        <p class="text-xs text-stone-500 mt-1.5 font-mono tabular-nums">
          {{ kpiResumen.completadas }} donaciones completadas
        </p>
      </div>
    </div>

    <!-- Filters & Search Toolbar -->
    <div class="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
      <div class="relative flex-1 max-w-md">
        <Search class="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Buscar por donante, código KIR-DON, receptor o proyecto..."
          class="w-full pl-10 pr-4 py-2 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#289EAB]/30 focus:border-[#289EAB]"
        />
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <!-- Segmented Type Filter -->
        <div class="inline-flex items-center gap-1 p-1 bg-stone-100 rounded-xl">
          <button
            v-for="opt in [
              { id: 'todos', label: 'Todas' },
              { id: 'economica', label: 'Económicas' },
              { id: 'especie', label: 'En especie' },
            ]"
            :key="opt.id"
            @click="tipoFilter = opt.id as any"
            :class="[
              'px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer',
              tipoFilter === opt.id
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-600 hover:text-stone-900',
            ]"
          >
            {{ opt.label }}
          </button>
        </div>

        <!-- Estado de Entrega Select -->
        <select
          v-model="estadoFilter"
          aria-label="Filtrar por estado de entrega"
          class="px-3.5 py-2 text-xs font-semibold bg-stone-50 border border-stone-200 rounded-xl text-stone-700 focus:outline-none focus:ring-2 focus:ring-[#289EAB]/30 focus:border-[#289EAB]"
        >
          <option value="todos">Todos los estados</option>
          <option value="recibida">Recibida en custodia</option>
          <option value="en_preparacion">En preparación / ruta</option>
          <option value="entrega_parcial">Entrega parcial</option>
          <option value="entregada">Entregada y trazada</option>
        </select>
      </div>
    </div>

    <!-- Loading Skeleton -->
    <div v-if="store.loading && !store.donations.length" class="space-y-4">
      <div
        v-for="n in 3"
        :key="n"
        class="bg-white border border-stone-200 rounded-2xl p-6 animate-pulse space-y-3"
      >
        <div class="h-4 bg-stone-200 rounded w-1/4"></div>
        <div class="h-5 bg-stone-100 rounded w-2/3"></div>
        <div class="h-4 bg-stone-100 rounded w-1/2"></div>
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-else-if="!filteredDonations.length"
      class="bg-white border border-stone-200 rounded-2xl p-12 text-center"
    >
      <div class="w-12 h-12 rounded-2xl bg-[#FDECEF] text-[#EB455F] flex items-center justify-center mx-auto mb-4">
        <HeartHandshake class="w-6 h-6" />
      </div>
      <h2 class="text-lg font-bold text-stone-900">
        {{ store.donations.length ? 'No hay donaciones con esos filtros' : 'Aún no hay donaciones registradas' }}
      </h2>
      <p class="text-sm text-stone-600 max-w-md mx-auto mt-1.5 mb-6">
        {{
          store.donations.length
            ? 'Ajusta el término de búsqueda o limpia los filtros de estado para ver el historial completo.'
            : 'Registra el primer aporte para iniciar la cadena de custodia entre donante, donación y receptor.'
        }}
      </p>
      <button
        v-if="!store.donations.length"
        @click="openCreateModal"
        class="px-5 py-2.5 bg-[#EB455F] hover:bg-[#d63851] text-white text-sm font-semibold rounded-xl transition-colors inline-flex items-center gap-2 cursor-pointer"
      >
        <Plus class="w-4 h-4" />
        <span>Registrar primera donación</span>
      </button>
      <button
        v-else
        @click="searchQuery = ''; tipoFilter = 'todos'; estadoFilter = 'todos'"
        class="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
      >
        Limpiar filtros
      </button>
    </div>

    <!-- Donations Traceability Movement List -->
    <div v-else class="space-y-4">
      <article
        v-for="d in filteredDonations"
        :key="d.id"
        class="bg-white border border-stone-200 rounded-2xl p-5 sm:p-6 transition-colors hover:border-stone-300"
      >
        <!-- Top Metadata Row + Status Indicator -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-stone-100">
          <div class="flex flex-wrap items-center gap-2 text-xs text-stone-500">
            <span class="font-mono font-bold text-stone-900">
              {{ d.codigo_donacion || `KIR-DON-${d.id}` }}
            </span>
            <span aria-hidden="true">·</span>
            <span>{{ d.tipo_donacion === 'economica' ? 'Aporte Económico' : 'Aporte en Especie' }}</span>
            <span aria-hidden="true">·</span>
            <span class="font-mono tabular-nums">{{ formatDate(d.fecha_recepcion) }}</span>
            <template v-if="d.proyecto?.titulo">
              <span aria-hidden="true">·</span>
              <span class="text-[#1E7B85] font-medium">Destino sugerido: {{ d.proyecto.titulo }}</span>
            </template>
          </div>

          <div
            :class="[
              'inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs font-semibold whitespace-nowrap shrink-0 self-start sm:self-auto',
              donationStatusMeta[(d.estado_entrega || 'recibida') as DonacionEstadoEntrega]?.bgClass,
              donationStatusMeta[(d.estado_entrega || 'recibida') as DonacionEstadoEntrega]?.textClass,
              donationStatusMeta[(d.estado_entrega || 'recibida') as DonacionEstadoEntrega]?.borderClass,
            ]"
          >
            <CheckCircle2 v-if="d.estado_entrega === 'entregada'" class="w-3.5 h-3.5" />
            <Truck v-else-if="d.estado_entrega === 'entrega_parcial' || d.estado_entrega === 'en_preparacion'" class="w-3.5 h-3.5" />
            <Clock v-else class="w-3.5 h-3.5" />
            <span>{{ donationStatusMeta[(d.estado_entrega || 'recibida') as DonacionEstadoEntrega]?.label }}</span>
          </div>
        </div>

        <!-- Chain Columns: Donante -> Donación -> Receptor(es) -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 py-4 items-start">
          <!-- Column 1: Donante -->
          <div class="lg:col-span-4 space-y-1">
            <div class="text-xs font-semibold text-stone-400">01. Donante</div>
            <div class="text-base font-bold text-stone-900 flex items-center gap-2">
              <Building2
                v-if="d.donante?.tipo_donante === 'empresa' || d.donante?.tipo_donante === 'organizacion'"
                class="w-4 h-4 text-[#289EAB] shrink-0"
              />
              <User v-else class="w-4 h-4 text-[#289EAB] shrink-0" />
              <span class="truncate">{{ d.donante_nombre }}</span>
            </div>
            <div class="text-xs text-stone-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span>{{ donorTypeLabels[d.donante?.tipo_donante || d.donante_tipo || 'persona'] || 'Persona' }}</span>
              <template v-if="d.donante_documento || d.donante?.documento_identidad">
                <span aria-hidden="true">·</span>
                <span class="font-mono">CI/NIT: {{ d.donante_documento || d.donante?.documento_identidad }}</span>
              </template>
              <template v-if="d.donante_email">
                <span aria-hidden="true">·</span>
                <span>{{ d.donante_email }}</span>
              </template>
            </div>
          </div>

          <!-- Column 2: Detalle de Donación y Saldo -->
          <div class="lg:col-span-4 space-y-1.5">
            <div class="text-xs font-semibold text-stone-400">02. Aporte Recibido</div>
            <template v-if="d.tipo_donacion === 'economica'">
              <div class="flex items-baseline gap-2">
                <span class="text-lg font-extrabold text-stone-900 font-mono tabular-nums">
                  {{ formatCurrency(d.monto_bob) }} Bs.
                </span>
                <span class="text-xs text-stone-500 font-mono tabular-nums">
                  (Entregado: {{ formatCurrency(d.monto_entregado_total) }} Bs.)
                </span>
              </div>
              <div class="w-full max-w-xs h-1.5 bg-stone-100 rounded-full overflow-hidden">
                <div
                  class="h-full bg-[#289EAB] transition-all duration-300"
                  :style="{ width: `${getProgressPercent(d)}%` }"
                ></div>
              </div>
              <div class="text-xs text-stone-500">
                <template v-if="d.recibido_por">
                  Recibido por: <span class="font-medium text-stone-700">{{ d.recibido_por }}</span>
                </template>
                <template v-else>
                  Modalidad: <span class="font-medium text-amber-800">{{ formatModalityLabel(d.modalidad_entrega) }}</span>
                </template>
                Recibido por: <span class="font-medium text-stone-700">{{ d.recibido_por }}</span>
              </div>
            </template>

            <template v-else>
              <div class="text-sm font-bold text-stone-900 leading-snug">
                {{ d.descripcion_especie }}
                <span v-if="d.cantidad_especie" class="font-mono text-xs text-stone-600">
                  ({{ d.cantidad_especie }} u.)
                </span>
              </div>
              <div class="text-xs text-stone-500">
                <template v-if="d.recibido_por">
                  Recibido por: <span class="font-medium text-stone-700">{{ d.recibido_por }}</span>
                </template>
                <template v-else>
                  Modalidad: <span class="font-medium text-amber-800">{{ formatModalityLabel(d.modalidad_entrega) }}</span>
                </template>
              </div>
            </template>
            <div v-if="d.direccion_recojo" class="text-xs text-stone-500">
              Recojo en: <span class="text-stone-700">{{ d.direccion_recojo }}</span>
            </div>
              </div>
              <div class="text-xs text-stone-500">
                Recibido por: <span class="font-medium text-stone-700">{{ d.recibido_por }}</span>
              </div>
            </template>
          </div>

          <!-- Column 3: Vínculo con Receptor y Entregas -->
          <div class="lg:col-span-4 space-y-1">
            <div class="text-xs font-semibold text-stone-400">03. Vínculo y Receptor(es)</div>
            <template v-if="d.entregas && d.entregas.length">
              <div class="text-sm font-bold text-stone-900 flex items-center gap-1.5">
                <ArrowRight class="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span class="truncate">{{ d.entregas[0].receptor?.nombre || d.ultimo_receptor }}</span>
              </div>
              <div class="text-xs text-stone-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span class="font-mono font-medium text-stone-700">{{ d.entregas[0].codigo_entrega }}</span>
                <span aria-hidden="true">·</span>
                <span>{{ d.entregas.length }} {{ d.entregas.length === 1 ? 'entrega' : 'entregas' }}</span>
                <template v-if="d.entregas[0].receptor?.ubicacion">
                  <span aria-hidden="true">·</span>
                  <span>{{ d.entregas[0].receptor.ubicacion }}</span>
                </template>
              </div>
            </template>
            <template v-else>
              <div class="text-sm font-medium text-stone-500">
                Pendiente de vincular a receptor
              </div>
              <div class="text-xs text-stone-400">
                Registra una entrega para completar la trazabilidad.
              </div>
            </template>
          </div>
        </div>

        <!-- Bottom Action Bar -->
        <div class="pt-3 border-t border-stone-100 flex flex-wrap items-center justify-between gap-3">
          <div class="text-xs text-stone-500">
            <template v-if="d.tipo_donacion === 'economica'">
              Saldo disponible para asignar:
              <span class="font-mono font-semibold text-stone-800 tabular-nums">
                {{ formatCurrency(d.saldo_disponible_bob ?? d.monto_bob) }} Bs.
              </span>
            </template>
            <template v-else>
              Trazabilidad de bienes físicos y actas de entrega
            </template>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <button
              @click="openTraceabilityModal(d)"
              class="px-3.5 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold rounded-xl transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Eye class="w-3.5 h-3.5" />
              <span>Ver trazabilidad</span>
            </button>

            <button
              v-if="d.estado_entrega === 'ofrecida'"
              @click="openConfirmModal(d)"
              class="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <CheckCircle2 class="w-3.5 h-3.5" />
              <span>Confirmar recepción</span>
            </button>

            <button
              v-if="canRegisterNewDelivery(d)"
              @click="openDeliveryModal(d)"
              class="px-4 py-2 bg-[#289EAB] hover:bg-[#1E7B85] text-white text-xs font-semibold rounded-xl transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Truck class="w-3.5 h-3.5" />
              <span>Registrar entrega</span>
            </button>
          </div>
        </div>
      </article>
    </div>

    <!-- ================================================================ -->
    <!-- MODAL 1: REGISTRAR NUEVA DONACIÓN Y DONANTE -->
    <!-- ================================================================ -->
    <div
      v-if="showCreateModal"
      class="fixed inset-0 z-50 bg-stone-950/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
    >
      <div class="bg-white rounded-2xl border border-stone-200 max-w-xl w-full p-6 sm:p-7 shadow-xl my-8 space-y-5">
        <div class="flex items-start justify-between gap-4 pb-3 border-b border-stone-100">
          <div>
            <h2 class="text-lg font-bold text-stone-900">Registrar Nueva Donación</h2>
            <p class="text-xs text-stone-500 mt-0.5">
              Registra al donante y el aporte recibido para emitir su código de custodia KIR-DON.
            </p>
          </div>
          <button
            @click="showCreateModal = false"
            class="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg cursor-pointer"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <form @submit.prevent="submitCreateDonation" class="space-y-4">
          <!-- Reuse existing donor if available -->
          <div v-if="store.donantes.length">
            <label class="block text-xs font-semibold text-stone-700 mb-1">
              Autocompletar desde donante registrado (opcional)
            </label>
            <select
              v-model="selectedExistingDonanteId"
              @change="handleSelectExistingDonante"
              class="w-full px-3.5 py-2 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-[#289EAB]"
            >
              <option value="">-- Nuevo donante --</option>
              <option v-for="dn in store.donantes" :key="dn.id" :value="dn.id">
                {{ dn.nombre }} ({{ donorTypeLabels[dn.tipo_donante] || dn.tipo_donante }})
              </option>
            </select>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div class="sm:col-span-2">
              <label class="block text-xs font-semibold text-stone-700 mb-1">
                Nombre o Razón Social del Donante *
              </label>
              <input
                v-model="createForm.donante_nombre"
                required
                type="text"
                placeholder="Ej. Fundación Solidaridad / Juan Pérez"
                class="w-full px-3.5 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:border-[#289EAB]"
              />
            </div>

            <div>
              <label class="block text-xs font-semibold text-stone-700 mb-1">Tipo de Donante</label>
              <select
                v-model="createForm.donante_tipo"
                class="w-full px-3.5 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:border-[#289EAB]"
              >
                <option value="persona">Persona natural</option>
                <option value="empresa">Empresa privada</option>
                <option value="organizacion">Organización aliada</option>
                <option value="anonimo">Anónimo</option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-semibold text-stone-700 mb-1">CI / NIT</label>
              <input
                v-model="createForm.donante_documento"
                type="text"
                placeholder="Ej. 8472910"
                class="w-full px-3.5 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:border-[#289EAB]"
              />
            </div>

            <div>
              <label class="block text-xs font-semibold text-stone-700 mb-1">Correo electrónico</label>
              <input
                v-model="createForm.donante_email"
                type="email"
                placeholder="donante@correo.com"
                class="w-full px-3.5 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:border-[#289EAB]"
              />
            </div>

            <div>
              <label class="block text-xs font-semibold text-stone-700 mb-1">Teléfono</label>
              <input
                v-model="createForm.donante_telefono"
                type="text"
                placeholder="+591 7..."
                class="w-full px-3.5 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:border-[#289EAB]"
              />
            </div>
          </div>

          <div class="pt-2 border-t border-stone-100 space-y-3.5">
            <div>
              <label class="block text-xs font-semibold text-stone-700 mb-1.5">Tipo de Donación *</label>
              <div class="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  @click="createForm.tipo_donacion = 'economica'"
                  :class="[
                    'px-4 py-2.5 text-xs font-semibold rounded-xl border transition-colors cursor-pointer',
                    createForm.tipo_donacion === 'economica'
                      ? 'bg-[#E8F6F8] border-[#289EAB] text-[#1E7B85]'
                      : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50',
                  ]"
                >
                  Económica (Bs.)
                </button>
                <button
                  type="button"
                  @click="createForm.tipo_donacion = 'especie'"
                  :class="[
                    'px-4 py-2.5 text-xs font-semibold rounded-xl border transition-colors cursor-pointer',
                    createForm.tipo_donacion === 'especie'
                      ? 'bg-[#FEF4EC] border-[#F58F38] text-[#B85E12]'
                      : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50',
                  ]"
                >
                  En Especie (Bienes)
                </button>
              </div>
            </div>

            <div v-if="createForm.tipo_donacion === 'economica'">
              <label class="block text-xs font-semibold text-stone-700 mb-1">Monto en Bolivianos (Bs.) *</label>
              <input
                v-model="createForm.monto_bob"
                required
                min="1"
                step="0.01"
                type="number"
                placeholder="Ej. 2500.00"
                class="w-full px-3.5 py-2 text-sm font-mono border border-stone-200 rounded-xl focus:outline-none focus:border-[#289EAB]"
              />
            </div>

            <div v-else>
              <label class="block text-xs font-semibold text-stone-700 mb-1">
                Descripción de Bienes en Especie *
              </label>
              <textarea
                v-model="createForm.descripcion_especie"
                required
                rows="2"
                placeholder="Ej. 40 mochilas escolares y 120 cuadernos"
                class="w-full px-3.5 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:border-[#289EAB]"
              ></textarea>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label class="block text-xs font-semibold text-stone-700 mb-1">
                  Proyecto Destino (Opcional)
                </label>
                <select
                  v-model="createForm.proyecto_destino_id"
                  class="w-full px-3.5 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:border-[#289EAB]"
                >
                  <option value="">Fondo general / Por asignar</option>
                  <option v-for="p in proyectos" :key="p.id" :value="p.id">
                    {{ p.titulo }}
                  </option>
                </select>
              </div>

              <div>
                <label class="block text-xs font-semibold text-stone-700 mb-1">
                  Recibido en Kirikú por *
                </label>
                <input
                  v-model="createForm.recibido_por"
                  required
                  type="text"
                  placeholder="Nombre del encargado"
                  class="w-full px-3.5 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:border-[#289EAB]"
                />
              </div>
            </div>
          </div>

          <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-100">
            <button
              type="button"
              @click="showCreateModal = false"
              class="px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-100 rounded-xl cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              :disabled="store.submitting"
              class="px-5 py-2 bg-[#EB455F] hover:bg-[#d63851] disabled:opacity-60 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              {{ store.submitting ? 'Guardando...' : 'Guardar donación' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- ================================================================ -->
    <!-- MODAL 2: REGISTRAR ENTREGA Y VÍNCULO DONANTE -> RECEPTOR -->
    <!-- ================================================================ -->
    <div
      v-if="showDeliveryModal && selectedDonationForDelivery"
      class="fixed inset-0 z-50 bg-stone-950/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
    >
      <div class="bg-white rounded-2xl border border-stone-200 max-w-2xl w-full p-6 sm:p-7 shadow-xl my-8 space-y-5">
        <div class="flex items-start justify-between gap-4 pb-3 border-b border-stone-100">
          <div>
            <h2 class="text-lg font-bold text-stone-900">
              Registrar Entrega y Vínculo con Receptor
            </h2>
            <p class="text-xs text-stone-500 mt-0.5">
              {{ selectedDonationForDelivery.codigo_donacion || `KIR-DON-${selectedDonationForDelivery.id}` }}
              · Donante: <span class="font-semibold text-stone-800">{{ selectedDonationForDelivery.donante_nombre }}</span>
            </p>
          </div>
          <button
            @click="showDeliveryModal = false"
            class="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg cursor-pointer"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <form @submit.prevent="submitRegisterDelivery" class="space-y-4">
          <!-- Mode toggle: New vs Existing Receptor -->
          <div class="flex items-center gap-2 p-1 bg-stone-100 rounded-xl w-fit">
            <button
              type="button"
              @click="recipientMode = 'nuevo'"
              :class="[
                'px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer',
                recipientMode === 'nuevo' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600',
              ]"
            >
              Registrar nuevo receptor
            </button>
            <button
              type="button"
              :disabled="!store.receptores.length"
              @click="recipientMode = 'existente'"
              :class="[
                'px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50',
                recipientMode === 'existente' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600',
              ]"
            >
              Seleccionar receptor existente ({{ store.receptores.length }})
            </button>
          </div>

          <div v-if="recipientMode === 'existente'" class="space-y-3">
            <label class="block text-xs font-semibold text-stone-700">Receptor Beneficiario *</label>
            <select
              v-model="deliveryForm.receptor_id"
              required
              class="w-full px-3.5 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:border-[#289EAB]"
            >
              <option value="">Selecciona un receptor registrado</option>
              <option v-for="r in store.receptores" :key="r.id" :value="r.id">
                {{ r.nombre }} — {{ recipientTypeLabels[r.tipo_receptor] || r.tipo_receptor }}
                {{ r.ubicacion ? `(${r.ubicacion})` : '' }}
              </option>
            </select>
          </div>

          <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div class="sm:col-span-2">
              <label class="block text-xs font-semibold text-stone-700 mb-1">
                Nombre del Receptor o Beneficiario Final *
              </label>
              <input
                v-model="deliveryForm.receptor_nombre"
                required
                type="text"
                placeholder="Ej. Unidad Educativa Villa Adela / Comunidad San Pedro"
                class="w-full px-3.5 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:border-[#289EAB]"
              />
            </div>

            <div>
              <label class="block text-xs font-semibold text-stone-700 mb-1">Tipo de Receptor *</label>
              <select
                v-model="deliveryForm.receptor_tipo"
                class="w-full px-3.5 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:border-[#289EAB]"
              >
                <option value="comunidad">Comunidad beneficiaria</option>
                <option value="proyecto">Proyecto comunitario</option>
                <option value="organizacion">Organización receptora</option>
                <option value="persona">Beneficiario individual</option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-semibold text-stone-700 mb-1">Ubicación de Entrega</label>
              <input
                v-model="deliveryForm.receptor_ubicacion"
                type="text"
                placeholder="Ej. El Alto, Distrito 3"
                class="w-full px-3.5 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:border-[#289EAB]"
              />
            </div>

            <div>
              <label class="block text-xs font-semibold text-stone-700 mb-1">CI / Documento Receptor</label>
              <input
                v-model="deliveryForm.receptor_documento"
                type="text"
                placeholder="Opcional"
                class="w-full px-3.5 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:border-[#289EAB]"
              />
            </div>

            <div>
              <label class="block text-xs font-semibold text-stone-700 mb-1">Teléfono Receptor</label>
              <input
                v-model="deliveryForm.receptor_telefono"
                type="text"
                placeholder="Opcional"
                class="w-full px-3.5 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:border-[#289EAB]"
              />
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2 border-t border-stone-100">
            <div>
              <label class="block text-xs font-semibold text-stone-700 mb-1">
                Vincular a Proyecto (Opcional)
              </label>
              <select
                v-model="deliveryForm.proyecto_id"
                class="w-full px-3.5 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:border-[#289EAB]"
              >
                <option value="">Sin proyecto específico</option>
                <option v-for="p in proyectos" :key="p.id" :value="p.id">
                  {{ p.titulo }}
                </option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-semibold text-stone-700 mb-1">
                Vincular a Organización (Opcional)
              </label>
              <select
                v-model="deliveryForm.organizacion_id"
                class="w-full px-3.5 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:border-[#289EAB]"
              >
                <option value="">Sin organización específica</option>
                <option v-for="o in organizaciones" :key="o.id" :value="o.id">
                  {{ o.nombre }}
                </option>
              </select>
            </div>
          </div>

          <!-- Amount or Goods -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2 border-t border-stone-100">
            <div v-if="selectedDonationForDelivery.tipo_donacion === 'economica'">
              <div class="flex items-center justify-between mb-1">
                <label class="text-xs font-semibold text-stone-700">Monto Entregado (Bs.) *</label>
                <button
                  type="button"
                  @click="fillRemainingBalance"
                  class="text-xs font-semibold text-[#1E7B85] hover:underline cursor-pointer"
                >
                  Saldo: {{ formatCurrency(selectedDonationForDelivery.saldo_disponible_bob ?? selectedDonationForDelivery.monto_bob) }} Bs.
                </button>
              </div>
              <input
                v-model="deliveryForm.monto_entregado_bob"
                required
                min="0.01"
                step="0.01"
                type="number"
                class="w-full px-3.5 py-2 text-sm font-mono border border-stone-200 rounded-xl focus:outline-none focus:border-[#289EAB]"
              />
            </div>

            <div v-else class="sm:col-span-2">
              <label class="block text-xs font-semibold text-stone-700 mb-1">
                Detalle de Bienes Entregados *
              </label>
              <input
                v-model="deliveryForm.detalle_bienes_entregados"
                required
                type="text"
                placeholder="Ej. 20 cajas entregadas en buen estado"
                class="w-full px-3.5 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:border-[#289EAB]"
              />
            </div>

            <div>
              <label class="block text-xs font-semibold text-stone-700 mb-1">Estado de la Entrega *</label>
              <select
                v-model="deliveryForm.estado"
                class="w-full px-3.5 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:border-[#289EAB]"
              >
                <option value="programada">Programada</option>
                <option value="en_camino">En camino</option>
                <option value="entregada">Entregada</option>
                <option value="verificada">Verificada</option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-semibold text-stone-700 mb-1">
                Responsable de Entrega (Kirikú) *
              </label>
              <input
                v-model="deliveryForm.responsable_entrega"
                required
                type="text"
                placeholder="Ej. Coordinador de Logística"
                class="w-full px-3.5 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:border-[#289EAB]"
              />
            </div>

            <div>
              <label class="block text-xs font-semibold text-stone-700 mb-1">
                Recibido en Destino por *
              </label>
              <input
                v-model="deliveryForm.recibido_por_receptor"
                required
                type="text"
                placeholder="Nombre y cargo de quien recibe"
                class="w-full px-3.5 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:border-[#289EAB]"
              />
            </div>

            <div class="sm:col-span-2">
              <label class="block text-xs font-semibold text-stone-700 mb-1">Observaciones / Acta</label>
              <textarea
                v-model="deliveryForm.observaciones"
                rows="2"
                placeholder="Notas de conformidad, número de acta o detalle logístico..."
                class="w-full px-3.5 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:border-[#289EAB]"
              ></textarea>
            </div>
          </div>

          <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-100">
            <button
              type="button"
              @click="showDeliveryModal = false"
              class="px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-100 rounded-xl cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              :disabled="store.submitting"
              class="px-5 py-2 bg-[#289EAB] hover:bg-[#1E7B85] disabled:opacity-60 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              {{ store.submitting ? 'Registrando...' : 'Confirmar entrega y vínculo' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- ================================================================ -->
    <!-- MODAL 3: AUDITORÍA Y CADENA DE TRAZABILIDAD COMPLETA -->
    <!-- ================================================================ -->
    <div
      v-if="showTraceModal && store.activeTraceability"
      class="fixed inset-0 z-50 bg-stone-950/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
    >
      <div class="bg-white rounded-2xl border border-stone-200 max-w-3xl w-full p-6 sm:p-8 shadow-xl my-8 space-y-6">
        <div class="flex items-start justify-between gap-4 pb-4 border-b border-stone-100">
          <div>
            <div class="text-xs font-mono font-bold text-[#1E7B85]">
              {{ store.activeTraceability.resumen.codigo_donacion }}
            </div>
            <h2 class="text-xl font-extrabold text-stone-900 mt-0.5">
              Cadena de Trazabilidad Donante → Receptor
            </h2>
          </div>
          <button
            @click="showTraceModal = false"
            class="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg cursor-pointer"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- Summary Strip -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div class="bg-stone-50 border border-stone-200 rounded-xl p-3">
            <div class="text-xs text-stone-500">Estado Actual</div>
            <div class="text-sm font-bold text-stone-900 mt-0.5">
              {{ donationStatusMeta[store.activeTraceability.resumen.estado_entrega]?.label }}
            </div>
          </div>
          <div class="bg-stone-50 border border-stone-200 rounded-xl p-3">
            <div class="text-xs text-stone-500">Entregas</div>
            <div class="text-sm font-bold text-stone-900 font-mono tabular-nums mt-0.5">
              {{ store.activeTraceability.resumen.total_entregas }} registradas
            </div>
          </div>
          <div class="bg-stone-50 border border-stone-200 rounded-xl p-3">
            <div class="text-xs text-stone-500">Receptores</div>
            <div class="text-sm font-bold text-stone-900 font-mono tabular-nums mt-0.5">
              {{ store.activeTraceability.resumen.receptores_vinculados }} vinculados
            </div>
          </div>
          <div class="bg-stone-50 border border-stone-200 rounded-xl p-3">
            <div class="text-xs text-stone-500">
              {{ store.activeTraceability.donacion.tipo_donacion === 'economica' ? 'Saldo Disponible' : 'Tipo' }}
            </div>
            <div class="text-sm font-bold text-stone-900 font-mono tabular-nums mt-0.5">
              {{
                store.activeTraceability.donacion.tipo_donacion === 'economica'
                  ? `${formatCurrency(store.activeTraceability.resumen.saldo_disponible_bob)} Bs.`
                  : 'En especie'
              }}
            </div>
          </div>
        </div>

        <!-- Step 1 & Step 2: Origin Donor + Custody Receipt -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="border border-stone-200 rounded-xl p-4 space-y-1.5">
            <div class="text-xs font-semibold text-[#1E7B85]">Paso 1 · Origen (Donante)</div>
            <div class="text-base font-bold text-stone-900">
              {{ store.activeTraceability.donante.nombre }}
            </div>
            <div class="text-xs text-stone-600 space-y-0.5">
              <div>Tipo: {{ donorTypeLabels[store.activeTraceability.donante.tipo_donante] || store.activeTraceability.donante.tipo_donante }}</div>
              <div v-if="store.activeTraceability.donante.documento_identidad">
                CI / NIT: <span class="font-mono">{{ store.activeTraceability.donante.documento_identidad }}</span>
              </div>
              <div v-if="store.activeTraceability.donante.email">
                Correo: {{ store.activeTraceability.donante.email }}
              </div>
              <div v-if="store.activeTraceability.donante.telefono">
                Teléfono: {{ store.activeTraceability.donante.telefono }}
              </div>
            </div>
          </div>

          <div class="border border-stone-200 rounded-xl p-4 space-y-1.5">
            <div class="text-xs font-semibold text-[#EB455F]">Paso 2 · Recepción en Custodia</div>
            <div class="text-base font-bold text-stone-900 font-mono tabular-nums">
              {{
                store.activeTraceability.donacion.tipo_donacion === 'economica'
                  ? `${formatCurrency(store.activeTraceability.donacion.monto_bob)} Bs.`
                  : store.activeTraceability.donacion.descripcion_especie
              }}
            </div>
            <div class="text-xs text-stone-600 space-y-0.5">
              <div>
                {{
                  store.activeTraceability.donacion.recibido_por
                    ? `Recibido por: ${store.activeTraceability.donacion.recibido_por}`
                    : `Estado: Ofrecida (${formatModalityLabel(store.activeTraceability.donacion.modalidad_entrega)})`
                }}
              </div>
              <div>Recibido por: {{ store.activeTraceability.donacion.recibido_por }}</div>
              <div>Fecha: {{ formatDate(store.activeTraceability.donacion.fecha_recepcion) }}</div>
              <div v-if="store.activeTraceability.proyecto_destino">
                Proyecto sugerido: {{ store.activeTraceability.proyecto_destino.titulo }}
              </div>
            </div>
          </div>
        </div>

        <!-- Step 3: Deliveries & Recipients -->
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-bold text-stone-900">
              Paso 3 · Entregas y Receptores Vinculados ({{ store.activeTraceability.entregas.length }})
            </h3>
            <button
              v-if="canRegisterNewDelivery(store.activeTraceability.donacion)"
              @click="showTraceModal = false; openDeliveryModal(store.activeTraceability.donacion)"
              class="px-3.5 py-1.5 bg-[#289EAB] hover:bg-[#1E7B85] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus class="w-3.5 h-3.5" />
              <span>Nueva entrega</span>
            </button>
          </div>

          <div
            v-if="!store.activeTraceability.entregas.length"
            class="border border-dashed border-stone-300 rounded-xl p-6 text-center text-sm text-stone-500"
          >
            Esta donación aún no tiene entregas vinculadas a un receptor.
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="e in store.activeTraceability.entregas"
              :key="e.id"
              class="border border-stone-200 rounded-xl p-4 space-y-2.5"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                  <span class="font-mono font-bold text-stone-900">{{ e.codigo_entrega }}</span>
                  <span aria-hidden="true">·</span>
                  <span class="font-mono tabular-nums">{{ formatDate(e.fecha_entrega) }}</span>
                  <span aria-hidden="true">·</span>
                  <span>{{ recipientTypeLabels[e.receptor?.tipo_receptor || ''] || 'Receptor' }}</span>
                </div>
                <span
                  :class="[
                    'px-2.5 py-0.5 rounded-md text-xs font-semibold',
                    deliveryStateMeta[e.estado]?.bgClass,
                    deliveryStateMeta[e.estado]?.textClass,
                  ]"
                >
                  {{ deliveryStateMeta[e.estado]?.label }}
                </span>
              </div>

              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div class="text-sm font-bold text-stone-900 flex items-center gap-1.5">
                    <MapPin class="w-3.5 h-3.5 text-[#289EAB] shrink-0" />
                    <span>{{ e.receptor?.nombre }}</span>
                  </div>
                  <div class="text-xs text-stone-600 mt-0.5">
                    Entregó: <span class="font-medium">{{ e.responsable_entrega }}</span>
                    · Recibió: <span class="font-medium">{{ e.recibido_por_receptor }}</span>
                    <template v-if="e.proyecto_titulo"> · Proyecto: {{ e.proyecto_titulo }}</template>
                  </div>
                </div>

                <div class="text-sm font-bold text-stone-900 font-mono tabular-nums shrink-0">
                  {{
                    e.monto_entregado_bob
                      ? `${formatCurrency(e.monto_entregado_bob)} Bs.`
                      : e.detalle_bienes_entregados
                  }}
                </div>
              </div>

              <p v-if="e.observaciones" class="text-xs text-stone-500 bg-stone-50 rounded-lg px-3 py-2">
                {{ e.observaciones }}
              </p>

              <!-- Advance delivery state controls -->
              <div v-if="e.estado !== 'verificada'" class="flex flex-wrap items-center gap-2 pt-1">
                <button
                  v-if="e.estado === 'programada'"
                  @click="advanceDeliveryState(e.id, e.donacion_id, 'en_camino')"
                  :disabled="store.submitting"
                  class="px-3 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Marcar en camino
                </button>
                <button
                  v-if="e.estado === 'programada' || e.estado === 'en_camino'"
                  @click="advanceDeliveryState(e.id, e.donacion_id, 'entregada')"
                  :disabled="store.submitting"
                  class="px-3 py-1 bg-[#E8F6F8] hover:bg-[#d4eef2] text-[#1E7B85] text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Confirmar entrega
                </button>
                <button
                  v-if="e.estado === 'entregada'"
                  @click="advanceDeliveryState(e.id, e.donacion_id, 'verificada')"
                  :disabled="store.submitting"
                  class="px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-lg inline-flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <ShieldCheck class="w-3.5 h-3.5" />
                  <span>Verificar entrega</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ================================================================ -->
    <!-- MODAL 4: CONFIRMAR RECEPCIÓN DE DONACIÓN OFRECIDA (KIR-30) -->
    <!-- ================================================================ -->
    <div
      v-if="showConfirmModal && selectedDonationForConfirm"
      class="fixed inset-0 z-50 bg-stone-950/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
    >
      <div class="bg-white rounded-2xl border border-stone-200 max-w-lg w-full p-6 sm:p-7 shadow-xl my-8 space-y-5">
        <div class="flex items-start justify-between gap-4 pb-3 border-b border-stone-100">
          <div>
            <h2 class="text-lg font-bold text-stone-900">Confirmar Recepción de Donación Ofrecida</h2>
            <p class="text-xs text-stone-500 mt-0.5">
              {{ selectedDonationForConfirm.codigo_donacion || `KIR-DON-${selectedDonationForConfirm.id}` }}
              · Donante: <span class="font-semibold text-stone-800">{{ selectedDonationForConfirm.donante_nombre }}</span>
            </p>
          </div>
          <button
            @click="showConfirmModal = false"
            class="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg cursor-pointer"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <form @submit.prevent="submitConfirmReceipt" class="space-y-4">
          <div class="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 space-y-1">
            <div>
              <strong>Modalidad ofrecida:</strong> {{ formatModalityLabel(selectedDonationForConfirm.modalidad_entrega) }}
            </div>
            <div v-if="selectedDonationForConfirm.direccion_recojo">
              <strong>Dirección de recojo:</strong> {{ selectedDonationForConfirm.direccion_recojo }}
            </div>
            <div v-if="selectedDonationForConfirm.notas_donante">
              <strong>Notas del donante:</strong> {{ selectedDonationForConfirm.notas_donante }}
            </div>
          </div>

          <div>
            <label class="block text-xs font-semibold text-stone-700 mb-1">
              Recibido / Verificado en Kirikú por *
            </label>
            <input
              v-model="confirmForm.recibido_por"
              required
              type="text"
              placeholder="Nombre completo del responsable de recepción"
              class="w-full px-3.5 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:border-[#289EAB]"
            />
          </div>

          <div>
            <label class="block text-xs font-semibold text-stone-700 mb-1">
              Observaciones de recepción (opcional)
            </label>
            <textarea
              v-model="confirmForm.notas_recepcion"
              rows="2"
              placeholder="Ej. Transferencia verificada / Bienes recibidos completos en centro de acopio"
              class="w-full px-3.5 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:border-[#289EAB]"
            ></textarea>
          </div>

          <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-100">
            <button
              type="button"
              @click="showConfirmModal = false"
              class="px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-100 rounded-xl cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              :disabled="store.submitting"
              class="px-5 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              {{ store.submitting ? 'Confirmando...' : 'Confirmar recepción en custodia' }}
            </button>
          </div>
        </form>

              <!-- Advance delivery state controls -->
              <div v-if="e.estado !== 'verificada'" class="flex flex-wrap items-center gap-2 pt-1">
                <button
                  v-if="e.estado === 'programada'"
                  @click="advanceDeliveryState(e.id, e.donacion_id, 'en_camino')"
                  :disabled="store.submitting"
                  class="px-3 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Marcar en camino
                </button>
                <button
                  v-if="e.estado === 'programada' || e.estado === 'en_camino'"
                  @click="advanceDeliveryState(e.id, e.donacion_id, 'entregada')"
                  :disabled="store.submitting"
                  class="px-3 py-1 bg-[#E8F6F8] hover:bg-[#d4eef2] text-[#1E7B85] text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Confirmar entrega
                </button>
                <button
                  v-if="e.estado === 'entregada'"
                  @click="advanceDeliveryState(e.id, e.donacion_id, 'verificada')"
                  :disabled="store.submitting"
                  class="px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-lg inline-flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <ShieldCheck class="w-3.5 h-3.5" />
                  <span>Verificar entrega</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div v-else-if="history && !historyLoading" class="bg-white rounded-2xl border border-stone-200 p-8 text-center"><History class="w-9 h-9 text-stone-300 mx-auto mb-2" /><h3 class="font-bold text-stone-800">No hay donaciones que coincidan</h3><p class="text-sm text-stone-500 mt-1">Prueba cambiando los filtros o consulta de nuevo más adelante.</p></div>
      <p class="text-[11px] text-stone-400">Por transparencia, el historial muestra datos del aporte y su destino. No se muestran correos electrónicos de donantes.</p>
    </section>
  </main>
</template>
