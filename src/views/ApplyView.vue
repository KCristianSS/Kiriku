<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useProjectsStore } from '../stores/projects';
import { useApplicationsStore } from '../stores/applications';
import { api } from '../api/client';
import AdultWarningModal from '../components/AdultWarningModal.vue';
import type { CreatePostulantePayload, Proyecto, ValidarEdadResponse } from '../types';
import {
  UserCheck,
  Building2,
  MapPin,
  Calendar,
  Users,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  ClipboardList,
  HeartHandshake,
  Check,
  ExternalLink,
  Info,
  AlertTriangle,
} from 'lucide-vue-next';

const route = useRoute();
const router = useRouter();
const projectsStore = useProjectsStore();
const applicationsStore = useApplicationsStore();

// Form Model
const form = ref<CreatePostulantePayload>({
  nombres: '',
  apellidos: '',
  email: '',
  ci: '',
  telefono: '',
  fecha_nacimiento: '',
  profesion_ocupacion: '',
  habilidades: '',
  motivacion: '',
  proyecto_id: '',
  confirmacion_mayor_edad: false,
});

// UI State
const selectedProject = ref<Proyecto | null>(null);
const submissionSuccess = ref(false);
const successData = ref<{
  postulacion_id: number | string;
  postulante_id: number | string;
  edad_calculada?: number;
  etapas_creadas?: number;
} | null>(null);
const localError = ref<string | null>(null);
const isSubmitting = ref(false);
const showAdultModal = ref(false);

// Server-side age validation status (KIR-99)
const isValidatingAge = ref(false);
const ageValidationResult = ref<ValidarEdadResponse | null>(null);

// Calculate age from birth date locally in real time
const calculatedAge = computed<number | null>(() => {
  if (!form.value.fecha_nacimiento) return null;
  const birth = new Date(form.value.fecha_nacimiento);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
});

// Check if volunteer meets the project's +18 requirement
const isUnderageForProject = computed(() => {
  if (!selectedProject.value?.es_mayor_edad) return false;
  if (calculatedAge.value === null) return false;
  return calculatedAge.value < 18;
});

// Validate whether submit button should be enabled
const isFormValid = computed(() => {
  const f = form.value;
  if (!f.proyecto_id) return false;
  if (!f.nombres.trim() || !f.apellidos.trim()) return false;
  if (!f.ci.trim() || !f.email.trim()) return false;
  if (!f.fecha_nacimiento) return false;
  if (isUnderageForProject.value) return false;
  if (selectedProject.value?.es_mayor_edad && !f.confirmacion_mayor_edad) return false;
  return true;
});

// Approved projects available for selection
const availableProjects = computed(() => {
  return projectsStore.projects.filter((p) => p.estado === 'aprobado');
});

// Asynchronously validate age against the backend API (KIR-99)
async function triggerServerAgeValidation() {
  if (!form.value.proyecto_id || !form.value.fecha_nacimiento) {
    ageValidationResult.value = null;
    return;
  }
  isValidatingAge.value = true;
  try {
    const res = await api.validateAge({
      proyecto_id: form.value.proyecto_id,
      fecha_nacimiento: form.value.fecha_nacimiento,
    });
    ageValidationResult.value = res;
  } catch (err) {
    console.warn('Pre-validation check fallback to local calculation:', err);
  } finally {
    isValidatingAge.value = false;
  }
}

// Watch birthdate changes to trigger real-time validation
watch(
  () => form.value.fecha_nacimiento,
  () => {
    if (form.value.fecha_nacimiento) {
      triggerServerAgeValidation();
    } else {
      ageValidationResult.value = null;
    }
  }
);

// Select a project
function selectProject(proj: Proyecto) {
  selectedProject.value = proj;
  form.value.proyecto_id = proj.id;
  localError.value = null;

  // If project requires +18, open the adult warning modal automatically for awareness
  if (proj.es_mayor_edad && !form.value.confirmacion_mayor_edad) {
    showAdultModal.value = true;
  }

  if (form.value.fecha_nacimiento) {
    triggerServerAgeValidation();
  }
}

// Handle adult warning modal confirmation (KIR-98 / KIR-100)
function handleModalConfirm(payload?: { confirmedDate?: string }) {
  showAdultModal.value = false;
  form.value.confirmacion_mayor_edad = true;
  if (payload?.confirmedDate && !form.value.fecha_nacimiento) {
    form.value.fecha_nacimiento = payload.confirmedDate;
  }
}

// Watch for route param changes
watch(
  () => route.params.id,
  (newId) => {
    if (newId) {
      form.value.proyecto_id = newId as string;
      const found = projectsStore.projects.find((p) => String(p.id) === String(newId));
      if (found) {
        selectedProject.value = found;
      } else {
        projectsStore.fetchProjectById(newId as string).then(() => {
          if (projectsStore.currentProject) {
            selectedProject.value = projectsStore.currentProject;
          }
        });
      }
    }
  },
  { immediate: true }
);

// Watch available projects once loaded
watch(
  () => projectsStore.projects,
  (projs) => {
    if (form.value.proyecto_id && !selectedProject.value) {
      const match = projs.find((p) => String(p.id) === String(form.value.proyecto_id));
      if (match) selectedProject.value = match;
    }
  }
);

onMounted(async () => {
  if (projectsStore.projects.length === 0) {
    await projectsStore.fetchProjects('aprobado');
  }

  // Prepopulate birthdate if passed from query
  if (route.query.fecha && typeof route.query.fecha === 'string') {
    form.value.fecha_nacimiento = route.query.fecha;
  }

  if (route.params.id) {
    const projId = route.params.id as string;
    form.value.proyecto_id = projId;
    const match = projectsStore.projects.find((p) => String(p.id) === String(projId));
    if (match) {
      selectedProject.value = match;
    } else {
      await projectsStore.fetchProjectById(projId);
      if (projectsStore.currentProject) {
        selectedProject.value = projectsStore.currentProject;
      }
    }
  }

  if (form.value.fecha_nacimiento && form.value.proyecto_id) {
    triggerServerAgeValidation();
  }
});

// Submit application to Supabase
async function handleSubmit() {
  localError.value = null;

  if (!isFormValid.value) {
    if (isUnderageForProject.value) {
      localError.value = `Este proyecto requiere ser mayor de edad (+18 años). Tu edad actual calculada es de ${calculatedAge.value} años. No es posible enviar la postulación.`;
    } else if (selectedProject.value?.es_mayor_edad && !form.value.confirmacion_mayor_edad) {
      localError.value = 'Debes aceptar la declaración jurada obligatoria de mayoría de edad.';
    } else {
      localError.value = 'Por favor completa todos los campos obligatorios antes de continuar.';
    }
    return;
  }

  // Strict pre-submission server check (KIR-99)
  if (selectedProject.value?.es_mayor_edad) {
    try {
      const validation = await api.validateAge({
        proyecto_id: form.value.proyecto_id,
        fecha_nacimiento: form.value.fecha_nacimiento,
      });
      if (!validation.es_elegible) {
        localError.value = validation.mensaje;
        return;
      }
    } catch (e: any) {
      console.warn('Backend age pre-check failed, proceeding to form submit verification:', e);
    }
  }

  isSubmitting.value = true;
  try {
    const res = await applicationsStore.submitApplication({
      ...form.value,
      ci: form.value.ci.trim().toUpperCase(),
      email: form.value.email.trim().toLowerCase(),
    });

    successData.value = res;
    submissionSuccess.value = true;
  } catch (err: any) {
    localError.value =
      err?.response?.data?.error || 'Ocurrió un error al registrar la postulación en la base de datos.';
  } finally {
    isSubmitting.value = false;
  }
}

// Reset form to apply again
function handleReset() {
  submissionSuccess.value = false;
  successData.value = null;
  ageValidationResult.value = null;
  form.value = {
    nombres: '',
    apellidos: '',
    email: '',
    ci: '',
    telefono: '',
    fecha_nacimiento: '',
    profesion_ocupacion: '',
    habilidades: '',
    motivacion: '',
    proyecto_id: selectedProject.value?.id || '',
    confirmacion_mayor_edad: false,
  };
}

// Navigate to tracking view
function goToTracking() {
  router.push({
    path: '/seguimiento',
    query: { busqueda: form.value.ci.trim() },
  });
}
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
    <!-- Breadcrumb & Back button -->
    <div class="mb-6 flex items-center justify-between">
      <button
        @click="router.push('/')"
        class="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-stone-600 hover:text-[#289EAB] transition-colors cursor-pointer"
      >
        <ArrowLeft class="w-4 h-4" />
        <span>Volver al Catálogo de Proyectos</span>
      </button>

      <span class="text-xs text-stone-500 font-medium">
        Historia: <strong class="text-stone-700">KIR-17: Validar Mayoría de Edad</strong>
      </span>
    </div>

    <!-- Success Screen / Modal after real DB registration -->
    <div
      v-if="submissionSuccess"
      class="bg-white rounded-3xl border border-emerald-200 p-8 sm:p-12 text-center shadow-lg relative overflow-hidden"
    >
      <div class="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-emerald-500 via-[#289EAB] to-[#F58F38]"></div>

      <div class="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 ring-8 ring-emerald-50/50">
        <CheckCircle2 class="w-12 h-12" />
      </div>

      <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-semibold mb-4">
        <Sparkles class="w-3.5 h-3.5 text-emerald-600" />
        <span>Registro Guardado en Supabase</span>
      </div>

      <h2 class="text-2xl sm:text-3xl font-extrabold text-stone-900 mb-3 tracking-tight">
        ¡Postulación Registrada Exitosamente!
      </h2>

      <p class="text-sm sm:text-base text-stone-600 max-w-lg mx-auto mb-8 leading-relaxed">
        Muchas gracias, <strong class="text-stone-900">{{ form.nombres }} {{ form.apellidos }}</strong>. Tu solicitud ha sido vinculada al proyecto y ha iniciado el proceso de evaluación de 5 etapas de Kirikú.
      </p>

      <!-- Registration Summary Card -->
      <div class="max-w-md mx-auto bg-stone-50 border border-stone-200 rounded-2xl p-5 text-left mb-8 space-y-3">
        <div class="flex items-center justify-between text-xs">
          <span class="text-stone-500">Proyecto Vinculado:</span>
          <span class="font-bold text-stone-900 text-right">{{ selectedProject?.titulo }}</span>
        </div>
        <div class="flex items-center justify-between text-xs">
          <span class="text-stone-500">Postulante (CI):</span>
          <span class="font-mono font-semibold text-stone-800">{{ form.ci }}</span>
        </div>
        <div class="flex items-center justify-between text-xs">
          <span class="text-stone-500">Correo Electrónico:</span>
          <span class="font-mono text-stone-800">{{ form.email }}</span>
        </div>
        <div class="flex items-center justify-between text-xs">
          <span class="text-stone-500">Edad Validada:</span>
          <span class="font-mono font-semibold text-emerald-700">{{ calculatedAge }} años (Mayor de edad cumplida)</span>
        </div>
        <div class="flex items-center justify-between text-xs">
          <span class="text-stone-500">ID de Postulación en BD:</span>
          <span class="font-mono text-xs text-[#289EAB] font-bold">{{ successData?.postulacion_id }}</span>
        </div>
        <div class="flex items-center justify-between text-xs pt-2 border-t border-stone-200">
          <span class="text-stone-500">Etapas Inicializadas:</span>
          <span class="inline-flex items-center gap-1 font-semibold text-emerald-700">
            <Check class="w-3.5 h-3.5" />
            5 Etapas creadas en tiempo real
          </span>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto">
        <button
          @click="goToTracking"
          class="w-full sm:w-auto flex-1 py-3 px-6 bg-[#289EAB] hover:bg-[#1E7B85] text-white font-semibold rounded-xl text-sm shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>Ver Seguimiento en Vivo</span>
          <ExternalLink class="w-4 h-4" />
        </button>

        <button
          @click="handleReset"
          class="w-full sm:w-auto py-3 px-5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold rounded-xl text-sm transition-colors cursor-pointer"
        >
          Nueva Postulación
        </button>
      </div>
    </div>

    <!-- Application Form View (KIR-100) -->
    <div v-else class="space-y-8">
      <!-- Header Banner -->
      <div class="relative bg-white border border-stone-200 rounded-3xl p-6 sm:p-8 shadow-xs overflow-hidden">
        <div class="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#289EAB] via-[#F58F38] to-[#EB455F]"></div>

        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div class="flex items-center gap-4">
            <div class="w-14 h-14 rounded-2xl bg-[#E8F6F8] text-[#289EAB] flex items-center justify-center shrink-0">
              <UserCheck class="w-7 h-7" />
            </div>
            <div>
              <div class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#E8F6F8] text-[#1E7B85] text-xs font-semibold mb-1">
                <Sparkles class="w-3.5 h-3.5 text-[#F58F38]" />
                <span>KIR-17: Validación de Mayoría de Edad</span>
              </div>
              <h1 class="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight">
                Registrar Postulación
              </h1>
              <p class="text-stone-600 text-xs sm:text-sm mt-1">
                Completa tus datos y verifica los requisitos legales y de edad para participar en Kirikú.
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- SECTION 1: Vinculación de Proyecto -->
      <div class="bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 shadow-xs space-y-6">
        <div class="flex items-center justify-between border-b border-stone-100 pb-4">
          <div class="flex items-center gap-2">
            <ClipboardList class="w-5 h-5 text-[#289EAB]" />
            <h2 class="text-lg font-bold text-stone-900">1. Vinculación con el Proyecto</h2>
          </div>
          <span class="text-xs text-stone-500 font-medium">* Requisito Obligatorio</span>
        </div>

        <!-- If project is already selected -->
        <div v-if="selectedProject" class="bg-gradient-to-br from-stone-50 to-[#E8F6F8]/30 rounded-2xl p-5 border border-stone-200 relative">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div class="flex flex-wrap items-center gap-2 mb-2">
                <span class="inline-flex items-center gap-1 text-xs font-semibold text-[#1E7B85] bg-[#E8F6F8] px-2.5 py-0.5 rounded-md">
                  <Building2 class="w-3.5 h-3.5" />
                  {{ selectedProject.organizacion?.nombre || 'Organización Aliada' }}
                </span>

                <!-- Badge +18 with button to view full legal notice (KIR-98) -->
                <span
                  v-if="selectedProject.es_mayor_edad"
                  class="inline-flex items-center gap-1 text-xs font-bold bg-amber-100 text-amber-900 px-2.5 py-0.5 rounded-md border border-amber-200"
                >
                  <ShieldAlert class="w-3.5 h-3.5 text-amber-700" />
                  Mayoría de Edad (+18) Requerida
                </span>
                <span
                  v-else
                  class="inline-flex items-center gap-1 text-xs font-semibold bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded-md"
                >
                  Convocatoria Abierta (Sin restricción de edad)
                </span>
              </div>

              <h3 class="text-lg font-bold text-stone-900">{{ selectedProject.titulo }}</h3>
              <p class="text-xs text-stone-600 line-clamp-2 mt-1 leading-relaxed">{{ selectedProject.descripcion }}</p>

              <div class="flex flex-wrap items-center gap-4 text-xs text-stone-500 mt-3">
                <span class="flex items-center gap-1">
                  <MapPin class="w-3.5 h-3.5 text-stone-400" />
                  {{ selectedProject.ubicacion }}
                </span>
                <span class="flex items-center gap-1">
                  <Users class="w-3.5 h-3.5 text-emerald-600" />
                  Cupos: <strong class="font-mono text-stone-800">{{ selectedProject.cupos_disponibles }}</strong>
                </span>
                <span v-if="selectedProject.fecha_inicio" class="flex items-center gap-1">
                  <Calendar class="w-3.5 h-3.5 text-stone-400" />
                  Inicio: {{ new Date(selectedProject.fecha_inicio).toLocaleDateString('es-BO') }}
                </span>
              </div>
            </div>

            <!-- Action buttons: Change project & View Adult Legal Notice -->
            <div class="flex flex-row sm:flex-col items-center sm:items-end gap-2 shrink-0">
              <button
                v-if="selectedProject.es_mayor_edad"
                type="button"
                @click="showAdultModal = true"
                class="px-3.5 py-2 text-xs font-semibold text-amber-800 hover:text-amber-900 bg-amber-50 border border-amber-300 rounded-xl hover:bg-amber-100 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <ShieldAlert class="w-3.5 h-3.5 text-amber-700" />
                <span>Ver Aviso Legal (+18)</span>
              </button>

              <button
                type="button"
                @click="selectedProject = null; form.proyecto_id = ''"
                class="px-3.5 py-2 text-xs font-semibold text-[#289EAB] hover:text-[#1E7B85] bg-white border border-[#289EAB]/30 rounded-xl hover:bg-[#E8F6F8] transition-colors cursor-pointer"
              >
                Cambiar Proyecto
              </button>
            </div>
          </div>
        </div>

        <!-- Project Selector if not selected yet -->
        <div v-else class="space-y-4">
          <p class="text-xs text-stone-600">
            Selecciona la iniciativa comunitaria a la que deseas postularte:
          </p>

          <div v-if="projectsStore.loading" class="p-8 text-center text-xs text-stone-500">
            Cargando proyectos desde la base de datos...
          </div>

          <div v-else-if="availableProjects.length === 0" class="p-6 bg-stone-50 rounded-2xl text-center text-xs text-stone-500">
            No hay proyectos disponibles en este momento.
          </div>

          <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
            <div
              v-for="p in availableProjects"
              :key="p.id"
              @click="selectProject(p)"
              class="p-4 rounded-2xl border border-stone-200 hover:border-[#289EAB] bg-white hover:bg-[#E8F6F8]/20 transition-all cursor-pointer flex flex-col justify-between group"
            >
              <div>
                <div class="flex items-center justify-between text-xs text-stone-500 mb-1">
                  <span class="font-medium text-[#1E7B85] truncate">{{ p.organizacion?.nombre || 'Kirikú' }}</span>
                  <span
                    v-if="p.es_mayor_edad"
                    class="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1"
                  >
                    <ShieldAlert class="w-3 h-3 text-amber-700" />
                    +18 Años
                  </span>
                  <span
                    v-else
                    class="bg-blue-50 text-blue-700 text-[10px] font-semibold px-1.5 py-0.5 rounded"
                  >
                    Sin restricción
                  </span>
                </div>
                <h4 class="text-sm font-bold text-stone-900 group-hover:text-[#289EAB] transition-colors mb-1 line-clamp-1">
                  {{ p.titulo }}
                </h4>
                <p class="text-xs text-stone-600 line-clamp-2">{{ p.descripcion }}</p>
              </div>

              <div class="mt-3 pt-2 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-500">
                <span class="flex items-center gap-1">
                  <MapPin class="w-3 h-3 text-stone-400" />
                  {{ p.ubicacion }}
                </span>
                <span class="text-[#289EAB] font-semibold group-hover:underline">Vincular &rarr;</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- SECTION 2: Datos Personales del Postulante & Validación de Edad (KIR-99 & KIR-100) -->
      <form @submit.prevent="handleSubmit" class="space-y-8">
        <div class="bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 shadow-xs space-y-6">
          <div class="flex items-center justify-between border-b border-stone-100 pb-4">
            <div class="flex items-center gap-2">
              <UserCheck class="w-5 h-5 text-[#F58F38]" />
              <h2 class="text-lg font-bold text-stone-900">2. Datos Personales y Verificación de Edad</h2>
            </div>
            <span class="text-xs text-stone-500 font-medium">Validación en tiempo real</span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <!-- Nombres -->
            <div>
              <label for="nombres" class="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                Nombres <span class="text-rose-500">*</span>
              </label>
              <input
                id="nombres"
                v-model="form.nombres"
                type="text"
                required
                placeholder="Ej. Juan Carlos"
                class="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#289EAB] focus:bg-white transition-all"
              />
            </div>

            <!-- Apellidos -->
            <div>
              <label for="apellidos" class="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                Apellidos <span class="text-rose-500">*</span>
              </label>
              <input
                id="apellidos"
                v-model="form.apellidos"
                type="text"
                required
                placeholder="Ej. Pérez Quispe"
                class="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#289EAB] focus:bg-white transition-all"
              />
            </div>

            <!-- Cédula de Identidad (CI) -->
            <div>
              <label for="ci" class="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                Cédula de Identidad (CI) <span class="text-rose-500">*</span>
              </label>
              <input
                id="ci"
                v-model="form.ci"
                type="text"
                required
                placeholder="Ej. 8492019 LP"
                class="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#289EAB] focus:bg-white font-mono transition-all"
              />
              <p class="text-[11px] text-stone-500 mt-1">Se contrastará con tu fecha de nacimiento en la Etapa 1.</p>
            </div>

            <!-- Correo Electrónico -->
            <div>
              <label for="email" class="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                Correo Electrónico <span class="text-rose-500">*</span>
              </label>
              <input
                id="email"
                v-model="form.email"
                type="email"
                required
                placeholder="Ej. voluntario@ejemplo.com"
                class="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#289EAB] focus:bg-white transition-all"
              />
            </div>

            <!-- Teléfono / WhatsApp -->
            <div>
              <label for="telefono" class="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                Teléfono / WhatsApp
              </label>
              <input
                id="telefono"
                v-model="form.telefono"
                type="tel"
                placeholder="Ej. +591 71234567"
                class="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#289EAB] focus:bg-white font-mono transition-all"
              />
            </div>

            <!-- Fecha de Nacimiento (KIR-99: Core Age Pre-validation) -->
            <div>
              <div class="flex items-center justify-between mb-1.5">
                <label for="fecha_nacimiento" class="block text-xs font-bold text-stone-700 uppercase tracking-wider">
                  Fecha de Nacimiento <span class="text-rose-500">*</span>
                </label>
                <span v-if="isValidatingAge" class="text-[11px] text-[#289EAB] flex items-center gap-1 font-medium">
                  <span class="inline-block w-2 h-2 rounded-full bg-[#289EAB] animate-ping"></span>
                  Validando...
                </span>
              </div>

              <input
                id="fecha_nacimiento"
                v-model="form.fecha_nacimiento"
                type="date"
                required
                class="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#289EAB] focus:bg-white font-mono transition-all"
              />

              <!-- Dynamic Real-Time Age Validation Feedback (KIR-99 & KIR-100) -->
              <div v-if="calculatedAge !== null" class="mt-3">
                <!-- Case A: Underage volunteer on a +18 project (BLOCKING) -->
                <div
                  v-if="isUnderageForProject"
                  class="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-1.5"
                >
                  <div class="flex items-center gap-2 font-bold text-rose-900">
                    <ShieldAlert class="w-4 h-4 text-rose-600 shrink-0" />
                    <span>Bloqueo por Minoría de Edad: {{ calculatedAge }} años</span>
                  </div>
                  <p class="leading-relaxed text-rose-700">
                    Este proyecto exige contar con <strong>18 años o más</strong> para actividades de campo y cobertura legal. No cumples con el requisito mínimo para postular a esta convocatoria.
                  </p>
                  <div class="pt-1">
                    <button
                      type="button"
                      @click="selectedProject = null; form.proyecto_id = ''"
                      class="text-xs font-bold text-rose-800 underline hover:text-rose-950 cursor-pointer"
                    >
                      Elegir un proyecto sin restricción de edad &rarr;
                    </button>
                  </div>
                </div>

                <!-- Case B: Age >= 18 on a +18 project (ELIGIBLE) -->
                <div
                  v-else-if="selectedProject?.es_mayor_edad"
                  class="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 font-medium"
                >
                  <CheckCircle2 class="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    <strong>Edad verificada:</strong> Tienes {{ calculatedAge }} años. Cumples con el requisito legal de mayoría de edad para este proyecto.
                  </span>
                </div>

                <!-- Case C: Project without +18 restriction -->
                <div
                  v-else
                  class="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-xs flex items-center gap-2 font-medium"
                >
                  <Info class="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    Edad calculada: <strong>{{ calculatedAge }} años</strong>. Este proyecto no tiene restricción de mayoría de edad.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- SECTION 3: Perfil y Motivación del Postulante -->
        <div class="bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 shadow-xs space-y-6">
          <div class="flex items-center justify-between border-b border-stone-100 pb-4">
            <div class="flex items-center gap-2">
              <HeartHandshake class="w-5 h-5 text-[#EB455F]" />
              <h2 class="text-lg font-bold text-stone-900">3. Perfil, Habilidades y Motivación</h2>
            </div>
            <span class="text-xs text-stone-500 font-medium">Información para evaluación</span>
          </div>

          <div class="space-y-5">
            <!-- Profesión u Ocupación -->
            <div>
              <label for="profesion" class="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                Profesión u Ocupación Actual
              </label>
              <input
                id="profesion"
                v-model="form.profesion_ocupacion"
                type="text"
                placeholder="Ej. Estudiante de Biología / Profesional en Sistemas / Docente"
                class="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#289EAB] focus:bg-white transition-all"
              />
            </div>

            <!-- Habilidades -->
            <div>
              <label for="habilidades" class="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                Habilidades y Experiencia Relevante
              </label>
              <textarea
                id="habilidades"
                v-model="form.habilidades"
                rows="2"
                placeholder="Ej. Trabajo en equipo, primeros auxilios, facilitación de talleres con niños, manejo de herramientas..."
                class="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#289EAB] focus:bg-white transition-all resize-none"
              ></textarea>
            </div>

            <!-- Motivación -->
            <div>
              <label for="motivacion" class="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                ¿Por qué te gustaría participar en este voluntariado?
              </label>
              <textarea
                id="motivacion"
                v-model="form.motivacion"
                rows="3"
                placeholder="Comparte tu motivación e interés en contribuir con las iniciativas comunitarias de Kirikú..."
                class="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#289EAB] focus:bg-white transition-all resize-none"
              ></textarea>
            </div>
          </div>
        </div>

        <!-- SECTION 4: Requisito de Mayoría de Edad (Si aplica al proyecto) (KIR-98 & KIR-100) -->
        <div
          v-if="selectedProject?.es_mayor_edad"
          :class="[
            'rounded-3xl border p-6 sm:p-8 space-y-4 transition-all',
            isUnderageForProject
              ? 'bg-rose-50/70 border-rose-200 opacity-60'
              : form.confirmacion_mayor_edad
              ? 'bg-emerald-50/50 border-emerald-300'
              : 'bg-amber-50/70 border-amber-200'
          ]"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2.5">
              <ShieldAlert
                :class="[
                  'w-5 h-5 shrink-0',
                  isUnderageForProject
                    ? 'text-rose-600'
                    : form.confirmacion_mayor_edad
                    ? 'text-emerald-700'
                    : 'text-amber-600'
                ]"
              />
              <h3 class="font-bold text-sm sm:text-base text-stone-900">
                Declaración Obligatoria de Mayoría de Edad (+18)
              </h3>
            </div>

            <button
              type="button"
              @click="showAdultModal = true"
              class="text-xs font-semibold text-amber-800 underline hover:text-amber-950 cursor-pointer shrink-0"
            >
              Leer condiciones completas
            </button>
          </div>

          <p class="text-xs text-stone-700 leading-relaxed">
            Las actividades de este proyecto implican trabajo en terreno y requieren obligatoriamente tener 18 años cumplidos al momento del inicio. El documento de identidad será requerido en la primera etapa de evaluación.
          </p>

          <label
            :class="[
              'flex items-start gap-3 pt-2 cursor-pointer p-3 rounded-xl border transition-all',
              isUnderageForProject
                ? 'cursor-not-allowed bg-stone-100 border-stone-200'
                : form.confirmacion_mayor_edad
                ? 'bg-white border-emerald-300 text-emerald-950 shadow-xs'
                : 'bg-white/80 border-amber-200 text-stone-800'
            ]"
          >
            <input
              type="checkbox"
              v-model="form.confirmacion_mayor_edad"
              :disabled="isUnderageForProject"
              class="w-4 h-4 text-[#289EAB] border-stone-300 rounded-sm focus:ring-[#289EAB] mt-0.5 cursor-pointer disabled:cursor-not-allowed"
            />
            <div class="text-xs font-medium leading-relaxed">
              <span>
                Certifico que tengo 18 años o más y acepto presentar mi documento de identidad en la verificación inicial.
              </span>
              <span v-if="!form.confirmacion_mayor_edad && !isUnderageForProject" class="block text-[11px] text-amber-700 font-semibold mt-0.5">
                * Casilla obligatoria para poder enviar la postulación.
              </span>
            </div>
          </label>
        </div>

        <!-- Error Notification Banner -->
        <div
          v-if="localError"
          class="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-start gap-3"
        >
          <AlertCircle class="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <strong class="font-semibold block mb-0.5">Validación de Postulación:</strong>
            <span>{{ localError }}</span>
          </div>
        </div>

        <!-- Submit Button -->
        <div class="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
          <div class="text-xs text-stone-500">
            <span class="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1.5"></span>
            Los datos se validan y almacenan directamente en <strong>Supabase</strong>.
          </div>

          <button
            type="submit"
            :disabled="!isFormValid || isSubmitting"
            :class="[
              'w-full sm:w-auto px-8 py-3.5 rounded-xl font-bold text-sm shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer',
              isFormValid && !isSubmitting
                ? 'bg-[#289EAB] hover:bg-[#1E7B85] text-white active:scale-98 shadow-md'
                : 'bg-stone-200 text-stone-400 cursor-not-allowed shadow-none'
            ]"
          >
            <span v-if="isSubmitting">Validando y Guardando en Supabase...</span>
            <span v-else>Enviar Postulación Inicial</span>
            <ArrowRight v-if="!isSubmitting" class="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>

    <!-- Adult Warning Modal Component (KIR-98 & KIR-100) -->
    <AdultWarningModal
      :is-open="showAdultModal"
      :project-title="selectedProject?.titulo"
      :project-location="selectedProject?.ubicacion"
      :project-org="selectedProject?.organizacion?.nombre || 'Iniciativa Kirikú'"
      :initial-birth-date="form.fecha_nacimiento"
      @confirm="handleModalConfirm"
      @close="showAdultModal = false"
    />
  </div>
</template>
