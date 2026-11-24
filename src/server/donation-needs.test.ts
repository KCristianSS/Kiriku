import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeRecipientEmail, validateDonationNeedRequest } from './donation-needs';

const baseRequest = {
  receptor_nombre: 'Ana Pérez',
  receptor_email: 'ANA@ejemplo.org ',
  receptor_telefono: '+591 70000000',
  tipo_necesidad: 'especie',
  titulo: 'Material escolar',
  descripcion: 'Cuadernos y lápices para el centro comunitario.',
};

test('acepta una solicitud de donación en especie válida', () => {
  assert.deepEqual(validateDonationNeedRequest({
    ...baseRequest,
    cantidad_objetivo: 25,
    unidad_medida: 'kits',
    fecha_necesaria: '2026-12-15',
    proyecto_destino_id: '2',
  }), { valid: true });
});

test('acepta una solicitud económica con un monto positivo', () => {
  assert.deepEqual(validateDonationNeedRequest({
    ...baseRequest,
    tipo_necesidad: 'economica',
    monto_objetivo: '1250.50',
  }), { valid: true });
});

test('rechaza datos requeridos incompletos, correos inválidos y tipos desconocidos', () => {
  assert.equal(validateDonationNeedRequest({ ...baseRequest, receptor_nombre: ' ' }).valid, false);
  assert.equal(validateDonationNeedRequest({ ...baseRequest, receptor_email: 'correo-invalido' }).valid, false);
  assert.equal(validateDonationNeedRequest({ ...baseRequest, tipo_necesidad: 'servicio' }).valid, false);
});

test('rechaza montos o cantidades no positivos y fechas inválidas', () => {
  assert.equal(validateDonationNeedRequest({ ...baseRequest, tipo_necesidad: 'economica', monto_objetivo: 0 }).valid, false);
  assert.equal(validateDonationNeedRequest({ ...baseRequest, cantidad_objetivo: -2 }).valid, false);
  assert.equal(validateDonationNeedRequest({ ...baseRequest, fecha_necesaria: '2026-02-31' }).valid, false);
  assert.equal(validateDonationNeedRequest({ ...baseRequest, proyecto_destino_id: '-1' }).valid, false);
});

test('normaliza el correo del receptor para evitar duplicados por mayúsculas o espacios', () => {
  assert.equal(normalizeRecipientEmail('  Ana@Ejemplo.org '), 'ana@ejemplo.org');
});
