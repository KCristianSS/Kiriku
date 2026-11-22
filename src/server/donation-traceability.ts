import type {
  DonacionEstadoEntrega,
  DonacionTipo,
  DonanteTipo,
  EntregaEstado,
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
  entregas: DeliveryAmountSnapshot[]
): DonacionEstadoEntrega {
  if (!entregas.length) {
    return 'recibida';
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
