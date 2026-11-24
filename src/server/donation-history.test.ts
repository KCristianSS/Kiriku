import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDonationHistoryConditions,
  parseDonationHistoryFilters,
  toDonationHistoryItem,
  type DonationHistoryFilters,
} from './donation-history';

test('normaliza filtros de historial y aplica paginación por defecto', () => {
  assert.deepEqual(parseDonationHistoryFilters({ q: '  útiles  ', tipo: 'ESPECIE' }), {
    valid: true,
    filters: {
      q: 'útiles',
      tipo: 'especie',
      proyecto_destino_id: undefined,
      fecha_desde: undefined,
      fecha_hasta: undefined,
      pagina: 1,
      limite: 20,
    },
  });
});

test('rechaza filtros inválidos de tipo, proyecto, fechas y paginación', () => {
  assert.equal(parseDonationHistoryFilters({ tipo: 'servicio' }).valid, false);
  assert.equal(parseDonationHistoryFilters({ proyecto_destino_id: '-2' }).valid, false);
  assert.equal(parseDonationHistoryFilters({ fecha_desde: '2026-02-31' }).valid, false);
  assert.equal(parseDonationHistoryFilters({ fecha_desde: '2026-12-10', fecha_hasta: '2026-12-01' }).valid, false);
  assert.equal(parseDonationHistoryFilters({ pagina: 0 }).valid, false);
  assert.equal(parseDonationHistoryFilters({ limite: 51 }).valid, false);
  assert.equal(parseDonationHistoryFilters({ tipo: ['especie'] }).valid, false);
  assert.equal(parseDonationHistoryFilters({ q: ['Ana'] }).valid, false);
});

test('genera condiciones parametrizadas para búsqueda, tipo, proyecto y rango inclusivo', () => {
  const filters: DonationHistoryFilters = {
    q: 'Ana',
    tipo: 'economica',
    proyecto_destino_id: 12,
    fecha_desde: '2026-11-01',
    fecha_hasta: '2026-11-30',
    pagina: 2,
    limite: 10,
  };
  const result = buildDonationHistoryConditions(filters);
  assert.equal(result.params.length, 5);
  assert.deepEqual(result.params, ['economica', 12, '2026-11-01', '2026-11-30', '%Ana%']);
  assert.match(result.whereSql, /d\.fecha_recepcion < \(\$4::date \+ INTERVAL '1 day'\)/);
  assert.match(result.whereSql, /d\.donante_nombre ILIKE \$5/);
});

test('retorna datos de trazabilidad sin exponer el correo del donante', () => {
  const historyItem = toDonationHistoryItem({
    id: 8,
    donante_nombre: 'Ana Pérez',
    tipo_donacion: 'economica',
    monto_bob: '250.50',
    descripcion_especie: null,
    fecha_recepcion: '2026-11-20T10:00:00.000Z',
    recibido_por: 'Equipo Kirikú',
    proyecto_destino_id: 4,
    proyecto_titulo: 'Huerto comunitario',
    proyecto_ubicacion: 'La Paz',
  });
  assert.deepEqual(historyItem.proyecto, { id: 4, titulo: 'Huerto comunitario', ubicacion: 'La Paz' });
  assert.equal(historyItem.monto_bob, 250.5);
  assert.equal('donante_email' in historyItem, false);
});
