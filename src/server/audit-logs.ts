import { isDatabaseConfigured, query } from './supabase';

export type SystemLogStatus = 'success' | 'denied' | 'error';

export interface SystemLogInput {
  user_id?: string | null;
  user_email?: string | null;
  user_role?: string | null;
  action: string;
  module: string;
  format?: string | null;
  file_size_bytes?: number | null;
  row_count?: number | null;
  duration_ms?: number;
  filters_json?: Record<string, unknown> | null;
  status?: SystemLogStatus;
  details?: string | null;
}

export interface SystemLogRecord {
  id: number;
  user_id: string | null;
  user_email: string | null;
  user_role: string | null;
  action: string;
  module: string;
  format: string | null;
  file_size_bytes: number | null;
  row_count: number | null;
  duration_ms: number;
  filters_json: Record<string, unknown> | null;
  status: SystemLogStatus;
  details: string | null;
  created_at: string;
}

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => unknown;
}

const MAX_MEMORY_LOGS = 500;
const memoryLogs: SystemLogRecord[] = [];
let memoryLogSeq = 1;
let forceMemoryLogsForTest = false;

/**
 * Neutralizes spreadsheet formula injection (=, +, -, @, tab, CR) and formats RFC 4180 CSV cells.
 */
export function sanitizeCsvCell(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  let text =
    raw instanceof Date
      ? raw.toISOString()
      : typeof raw === 'object'
      ? JSON.stringify(raw)
      : String(raw);

  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }

  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildCsvReport<T>(
  columns: CsvColumn<T>[],
  rows: T[]
): { csv: string; sizeBytes: number; rowCount: number } {
  const headerLine = columns.map((c) => sanitizeCsvCell(c.header)).join(',');
  const dataLines = rows.map((row) =>
    columns.map((c) => sanitizeCsvCell(c.value(row))).join(',')
  );

  // UTF-8 BOM for proper accent rendering in Excel
  const csv = `\uFEFF${[headerLine, ...dataLines].join('\r\n')}\r\n`;
  const sizeBytes = Buffer.byteLength(csv, 'utf8');

  return {
    csv,
    sizeBytes,
    rowCount: rows.length,
  };
}

function pushMemoryLog(entry: SystemLogInput): SystemLogRecord {
  const record: SystemLogRecord = {
    id: memoryLogSeq++,
    user_id: entry.user_id || null,
    user_email: entry.user_email || null,
    user_role: entry.user_role || null,
    action: entry.action,
    module: entry.module,
    format: entry.format || null,
    file_size_bytes: entry.file_size_bytes ?? null,
    row_count: entry.row_count ?? null,
    duration_ms: Math.max(0, Math.round(entry.duration_ms ?? 0)),
    filters_json: entry.filters_json ?? null,
    status: entry.status || 'success',
    details: entry.details || null,
    created_at: new Date().toISOString(),
  };

  memoryLogs.unshift(record);
  if (memoryLogs.length > MAX_MEMORY_LOGS) {
    memoryLogs.length = MAX_MEMORY_LOGS;
  }
  return record;
}

export async function recordSystemLog(entry: SystemLogInput): Promise<SystemLogRecord> {
  const durationMs = Math.max(0, Math.round(entry.duration_ms ?? 0));
  const status: SystemLogStatus = entry.status || 'success';

  if (!isDatabaseConfigured || forceMemoryLogsForTest) {
    return pushMemoryLog({ ...entry, duration_ms: durationMs, status });
  }

  try {
    const rows = await query<SystemLogRecord>(
      `INSERT INTO public.system_logs (
         user_id, user_email, user_role, action, module, format,
         file_size_bytes, row_count, duration_ms, filters_json, status, details
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12)
       RETURNING *`,
      [
        entry.user_id || null,
        entry.user_email || null,
        entry.user_role || null,
        entry.action,
        entry.module,
        entry.format || null,
        entry.file_size_bytes ?? null,
        entry.row_count ?? null,
        durationMs,
        entry.filters_json ? JSON.stringify(entry.filters_json) : null,
        status,
        entry.details || null,
      ]
    );
    return rows[0];
  } catch (err: any) {
    // Graceful fallback if system_logs migration has not been executed yet in Supabase
    if (err?.code !== '42P01') {
      console.warn('No se pudo persistir log en PostgreSQL, usando memoria:', err?.message);
    }
    return pushMemoryLog({ ...entry, duration_ms: durationMs, status });
  }
}

export interface SystemLogsQueryFilters {
  module?: string;
  action?: string;
  status?: string;
  q?: string;
  fecha_desde?: string;
  fecha_hasta?: string;
  ordenar?: 'recientes' | 'antiguos' | 'duracion_desc' | 'tamano_desc';
  pagina?: number;
  limite?: number;
}

function queryMemoryLogs(filters: SystemLogsQueryFilters) {
  const mod = (filters.module || '').trim().toLowerCase();
  const act = (filters.action || '').trim().toLowerCase();
  const status = (filters.status || '').trim().toLowerCase();
  const q = (filters.q || '').trim().toLowerCase();
  const pagina = Math.max(1, Number(filters.pagina) || 1);
  const limite = Math.min(100, Math.max(1, Number(filters.limite) || 25));

  const filtered = memoryLogs.filter((item) => {
    if (mod && item.module.toLowerCase() !== mod) return false;
    if (act && item.action.toLowerCase() !== act) return false;
    if (status && item.status.toLowerCase() !== status) return false;
    if (filters.fecha_desde && item.created_at < filters.fecha_desde) return false;
    if (filters.fecha_hasta && item.created_at.slice(0, 10) > filters.fecha_hasta) return false;
    if (q) {
      const hay =
        (item.user_email || '').toLowerCase().includes(q) ||
        item.action.toLowerCase().includes(q) ||
        item.module.toLowerCase().includes(q) ||
        (item.details || '').toLowerCase().includes(q);
      if (!hay) return false;
    }
    return true;
  });

  const sort = filters.ordenar || 'recientes';
  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'antiguos') return a.created_at.localeCompare(b.created_at);
    if (sort === 'duracion_desc') return b.duration_ms - a.duration_ms;
    if (sort === 'tamano_desc') return (b.file_size_bytes || 0) - (a.file_size_bytes || 0);
    return b.created_at.localeCompare(a.created_at);
  });

  const total = sorted.length;
  const offset = (pagina - 1) * limite;
  const items = sorted.slice(offset, offset + limite);
  const exportsOnly = filtered.filter((l) => l.action.startsWith('EXPORT_'));
  const totalBytes = exportsOnly.reduce((sum, l) => sum + (l.file_size_bytes || 0), 0);
  const avgDuration =
    filtered.length > 0
      ? Math.round(filtered.reduce((sum, l) => sum + l.duration_ms, 0) / filtered.length)
      : 0;

  return {
    items,
    resumen: {
      total_logs: total,
      total_exportaciones: exportsOnly.length,
      tamano_total_bytes: totalBytes,
      duracion_promedio_ms: avgDuration,
      intentos_denegados: filtered.filter((l) => l.status === 'denied').length,
    },
    paginacion: {
      pagina,
      limite,
      paginas: Math.max(1, Math.ceil(total / limite)),
    },
  };
}

export async function querySystemLogs(filters: SystemLogsQueryFilters) {
  if (!isDatabaseConfigured || forceMemoryLogsForTest) {
    return queryMemoryLogs(filters);
  }

  const pagina = Math.max(1, Number(filters.pagina) || 1);
  const limite = Math.min(100, Math.max(1, Number(filters.limite) || 25));
  const offset = (pagina - 1) * limite;

  const conditions: string[] = [];
  const params: any[] = [];

  if (filters.module && filters.module.trim()) {
    params.push(filters.module.trim());
    conditions.push(`module = $${params.length}`);
  }
  if (filters.action && filters.action.trim()) {
    params.push(filters.action.trim());
    conditions.push(`action = $${params.length}`);
  }
  if (filters.status && ['success', 'denied', 'error'].includes(filters.status.trim())) {
    params.push(filters.status.trim());
    conditions.push(`status = $${params.length}`);
  }
  if (filters.fecha_desde && /^\d{4}-\d{2}-\d{2}$/.test(filters.fecha_desde.trim())) {
    params.push(filters.fecha_desde.trim());
    conditions.push(`created_at >= $${params.length}::date`);
  }
  if (filters.fecha_hasta && /^\d{4}-\d{2}-\d{2}$/.test(filters.fecha_hasta.trim())) {
    params.push(filters.fecha_hasta.trim());
    conditions.push(`created_at < ($${params.length}::date + INTERVAL '1 day')`);
  }
  if (filters.q && filters.q.trim()) {
    params.push(`%${filters.q.trim()}%`);
    const pIdx = params.length;
    conditions.push(`(
      COALESCE(user_email, '') ILIKE $${pIdx}
      OR action ILIKE $${pIdx}
      OR module ILIKE $${pIdx}
      OR COALESCE(details, '') ILIKE $${pIdx}
    )`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderByMap: Record<string, string> = {
    recientes: 'created_at DESC, id DESC',
    antiguos: 'created_at ASC, id ASC',
    duracion_desc: 'duration_ms DESC, created_at DESC',
    tamano_desc: 'COALESCE(file_size_bytes, 0) DESC, created_at DESC',
  };
  const orderBy = orderByMap[filters.ordenar || 'recientes'] || orderByMap.recientes;

  try {
    const [summaryRows, itemRows] = await Promise.all([
      query<{
        total_logs: string;
        total_exportaciones: string;
        tamano_total_bytes: string;
        duracion_promedio_ms: string;
        intentos_denegados: string;
      }>(
        `SELECT
           COUNT(*)::text AS total_logs,
           COUNT(*) FILTER (WHERE action LIKE 'EXPORT_%')::text AS total_exportaciones,
           COALESCE(SUM(file_size_bytes) FILTER (WHERE action LIKE 'EXPORT_%'), 0)::text AS tamano_total_bytes,
           COALESCE(ROUND(AVG(duration_ms)), 0)::text AS duracion_promedio_ms,
           COUNT(*) FILTER (WHERE status = 'denied')::text AS intentos_denegados
         FROM public.system_logs
         ${whereClause}`,
        params
      ),
      query<SystemLogRecord>(
        `SELECT * FROM public.system_logs
         ${whereClause}
         ORDER BY ${orderBy}
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limite, offset]
      ),
    ]);

    const summary = summaryRows[0];
    const total = parseInt(summary?.total_logs || '0', 10);

    return {
      items: itemRows,
      resumen: {
        total_logs: total,
        total_exportaciones: parseInt(summary?.total_exportaciones || '0', 10),
        tamano_total_bytes: parseInt(summary?.tamano_total_bytes || '0', 10),
        duracion_promedio_ms: parseInt(summary?.duracion_promedio_ms || '0', 10),
        intentos_denegados: parseInt(summary?.intentos_denegados || '0', 10),
      },
      paginacion: {
        pagina,
        limite,
        paginas: Math.max(1, Math.ceil(total / limite)),
      },
    };
  } catch (err: any) {
    if (err?.code === '42P01') {
      return queryMemoryLogs(filters);
    }
    throw err;
  }
}

export function setMemoryLogsModeForTest(enabled: boolean) {
  forceMemoryLogsForTest = enabled;
}

export function clearMemoryLogsForTest(forceMemory = false) {
  forceMemoryLogsForTest = forceMemory;
  memoryLogs.length = 0;
  memoryLogSeq = 1;
}
