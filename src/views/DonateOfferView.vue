<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  HeartHandshake,
  ArrowLeft,
  Coins,
  Package,
  Building2,
  User,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Truck,
  MapPin,
  Calendar,
  Send,
  Sparkles,
  Clock,
} from 'lucide-vue-next';
import { api } from '../api/client';
import { useDonationsStore } from '../stores/donations';
import type {
  Donacion,
  DonacionCategoriaEspecie,
  DonacionModalidadEntrega,
  DonacionTipo,
  DonanteTipo,
  Proyecto,
} from '../types';

const store = useDonationsStore();

const proyectos = ref<Proyecto[]>([]);
const loadingProjects = ref(false);
const dbWarning = ref<string | null>(null);
const errorMsg = ref<string | null>(null);
const submittedDonation = ref<Donacion | null>(null);
const successMessage = ref<string | null>(null);

const todayYmd = (() => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
})();

const form = ref({
  donante_tipo: 'persona' as DonanteTipo,
  donante_nombre: '',
  donante_documento: '',
  donante_email: '',
  donante_telefono: '',
  donante_ciudad: 'La Paz',
  tipo_donacion: 'economica' as DonacionTipo,
  monto_bob: '' as string | number,
  categoria_especie: 'alimentos' as DonacionCategoriaEspecie,
  cantidad_especie: '' as string | number,
  descripcion_especie: '',
  proyecto_destino_id: '',
  modalidad_entrega: 'transferencia_qr' as DonacionModalidadEntrega,
  fecha_disponible_estimada: '',
  direccion_recojo: '',
  notas_donante: '',
});

const quickAmounts = [50, 100, 250, 500, 1000];

const donorTypes: Array<{ id: DonanteTipo; label: string; hint: string }> = [
  { id: 'persona', label: 'Persona natural', hint: 'Aporte individual o familiar' },
  { id: 'empresa', label: 'Empresa privada', hint: 'Responsabilidad social / RSE' },
  { id: 'organizacion', label: 'Organización aliada', hint: 'ONG, colectivo o institución' },
  { id: 'anonimo', label: 'Aporte anónimo', hint: 'Sin publicar identidad' },
];

const inKindCategories: Array<{ id: DonacionCategoriaEspecie; label: string }> = [
  { id: 'alimentos', label: 'Alimentos no perecederos' },
  { id: 'ropa_abrigo', label: 'Ropa y abrigo' },
  { id: 'utiles_escolares', label: 'Útiles escolares y libros' },
  { id: 'salud_higiene', label: 'Insumos de salud e higiene' },
  { id: 'herramientas', label: 'Herramientas y equipamiento' },
  { id: 'otros', label: 'Otros bienes' },
];

const modalityOptions = computed(() => {
  if (form.value.tipo_donacion === 'economica') {
    return [
      {
        id: 'transferencia_qr' as DonacionModalidadEntrega,
        label: 'Transferencia bancaria / QR',
        desc: 'Coordinación rápida por comprobante',
      },
      {
        id: 'entrega_centro_acopio' as DonacionModalidadEntrega,
        label: 'Aporte presencial en oficina Kirikú',
        desc: 'Recepción directa con recibo oficial',
      },
      {
        id: 'coordinacion_directa' as DonacionModalidadEntrega,
        label: 'Coordinación con equipo Kirikú',
        desc: 'Te contactamos para definir la vía',
      },
    ];
  }
  return [
    {
      id: 'entrega_centro_acopio' as DonacionModalidadEntrega,
      label: 'Entregar en centro de acopio',
      desc: 'Acercas los bienes en el horario acordado',
    },
    {
      id: 'recojo_domicilio' as DonacionModalidadEntrega,
      label: 'Solicitar recojo a domicilio',
      desc: 'Nuestra brigada pasa a recoger el aporte',
    },
    {
      id: 'coordinacion_directa' as DonacionModalidadEntrega,
      label: 'Coordinación directa en terreno',
      desc: 'Entrega acordada para el proyecto',
    },
  ];
});

function setDonationType(tipo: DonacionTipo) {
  form.value.tipo_donacion = tipo;
  if (tipo === 'economica') {
    if (form.value.modalidad_entrega === 'recojo_domicilio') {
      form.value.modalidad_entrega = 'transferencia_qr';
    }
  } else {
    if (form.value.modalidad_entrega === 'transferencia_qr') {
      form.value.modalidad_entrega = 'entrega_centro_acopio';
    }
  }
}

const validationMessage = computed(() => {
  if (form.value.donante_tipo !== 'anonimo') {
    if (form.value.donante_nombre.trim().length < 2) {
      return 'Ingresa tu nombre o razón social (mínimo 2 caracteres).';
    }
    if (!form.value.donante_email.trim() && !form.value.donante_telefono.trim()) {
      return 'Ingresa un correo electrónico o teléfono para coordinar la recepción.';
    }
  }
  if (
    form.value.donante_email.trim() &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.value.donante_email.trim())
  ) {
    return 'El formato del correo electrónico no es válido.';
  }
  if (form.value.tipo_donacion === 'economica') {
    const monto = Number(form.value.monto_bob);
    if (!Number.isFinite(monto) || monto <= 0) {
      return 'Ingresa el monto económico que deseas ofrecer (mayor a 0 Bs.).';
    }
  } else {
    if (form.value.descripcion_especie.trim().length < 3) {
      return 'Describe los bienes que deseas donar (mínimo 3 caracteres).';
    }
    if (
      form.value.cantidad_especie !== '' &&
      (!Number.isInteger(Number(form.value.cantidad_especie)) ||
        Number(form.value.cantidad_especie) <= 0)
    ) {
      return 'La cantidad estimada debe ser un número entero positivo.';
    }
  }
  if (
    form.value.modalidad_entrega === 'recojo_domicilio' &&
    form.value.direccion_recojo.trim().length < 5
  ) {
    return 'Indica la dirección completa para el recojo a domicilio.';
  }
  if (
    form.value.fecha_disponible_estimada &&
    form.value.fecha_disponible_estimada < todayYmd
  ) {
    return 'La fecha disponible estimada no puede ser anterior a hoy.';
  }
  return null;
});

const isFormReady = computed(() => !validationMessage.value && !dbWarning.value);

async function loadProjects() {
  loadingProjects.value = true;
  dbWarning.value = null;
  try {
    const status = await api.getStatus();
    if (!status.databaseConfigured) {
      dbWarning.value =
        'La base de datos aún no está conectada en este entorno. Configura DATABASE_URL para registrar ofrecimientos en vivo.';
      return;
    }
    const list = await api.getPublishedProjects();
    proyectos.value = list;
  } catch {
    try {
      proyectos.value = await api.getProyectos({ estado: 'aprobado' });
    } catch {
      proyectos.value = [];
    }
  } finally {
    loadingProjects.value = false;
  }
}

async function handleSubmit() {
  errorMsg.value = null;
  if (validationMessage.value) {
    errorMsg.value = validationMessage.value;
    return;
  }
  try {
    const res = await store.offerDonation({
      donante_tipo: form.value.donante_tipo,
      donante_nombre:
        form.value.donante_tipo === 'anonimo' && !form.value.donante_nombre.trim()
          ? 'Donante Anónimo'
          : form.value.donante_nombre.trim(),
      donante_documento: form.value.donante_documento.trim() || undefined,
      donante_email: form.value.donante_email.trim() || undefined,
      donante_telefono: form.value.donante_telefono.trim() || undefined,
      donante_ciudad: form.value.donante_ciudad.trim() || undefined,
      tipo_donacion: form.value.tipo_donacion,
      monto_bob:
        form.value.tipo_donacion === 'economica' ? Number(form.value.monto_bob) : undefined,
      categoria_especie:
        form.value.tipo_donacion === 'especie' ? form.value.categoria_especie : undefined,
      cantidad_especie:
        form.value.tipo_donacion === 'especie' && form.value.cantidad_especie !== ''
          ? Number(form.value.cantidad_especie)
          : undefined,
      descripcion_especie:
        form.value.tipo_donacion === 'especie'
          ? form.value.descripcion_especie.trim()
          : undefined,
      proyecto_destino_id: form.value.proyecto_destino_id || null,
      modalidad_entrega: form.value.modalidad_entrega,
      fecha_disponible_estimada: form.value.fecha_disponible_estimada || undefined,
      direccion_recojo:
        form.value.modalidad_entrega === 'recojo_domicilio'
          ? form.value.direccion_recojo.trim()
          : undefined,
      notas_donante: form.value.notas_donante.trim() || undefined,
    });
    submittedDonation.value = res.donacion;
    successMessage.value = res.message;
  } catch (err: any) {
    errorMsg.value =
      err?.response?.data?.error || 'No se pudo registrar tu donación ofrecida. Intenta nuevamente.';
  }
}

function resetOfferForm() {
  submittedDonation.value = null;
  successMessage.value = null;
  errorMsg.value = null;
  form.value = {
    donante_tipo: 'persona',
    donante_nombre: '',
    donante_documento: '',
    donante_email: '',
    donante_telefono: '',
    donante_ciudad: 'La Paz',
    tipo_donacion: 'economica',
    monto_bob: '',
    categoria_especie: 'alimentos',
    cantidad_especie: '',
    descripcion_especie: '',
    proyecto_destino_id: '',
    modalidad_entrega: 'transferencia_qr',
    fecha_disponible_estimada: '',
    direccion_recojo: '',
    notas_donante: '',
  };
}

function formatModalityLabel(mod?: string | null): string {
  const map: Record<string, string> = {
    transferencia_qr: 'Transferencia bancaria / QR',
    entrega_centro_acopio: 'Entrega en centro de acopio Kirikú',
    recojo_domicilio: 'Recojo a domicilio solicitado',
    coordinacion_directa: 'Coordinación directa con el equipo',
  };
  return (mod && map[mod]) || 'Coordinación directa';
}

onMounted(() => {
  loadProjects();
});
</script>

<template>
  <div class="min-h-screen bg-stone-50 py-8 sm:py-10 px-4 sm:px-6 lg:px-8">
    <div class="max-w-4xl mx-auto space-y-6">
      <!-- Top Navigation Bar -->
      <div class="flex flex-wrap items-center justify-between gap-3">
        <router-link
          to="/donaciones"
          class="inline-flex items-center gap-2 text-sm font-semibold text-stone-600 hover:text-stone-900 transition-colors"
        >
          <ArrowLeft class="w-4 h-4" />
          <span>Ver panel de donaciones y trazabilidad</span>
        </router-link>

        <span class="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#E8F6F8] text-[#1E7B85] border border-[#289EAB]/20">
          <HeartHandshake class="w-3.5 h-3.5 text-[#289EAB]" />
          <span>Formulario para Donantes · KIR-30</span>
        </span>
      </div>

      <!-- DB Warning if unconfigured -->
      <div
        v-if="dbWarning"
        role="alert"
        class="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-4 text-sm flex items-start gap-3"
      >
        <AlertCircle class="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
        <span>{{ dbWarning }}</span>
      </div>

      <!-- SUCCESS RECEIPT SCREEN -->
      <div
        v-if="submittedDonation"
        class="bg-white rounded-2xl border border-emerald-200 p-7 sm:p-10 shadow-xs space-y-6"
      >
        <div class="text-center space-y-3">
          <div class="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
            <CheckCircle2 class="w-8 h-8" />
          </div>
          <h1 class="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight">
            ¡Donación Ofrecida Registrada!
          </h1>
          <p class="text-sm text-stone-600 max-w-xl mx-auto leading-relaxed">
            {{ successMessage }}
          </p>
        </div>

        <div class="bg-stone-50 rounded-2xl border border-stone-200 p-5 sm:p-6 max-w-2xl mx-auto space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-stone-200">
            <div>
              <div class="text-xs font-semibold text-stone-500">Código de seguimiento</div>
              <div class="text-xl font-extrabold font-mono text-stone-900">
                {{ submittedDonation.codigo_donacion || `KIR-DON-${submittedDonation.id}` }}
              </div>
            </div>
            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
              <Clock class="w-3.5 h-3.5" />
              <span>Ofrecida · Pendiente de recepción</span>
            </span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <div class="text-xs text-stone-500">Donante</div>
              <div class="font-bold text-stone-900">{{ submittedDonation.donante_nombre }}</div>
              <div class="text-xs text-stone-500 mt-0.5">
                {{ submittedDonation.donante_email || submittedDonation.donante_telefono || 'Aporte anónimo' }}
              </div>
            </div>

            <div>
              <div class="text-xs text-stone-500">Detalle del ofrecimiento</div>
              <div v-if="submittedDonation.tipo_donacion === 'economica'" class="font-extrabold font-mono text-stone-900 text-base tabular-nums">
                {{ Number(submittedDonation.monto_bob || 0).toLocaleString('es-BO', { minimumFractionDigits: 2 }) }} Bs.
              </div>
              <div v-else class="font-bold text-stone-900">
                {{ submittedDonation.descripcion_especie }}
                <span v-if="submittedDonation.cantidad_especie" class="font-mono text-xs text-stone-600">
                  ({{ submittedDonation.cantidad_especie }} u.)
                </span>
              </div>
            </div>

            <div>
              <div class="text-xs text-stone-500">Modalidad de entrega</div>
              <div class="font-semibold text-stone-800">
                {{ formatModalityLabel(submittedDonation.modalidad_entrega) }}
              </div>
              <div v-if="submittedDonation.direccion_recojo" class="text-xs text-stone-500 mt-0.5">
                Dirección: {{ submittedDonation.direccion_recojo }}
              </div>
            </div>

            <div>
              <div class="text-xs text-stone-500">Destino</div>
              <div class="font-semibold text-[#1E7B85]">
                {{ submittedDonation.proyecto?.titulo || 'Fondo solidario general Kirikú' }}
              </div>
              <div v-if="submittedDonation.fecha_disponible_estimada" class="text-xs text-stone-500 mt-0.5 font-mono">
                Disponible desde: {{ submittedDonation.fecha_disponible_estimada.slice(0, 10) }}
              </div>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            @click="resetOfferForm"
            class="px-5 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-800 text-sm font-semibold rounded-xl transition-colors cursor-pointer"
          >
            Ofrecer otra donación
          </button>
          <router-link
            to="/donaciones"
            class="px-5 py-2.5 bg-[#289EAB] hover:bg-[#1E7B85] text-white text-sm font-semibold rounded-xl transition-colors inline-flex items-center gap-2"
          >
            <span>Ir a Trazabilidad de Donaciones</span>
          </router-link>
        </div>
      </div>

      <!-- DONOR OFFER FORM -->
      <div v-else class="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
        <div class="h-1.5 w-full flex">
          <div class="flex-1 bg-[#289EAB]"></div>
          <div class="flex-1 bg-[#F58F38]"></div>
          <div class="flex-1 bg-[#EB455F]"></div>
        </div>

        <div class="p-6 sm:p-8 border-b border-stone-100">
          <div class="flex items-start gap-4">
            <div class="w-12 h-12 rounded-2xl bg-[#FDECEF] text-[#EB455F] flex items-center justify-center shrink-0">
              <HeartHandshake class="w-6 h-6" />
            </div>
            <div>
              <h1 class="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight">
                Registrar Donación Ofrecida
              </h1>
              <p class="text-sm text-stone-600 mt-1.5 leading-relaxed">
                Completa este formulario para ofrecer un aporte económico o en especie a los proyectos comunitarios de Kirikú. Emitiremos tu código <span class="font-mono font-semibold text-stone-800">KIR-DON</span> para coordinar la entrega y hacer seguimiento transparente.
              </p>
            </div>
          </div>
        </div>

        <form @submit.prevent="handleSubmit" class="p-6 sm:p-8 space-y-8">
          <!-- Error alert -->
          <div
            v-if="errorMsg"
            role="alert"
            class="bg-red-50 border border-red-200 text-red-900 rounded-xl px-4 py-3 text-sm flex items-start gap-2.5"
          >
            <AlertCircle class="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
            <span>{{ errorMsg }}</span>
          </div>

          <!-- SECTION 1: DONOR PROFILE -->
          <section class="space-y-4">
            <div class="flex items-center gap-2 text-sm font-bold text-stone-900">
              <span class="w-6 h-6 rounded-lg bg-[#E8F6F8] text-[#1E7B85] font-mono text-xs flex items-center justify-center">01</span>
              <span>Identificación y Contacto del Donante</span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              <button
                v-for="dt in donorTypes"
                :key="dt.id"
                type="button"
                @click="form.donante_tipo = dt.id"
                :class="[
                  'p-3 rounded-xl border text-left transition-colors cursor-pointer',
                  form.donante_tipo === dt.id
                    ? 'bg-[#E8F6F8] border-[#289EAB] text-stone-900'
                    : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50',
                ]"
              >
                <div class="text-xs font-bold flex items-center gap-1.5">
                  <Building2 v-if="dt.id === 'empresa' || dt.id === 'organizacion'" class="w-3.5 h-3.5 text-[#289EAB]" />
                  <ShieldCheck v-else-if="dt.id === 'anonimo'" class="w-3.5 h-3.5 text-[#289EAB]" />
                  <User v-else class="w-3.5 h-3.5 text-[#289EAB]" />
                  <span>{{ dt.label }}</span>
                </div>
                <div class="text-[11px] text-stone-500 mt-1">{{ dt.hint }}</div>
              </button>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div class="sm:col-span-2">
                <label class="block text-xs font-semibold text-stone-700 mb-1">
                  {{ form.donante_tipo === 'anonimo' ? 'Alias o referencia (opcional)' : 'Nombre completo o Razón Social *' }}
                </label>
                <input
                  v-model="form.donante_nombre"
                  :required="form.donante_tipo !== 'anonimo'"
                  type="text"
                  :placeholder="form.donante_tipo === 'anonimo' ? 'Ej. Donante Anónimo' : 'Ej. Valeria Mendoza / Fundación Esperanza'"
                  class="w-full px-3.5 py-2.5 text-sm bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#289EAB]/25 focus:border-[#289EAB]"
                />
              </div>

              <div>
                <label class="block text-xs font-semibold text-stone-700 mb-1">
                  Correo electrónico {{ form.donante_tipo === 'anonimo' ? '(opcional)' : '*' }}
                </label>
                <input
                  v-model="form.donante_email"
                  type="email"
                  placeholder="correo@ejemplo.com"
                  class="w-full px-3.5 py-2.5 text-sm bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#289EAB]/25 focus:border-[#289EAB]"
                />
              </div>

              <div>
                <label class="block text-xs font-semibold text-stone-700 mb-1">
                  Teléfono / WhatsApp {{ form.donante_tipo === 'anonimo' ? '(opcional)' : '*' }}
                </label>
                <input
                  v-model="form.donante_telefono"
                  type="text"
                  placeholder="+591 7..."
                  class="w-full px-3.5 py-2.5 text-sm bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#289EAB]/25 focus:border-[#289EAB]"
                />
              </div>

              <div>
                <label class="block text-xs font-semibold text-stone-700 mb-1">CI / NIT (opcional)</label>
                <input
                  v-model="form.donante_documento"
                  type="text"
                  placeholder="Para recibo o trazabilidad"
                  class="w-full px-3.5 py-2.5 text-sm bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#289EAB]/25 focus:border-[#289EAB]"
                />
              </div>

              <div>
                <label class="block text-xs font-semibold text-stone-700 mb-1">Ciudad</label>
                <input
                  v-model="form.donante_ciudad"
                  type="text"
                  placeholder="Ej. La Paz, El Alto, Cochabamba..."
                  class="w-full px-3.5 py-2.5 text-sm bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#289EAB]/25 focus:border-[#289EAB]"
                />
              </div>
            </div>
          </section>

          <!-- SECTION 2: OFFERED DONATION DETAILS -->
          <section class="pt-6 border-t border-stone-100 space-y-4">
            <div class="flex items-center gap-2 text-sm font-bold text-stone-900">
              <span class="w-6 h-6 rounded-lg bg-[#FEF4EC] text-[#B85E12] font-mono text-xs flex items-center justify-center">02</span>
              <span>Detalle de la Donación Ofrecida</span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                @click="setDonationType('economica')"
                :class="[
                  'p-4 rounded-xl border flex items-center gap-3 text-left transition-colors cursor-pointer',
                  form.tipo_donacion === 'economica'
                    ? 'bg-[#E8F6F8] border-[#289EAB] text-stone-900'
                    : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50',
                ]"
              >
                <div class="w-10 h-10 rounded-xl bg-white border border-stone-200 flex items-center justify-center shrink-0">
                  <Coins class="w-5 h-5 text-[#289EAB]" />
                </div>
                <div>
                  <div class="text-sm font-bold">Donación Económica</div>
                  <div class="text-xs text-stone-500">Aporte monetario en Bolivianos (Bs.)</div>
                </div>
              </button>

              <button
                type="button"
                @click="setDonationType('especie')"
                :class="[
                  'p-4 rounded-xl border flex items-center gap-3 text-left transition-colors cursor-pointer',
                  form.tipo_donacion === 'especie'
                    ? 'bg-[#FEF4EC] border-[#F58F38] text-stone-900'
                    : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50',
                ]"
              >
                <div class="w-10 h-10 rounded-xl bg-white border border-stone-200 flex items-center justify-center shrink-0">
                  <Package class="w-5 h-5 text-[#F58F38]" />
                </div>
                <div>
                  <div class="text-sm font-bold">Donación en Especie</div>
                  <div class="text-xs text-stone-500">Alimentos, ropa, útiles, insumos o equipos</div>
                </div>
              </button>
            </div>

            <!-- Economic input -->
            <div v-if="form.tipo_donacion === 'economica'" class="space-y-3">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-xs font-semibold text-stone-500 mr-1">Montos sugeridos:</span>
                <button
                  v-for="amt in quickAmounts"
                  :key="amt"
                  type="button"
                  @click="form.monto_bob = amt"
                  :class="[
                    'px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition-colors cursor-pointer',
                    Number(form.monto_bob) === amt
                      ? 'bg-[#289EAB] border-[#289EAB] text-white'
                      : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100',
                  ]"
                >
                  {{ amt }} Bs.
                </button>
              </div>

              <div>
                <label class="block text-xs font-semibold text-stone-700 mb-1">
                  Monto ofrecido en Bolivianos (Bs.) *
                </label>
                <input
                  v-model="form.monto_bob"
                  required
                  min="1"
                  step="0.01"
                  type="number"
                  placeholder="Ej. 250.00"
                  class="w-full sm:max-w-xs px-3.5 py-2.5 text-base font-mono font-bold bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#289EAB]/25 focus:border-[#289EAB]"
                />
              </div>
            </div>

            <!-- In-kind input -->
            <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-semibold text-stone-700 mb-1">Categoría de bienes *</label>
                <select
                  v-model="form.categoria_especie"
                  class="w-full px-3.5 py-2.5 text-sm bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#289EAB]/25 focus:border-[#289EAB]"
                >
                  <option v-for="cat in inKindCategories" :key="cat.id" :value="cat.id">
                    {{ cat.label }}
                  </option>
                </select>
              </div>

              <div>
                <label class="block text-xs font-semibold text-stone-700 mb-1">Cantidad estimada (unidades/cajas)</label>
                <input
                  v-model="form.cantidad_especie"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Ej. 25"
                  class="w-full px-3.5 py-2.5 text-sm font-mono bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#289EAB]/25 focus:border-[#289EAB]"
                />
              </div>

              <div class="sm:col-span-2">
                <label class="block text-xs font-semibold text-stone-700 mb-1">
                  Descripción detallada de los bienes ofrecidos *
                </label>
                <textarea
                  v-model="form.descripcion_especie"
                  required
                  rows="3"
                  placeholder="Ej. 25 frazadas térmicas nuevas y 15 paquetes de útiles escolares para primaria"
                  class="w-full px-3.5 py-2.5 text-sm bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#289EAB]/25 focus:border-[#289EAB]"
                ></textarea>
              </div>
            </div>

            <!-- Destination Project -->
            <div>
              <label class="block text-xs font-semibold text-stone-700 mb-1">
                Proyecto comunitario de preferencia (opcional)
              </label>
              <select
                v-model="form.proyecto_destino_id"
                :disabled="loadingProjects"
                class="w-full px-3.5 py-2.5 text-sm bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#289EAB]/25 focus:border-[#289EAB]"
              >
                <option value="">Fondo Solidario General (asignar donde más se necesite)</option>
                <option v-for="p in proyectos" :key="p.id" :value="p.id">
                  {{ p.titulo }} — {{ p.ubicacion }}
                </option>
              </select>
            </div>
          </section>

          <!-- SECTION 3: DELIVERY COORDINATION -->
          <section class="pt-6 border-t border-stone-100 space-y-4">
            <div class="flex items-center gap-2 text-sm font-bold text-stone-900">
              <span class="w-6 h-6 rounded-lg bg-[#FDECEF] text-[#EB455F] font-mono text-xs flex items-center justify-center">03</span>
              <span>Coordinación de Entrega</span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                v-for="mod in modalityOptions"
                :key="mod.id"
                type="button"
                @click="form.modalidad_entrega = mod.id"
                :class="[
                  'p-3.5 rounded-xl border text-left transition-colors cursor-pointer',
                  form.modalidad_entrega === mod.id
                    ? 'bg-stone-900 border-stone-900 text-white'
                    : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50',
                ]"
              >
                <div class="text-xs font-bold flex items-center gap-1.5">
                  <Truck class="w-3.5 h-3.5 shrink-0" />
                  <span>{{ mod.label }}</span>
                </div>
                <div
                  :class="[
                    'text-[11px] mt-1 leading-snug',
                    form.modalidad_entrega === mod.id ? 'text-stone-300' : 'text-stone-500',
                  ]"
                >
                  {{ mod.desc }}
                </div>
              </button>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div v-if="form.modalidad_entrega === 'recojo_domicilio'" class="sm:col-span-2">
                <label class="block text-xs font-semibold text-stone-700 mb-1">
                  <MapPin class="w-3.5 h-3.5 inline text-[#EB455F] mr-1" />
                  Dirección completa para el recojo a domicilio *
                </label>
                <input
                  v-model="form.direccion_recojo"
                  required
                  type="text"
                  placeholder="Zona, calle/avenida, número y referencia"
                  class="w-full px-3.5 py-2.5 text-sm bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#289EAB]/25 focus:border-[#289EAB]"
                />
              </div>

              <div>
                <label class="block text-xs font-semibold text-stone-700 mb-1">
                  <Calendar class="w-3.5 h-3.5 inline text-[#289EAB] mr-1" />
                  Fecha estimada de disponibilidad (opcional)
                </label>
                <input
                  v-model="form.fecha_disponible_estimada"
                  :min="todayYmd"
                  type="date"
                  class="w-full px-3.5 py-2.5 text-sm bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#289EAB]/25 focus:border-[#289EAB]"
                />
              </div>

              <div>
                <label class="block text-xs font-semibold text-stone-700 mb-1">
                  Horarios o notas para el equipo Kirikú (opcional)
                </label>
                <input
                  v-model="form.notas_donante"
                  type="text"
                  placeholder="Ej. Disponible de lunes a viernes por la tarde"
                  class="w-full px-3.5 py-2.5 text-sm bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#289EAB]/25 focus:border-[#289EAB]"
                />
              </div>
            </div>
          </section>

          <!-- SUBMIT FOOTER -->
          <div class="pt-5 border-t border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="text-xs text-stone-500 flex items-center gap-2">
              <Sparkles class="w-4 h-4 text-[#F58F38] shrink-0" />
              <span>
                Tu ofrecimiento quedará registrado en estado <strong class="text-stone-700">Ofrecida</strong> hasta confirmar la recepción.
              </span>
            </div>

            <button
              type="submit"
              :disabled="store.submitting || !isFormReady"
              class="px-6 py-3 bg-[#EB455F] hover:bg-[#d63851] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
            >
              <Send class="w-4 h-4" />
              <span>{{ store.submitting ? 'Registrando ofrecimiento...' : 'Registrar donación ofrecida' }}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
