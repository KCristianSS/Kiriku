export type DonationNeedType = 'economica' | 'especie';

export interface DonationNeedRequest {
  receptor_nombre: string;
  receptor_email: string;
  receptor_telefono: string;
  receptor_organizacion?: string;
  tipo_necesidad: DonationNeedType;
  titulo: string;
  descripcion: string;
  monto_objetivo?: number | string | null;
  cantidad_objetivo?: number | string | null;
  unidad_medida?: string | null;
  fecha_necesaria?: string | null;
  proyecto_destino_id?: number | string | null;
}

export function validateDonationNeedRequest(value: unknown): { valid: true } | { valid: false; error: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { valid: false, error: 'Los datos de la solicitud no son válidos' };
  }

  const request = value as Record<string, unknown>;
  const requiredFields = [
    ['receptor_nombre', 'Ingrese el nombre de la persona receptora'],
    ['receptor_email', 'Ingrese el correo electrónico de contacto'],
    ['receptor_telefono', 'Ingrese un teléfono de contacto'],
    ['titulo', 'Ingrese un título para la necesidad'],
    ['descripcion', 'Describa la necesidad de donación'],
  ] as const;
  for (const [field, error] of requiredFields) {
    if (typeof request[field] !== 'string' || !request[field].trim()) {
      return { valid: false, error };
    }
  }

  const email = String(request.receptor_email).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { valid: false, error: 'Ingrese un correo electrónico válido' };
  }
  if (request.tipo_necesidad !== 'economica' && request.tipo_necesidad !== 'especie') {
    return { valid: false, error: 'Seleccione si la necesidad es económica o en especie' };
  }

  if (request.tipo_necesidad === 'economica') {
    const amount = Number(request.monto_objetivo);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { valid: false, error: 'Indique un monto objetivo mayor a cero en Bs.' };
    }
  }

  if (request.tipo_necesidad === 'especie' && request.cantidad_objetivo != null && request.cantidad_objetivo !== '') {
    const quantity = Number(request.cantidad_objetivo);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { valid: false, error: 'La cantidad solicitada debe ser mayor a cero' };
    }
  }

  if (request.fecha_necesaria) {
    const dateText = String(request.fecha_necesaria);
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
    const date = match
      ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
      : null;
    if (!match || !date || date.toISOString().slice(0, 10) !== dateText) {
      return { valid: false, error: 'La fecha requerida debe ser una fecha válida con formato AAAA-MM-DD' };
    }
  }

  if (request.proyecto_destino_id != null && request.proyecto_destino_id !== '') {
    const projectId = Number(request.proyecto_destino_id);
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return { valid: false, error: 'Seleccione un proyecto válido' };
    }
  }

  return { valid: true };
}

export function normalizeRecipientEmail(email: string): string {
  return email.trim().toLowerCase();
}
