import { ref, computed } from 'vue';
import { api } from '../api/client';
import type { ExportModulo } from '../types';

export function validateNumericBoundsClient(
  minRaw: string | number | null | undefined,
  maxRaw: string | number | null | undefined,
  options: { label: string; integerOnly?: boolean; maxAllowed?: number }
): string | null {
  const minStr = minRaw === null || minRaw === undefined ? '' : String(minRaw).trim();
  const maxStr = maxRaw === null || maxRaw === undefined ? '' : String(maxRaw).trim();

  let minVal: number | null = null;
  let maxVal: number | null = null;

  if (minStr !== '') {
    minVal = Number(minStr);
    if (!Number.isFinite(minVal) || minVal < 0) {
      return `El mínimo de ${options.label} debe ser mayor o igual a 0.`;
    }
    if (options.integerOnly && !Number.isInteger(minVal)) {
      return `El mínimo de ${options.label} debe ser un número entero.`;
    }
    if (options.maxAllowed !== undefined && minVal > options.maxAllowed) {
      return `El mínimo de ${options.label} no puede superar ${options.maxAllowed}.`;
    }
  }

  if (maxStr !== '') {
    maxVal = Number(maxStr);
    if (!Number.isFinite(maxVal) || maxVal < 0) {
      return `El máximo de ${options.label} debe ser mayor o igual a 0.`;
    }
    if (options.integerOnly && !Number.isInteger(maxVal)) {
      return `El máximo de ${options.label} debe ser un número entero.`;
    }
    if (options.maxAllowed !== undefined && maxVal > options.maxAllowed) {
      return `El máximo de ${options.label} no puede superar ${options.maxAllowed}.`;
    }
  }

  if (minVal !== null && maxVal !== null && minVal > maxVal) {
    return `El mínimo de ${options.label} (${minVal}) no puede ser mayor que el máximo (${maxVal}).`;
  }

  return null;
}

export function useAuthAccess() {
  const role = ref<string>(typeof window !== 'undefined' ? localStorage.getItem('kiriku_user_role') || '' : '');
  const permissions = ref<string[]>([]);
  const exporting = ref(false);
  const exportNotice = ref<{ type: 'success' | 'error'; text: string } | null>(null);

  if (typeof window !== 'undefined') {
    try {
      const saved = JSON.parse(localStorage.getItem('kiriku_user_permissions') || '[]');
      if (Array.isArray(saved)) permissions.value = saved;
    } catch {
      permissions.value = [];
    }
  }

  const isAuthenticated = computed(() => {
    if (typeof window === 'undefined') return false;
    return Boolean(localStorage.getItem('kiriku_admin_token') || role.value);
  });

  const canExport = computed(() => {
    if (!isAuthenticated.value) return false;
    return role.value === 'administrador' || permissions.value.includes('reports.export');
  });

  const canReadAudit = computed(() => {
    if (!isAuthenticated.value) return false;
    return role.value === 'administrador' || permissions.value.includes('audit.read');
  });

  const canManageRoles = computed(() => {
    if (!isAuthenticated.value) return false;
    return role.value === 'administrador' || permissions.value.includes('roles.manage');
  });

  async function refreshAccess() {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('kiriku_admin_token');
    if (!token) return;
    try {
      const me = await api.getMe();
      role.value = me.rol;
      permissions.value = Array.isArray(me.permissions) ? me.permissions : [];
      localStorage.setItem('kiriku_user_role', me.rol);
      localStorage.setItem('kiriku_user_permissions', JSON.stringify(permissions.value));
    } catch {
      // Mantener último estado en localStorage si /auth/me falla por red
    }
  }

  async function downloadCsv(modulo: ExportModulo, params?: Record<string, unknown>) {
    exporting.value = true;
    exportNotice.value = null;
    try {
      const { filename, sizeBytes } = await api.exportCsvReport(modulo, params);
      const kb = (sizeBytes / 1024).toFixed(1);
      exportNotice.value = {
        type: 'success',
        text: `Reporte ${filename} descargado (${kb} KB · ${sizeBytes} bytes) y registrado en auditoría.`,
      };
      return true;
    } catch (err: any) {
      exportNotice.value = {
        type: 'error',
        text: err?.message || 'No tienes permiso o hubo un error al exportar el reporte CSV.',
      };
      return false;
    } finally {
      exporting.value = false;
    }
  }

  return {
    role,
    permissions,
    isAuthenticated,
    canExport,
    canReadAudit,
    canManageRoles,
    exporting,
    exportNotice,
    refreshAccess,
    downloadCsv,
  };
}
