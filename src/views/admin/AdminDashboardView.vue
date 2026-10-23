<script setup lang="ts">
import { LayoutDashboard, ArrowRight, CheckSquare, Users, ShieldCheck, KeyRound } from 'lucide-vue-next';
import { ref, onMounted } from 'vue';
import { api } from '../../api/client';
import type { DashboardMetrics } from '../../types';
import {
  LayoutDashboard,
  ArrowRight,
  CheckSquare,
  Users,
  ShieldCheck,
  FolderKanban,
  UserCheck,
  Heart,
  TrendingUp,
  RefreshCw,
  ExternalLink,
  FileCode,
} from 'lucide-vue-next';

const metrics = ref<DashboardMetrics | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

async function loadMetrics() {
  loading.value = true;
  error.value = null;
  try {
    metrics.value = await api.getDashboardMetrics();
  } catch (err: any) {
    error.value = err?.response?.data?.error || 'Error al cargar métricas del panel';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadMetrics();
});
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-12 space-y-8">
    <!-- Header Banner -->
    <div class="relative bg-white border border-stone-200 rounded-3xl p-6 sm:p-10 shadow-xs overflow-hidden">
      <div class="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#289EAB] via-[#F58F38] to-[#EB455F]"></div>

      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E8F6F8] text-[#1E7B85] text-xs font-semibold mb-2">
            <ShieldCheck class="w-3.5 h-3.5 text-[#289EAB]" />
            <span>Panel de Control & Reportes</span>
          </div>

          <h1 class="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight">
            Reportes y Administración
          </h1>
          <p class="text-stone-600 text-xs sm:text-sm mt-1">
            Supervisión integral de proyectos, postulaciones comunitarias y donaciones recibidas.
          </p>
        </div>

        <button
          @click="loadMetrics"
          :disabled="loading"
          class="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw :class="['w-3.5 h-3.5', loading ? 'animate-spin' : '']" />
          <span>Actualizar Datos</span>
        </button>
      </div>
    </div>

    <!-- Metrics Cards Grid -->
    <div v-if="loading && !metrics" class="py-16 text-center text-xs text-stone-500">
      Cargando indicadores desde Supabase...
    </div>

    <div v-else-if="metrics" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <!-- Total Proyectos -->
      <div class="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs">
        <div class="flex items-center justify-between text-xs text-stone-500 mb-2">
          <span>Proyectos Totales</span>
          <FolderKanban class="w-4 h-4 text-[#289EAB]" />
        </div>
        <div class="text-2xl font-extrabold text-stone-900 font-mono">
          {{ metrics.totalProyectos }}
        </div>
        <div class="text-[11px] text-stone-500 mt-2 flex items-center gap-2">
          <span class="text-emerald-700 font-semibold">{{ metrics.proyectosAprobados }} aprobados</span>
          <span>·</span>
          <span class="text-amber-700 font-semibold">{{ metrics.proyectosPendientes }} pendientes</span>
        </div>
      </div>

      <!-- Postulantes Registrados -->
      <div class="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs">
        <div class="flex items-center justify-between text-xs text-stone-500 mb-2">
          <span>Banco de Postulantes</span>
          <ArrowRight class="w-3.5 h-3.5 opacity-80" />
        </router-link>
        <router-link
          to="/admin/roles"
          class="px-5 py-2.5 bg-stone-800 hover:bg-stone-700 text-white rounded-xl text-xs font-semibold transition-all inline-flex items-center gap-2 shadow-xs"
        >
          <KeyRound class="w-4 h-4" />
          <span>Roles y permisos</span>
          <ArrowRight class="w-3.5 h-3.5 opacity-80" />
        </router-link>
          <Users class="w-4 h-4 text-[#F58F38]" />
        </div>
        <div class="text-2xl font-extrabold text-stone-900 font-mono">
          {{ metrics.totalPostulantes }}
        </div>
        <div class="text-[11px] text-stone-500 mt-2">
          Voluntarios únicos en la base de datos
        </div>
      </div>

      <!-- Postulaciones Activas -->
      <div class="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs">
        <div class="flex items-center justify-between text-xs text-stone-500 mb-2">
          <span>Postulaciones en Proceso</span>
          <UserCheck class="w-4 h-4 text-emerald-600" />
        </div>
        <div class="text-2xl font-extrabold text-stone-900 font-mono">
          {{ metrics.postulacionesEnProceso }}
        </div>
        <div class="text-[11px] text-stone-500 mt-2">
          En evaluación de 5 etapas
        </div>
      </div>

      <!-- Donaciones -->
      <div class="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs">
        <div class="flex items-center justify-between text-xs text-stone-500 mb-2">
          <span>Fondos Recaudados</span>
          <Heart class="w-4 h-4 text-[#EB455F]" />
        </div>
        <div class="text-2xl font-extrabold text-stone-900 font-mono">
          {{ Number(metrics.totalDonacionesBob).toLocaleString('es-BO', { minimumFractionDigits: 2 }) }} Bs.
        </div>
        <div class="text-[11px] text-stone-500 mt-2">
          + {{ metrics.totalDonacionesEspecie }} donaciones en especie
        </div>
      </div>
    </div>

    <!-- Quick Navigation to Admin Modules -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <router-link
        to="/admin/revision"
        class="bg-white rounded-2xl border border-stone-200 hover:border-[#289EAB] p-6 shadow-xs transition-all flex items-center justify-between group"
      >
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 bg-[#E8F6F8] text-[#289EAB] rounded-xl flex items-center justify-center">
            <CheckSquare class="w-6 h-6" />
          </div>
          <div>
            <h3 class="text-base font-bold text-stone-900 group-hover:text-[#289EAB] transition-colors">
              Revisión de Proyectos
            </h3>
            <p class="text-xs text-stone-500 mt-0.5">
              Aprobar o rechazar propuestas de iniciativas con motivo formal.
            </p>
          </div>
        </div>
        <ArrowRight class="w-5 h-5 text-stone-400 group-hover:text-[#289EAB] group-hover:translate-x-1 transition-all" />
      </router-link>

      <router-link
        to="/admin/postulantes"
        class="bg-white rounded-2xl border border-stone-200 hover:border-[#F58F38] p-6 shadow-xs transition-all flex items-center justify-between group"
      >
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 bg-[#FEF4EC] text-[#F58F38] rounded-xl flex items-center justify-center">
            <Users class="w-6 h-6" />
          </div>
          <div>
            <h3 class="text-base font-bold text-stone-900 group-hover:text-[#F58F38] transition-colors">
              Banco de Postulantes
            </h3>
            <p class="text-xs text-stone-500 mt-0.5">
              Gestión de postulantes, calificación de etapas y reasignación.
            </p>
          </div>
        </div>
        <ArrowRight class="w-5 h-5 text-stone-400 group-hover:text-[#F58F38] group-hover:translate-x-1 transition-all" />
      </router-link>

      <!-- Swagger Documentation Card -->
      <a
        href="/api-docs"
        target="_blank"
        rel="noopener noreferrer"
        class="bg-white rounded-2xl border border-stone-200 hover:border-[#289EAB] p-6 shadow-xs transition-all flex items-center justify-between group sm:col-span-2"
      >
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 bg-[#E8F6F8] text-[#1E7B85] rounded-xl flex items-center justify-center">
            <FileCode class="w-6 h-6" />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h3 class="text-base font-bold text-stone-900 group-hover:text-[#1E7B85] transition-colors">
                Documentación Swagger UI (Colección de Endpoints REST)
              </h3>
              <span class="bg-[#E8F6F8] text-[#1E7B85] text-[10px] font-bold px-2 py-0.5 rounded-full border border-[#289EAB]/30">
                OpenAPI 3.0
              </span>
            </div>
            <p class="text-xs text-stone-500 mt-0.5">
              Colección completa e interactiva de endpoints para probar: Proyectos, Postulaciones, Validación de Mayoría de Edad, Evaluaciones en 5 etapas, Donaciones y Métricas.
            </p>
          </div>
        </div>
        <ExternalLink class="w-5 h-5 text-stone-400 group-hover:text-[#1E7B85] transition-all" />
      </a>
    </div>
  </div>
</template>
