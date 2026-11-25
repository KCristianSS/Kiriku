import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterAndSortDonations,
  filterAndSortProjects,
  normalizeCategoryFilter,
  normalizeSortOrder,
  PROJECT_SORT_OPTIONS,
  DONATION_SORT_OPTIONS,
  validateNumericRange,
  validatePriceRange,
  validateQuotaRange,
  validateScoreRange,
} from './catalog-filters';
import { CacheService, buildCacheKey } from './cache';

test('validatePriceRange rechaza rangos inválidos, negativos y no numéricos', () => {
  const negMin = validatePriceRange('-10', '100');
  assert.equal(negMin.ok, false);

  const negMax = validatePriceRange('0', -5);
  assert.equal(negMax.ok, false);

  const inverted = validatePriceRange('500', '100');
  assert.equal(inverted.ok, false);
  if (!inverted.ok) {
    assert.match(inverted.error, /mayor que el máximo/i);
  }

  const nonNumeric = validatePriceRange('abc', '200');
  assert.equal(nonNumeric.ok, false);

  const overLimit = validatePriceRange('10', '999999999');
  assert.equal(overLimit.ok, false);
});

test('validatePriceRange acepta rangos válidos abiertos y cerrados', () => {
  const empty = validatePriceRange(undefined, '');
  assert.deepEqual(empty, { ok: true, min: null, max: null });

  const minOnly = validatePriceRange('25.50', undefined);
  assert.deepEqual(minOnly, { ok: true, min: 25.5, max: null });

  const closed = validatePriceRange('0', '1500.75');
  assert.deepEqual(closed, { ok: true, min: 0, max: 1500.75 });
});

test('validateQuotaRange exige enteros no negativos y respeta límite de cupos', () => {
  const decimal = validateQuotaRange('2.5', '10');
  assert.equal(decimal.ok, false);

  const inverted = validateQuotaRange('12', '4');
  assert.equal(inverted.ok, false);

  const valid = validateQuotaRange('1', '25');
  assert.deepEqual(valid, { ok: true, min: 1, max: 25 });
});

test('validateScoreRange valida rangos porcentuales 0-100', () => {
  const above100 = validateScoreRange('10', '105', 100);
  assert.equal(above100.ok, false);

  const valid = validateScoreRange('60', '100', 100);
  assert.deepEqual(valid, { ok: true, min: 60, max: 100 });

  const generic = validateNumericRange('-50', '50', {
    fieldLabel: 'delta',
    allowNegative: true,
    minAllowed: -100,
    maxAllowed: 100,
  });
  assert.deepEqual(generic, { ok: true, min: -50, max: 50 });
});

test('filterAndSortProjects filtra por categoría, cupos, texto y mantiene ordenamiento', () => {
  const sampleProjects = [
    {
      id: 1,
      titulo: 'Reforestación Sama',
      descripcion: 'Siembra de árboles nativos',
      ubicacion: 'Tarija',
      cupos_disponibles: 15,
      organizacion_tipo: 'ONG',
      organizacion_nombre: 'Nativa',
      created_at: '2026-10-01T10:00:00Z',
    },
    {
      id: 2,
      titulo: 'Alfabetización Digital',
      descripcion: 'Talleres escolares',
      ubicacion: 'La Paz',
      cupos_disponibles: 40,
      organizacion_tipo: 'Fundación',
      organizacion_nombre: 'Aprender',
      created_at: '2026-10-05T10:00:00Z',
    },
    {
      id: 3,
      titulo: 'Brigada de Agua Limpia',
      descripcion: 'Filtros rurales',
      ubicacion: 'Cochabamba',
      cupos_disponibles: 8,
      organizacion_tipo: 'ONG',
      organizacion_nombre: 'Agua Viva',
      created_at: '2026-10-08T10:00:00Z',
    },
  ];

  const ongSortedAsc = filterAndSortProjects(sampleProjects, {
    categoria: 'ONG',
    cuposMin: 5,
    cuposMax: 20,
    ordenar: normalizeSortOrder('cupos_asc', PROJECT_SORT_OPTIONS, 'recientes'),
  });
  assert.deepEqual(
    ongSortedAsc.map((p) => p.id),
    [3, 1]
  );

  const searchTituloDesc = filterAndSortProjects(sampleProjects, {
    q: 'Agua',
    ordenar: 'titulo_desc',
  });
  assert.equal(searchTituloDesc.length, 1);
  assert.equal(searchTituloDesc[0].id, 3);
});

test('filterAndSortDonations filtra por categoría, rango de monto/precio y ordena correctamente', () => {
  const donations = [
    {
      id: 1,
      donante_nombre: 'Carlos Mendoza',
      tipo_donacion: 'monetaria',
      categoria_especie: null,
      monto_bob: 250,
      estado_entrega: 'verificada',
      fecha_recepcion: '2026-11-01T10:00:00Z',
      codigo_donacion: 'DON-001',
    },
    {
      id: 2,
      donante_nombre: 'Ana Quispe',
      tipo_donacion: 'monetaria',
      categoria_especie: null,
      monto_bob: 800,
      estado_entrega: 'verificada',
      fecha_recepcion: '2026-11-03T10:00:00Z',
      codigo_donacion: 'DON-002',
    },
    {
      id: 3,
      donante_nombre: 'Belen Torrez',
      tipo_donacion: 'especie',
      categoria_especie: 'Salud',
      monto_bob: 120,
      estado_entrega: 'recibida',
      fecha_recepcion: '2026-11-04T10:00:00Z',
      codigo_donacion: 'DON-003',
    },
  ];

  const byPriceRange = filterAndSortDonations(donations, {
    montoMin: 200,
    montoMax: 900,
    ordenar: normalizeSortOrder('monto_desc', DONATION_SORT_OPTIONS, 'recientes'),
  });
  assert.deepEqual(
    byPriceRange.map((d) => d.id),
    [2, 1]
  );

  const byCategory = filterAndSortDonations(donations, {
    categoria: normalizeCategoryFilter('Salud'),
    ordenar: 'donante_asc',
  });
  assert.equal(byCategory.length, 1);
  assert.equal(byCategory[0].codigo_donacion, 'DON-003');
});

test('CacheService maneja claves determinísticas, HIT/MISS, expiración TTL e invalidación por prefijo', async () => {
  const originalRedisUrl = process.env.REDIS_URL;
  delete process.env.REDIS_URL;

  try {
    const cache = new CacheService();
    const key1 = buildCacheKey('proyectos:list', { ordenar: 'cupos_desc', categoria: 'ONG', q: '' });
    const key2 = buildCacheKey('proyectos:list', { categoria: 'ONG', ordenar: 'cupos_desc', q: undefined });
    assert.equal(key1, key2);

    assert.equal(await cache.get(key1), null);
    await cache.set(key1, [{ id: 10 }], 60);
    const cached = await cache.get<Array<{ id: number }>>(key1);
    assert.deepEqual(cached, [{ id: 10 }]);

    const otherKey = buildCacheKey('donaciones:list', { tipo: 'monetaria' });
    await cache.set(otherKey, [{ id: 99 }], 60);

    const removed = await cache.delByPrefix('proyectos:');
    assert.equal(removed, 1);
    assert.equal(await cache.get(key1), null);
    assert.deepEqual(await cache.get(otherKey), [{ id: 99 }]);

    const stats = cache.getStats();
    assert.equal(stats.backend, 'memory');
    assert.equal(stats.hits, 2);
    assert.equal(stats.misses, 2);
    assert.equal(stats.invalidations, 1);
  } finally {
    if (originalRedisUrl !== undefined) {
      process.env.REDIS_URL = originalRedisUrl;
    }
  }
});
