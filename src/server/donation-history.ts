export interface DonationHistoryFilters {
  q?: string;
  tipo?: 'economica' | 'especie';
  proyecto_destino_id?: number;
  fecha_desde?: string;
  fecha_hasta?: string;
  pagina: number;
  limite: number;
}

export interface DonationHistoryRow {
  id: number | string;
  donante_nombre: string;
  tipo_donacion: 'economica' | 'especie';
  monto_bob?: number | string | null;
  descripcion_especie?: string | null;
  proyecto_destino_id?: number | string | null;
  proyecto_titulo?: string | null;
  proyecto_ubicacion?: string | null;
  recibido_por: string;
  fecha_recepcion: string;
}

export function isValidCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
}

export function parseDonationHistoryFilters(value: Record<string, unknown>):
  | { valid: true; filters: DonationHistoryFilters }
  | { valid: false; error: string } {
  if (value.tipo != null && typeof value.tipo !== 'string') {
    return { valid: false, error: 'El tipo de donación debe ser un texto válido' };
  }
  const rawType = typeof value.tipo === 'string' ? value.tipo.trim().toLowerCase() : '';
  if (rawType && rawType !== 'economica' && rawType !== 'especie') {
    return { valid: false, error: 'El tipo de donación debe ser económica o en especie' };
  }

  const rawProject = value.proyecto_destino_id;
  if (rawProject != null && rawProject !== '' && typeof rawProject !== 'string' && typeof rawProject !== 'number') {
    return { valid: false, error: 'El proyecto seleccionado no es válido' };
  }
  const projectId = rawProject == null || rawProject === '' ? undefined : Number(rawProject);
  if (projectId !== undefined && (!Number.isInteger(projectId) || projectId <= 0)) {
    return { valid: false, error: 'El proyecto seleccionado no es válido' };
  }

  const rawFrom = typeof value.fecha_desde === 'string' && value.fecha_desde.trim() ? value.fecha_desde.trim() : undefined;
  const rawTo = typeof value.fecha_hasta === 'string' && value.fecha_hasta.trim() ? value.fecha_hasta.trim() : undefined;
  if ((value.fecha_desde != null && value.fecha_desde !== '' && typeof value.fecha_desde !== 'string') ||
      (value.fecha_hasta != null && value.fecha_hasta !== '' && typeof value.fecha_hasta !== 'string')) {
    return { valid: false, error: 'Las fechas deben tener el formato AAAA-MM-DD' };
  }
  if ((rawFrom && !isValidCalendarDate(rawFrom)) || (rawTo && !isValidCalendarDate(rawTo))) {
    return { valid: false, error: 'Las fechas deben tener el formato AAAA-MM-DD' };
  }
  if (rawFrom && rawTo && rawFrom > rawTo) {
    return { valid: false, error: 'La fecha inicial no puede ser posterior a la fecha final' };
  }

  if ((value.pagina != null && value.pagina !== '' && typeof value.pagina !== 'string' && typeof value.pagina !== 'number') ||
      (value.limite != null && value.limite !== '' && typeof value.limite !== 'string' && typeof value.limite !== 'number')) {
    return { valid: false, error: 'La paginación no es válida' };
  }
  const page = value.pagina == null || value.pagina === '' ? 1 : Number(value.pagina);
  const pageSize = value.limite == null || value.limite === '' ? 20 : Number(value.limite);
  if (!Number.isInteger(page) || page < 1) {
    return { valid: false, error: 'El número de página debe ser mayor a cero' };
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    return { valid: false, error: 'El límite debe estar entre 1 y 50 registros' };
  }

  if (value.q != null && typeof value.q !== 'string') {
    return { valid: false, error: 'El texto de búsqueda debe ser válido' };
  }
  const q = typeof value.q === 'string' ? value.q.trim() : '';
  if (q.length > 120) {
    return { valid: false, error: 'La búsqueda no puede superar 120 caracteres' };
  }

  return {
    valid: true,
    filters: {
      q: q || undefined,
      tipo: rawType ? rawType as DonationHistoryFilters['tipo'] : undefined,
      proyecto_destino_id: projectId,
      fecha_desde: rawFrom,
      fecha_hasta: rawTo,
      pagina: page,
      limite: pageSize,
    },
  };
}

export function buildDonationHistoryConditions(filters: DonationHistoryFilters) {
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  const add = (clause: (placeholder: string) => string, value: string | number) => {
    params.push(value);
    clauses.push(clause(`$${params.length}`));
  };

  if (filters.tipo) add((placeholder) => `d.tipo_donacion = ${placeholder}`, filters.tipo);
  if (filters.proyecto_destino_id) add((placeholder) => `d.proyecto_destino_id = ${placeholder}`, filters.proyecto_destino_id);
  if (filters.fecha_desde) add((placeholder) => `d.fecha_recepcion >= ${placeholder}::date`, filters.fecha_desde);
  if (filters.fecha_hasta) add((placeholder) => `d.fecha_recepcion < (${placeholder}::date + INTERVAL '1 day')`, filters.fecha_hasta);
  if (filters.q) {
    params.push(`%${filters.q}%`);
    const placeholder = `$${params.length}`;
    clauses.push(`(d.donante_nombre ILIKE ${placeholder} OR d.recibido_por ILIKE ${placeholder} OR p.titulo ILIKE ${placeholder})`);
  }

  return { whereSql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

export function toDonationHistoryItem(row: DonationHistoryRow) {
  return {
    id: row.id,
    donante_nombre: row.donante_nombre,
    tipo_donacion: row.tipo_donacion,
    monto_bob: row.tipo_donacion === 'economica' ? Number(row.monto_bob) : null,
    descripcion_especie: row.tipo_donacion === 'especie' ? row.descripcion_especie : null,
    fecha_recepcion: row.fecha_recepcion,
    recibido_por: row.recibido_por,
    proyecto: row.proyecto_destino_id
      ? {
          id: row.proyecto_destino_id,
          titulo: row.proyecto_titulo || 'Proyecto sin título',
          ubicacion: row.proyecto_ubicacion || '',
        }
      : null,
  };
}
