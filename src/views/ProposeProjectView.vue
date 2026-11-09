<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api/client';
import type { Organizacion, ProposeProjectPayload, Proyecto } from '../types';
import {
  Building2,
  Sparkles,
  Calendar,
  MapPin,
  Users,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Image as ImageIcon,
  Send,
  Clock,
  ShieldCheck,
  PlusCircle,
  HelpCircle,
} from 'lucide-vue-next';

const router = useRouter();

// Form state
const titulo = ref('');
const descripcion = ref('');
const ubicacion = ref('');
const cuposDisponibles = ref<number>(15);
const fechaInicio = ref('');
const fechaFin = ref('');
const esMayorEdad = ref(true);
const portadaUrl = ref('');

// Organization selection
const orgMode = ref<'existente' | 'nueva'>('existente');
const selectedOrgId = ref<string>('');
const organizaciones = ref<Organizacion[]>([]);
const loadingOrgs = ref(false);

// New organization fields
const nuevaOrgNombre = ref('');
const nuevaOrgTipo = ref('ONG');
const nuevaOrgContactoNombre = ref('');
const nuevaOrgContactoEmail = ref('');
const nuevaOrgContactoTelefono = ref('');

// UI state
const isSubmitting = ref(false);
const errorMsg = ref<string | null>(null);
const submittedProject = ref<Proyecto | null>(null);
const successMsg = ref<string | null>(null);

// Preset cover images for easy selection
const presetImages = [
  {
    name: 'Educación & Talleres',
    url: 'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1000&q=80',
  },
  {
    name: 'Reforestación & Naturaleza',
    url: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=1000&q=80',
  },
  {
    name: 'Salud & Nutrición',
    url: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=1000&q=80',
  },
  {
    name: 'Infraestructura Comunitaria',
    url: 'https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?auto=format&fit=crop&w=1000&q=80',
  },
];

async function loadOrganizaciones() {
  loadingOrgs.value = true;
  try {
    const list = await api.getOrganizaciones();
    organizaciones.value = list;
    if (list.length > 0) {
      selectedOrgId.value = String(list[0].id);
    }
  } catch (err) {
    console.error('Error fetching organizaciones:', err);
  } finally {
    loadingOrgs.value = false;
  }
}

onMounted(() => {
  loadOrganizaciones();
});

// Live validation for execution dates (KIR-109)
const dateValidationError = computed(() => {
  if (fechaInicio.value && fechaFin.value) {
    const dInicio = new Date(fechaInicio.value);
    const dFin = new Date(fechaFin.value);
    if (dFin < dInicio) {
      return 'La fecha de finalización no puede ser anterior a la fecha de inicio del proyecto.';
    }
  }
  return null;
});

// Form validity check
const isFormValid = computed(() => {
  if (titulo.value.trim().length < 5) return false;
  if (descripcion.value.trim().length < 15) return false;
  if (ubicacion.value.trim().length < 3) return false;
  if (!cuposDisponibles.value || cuposDisponibles.value <= 0) return false;
  if (dateValidationError.value) return false;

  if (orgMode.value === 'existente') {
    if (!selectedOrgId.value) return false;
  } else {
    if (!nuevaOrgNombre.value.trim()) return false;
  }

  return true;
});

async function handleSubmitProposal() {
  if (!isFormValid.value || isSubmitting.value) return;

  errorMsg.value = null;
  isSubmitting.value = true;

  try {
    const payload: ProposeProjectPayload = {
      titulo: titulo.value.trim(),
      descripcion: descripcion.value.trim(),
      ubicacion: ubicacion.value.trim(),
      cupos_disponibles: Number(cuposDisponibles.value),
      fecha_inicio: fechaInicio.value || undefined,
      fecha_fin: fechaFin.value || undefined,
      es_mayor_edad: Boolean(esMayorEdad.value),
      portada_url: portadaUrl.value.trim() || undefined,
      organizacion_id: orgMode.value === 'existente' ? selectedOrgId.value : undefined,
      organizacion_nueva:
        orgMode.value === 'nueva'
          ? {
              nombre: nuevaOrgNombre.value.trim(),
              tipo: nuevaOrgTipo.value,
              contacto_nombre: nuevaOrgContactoNombre.value.trim(),
              contacto_email: nuevaOrgContactoEmail.value.trim(),
              contacto_telefono: nuevaOrgContactoTelefono.value.trim(),
            }
          : undefined,
    };

    const res = await api.proposeProject(payload);
    submittedProject.value = res.proyecto;
    successMsg.value =
      res.message ||
      '¡Tu propuesta de proyecto fue registrada con éxito y enviada al flujo de revisión!';
  } catch (err: any) {
    errorMsg.value =
      err?.response?.data?.error ||
      'Ocurrió un error al registrar la propuesta. Por favor verifica los campos.';
  } finally {
    isSubmitting.value = false;
  }
}

function handleResetForm() {
  titulo.value = '';
  descripcion.value = '';
  ubicacion.value = '';
  cuposDisponibles.value = 15;
  fechaInicio.value = '';
  fechaFin.value = '';
  esMayorEdad.value = true;
  portadaUrl.value = '';
  nuevaOrgNombre.value = '';
  nuevaOrgContactoNombre.value = '';
  nuevaOrgContactoEmail.value = '';
  nuevaOrgContactoTelefono.value = '';
  submittedProject.value = null;
  errorMsg.value = null;
}
</script>

<template>
  <div class="min-h-screen bg-stone-50 py-10 px-4 sm:px-6 lg:px-8">
    <div class="max-w-4xl mx-auto space-y-8">
      
      <!-- Top Breadcrumb / Back -->
      <div class="flex items-center justify-between">
        <router-link
          to="/"
          class="inline-flex items-center gap-2 text-sm font-semibold text-stone-600 hover:text-stone-900 transition-colors"
        >
          <ArrowLeft class="w-4 h-4" />
          <span>Volver al Catálogo de Proyectos</span>
        </router-link>

        <span class="text-xs font-semibold px-3 py-1 rounded-full bg-[#E8F6F8] text-[#1E7B85] border border-[#289EAB]/20 flex items-center gap-1.5">
          <Sparkles class="w-3.5 h-3.5 text-[#F58F38]" />
          <span>KIR-106 • Épica KIR-3</span>
        </span>
      </div>

      <!-- SUCCESS CONFIRMATION SCREEN (KIR-108) -->
      <div
        v-if="submittedProject"
        class="bg-white rounded-3xl border border-emerald-200 p-8 sm:p-10 shadow-lg text-center space-y-6 animate-fade-in"
      >
        <div class="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-xs">
          <CheckCircle2 class="w-9 h-9" />
        </div>

        <div class="max-w-xl mx-auto space-y-2">
          <h2 class="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight">
            ¡Propuesta de Proyecto Registrada!
          </h2>
          <p class="text-stone-600 text-sm leading-relaxed">
            {{ successMsg }}
          </p>
        </div>

        <!-- Project Ticket Card -->
        <div class="bg-stone-50 rounded-2xl border border-stone-200 p-6 text-left max-w-lg mx-auto space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-stone-400 uppercase tracking-wider">Proyecto Comunitario</span>
            <span class="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
              <Clock class="w-3.5 h-3.5" />
              <span>Pendiente de Revisión</span>
            </span>
          </div>

          <div class="text-lg font-bold text-stone-900">
            {{ submittedProject.titulo }}
          </div>

          <div class="grid grid-cols-2 gap-2 text-xs text-stone-600 pt-2 border-t border-stone-200/80">
            <div>
              <span class="font-semibold text-stone-500">Ubicación:</span>
              <div class="text-stone-800 font-medium truncate">{{ submittedProject.ubicacion }}</div>
            </div>
            <div>
              <span class="font-semibold text-stone-500">Cupos Solicitados:</span>
              <div class="text-stone-800 font-medium">{{ submittedProject.cupos_disponibles }} voluntarios</div>
            </div>
          </div>

          <div class="text-xs bg-amber-50 text-amber-900 p-3 rounded-xl border border-amber-200/70 mt-2">
            💡 <strong>Siguiente paso:</strong> El equipo auditor de Kirikú revisará el cumplimiento de requerimientos y logística (KIR-21). Una vez aprobado, estará disponible automáticamente en el catálogo para postulantes.
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <router-link
            to="/admin/revision"
            class="w-full sm:w-auto px-6 py-2.5 bg-[#0D9488] hover:bg-[#0F766E] text-white text-sm font-semibold rounded-xl transition-all shadow-xs"
          >
            Ir al Panel de Revisión
          </router-link>

          <button
            @click="handleResetForm"
            class="w-full sm:w-auto px-6 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-sm font-semibold rounded-xl transition-colors cursor-pointer"
          >
            Proponer otro proyecto
          </button>
        </div>
      </div>

      <!-- MAIN FORM: REGISTRAR PROPUESTA DE PROYECTO (KIR-107 & KIR-109) -->
      <form
        v-else
        @submit.prevent="handleSubmitProposal"
        class="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden"
      >
        <!-- Form Header Banner -->
        <div class="bg-gradient-to-r from-[#1E4867] via-[#289EAB] to-[#0D9488] text-white p-6 sm:p-8 relative">
          <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-white text-xs font-semibold mb-3 backdrop-blur-xs">
            <Building2 class="w-3.5 h-3.5 text-amber-300" />
            <span>Alianzas e Iniciativas Sociales</span>
          </div>

          <h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Registrar Propuesta de Proyecto Comunitario
          </h1>
          <p class="text-teal-50 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
            Completa la ficha técnica con la información de tu organización, impacto esperado, cupos requeridos y fechas de ejecución para revisión y aprobación.
          </p>

          <!-- Status Reminder Badge -->
          <div class="mt-4 inline-flex items-center gap-2 text-xs font-medium text-teal-100 bg-black/20 px-3.5 py-1.5 rounded-xl border border-white/10">
            <Clock class="w-3.5 h-3.5 text-amber-300 shrink-0" />
            <span>El proyecto se registrará con estado inicial <strong>pendiente_revision</strong> (KIR-108).</span>
          </div>
        </div>

        <div class="p-6 sm:p-8 space-y-8">
          
          <!-- Error banner -->
          <div
            v-if="errorMsg"
            class="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-2xl text-xs sm:text-sm flex items-start gap-3"
          >
            <AlertTriangle class="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <div class="font-bold">Error en la propuesta</div>
              <div>{{ errorMsg }}</div>
            </div>
          </div>

          <!-- SECCIÓN 1: DATOS DEL PROYECTO (KIR-107) -->
          <div class="space-y-5">
            <div class="flex items-center gap-2 pb-2 border-b border-stone-200">
              <span class="w-6 h-6 rounded-full bg-teal-100 text-teal-800 text-xs font-bold flex items-center justify-center">1</span>
              <h2 class="text-base font-bold text-stone-900">
                Información Técnica del Proyecto
              </h2>
            </div>

            <!-- Título -->
            <div class="space-y-1.5">
              <div class="flex justify-between items-center text-xs font-semibold text-stone-700">
                <label for="titulo">Título de la Iniciativa <span class="text-rose-500">*</span></label>
                <span class="text-stone-400 font-normal">{{ titulo.length }}/100</span>
              </div>
              <input
                id="titulo"
                v-model="titulo"
                type="text"
                maxlength="100"
                placeholder="Ej. Reforestación y Huertos Urbanos en Zonas Altas"
                class="w-full px-4 py-2.5 text-sm bg-stone-50 border border-stone-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
                required
              />
              <p class="text-[11px] text-stone-400">
                Nombre descriptivo y claro de la iniciativa comunitaria (mínimo 5 caracteres).
              </p>
            </div>

            <!-- Descripción -->
            <div class="space-y-1.5">
              <div class="flex justify-between items-center text-xs font-semibold text-stone-700">
                <label for="descripcion">Descripción de Actividades & Objetivos <span class="text-rose-500">*</span></label>
                <span class="text-stone-400 font-normal">{{ descripcion.length }}/500</span>
              </div>
              <textarea
                id="descripcion"
                v-model="descripcion"
                rows="4"
                maxlength="500"
                placeholder="Detalla las actividades que realizarán los voluntarios, beneficiarios directos, metodología de trabajo y objetivos del proyecto..."
                class="w-full px-4 py-2.5 text-sm bg-stone-50 border border-stone-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
                required
              ></textarea>
              <p class="text-[11px] text-stone-400">
                Explica claramente el plan de trabajo (mínimo 15 caracteres).
              </p>
            </div>

            <!-- Ubicación & Cupos -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <!-- Ubicación -->
              <div class="space-y-1.5">
                <label for="ubicacion" class="text-xs font-semibold text-stone-700 block">
                  Ubicación de Ejecución <span class="text-rose-500">*</span>
                </label>
                <div class="relative">
                  <MapPin class="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="ubicacion"
                    v-model="ubicacion"
                    type="text"
                    placeholder="Ej. La Paz, Bosquecillo de Pura Pura"
                    class="w-full pl-10 pr-4 py-2.5 text-sm bg-stone-50 border border-stone-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
                    required
                  />
                </div>
              </div>

              <!-- Cupos Disponibles -->
              <div class="space-y-1.5">
                <label for="cupos" class="text-xs font-semibold text-stone-700 block">
                  Cupos de Voluntarios Requeridos <span class="text-rose-500">*</span>
                </label>
                <div class="flex items-center gap-2">
                  <div class="relative flex-1">
                    <Users class="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="cupos"
                      v-model.number="cuposDisponibles"
                      type="number"
                      min="1"
                      max="500"
                      class="w-full pl-10 pr-4 py-2.5 text-sm bg-stone-50 border border-stone-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
                      required
                    />
                  </div>
                  <!-- Quick preset buttons -->
                  <div class="flex items-center gap-1">
                    <button
                      type="button"
                      v-for="preset in [5, 10, 20, 50]"
                      :key="preset"
                      @click="cuposDisponibles = preset"
                      class="px-2.5 py-2 text-xs font-medium rounded-lg border border-stone-200 hover:bg-stone-100 transition-colors"
                      :class="cuposDisponibles === preset ? 'bg-teal-50 border-teal-300 text-teal-800 font-bold' : 'text-stone-600'"
                    >
                      {{ preset }}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Validación de Mayoría de Edad -->
            <div class="bg-stone-50 p-4 rounded-2xl border border-stone-200 flex items-start justify-between gap-4">
              <div class="space-y-0.5">
                <div class="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                  <ShieldCheck class="w-4 h-4 text-teal-600" />
                  <span>Restricción de Mayoría de Edad (+18 años)</span>
                </div>
                <p class="text-[11px] text-stone-500">
                  Si se activa, el sistema aplicará la validación matemática estricta al momento de la postulación (KIR-17).
                </p>
              </div>
              <label class="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                <input type="checkbox" v-model="esMayorEdad" class="sr-only peer" />
                <div class="w-11 h-6 bg-stone-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0D9488]"></div>
              </label>
            </div>
          </div>

          <!-- SECCIÓN 2: FECHAS DE EJECUCIÓN (KIR-109) -->
          <div class="space-y-4">
            <div class="flex items-center gap-2 pb-2 border-b border-stone-200">
              <span class="w-6 h-6 rounded-full bg-teal-100 text-teal-800 text-xs font-bold flex items-center justify-center">2</span>
              <h2 class="text-base font-bold text-stone-900">
                Cronograma y Fechas de Ejecución
              </h2>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <!-- Fecha Inicio -->
              <div class="space-y-1.5">
                <label for="fecha_inicio" class="text-xs font-semibold text-stone-700 block">
                  Fecha Estimada de Inicio
                </label>
                <div class="relative">
                  <Calendar class="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="fecha_inicio"
                    v-model="fechaInicio"
                    type="date"
                    class="w-full pl-10 pr-4 py-2.5 text-sm bg-stone-50 border border-stone-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
                  />
                </div>
              </div>

              <!-- Fecha Fin -->
              <div class="space-y-1.5">
                <label for="fecha_fin" class="text-xs font-semibold text-stone-700 block">
                  Fecha Estimada de Finalización
                </label>
                <div class="relative">
                  <Calendar class="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="fecha_fin"
                    v-model="fechaFin"
                    type="date"
                    class="w-full pl-10 pr-4 py-2.5 text-sm bg-stone-50 border border-stone-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
                  />
                </div>
              </div>
            </div>

            <!-- Date validation warning (KIR-109) -->
            <div
              v-if="dateValidationError"
              class="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl text-xs font-semibold flex items-center gap-2"
            >
              <AlertTriangle class="w-4 h-4 text-rose-600 shrink-0" />
              <span>{{ dateValidationError }}</span>
            </div>
          </div>

          <!-- SECCIÓN 3: ORGANIZACIÓN / INSTITUCIÓN ALIADA (KIR-107) -->
          <div class="space-y-4">
            <div class="flex items-center justify-between pb-2 border-b border-stone-200">
              <div class="flex items-center gap-2">
                <span class="w-6 h-6 rounded-full bg-teal-100 text-teal-800 text-xs font-bold flex items-center justify-center">3</span>
                <h2 class="text-base font-bold text-stone-900">
                  Organización o Institución Responsable
                </h2>
              </div>

              <!-- Switch existing vs new -->
              <div class="inline-flex p-1 bg-stone-100 rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  @click="orgMode = 'existente'"
                  :class="orgMode === 'existente' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-800'"
                  class="px-3 py-1 rounded-lg transition-all cursor-pointer"
                >
                  Registrada
                </button>
                <button
                  type="button"
                  @click="orgMode = 'nueva'"
                  :class="orgMode === 'nueva' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-800'"
                  class="px-3 py-1 rounded-lg transition-all cursor-pointer"
                >
                  Nueva Institución
                </button>
              </div>
            </div>

            <!-- Existing Organization Select -->
            <div v-if="orgMode === 'existente'" class="space-y-2">
              <label for="org_select" class="text-xs font-semibold text-stone-700 block">
                Selecciona una organización aliada <span class="text-rose-500">*</span>
              </label>
              <select
                id="org_select"
                v-model="selectedOrgId"
                class="w-full px-4 py-2.5 text-sm bg-stone-50 border border-stone-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
                required
              >
                <option v-for="org in organizaciones" :key="org.id" :value="String(org.id)">
                  {{ org.nombre }} ({{ org.tipo }})
                </option>
              </select>
              <p class="text-[11px] text-stone-400">
                Si tu organización no aparece en la lista, selecciona la pestaña "Nueva Institución".
              </p>
            </div>

            <!-- New Organization Fields -->
            <div v-else class="space-y-4 bg-stone-50 p-5 rounded-2xl border border-stone-200">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div class="space-y-1.5">
                  <label class="text-xs font-semibold text-stone-700 block">
                    Nombre de la Institución <span class="text-rose-500">*</span>
                  </label>
                  <input
                    v-model="nuevaOrgNombre"
                    type="text"
                    placeholder="Ej. Colectivo Acción Verde"
                    class="w-full px-4 py-2 text-sm bg-white border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
                    required
                  />
                </div>

                <div class="space-y-1.5">
                  <label class="text-xs font-semibold text-stone-700 block">
                    Tipo de Organización
                  </label>
                  <select
                    v-model="nuevaOrgTipo"
                    class="w-full px-4 py-2 text-sm bg-white border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
                  >
                    <option value="ONG">ONG</option>
                    <option value="Fundación">Fundación</option>
                    <option value="Empresa">Empresa</option>
                    <option value="Colectivo Social">Colectivo Social</option>
                    <option value="Institución Educativa">Institución Educativa</option>
                  </select>
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div class="space-y-1">
                  <label class="text-[11px] font-semibold text-stone-600 block">Contacto Responsable</label>
                  <input
                    v-model="nuevaOrgContactoNombre"
                    type="text"
                    placeholder="Nombre completo"
                    class="w-full px-3 py-1.5 text-xs bg-white border border-stone-300 rounded-lg"
                  />
                </div>
                <div class="space-y-1">
                  <label class="text-[11px] font-semibold text-stone-600 block">Correo Electrónico</label>
                  <input
                    v-model="nuevaOrgContactoEmail"
                    type="email"
                    placeholder="contacto@organizacion.org"
                    class="w-full px-3 py-1.5 text-xs bg-white border border-stone-300 rounded-lg"
                  />
                </div>
                <div class="space-y-1">
                  <label class="text-[11px] font-semibold text-stone-600 block">Teléfono / WhatsApp</label>
                  <input
                    v-model="nuevaOrgContactoTelefono"
                    type="tel"
                    placeholder="70012345"
                    class="w-full px-3 py-1.5 text-xs bg-white border border-stone-300 rounded-lg"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- SECCIÓN 4: PORTADA DEL PROYECTO (OPCIONAL) -->
          <div class="space-y-3">
            <div class="flex items-center gap-2 pb-2 border-b border-stone-200">
              <span class="w-6 h-6 rounded-full bg-teal-100 text-teal-800 text-xs font-bold flex items-center justify-center">4</span>
              <h2 class="text-base font-bold text-stone-900">
                Imagen de Portada (Opcional)
              </h2>
            </div>

            <!-- URL input -->
            <div class="space-y-1.5">
              <div class="relative">
                <ImageIcon class="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  v-model="portadaUrl"
                  type="url"
                  placeholder="https://ejemplo.com/imagen.jpg (o selecciona una plantilla abajo)"
                  class="w-full pl-10 pr-4 py-2.5 text-sm bg-stone-50 border border-stone-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0D9488]"
                />
              </div>
            </div>

            <!-- Quick Preset Images -->
            <div class="space-y-1.5">
              <span class="text-xs text-stone-500 font-medium">Plantillas de imagen sugeridas:</span>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  v-for="p in presetImages"
                  :key="p.name"
                  @click="portadaUrl = p.url"
                  class="text-left p-2 rounded-xl border border-stone-200 hover:border-teal-400 transition-all text-xs"
                  :class="portadaUrl === p.url ? 'bg-teal-50 border-teal-500 ring-2 ring-teal-200' : 'bg-stone-50'"
                >
                  <img :src="p.url" class="w-full h-14 object-cover rounded-lg mb-1" />
                  <span class="font-medium text-stone-700 block truncate">{{ p.name }}</span>
                </button>
              </div>
            </div>
          </div>

        </div>

        <!-- Form Submission Footer -->
        <div class="bg-stone-50 p-6 sm:p-8 border-t border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div class="text-xs text-stone-500">
            * Campos marcados con asterisco son obligatorios para la revisión.
          </div>

          <div class="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              @click="handleResetForm"
              class="w-full sm:w-auto px-5 py-2.5 text-sm font-semibold text-stone-600 bg-white border border-stone-300 rounded-xl hover:bg-stone-100 transition-colors cursor-pointer"
            >
              Limpiar
            </button>

            <button
              type="submit"
              :disabled="!isFormValid || isSubmitting"
              class="w-full sm:w-auto px-7 py-2.5 text-sm font-bold text-white bg-[#0D9488] hover:bg-[#0F766E] rounded-xl transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
            >
              <Send class="w-4 h-4" />
              <span>{{ isSubmitting ? 'Registrando...' : 'Enviar Propuesta' }}</span>
            </button>
          </div>
        </div>

      </form>

    </div>
  </div>
</template>
