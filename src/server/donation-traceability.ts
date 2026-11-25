import type {
  DonacionCategoriaEspecie,
  DonacionEstadoEntrega,
  DonacionModalidadEntrega,
  DonacionTipo,
  DonanteTipo,
  EntregaEstado,
  OfferDonationPayload,
  ReceptorTipo,
  RegisterDeliveryPayload,
} from '../types';

export const VALID_DONOR_TYPES: readonly DonanteTipo[] = [
  'persona',
  'empresa',
  'organizacion',
  'anonimo',
];

export const VALID_RECIPIENT_TYPES: readonly ReceptorTipo[] = [
  'proyecto',
  'organizacion',
  'comunidad',
  'persona',
];

export const VALID_DELIVERY_STATES: readonly EntregaEstado[] = [
  'programada',
  'en_camino',
  'entregada',
  'verificada',
];

export const VALID_DELIVERY_TRANSITIONS: Record<EntregaEstado, EntregaEstado[]> = {
  programada: ['programada', 'en_camino', 'entregada', 'verificada'],
  en_camino: ['en_camino', 'entregada', 'verificada'],
  entregada: ['entregada', 'verificada'],
  verificada: ['verificada'],
};

export const VALID_DONATION_MODALITIES: readonly DonacionModalidadEntrega[] = [
  'transferencia_qr',
  'entrega_centro_acopio',
  'recojo_domicilio',
  'coordinacion_directa',
];

export const VALID_IN_KIND_CATEGORIES: readonly DonacionCategoriaEspecie[] = [
  'alimentos',
  'ropa_abrigo',
  'utiles_escolares',
  'salud_higiene',
  'herramientas',
  'otros',
];

export function formatDonationCode(id: number | string): string {
  return `KIR-DON-${id}`;
}

export function formatDeliveryCode(id: number | string): string {
  return `KIR-ENT-${id}`;
}

export function normalizeDonorType(input?: string | null): DonanteTipo {
  const val = String(input || 'persona').trim().toLowerCase() as DonanteTipo;
  return VALID_DONOR_TYPES.includes(val) ? val : 'persona';
}

export function normalizeRecipientType(input?: string | null): ReceptorTipo {
  const val = String(input || 'comunidad').trim().toLowerCase() as ReceptorTipo;
  return VALID_RECIPIENT_TYPES.includes(val) ? val : 'comunidad';
}

export function normalizeDeliveryState(input?: string | null): EntregaEstado {
  const val = String(input || 'entregada').trim().toLowerCase() as EntregaEstado;
  return VALID_DELIVERY_STATES.includes(val) ? val : 'entregada';
}

export function normalizeDonationModality(
  input?: string | null,
  tipoDonacion: DonacionTipo | string = 'economica'
): DonacionModalidadEntrega {
  const val = String(input || '').trim().toLowerCase() as DonacionModalidadEntrega;
  if (VALID_DONATION_MODALITIES.includes(val)) {
    return val;
  }
  return tipoDonacion === 'economica' ? 'transferencia_qr' : 'entrega_centro_acopio';
}

export function normalizeInKindCategory(input?: string | null): DonacionCategoriaEspecie | null {
  if (!input || !String(input).trim()) return null;
  const val = String(input).trim().toLowerCase() as DonacionCategoriaEspecie;
  return VALID_IN_KIND_CATEGORIES.includes(val) ? val : 'otros';
}

export function canTransitionDeliveryState(
  currentState: EntregaEstado,
  nextState: EntregaEstado
): boolean {
  const allowed = VALID_DELIVERY_TRANSITIONS[currentState];
  if (!allowed) return false;
  return allowed.includes(nextState);
}

export interface DeliveryAmountSnapshot {
  estado: string;
  monto_entregado_bob?: number | string | null;
}

export function calculateDonationBalance(
  tipoDonacion: DonacionTipo | string,
  montoTotalBob: number | string | null | undefined,
  entregas: DeliveryAmountSnapshot[]
) {
  const totalBob =
    tipoDonacion === 'economica' ? Math.max(0, Number(montoTotalBob || 0)) : 0;

  let deliveredBob = 0;
  let completedCount = 0;
  let pendingCount = 0;

  for (const e of entregas) {
    const monto = Number(e.monto_entregado_bob || 0);
    if (Number.isFinite(monto) && monto > 0) {
      deliveredBob += monto;
    }
    if (e.estado === 'entregada' || e.estado === 'verificada') {
      completedCount += 1;
    } else {
      pendingCount += 1;
    }
  }

  const roundedTotal = Math.round(totalBob * 100) / 100;
  const roundedDelivered = Math.round(deliveredBob * 100) / 100;
  const availableBob =
    tipoDonacion === 'economica'
      ? Math.max(0, Math.round((roundedTotal - roundedDelivered) * 100) / 100)
      : 0;

  return {
    monto_total_bob: roundedTotal,
    monto_entregado_bob: roundedDelivered,
    saldo_disponible_bob: availableBob,
    entregas_completadas: completedCount,
    entregas_pendientes: pendingCount,
  };
}

export function deriveDonationDeliveryStatus(
  tipoDonacion: DonacionTipo | string,
  montoTotalBob: number | string | null | undefined,
  entregas: DeliveryAmountSnapshot[],
  currentStatus?: DonacionEstadoEntrega | string | null
): DonacionEstadoEntrega {
  if (!entregas.length) {
    return currentStatus === 'ofrecida' ? 'ofrecida' : 'recibida';
  }

  const balance = calculateDonationBalance(tipoDonacion, montoTotalBob, entregas);

  if (tipoDonacion === 'economica') {
    if (balance.entregas_completadas === 0 && balance.monto_entregado_bob <= 0) {
      return 'en_preparacion';
    }
    if (balance.saldo_disponible_bob > 0.009) {
      return balance.entregas_completadas > 0 || balance.monto_entregado_bob > 0
        ? 'entrega_parcial'
        : 'en_preparacion';
    }
    // Todo el monto comprometido/entregado; si hay pendientes por confirmar, es entrega_parcial / en_preparacion
    if (balance.entregas_pendientes > 0) {
      return balance.entregas_completadas > 0 ? 'entrega_parcial' : 'en_preparacion';
    }
    return 'entregada';
  }

  // Donación en especie
  if (balance.entregas_completadas > 0 && balance.entregas_pendientes === 0) {
    return 'entregada';
  }
  if (balance.entregas_completadas > 0 && balance.entregas_pendientes > 0) {
    return 'entrega_parcial';
  }
  return 'en_preparacion';
}

export function validateDeliveryRegistration(
  donacion: { tipo_donacion: DonacionTipo | string; monto_bob?: number | string | null },
  existingEntregas: DeliveryAmountSnapshot[],
  payload: Partial<RegisterDeliveryPayload>
): { ok: true; estado: EntregaEstado; monto_entregado_bob: number | null } | { ok: false; error: string } {
  const hasReceptorId =
    payload.receptor_id !== undefined &&
    payload.receptor_id !== null &&
    String(payload.receptor_id).trim() !== '';

  const receptorNombre = typeof payload.receptor_nombre === 'string' ? payload.receptor_nombre.trim() : '';

  if (!hasReceptorId && receptorNombre.length < 2) {
    return {
      ok: false,
      error: 'Debe seleccionar un receptor existente o ingresar el nombre del receptor (mínimo 2 caracteres)',
    };
  }

  const responsable =
    typeof payload.responsable_entrega === 'string' ? payload.responsable_entrega.trim() : '';
  const recibidoPor =
    typeof payload.recibido_por_receptor === 'string' ? payload.recibido_por_receptor.trim() : '';

  if (responsable.length < 2) {
    return { ok: false, error: 'El nombre del responsable de entrega es obligatorio' };
  }
  if (recibidoPor.length < 2) {
    return {
      ok: false,
      error: 'Debe indicar el nombre de la persona que recibe en nombre del receptor',
    };
  }

  const requestedState = payload.estado ? String(payload.estado).trim().toLowerCase() : 'entregada';
  if (!VALID_DELIVERY_STATES.includes(requestedState as EntregaEstado)) {
    return {
      ok: false,
      error: 'Estado de entrega inválido (use: programada, en_camino, entregada o verificada)',
    };
  }
  const estado = requestedState as EntregaEstado;

  if (donacion.tipo_donacion === 'economica') {
    const monto = Number(payload.monto_entregado_bob);
    if (!Number.isFinite(monto) || monto <= 0) {
      return {
        ok: false,
        error: 'Para donaciones económicas debe indicar un monto entregado mayor a 0 Bs.',
      };
    }

    const balance = calculateDonationBalance(
      donacion.tipo_donacion,
      donacion.monto_bob,
      existingEntregas
    );
    if (monto > balance.saldo_disponible_bob + 0.009) {
      return {
        ok: false,
        error: `El monto a entregar (${monto.toFixed(2)} Bs.) supera el saldo disponible (${balance.saldo_disponible_bob.toFixed(2)} Bs.)`,
      };
    }

    return {
      ok: true,
      estado,
      monto_entregado_bob: Math.round(monto * 100) / 100,
    };
  }

  // Donación en especie
  const detalleBienes =
    typeof payload.detalle_bienes_entregados === 'string'
      ? payload.detalle_bienes_entregados.trim()
      : '';
  if (detalleBienes.length < 3) {
    return {
      ok: false,
      error: 'Para donaciones en especie debe detallar los bienes entregados al receptor',
    };
  }

  return {
    ok: true,
    estado,
    monto_entregado_bob: null,
  };
}

export interface ValidatedOfferedDonation {
  donante_nombre: string;
  donante_tipo: DonanteTipo;
  donante_documento: string | null;
  donante_email: string | null;
  donante_telefono: string | null;
  donante_ciudad: string | null;
  tipo_donacion: DonacionTipo;
  monto_bob: number | null;
  descripcion_especie: string | null;
  categoria_especie: DonacionCategoriaEspecie | null;
  cantidad_especie: number | null;
  proyecto_destino_id: number | null;
  modalidad_entrega: DonacionModalidadEntrega;
  fecha_disponible_estimada: string | null;
  direccion_recojo: string | null;
  notas_donante: string | null;
}

export function validateOfferedDonation(
  payload: Partial<OfferDonationPayload>,
  todayYmd?: string
): { ok: true; data: ValidatedOfferedDonation } | { ok: false; error: string } {
  const donanteTipo = normalizeDonorType(payload.donante_tipo);
  const rawNombre = typeof payload.donante_nombre === 'string' ? payload.donante_nombre.trim() : '';

  const donanteNombre =
    donanteTipo === 'anonimo' && rawNombre.length === 0 ? 'Donante Anónimo' : rawNombre;

  if (donanteNombre.length < 2) {
    return {
      ok: false,
      error: 'El nombre o razón social del donante es obligatorio (mínimo 2 caracteres)',
    };
  }

  const email =
    typeof payload.donante_email === 'string' && payload.donante_email.trim()
      ? payload.donante_email.trim().toLowerCase()
      : null;

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      ok: false,
      error: 'El correo electrónico del donante no tiene un formato válido',
    };
  }

  const telefono =
    typeof payload.donante_telefono === 'string' && payload.donante_telefono.trim()
      ? payload.donante_telefono.trim()
      : null;

  if (donanteTipo !== 'anonimo' && !email && !telefono) {
    return {
      ok: false,
      error: 'Debe ingresar un correo electrónico o teléfono de contacto para coordinar la donación',
    };
  }

  const tipoDonacion = String(payload.tipo_donacion || '').trim().toLowerCase();
  if (tipoDonacion !== 'economica' && tipoDonacion !== 'especie') {
    return {
      ok: false,
      error: 'El tipo de donación debe ser economica o especie',
    };
  }

  let montoBob: number | null = null;
  let descripcionEspecie: string | null = null;
  let categoriaEspecie: DonacionCategoriaEspecie | null = null;
  let cantidadEspecie: number | null = null;

  if (tipoDonacion === 'economica') {
    const monto = Number(payload.monto_bob);
    if (!Number.isFinite(monto) || monto <= 0) {
      return {
        ok: false,
        error: 'Para donaciones económicas debe indicar un monto ofrecido mayor a 0 Bs.',
      };
    }
    montoBob = Math.round(monto * 100) / 100;
  } else {
    const desc =
      typeof payload.descripcion_especie === 'string' ? payload.descripcion_especie.trim() : '';
    if (desc.length < 3) {
      return {
        ok: false,
        error: 'Debe describir los bienes ofrecidos en especie (mínimo 3 caracteres)',
      };
    }
    descripcionEspecie = desc;
    categoriaEspecie = normalizeInKindCategory(payload.categoria_especie) || 'otros';

    if (
      payload.cantidad_especie !== undefined &&
      payload.cantidad_especie !== null &&
      String(payload.cantidad_especie).trim() !== ''
    ) {
      const cant = Number(payload.cantidad_especie);
      if (!Number.isInteger(cant) || cant <= 0) {
        return {
          ok: false,
          error: 'La cantidad estimada de bienes en especie debe ser un número entero positivo',
        };
      }
      cantidadEspecie = cant;
    }
  }

  const rawModality = payload.modalidad_entrega
    ? String(payload.modalidad_entrega).trim().toLowerCase()
    : '';
  if (rawModality && !VALID_DONATION_MODALITIES.includes(rawModality as DonacionModalidadEntrega)) {
    return {
      ok: false,
      error:
        'Modalidad de entrega inválida (use: transferencia_qr, entrega_centro_acopio, recojo_domicilio o coordinacion_directa)',
    };
  }
  const modalidadEntrega = normalizeDonationModality(rawModality, tipoDonacion);

  const direccionRecojo =
    typeof payload.direccion_recojo === 'string' && payload.direccion_recojo.trim()
      ? payload.direccion_recojo.trim()
      : null;

  if (modalidadEntrega === 'recojo_domicilio' && (!direccionRecojo || direccionRecojo.length < 5)) {
    return {
      ok: false,
      error: 'Para solicitar recojo a domicilio debe ingresar la dirección completa (mínimo 5 caracteres)',
    };
  }

  let fechaDisponible: string | null = null;
  if (typeof payload.fecha_disponible_estimada === 'string' && payload.fecha_disponible_estimada.trim()) {
    const rawDate = payload.fecha_disponible_estimada.trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      return {
        ok: false,
        error: 'La fecha disponible estimada debe tener formato YYYY-MM-DD',
      };
    }
    const parsed = new Date(`${rawDate}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      return {
        ok: false,
        error: 'La fecha disponible estimada no es válida',
      };
    }
    const now = new Date();
    const refToday =
      todayYmd ||
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (rawDate < refToday) {
      return {
        ok: false,
        error: 'La fecha disponible estimada no puede ser anterior a hoy',
      };
    }
    fechaDisponible = rawDate;
  }

  let proyectoDestinoId: number | null = null;
  if (
    payload.proyecto_destino_id !== undefined &&
    payload.proyecto_destino_id !== null &&
    String(payload.proyecto_destino_id).trim() !== ''
  ) {
    const pid = Number(payload.proyecto_destino_id);
    if (!Number.isInteger(pid) || pid <= 0) {
      return {
        ok: false,
        error: 'El proyecto destino seleccionado es inválido',
      };
    }
    proyectoDestinoId = pid;
  }

  const documento =
    typeof payload.donante_documento === 'string' && payload.donante_documento.trim()
      ? payload.donante_documento.trim()
      : null;
  const ciudad =
    typeof payload.donante_ciudad === 'string' && payload.donante_ciudad.trim()
      ? payload.donante_ciudad.trim()
      : null;
  const notas =
    typeof payload.notas_donante === 'string' && payload.notas_donante.trim()
      ? payload.notas_donante.trim()
      : null;

  return {
    ok: true,
    data: {
      donante_nombre: donanteNombre,
      donante_tipo: donanteTipo,
      donante_documento: documento,
      donante_email: email,
      donante_telefono: telefono,
      donante_ciudad: ciudad,
      tipo_donacion: tipoDonacion as DonacionTipo,
      monto_bob: montoBob,
      descripcion_especie: descripcionEspecie,
      categoria_especie: categoriaEspecie,
      cantidad_especie: cantidadEspecie,
      proyecto_destino_id: proyectoDestinoId,
      modalidad_entrega: modalidadEntrega,
      fecha_disponible_estimada: fechaDisponible,
      direccion_recojo: direccionRecojo,
      notas_donante: notas,
    },
  };
}

