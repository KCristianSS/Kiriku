<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '../../api/client';
import { useAuthAccess } from '../../composables/useAuthAccess';
import type { CacheStats, SystemLogRecord, SystemLogsResponse } from '../../types';
import {
  ArrowLeft,
  RefreshCw,
  Download,
  Search,
  Database,
  ShieldAlert,
  FileSpreadsheet,
  Clock,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from 'lucide-vue-next';

const { canExport, exporting, exportNotice, refreshAccess, downloadCsv } = useAuthAccess();

const loading = ref(false);
const error = ref<string | null>(null);
const logsData = ref<SystemLogsResponse | null>(null);
const cacheStats = ref<CacheStats | null>(null);

const filterQ = ref('');
const filterModule = ref('');
const filterAction = ref('');
const filterStatus = ref('');
const filterDesde = ref('');
const filterHasta = ref('');
const sortOrder = ref<'recientes' | 'antiguos' | 'duracion_desc' | 'tamano_desc'>('recientes');
const pagina = ref(1);
const limite = 25;

async function loadData(resetPage = false) {
  if (resetPage) pagina.value = 1;
  loading.value = true;
  error.value = null;
  try {
    const [logsRes, cacheRes] = await Promise.all([
      api.getSystemLogs({
        q: filterQ.value.trim() || undefined,
        module: filterModule.value || undefined,
        action: filterAction.value || undefined,
        status: filterStatus.value || undefined,
        fecha_desde: filterDesde.value || undefined,
        fecha_hasta: filterHasta.value || undefined,
        ordenar: sortOrder.value,
        pagina: pagina.value,
        limite,
      }),
      api.getCacheStats().catch(() => null),
    ]);
    logsData.value = logsRes;
    if (cacheRes) cacheStats.value = cacheRes;
  } catch (err: any) {
    error.value =
      err?.response?.data?.error ||
      'No se pudieron cargar los logs del sistema. Verifica que tu rol tenga permiso audit.read.';
  } finally {
    loading.value = false;
  }
}

async function handleExportLogs() {
  await downloadCsv('logs', {
    q: filterQ.value.trim() || undefined,
    module: filterModule.value || undefined,
    action: filterAction.value || undefined,
    status: filterStatus.value || undefined,
    fecha_desde: filterDesde.value || undefined,
    fecha_hasta: filterHasta.value || undefined,
    ordenar: sortOrder.value,
  });
  await loadData();
}

function clearFilters() {
  filterQ.value = '';
  filterModule.value = '';
  filterAction.value = '';
  filterStatus.value = '';
  filterDesde.value = '';
  filterHasta.value = '';
  sortOrder.value = 'recientes';
  loadData(true);
}

function formatBytes(bytes: number | null | undefined) {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(2)} KB`;
}

function formatTimestamp(ts: string) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleString('es-BO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function statusLabel(status: SystemLogRecord['status']) {
  if (status === 'denied') return 'Denegado';
  if (status === 'error') return 'Error';
  return 'Exitoso';
}

function statusTextClass(status: SystemLogRecord['status']) {
  if (status === 'denied') return 'text-rose-700 font-semibold';
  if (status === 'error') return 'text-amber-700 font-semibold';
  return 'text-emerald-700 font-semibold';
}

onMounted(async () => {
  await refreshAccess();
  await loadData(true);
});
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">
    <!-- Top bar -->
    <div class="bg-white border border-stone-200 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-2 text-xs text-stone-500 mb-1">
          <router-link to="/admin" class="hover:text-[#1E7B85] inline-flex items-center gap-1 font-medium whitespace-nowrap">
            <ArrowLeft class="w-3.5 h-3.5" />
            <span>Panel Administrativo</span>
          </router-link>
          <span aria-hidden="true">/</span>
          <span class="text-stone-700 font-medium">Auditoría y Caché</span>
        </div>
        <h1 class="text-2xl font-bold text-stone-900 tracking-tight">
          Logs del Sistema y Rendimiento de Caché
        </h1>
        <p class="text-xs sm:text-sm text-stone-600 mt-1">
          Registro de exportaciones CSV (tamaño en bytes y duración en ms), intentos RBAC denegados y métricas de caché.
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2.5 shrink-0">
        <button
          type="button"
          @click="loadData()"
          :disabled="loading"
          class="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold rounded-xl transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <RefreshCw :class="['w-3.5 h-3.5', loading ? 'animate-spin' : '']" />
          <span>Actualizar</span>
        </button>

        <button
          v-if="canExport"
          type="button"
          @click="handleExportLogs"
          :disabled="exporting"
          class="px-4 py-2 bg-[#289EAB] hover:bg-[#1E7B85] text-white text-xs font-semibold rounded-xl transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
        >
          <Download class="w-3.5 h-3.5" />
          <span>{{ exporting ? 'Exportando...' : 'Exportar CSV' }}</span>
        </button>
      </div>
    </div>

    <div
      v-if="exportNotice"
      role="status"
      :class="[
        'p-3.5 rounded-xl border text-xs sm:text-sm',
        exportNotice.type === 'success'
          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
          : 'bg-rose-50 border-rose-200 text-rose-800',
      ]"
    >
      {{ exportNotice.text }}
    </div>

    <div v-if="error" role="alert" class="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-4 text-sm flex items-center gap-3">
      <AlertCircle class="w-5 h-5 text-rose-600 shrink-0" />
      <span>{{ error }}</span>
    </div>

    <!-- Cache stats strip -->
    <div v-if="cacheStats" class="bg-white border border-stone-200 rounded-2xl p-5 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2 text-sm font-bold text-stone-900">
          <Database class="w-4 h-4 text-[#289EAB]" />
          <span>Estado de Caché de Consultas</span>
        </div>
        <div class="text-xs text-stone-600 flex flex-wrap items-center gap-2">
          <span>Motor activo: <strong class="text-stone-900 uppercase">{{ cacheStats.backend }}</strong></span>
          <span aria-hidden="true">·</span>
          <span>Redis configurado: <strong>{{ cacheStats.redisConfigured ? 'Sí' : 'Fallback en memoria' }}</strong></span>
          <span aria-hidden="true">·</span>
          <span class="tabular-nums">TTL: <strong>{{ cacheStats.defaultTtlSeconds }}s</strong></span>
        </div>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2 border-t border-stone-100 text-xs">
        <div>
          <span class="text-stone-500 block">Aciertos (Hits)</span>
          <strong class="text-lg font-mono tabular-nums text-emerald-700">{{ cacheStats.hits }}</strong>
        </div>
        <div>
          <span class="text-stone-500 block">Fallos (Misses)</span>
          <strong class="text-lg font-mono tabular-nums text-stone-900">{{ cacheStats.misses }}</strong>
        </div>
        <div>
          <span class="text-stone-500 block">Escrituras (Sets)</span>
          <strong class="text-lg font-mono tabular-nums text-stone-900">{{ cacheStats.sets }}</strong>
        </div>
        <div>
          <span class="text-stone-500 block">Claves activas</span>
          <strong class="text-lg font-mono tabular-nums text-[#1E7B85]">{{ cacheStats.activeKeys }}</strong>
        </div>
        <div>
          <span class="text-stone-500 block">Invalidaciones</span>
          <strong class="text-lg font-mono tabular-nums text-amber-700">{{ cacheStats.invalidations }}</strong>
        </div>
      </div>
    </div>

    <!-- Audit KPI cards -->
    <div v-if="logsData" class="grid grid-cols-2 sm:grid-cols-5 gap-4">
      <div class="bg-white border border-stone-200 rounded-2xl p-4">
        <span class="text-xs text-stone-500 block">Eventos registrados</span>
        <strong class="text-2xl font-mono tabular-nums text-stone-900 mt-1 block">{{ logsData.resumen.total_logs }}</strong>
      </div>
      <div class="bg-white border border-stone-200 rounded-2xl p-4">
        <span class="text-xs text-stone-500 flex items-center gap-1">
          <FileSpreadsheet class="w-3.5 h-3.5 text-[#289EAB]" />
          <span>Exportaciones CSV</span>
        </span>
        <strong class="text-2xl font-mono tabular-nums text-[#1E7B85] mt-1 block">{{ logsData.resumen.total_exportaciones }}</strong>
      </div>
      <div class="bg-white border border-stone-200 rounded-2xl p-4">
        <span class="text-xs text-stone-500 block">Volumen exportado</span>
        <strong class="text-2xl font-mono tabular-nums text-stone-900 mt-1 block">{{ formatBytes(logsData.resumen.tamano_total_bytes) }}</strong>
      </div>
      <div class="bg-white border border-stone-200 rounded-2xl p-4">
        <span class="text-xs text-stone-500 flex items-center gap-1">
          <Clock class="w-3.5 h-3.5 text-stone-400" />
          <span>Duración promedio</span>
        </span>
        <strong class="text-2xl font-mono tabular-nums text-stone-900 mt-1 block">{{ logsData.resumen.duracion_promedio_ms }} ms</strong>
      </div>
      <div class="bg-white border border-stone-200 rounded-2xl p-4">
        <span class="text-xs text-stone-500 flex items-center gap-1">
          <ShieldAlert class="w-3.5 h-3.5 text-rose-600" />
          <span>Accesos denegados</span>
        </span>
        <strong class="text-2xl font-mono tabular-nums text-rose-700 mt-1 block">{{ logsData.resumen.intentos_denegados }}</strong>
      </div>
    </div>

    <!-- Filter bar -->
    <form @submit.prevent="loadData(true)" class="bg-white border border-stone-200 rounded-2xl p-4 space-y-3">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div class="relative">
          <Search class="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            v-model="filterQ"
            type="text"
            placeholder="Buscar correo, acción o detalle..."
            class="w-full pl-9 pr-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#289EAB]"
          />
        </div>

        <select
          v-model="filterModule"
          class="px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-700 focus:outline-none focus:ring-2 focus:ring-[#289EAB]"
        >
          <option value="">Todos los módulos</option>
          <option value="catalogo">Catálogo público</option>
          <option value="proyectos">Proyectos</option>
          <option value="proyectos-seguimiento">Seguimiento proyectos</option>
          <option value="postulaciones-seguimiento">Seguimiento postulaciones</option>
          <option value="donaciones">Donaciones</option>
          <option value="historial-donaciones">Historial donaciones</option>
          <option value="necesidades-donacion">Necesidades donación</option>
          <option value="postulantes">Banco postulantes</option>
          <option value="evaluacion-inicial">Evaluación inicial</option>
          <option value="evaluacion-tecnica">Evaluación técnica</option>
          <option value="evaluacion-personal">Evaluación personal</option>
          <option value="evaluacion-competencias">Evaluación competencias</option>
          <option value="evaluacion-salud">Evaluación salud</option>
          <option value="roles">Roles y usuarios</option>
          <option value="logs">Logs del sistema</option>
        </select>

        <select
          v-model="filterStatus"
          class="px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-700 focus:outline-none focus:ring-2 focus:ring-[#289EAB]"
        >
          <option value="">Todos los estados</option>
          <option value="success">Exitoso</option>
          <option value="denied">Denegado (RBAC)</option>
          <option value="error">Error</option>
        </select>

        <select
          v-model="sortOrder"
          class="px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-700 focus:outline-none focus:ring-2 focus:ring-[#289EAB]"
        >
          <option value="recientes">Más recientes primero</option>
          <option value="antiguos">Más antiguos primero</option>
          <option value="tamano_desc">Mayor tamaño (bytes)</option>
          <option value="duracion_desc">Mayor duración (ms)</option>
        </select>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-stone-100">
        <div class="flex flex-wrap items-center gap-2 text-xs">
          <label class="inline-flex items-center gap-1.5 text-stone-600">
            <span>Desde:</span>
            <input v-model="filterDesde" type="date" class="px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-xs" />
          </label>
          <label class="inline-flex items-center gap-1.5 text-stone-600">
            <span>Hasta:</span>
            <input v-model="filterHasta" type="date" class="px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-xs" />
          </label>
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            @click="clearFilters"
            class="px-3.5 py-1.5 text-xs font-semibold text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Limpiar filtros
          </button>
          <button
            type="submit"
            class="px-4 py-1.5 text-xs font-semibold text-white bg-stone-900 hover:bg-stone-800 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Aplicar filtros
          </button>
        </div>
      </div>
    </form>

    <!-- Table -->
    <div class="bg-white border border-stone-200 rounded-2xl overflow-hidden">
      <div v-if="loading && !logsData" class="p-12 text-center text-xs text-stone-500">
        Cargando bitácora de auditoría...
      </div>

      <div v-else-if="!logsData || logsData.items.length === 0" class="p-12 text-center space-y-2">
        <p class="text-sm font-semibold text-stone-800">Sin eventos registrados para los filtros seleccionados</p>
        <p class="text-xs text-stone-500">Las exportaciones CSV, consultas de auditoría y eventos RBAC aparecerán aquí.</p>
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="border-b border-stone-200 bg-stone-50 text-stone-600 font-semibold">
              <th class="px-4 py-3">Fecha y Hora</th>
              <th class="px-4 py-3">Usuario · Rol</th>
              <th class="px-4 py-3">Acción</th>
              <th class="px-4 py-3">Módulo</th>
              <th class="px-4 py-3">Estado</th>
              <th class="px-4 py-3 text-right">Filas</th>
              <th class="px-4 py-3 text-right">Tamaño</th>
              <th class="px-4 py-3 text-right">Duración</th>
              <th class="px-4 py-3">Detalle</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-stone-100">
            <tr v-for="item in logsData.items" :key="item.id" class="hover:bg-stone-50/70 transition-colors">
              <td class="px-4 py-2.5 font-mono tabular-nums text-stone-600 whitespace-nowrap">
                {{ formatTimestamp(item.created_at) }}
              </td>
              <td class="px-4 py-2.5">
                <span class="font-medium text-stone-900">{{ item.user_email || 'Anónimo' }}</span>
                <span v-if="item.user_role" class="text-stone-400"> · {{ item.user_role }}</span>
              </td>
              <td class="px-4 py-2.5 font-mono text-stone-800 whitespace-nowrap">{{ item.action }}</td>
              <td class="px-4 py-2.5 text-stone-700 whitespace-nowrap">{{ item.module }}</td>
              <td class="px-4 py-2.5 whitespace-nowrap" :class="statusTextClass(item.status)">
                {{ statusLabel(item.status) }}
              </td>
              <td class="px-4 py-2.5 text-right font-mono tabular-nums text-stone-700">
                {{ item.row_count ?? '—' }}
              </td>
              <td class="px-4 py-2.5 text-right font-mono tabular-nums text-stone-700">
                {{ formatBytes(item.file_size_bytes) }}
              </td>
              <td class="px-4 py-2.5 text-right font-mono tabular-nums text-stone-700">
                {{ item.duration_ms }} ms
              </td>
              <td class="px-4 py-2.5 text-stone-600 max-w-xs truncate" :title="item.details || ''">
                {{ item.details || '—' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div
        v-if="logsData && logsData.paginacion.paginas > 1"
        class="px-4 py-3 border-t border-stone-200 flex items-center justify-between text-xs text-stone-600"
      >
        <span class="tabular-nums">
          Página {{ logsData.paginacion.pagina }} de {{ logsData.paginacion.paginas }}
        </span>
        <div class="flex items-center gap-2">
          <button
            type="button"
            :disabled="pagina <= 1 || loading"
            @click="pagina--; loadData()"
            class="px-3 py-1.5 border border-stone-200 rounded-lg hover:bg-stone-50 disabled:opacity-40 inline-flex items-center gap-1 cursor-pointer"
          >
            <ChevronLeft class="w-3.5 h-3.5" />
            <span>Anterior</span>
          </button>
          <button
            type="button"
            :disabled="pagina >= logsData.paginacion.paginas || loading"
            @click="pagina++; loadData()"
            class="px-3 py-1.5 border border-stone-200 rounded-lg hover:bg-stone-50 disabled:opacity-40 inline-flex items-center gap-1 cursor-pointer"
          >
            <span>Siguiente</span>
            <ChevronRight class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
