export interface NumericRangeOptions {
  fieldLabel: string;
  allowNegative?: boolean;
  integerOnly?: boolean;
  minAllowed?: number;
  maxAllowed?: number;
}

export type NumericRangeResult =
  | { ok: true; min: number | null; max: number | null }
  | { ok: false; error: string };

const MAX_SAFE_NUMERIC_LIMIT = 1_000_000_000;

function parseNumericBound(raw: unknown): { present: boolean; valid: boolean; value: number | null } {
  if (raw === undefined || raw === null) {
    return { present: false, valid: true, value: null };
  }
  if (typeof raw === 'string' && raw.trim() === '') {
    return { present: false, valid: true, value: null };
  }
  if (typeof raw === 'boolean' || (typeof raw === 'object' && raw !== null)) {
    return { present: true, valid: false, value: null };
  }
  const str = typeof raw === 'string' ? raw.trim() : String(raw);
  if (!/^-?\d+(?:\.\d+)?$/.test(str)) {
    return { present: true, valid: false, value: null };
  }
  const num = Number(str);
  if (!Number.isFinite(num)) {
    return { present: true, valid: false, value: null };
  }
  return { present: true, valid: true, value: num };
}

export function validateNumericRange(
  minRaw: unknown,
  maxRaw: unknown,
  options: NumericRangeOptions
): NumericRangeResult {
  const {
    fieldLabel,
    allowNegative = false,
    integerOnly = false,
    minAllowed = allowNegative ? -MAX_SAFE_NUMERIC_LIMIT : 0,
    maxAllowed = MAX_SAFE_NUMERIC_LIMIT,
  } = options;

  const parsedMin = parseNumericBound(minRaw);
  if (!parsedMin.valid) {
    return { ok: false, error: `El valor mínimo de ${fieldLabel} debe ser un número válido` };
  }

  const parsedMax = parseNumericBound(maxRaw);
  if (!parsedMax.valid) {
    return { ok: false, error: `El valor máximo de ${fieldLabel} debe ser un número válido` };
  }

  const minVal = parsedMin.value;
  const maxVal = parsedMax.value;

  if (minVal !== null) {
    if (integerOnly && !Number.isInteger(minVal)) {
      return { ok: false, error: `El valor mínimo de ${fieldLabel} debe ser un número entero` };
    }
    if (!allowNegative && minVal < 0) {
      return { ok: false, error: `El valor mínimo de ${fieldLabel} no puede ser negativo` };
    }
    if (minVal < minAllowed || minVal > maxAllowed) {
      return {
        ok: false,
        error: `El valor mínimo de ${fieldLabel} debe estar entre ${minAllowed} y ${maxAllowed}`,
      };
    }
  }

  if (maxVal !== null) {
    if (integerOnly && !Number.isInteger(maxVal)) {
      return { ok: false, error: `El valor máximo de ${fieldLabel} debe ser un número entero` };
    }
    if (!allowNegative && maxVal < 0) {
      return { ok: false, error: `El valor máximo de ${fieldLabel} no puede ser negativo` };
    }
    if (maxVal < minAllowed || maxVal > maxAllowed) {
      return {
        ok: false,
        error: `El valor máximo de ${fieldLabel} debe estar entre ${minAllowed} y ${maxAllowed}`,
      };
    }
  }

  if (minVal !== null && maxVal !== null && minVal > maxVal) {
    return {
      ok: false,
      error: `El rango numérico de ${fieldLabel} es inválido: el mínimo (${minVal}) no puede ser mayor que el máximo (${maxVal})`,
    };
  }

  return { ok: true, min: minVal, max: maxVal };
}

export function validatePriceRange(minRaw: unknown, maxRaw: unknown): NumericRangeResult {
  return validateNumericRange(minRaw, maxRaw, {
    fieldLabel: 'precio/monto (Bs)',
    allowNegative: false,
    minAllowed: 0,
    maxAllowed: 100_000_000,
  });
}

export function validateQuotaRange(minRaw: unknown, maxRaw: unknown): NumericRangeResult {
  return validateNumericRange(minRaw, maxRaw, {
    fieldLabel: 'cupos',
    allowNegative: false,
    integerOnly: true,
    minAllowed: 0,
    maxAllowed: 100_000,
  });
}

export function validateScoreRange(minRaw: unknown, maxRaw: unknown, maxAllowed = 100): NumericRangeResult {
  return validateNumericRange(minRaw, maxRaw, {
    fieldLabel: 'puntaje/porcentaje',
    allowNegative: false,
    minAllowed: 0,
    maxAllowed,
  });
}

export function normalizeCategoryFilter(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const cleaned = raw.trim();
  if (!cleaned || cleaned.toLowerCase() === 'todas' || cleaned.toLowerCase() === 'todos') {
    return '';
  }
  return cleaned;
}

export function normalizeSortOrder<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  fallback: T
): T {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw.trim() as T;
  return allowed.includes(cleaned) ? cleaned : fallback;
}

export const PROJECT_SORT_OPTIONS = [
  'recientes',
  'titulo_asc',
  'titulo_desc',
  'cupos_desc',
  'cupos_asc',
] as const;
export type ProjectSortOrder = (typeof PROJECT_SORT_OPTIONS)[number];

export const DONATION_SORT_OPTIONS = [
  'recientes',
  'monto_desc',
  'monto_asc',
  'donante_asc',
] as const;
export type DonationSortOrder = (typeof DONATION_SORT_OPTIONS)[number];

export function filterAndSortProjects<
  T extends {
    titulo: string;
    descripcion?: string | null;
    ubicacion: string;
    cupos_disponibles: number;
    organizacion_tipo?: string | null;
    organizacion?: { tipo?: string | null; nombre?: string | null } | null;
    organizacion_nombre?: string | null;
    created_at?: string | null;
  },
>(
  items: T[],
  filters: {
    q?: string;
    categoria?: string;
    ubicacion?: string;
    cuposMin?: number | null;
    cuposMax?: number | null;
    ordenar?: ProjectSortOrder;
  }
): T[] {
  const q = (filters.q || '').trim().toLowerCase();
  const categoria = normalizeCategoryFilter(filters.categoria).toLowerCase();
  const ubicacion = normalizeCategoryFilter(filters.ubicacion).toLowerCase();

  const filtered = items.filter((item) => {
    const orgTipo = (item.organizacion_tipo || item.organizacion?.tipo || '').toLowerCase();
    const orgNombre = (item.organizacion_nombre || item.organizacion?.nombre || '').toLowerCase();

    if (categoria && orgTipo !== categoria) {
      return false;
    }
    if (ubicacion && !item.ubicacion.toLowerCase().includes(ubicacion)) {
      return false;
    }
    if (filters.cuposMin !== null && filters.cuposMin !== undefined && item.cupos_disponibles < filters.cuposMin) {
      return false;
    }
    if (filters.cuposMax !== null && filters.cuposMax !== undefined && item.cupos_disponibles > filters.cuposMax) {
      return false;
    }
    if (q) {
      const hayMatch =
        item.titulo.toLowerCase().includes(q) ||
        (item.descripcion || '').toLowerCase().includes(q) ||
        item.ubicacion.toLowerCase().includes(q) ||
        orgNombre.includes(q);
      if (!hayMatch) return false;
    }
    return true;
  });

  const sort = filters.ordenar || 'recientes';
  return [...filtered].sort((a, b) => {
    if (sort === 'titulo_asc') return a.titulo.localeCompare(b.titulo, 'es');
    if (sort === 'titulo_desc') return b.titulo.localeCompare(a.titulo, 'es');
    if (sort === 'cupos_desc') return Number(b.cupos_disponibles) - Number(a.cupos_disponibles);
    if (sort === 'cupos_asc') return Number(a.cupos_disponibles) - Number(b.cupos_disponibles);
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });
}

export function filterAndSortDonations<
  T extends {
    donante_nombre: string;
    tipo_donacion: string;
    categoria_especie?: string | null;
    monto_bob?: number | null;
    estado_entrega?: string | null;
    fecha_recepcion?: string | null;
    codigo_donacion?: string | null;
    descripcion_especie?: string | null;
  },
>(
  items: T[],
  filters: {
    q?: string;
    tipo?: string;
    categoria?: string;
    estado_entrega?: string;
    montoMin?: number | null;
    montoMax?: number | null;
    ordenar?: DonationSortOrder;
  }
): T[] {
  const q = (filters.q || '').trim().toLowerCase();
  const tipo = normalizeCategoryFilter(filters.tipo).toLowerCase();
  const categoria = normalizeCategoryFilter(filters.categoria).toLowerCase();
  const estado = normalizeCategoryFilter(filters.estado_entrega).toLowerCase();

  const filtered = items.filter((item) => {
    if (tipo && item.tipo_donacion.toLowerCase() !== tipo) return false;
    if (categoria && (item.categoria_especie || '').toLowerCase() !== categoria) return false;
    if (estado && (item.estado_entrega || 'recibida').toLowerCase() !== estado) return false;

    const amount = Number(item.monto_bob || 0);
    if (filters.montoMin !== null && filters.montoMin !== undefined && amount < filters.montoMin) {
      return false;
    }
    if (filters.montoMax !== null && filters.montoMax !== undefined && amount > filters.montoMax) {
      return false;
    }

    if (q) {
      const hayMatch =
        item.donante_nombre.toLowerCase().includes(q) ||
        (item.codigo_donacion || '').toLowerCase().includes(q) ||
        (item.descripcion_especie || '').toLowerCase().includes(q);
      if (!hayMatch) return false;
    }
    return true;
  });

  const sort = filters.ordenar || 'recientes';
  return [...filtered].sort((a, b) => {
    if (sort === 'monto_desc') return Number(b.monto_bob || 0) - Number(a.monto_bob || 0);
    if (sort === 'monto_asc') return Number(a.monto_bob || 0) - Number(b.monto_bob || 0);
    if (sort === 'donante_asc') return a.donante_nombre.localeCompare(b.donante_nombre, 'es');
    const ta = a.fecha_recepcion ? new Date(a.fecha_recepcion).getTime() : 0;
    const tb = b.fecha_recepcion ? new Date(b.fecha_recepcion).getTime() : 0;
    return tb - ta;
  });
}
