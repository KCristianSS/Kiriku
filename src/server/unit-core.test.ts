import assert from 'node:assert/strict';
import test, { describe, it } from 'node:test';
import {
  buildProcessProgress,
  calculateAge,
  enrichStagesForTracking,
  ETAPAS_PROCESO_DEFINICION,
  EVALUATION_SORT_OPTIONS,
  extractEvaluationScore,
  filterAndSortEvaluationItems,
  normalizeEtapaEstado,
} from './api';
import {
  authenticate,
  requirePermission,
  signAuthToken,
  verifyAuthToken,
  type AuthenticatedRequest,
} from './authorization';
import {
  calculateDonationBalance,
  canTransitionDeliveryState,
  deriveDonationDeliveryStatus,
  formatDeliveryCode,
  formatDonationCode,
  normalizeDeliveryState,
  normalizeDonorType,
  normalizeRecipientType,
  validateDeliveryRegistration,
} from './donation-traceability';
import { CacheService } from './cache';
import { normalizeCategoryFilter, normalizeSortOrder, PROJECT_SORT_OPTIONS } from './catalog-filters';
import { clearMemoryLogsForTest, querySystemLogs, setMemoryLogsModeForTest } from './audit-logs';
import { shouldUseSsl } from './supabase';
import { swaggerSpec } from './swagger';

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function createMockRes() {
  const state: { statusCode: number; body: any } = { statusCode: 200, body: null };
  const res: any = {
    status(code: number) {
      state.statusCode = code;
      return this;
    },
    json(payload: any) {
      state.body = payload;
      return this;
    },
  };
  return { res, state };
}

describe('Pruebas unitarias de funciones principales del sistema Kirikú', () => {
  describe('calculateAge (KIR-17: Validación real de mayoría de edad)', () => {
    it('calcula exactamente 17, 18 hoy, 17 si cumple mañana y soporta Date/ISO', () => {
      const today = new Date();
      const b17 = formatYmd(new Date(today.getFullYear() - 17, today.getMonth(), today.getDate()));
      const b18Today = formatYmd(new Date(today.getFullYear() - 18, today.getMonth(), today.getDate()));
      const b18Tomorrow = formatYmd(new Date(today.getFullYear() - 18, today.getMonth(), today.getDate() + 1));

      assert.equal(calculateAge(b17), 17);
      assert.equal(calculateAge(b18Today), 18);
      assert.equal(calculateAge(b18Tomorrow), 17);
      assert.equal(calculateAge(`${b18Today}T14:30:00.000Z`), 18);
      assert.ok(calculateAge(new Date(Date.UTC(today.getUTCFullYear() - 25, 0, 1))) >= 24);
    });
  });

  describe('Seguimiento de etapas y avance porcentual (KIR-29)', () => {
    it('normalizeEtapaEstado normaliza alias y valores desconocidos a pendiente', () => {
      assert.equal(normalizeEtapaEstado('aprobada'), 'aprobado');
      assert.equal(normalizeEtapaEstado('rechazada'), 'rechazado');
      assert.equal(normalizeEtapaEstado('observada'), 'observado');
      assert.equal(normalizeEtapaEstado('en revisión'), 'en_revision');
      assert.equal(normalizeEtapaEstado('en_curso'), 'en_revision');
      assert.equal(normalizeEtapaEstado(null), 'pendiente');
      assert.equal(normalizeEtapaEstado('desconocido'), 'pendiente');
    });

    it('enrichStagesForTracking completa las 5 etapas faltantes con registros virtuales ordenados', () => {
      const enriched = enrichStagesForTracking([{ etapa: 'inicial', estado: 'aprobada', evaluador: 'Admisiones' }]);
      assert.equal(enriched.length, ETAPAS_PROCESO_DEFINICION.length);
      assert.equal(enriched[0].etapa, 'inicial');
      assert.equal(enriched[0].estado, 'aprobado');
      assert.equal(enriched[1].id, 'virtual-tecnica');
      assert.equal(enriched[1].estado, 'pendiente');
      assert.equal(enriched[4].etapa, 'salud_fisica_psicologica');
    });

    it('buildProcessProgress prioriza estados rechazado > observado > reasignacion > aprobado > en_proceso', () => {
      const rejected = buildProcessProgress('en_proceso', [
        { etapa: 'inicial', estado: 'aprobado' },
        { etapa: 'tecnica', estado: 'rechazado', comentarios: 'No cumple perfil territorial' },
      ]);
      assert.equal(rejected.estado_visible.codigo, 'rechazado');
      assert.equal(rejected.etapa_actual?.codigo, 'tecnica');
      assert.equal(rejected.porcentaje, 20);
      assert.ok(rejected.siguiente_paso.includes('No cumple perfil territorial'));

      const reasignado = buildProcessProgress('reenganche', [
        { etapa: 'inicial', estado: 'aprobado' },
        { etapa: 'tecnica', estado: 'en_revision' },
      ]);
      assert.equal(reasignado.estado_visible.codigo, 'reasignacion');
      assert.equal(reasignado.porcentaje, 20);

      const observed = buildProcessProgress('en_proceso', [
        { etapa: 'inicial', estado: 'aprobado' },
        { etapa: 'tecnica', estado: 'aprobado' },
        { etapa: 'personal', estado: 'observado', comentarios: 'Confirmar disponibilidad' },
      ]);
      assert.equal(observed.porcentaje, 40);
      assert.equal(observed.requiere_atencion, true);
      assert.equal(observed.estado_visible.codigo, 'observado');
    });
  });

  describe('extractEvaluationScore y filterAndSortEvaluationItems', () => {
    it('extrae puntaje desde puntaje_promedio o texto de comentarios (/100 y /5)', () => {
      assert.equal(extractEvaluationScore({ puntaje_promedio: 4.4 }), 4.4);
      assert.equal(extractEvaluationScore({ comentarios: 'Índice de Bienestar: 92/100 | Riesgo: BAJO' }), 92);
      assert.equal(extractEvaluationScore({ comentarios: 'Promedio rúbrica: 4.2/5' }), 4.2);
      assert.equal(extractEvaluationScore({ comentarios: 'Sin calificación numérica' }), null);
    });

    it('filtra por profesión y rango numérico y ordena según EVALUATION_SORT_OPTIONS', () => {
      assert.deepEqual(EVALUATION_SORT_OPTIONS, ['recientes', 'nombre_asc', 'puntaje_desc', 'puntaje_asc']);

      const items = [
        {
          etapa_id: 1,
          puntaje_promedio: 72,
          postulante: { nombres: 'Carlos', apellidos: 'Zapata', profesion_ocupacion: 'Ingeniero Civil' },
        },
        {
          etapa_id: 2,
          puntaje_promedio: 95,
          postulante: { nombres: 'Ana', apellidos: 'Morales', profesion_ocupacion: 'Ingeniera Ambiental' },
        },
        {
          etapa_id: 3,
          puntaje_promedio: 84,
          postulante: { nombres: 'Beatriz', apellidos: 'Quispe', profesion_ocupacion: 'Médica General' },
        },
      ];

      const filteredIng = filterAndSortEvaluationItems(items, {
        categoria: 'Ingenier',
        puntajeMin: 70,
        puntajeMax: 96,
        ordenar: 'puntaje_desc',
      });
      assert.deepEqual(
        filteredIng.map((x) => x.etapa_id),
        [2, 1]
      );

      const sortedByName = filterAndSortEvaluationItems(items, { ordenar: 'nombre_asc' });
      assert.deepEqual(
        sortedByName.map((x) => x.etapa_id),
        [2, 3, 1]
      );

      const sortedAsc = filterAndSortEvaluationItems(items, { ordenar: 'puntaje_asc' });
      assert.deepEqual(
        sortedAsc.map((x) => x.etapa_id),
        [1, 3, 2]
      );
    });
  });

  describe('Trazabilidad y entregas de donaciones (donation-traceability)', () => {
    it('formatea códigos y normaliza tipos de donante, receptor y estado de entrega', () => {
      assert.equal(formatDonationCode(42), 'KIR-DON-42');
      assert.equal(formatDeliveryCode(9), 'KIR-ENT-9');
      assert.equal(normalizeDonorType('EMPRESA'), 'empresa');
      assert.equal(normalizeDonorType('otro_tipo'), 'persona');
      assert.equal(normalizeRecipientType('ORGANIZACION'), 'organizacion');
      assert.equal(normalizeRecipientType('invalido'), 'comunidad');
      assert.equal(normalizeDeliveryState('EN_CAMINO'), 'en_camino');
      assert.equal(normalizeDeliveryState('invalido'), 'entregada');
    });

    it('valida reglas de registro de entrega económica y en especie', () => {
      const missingReceptor = validateDeliveryRegistration(
        { tipo_donacion: 'economica', monto_bob: 500 },
        [],
        { responsable_entrega: 'Equipo', recibido_por_receptor: 'Ana', monto_entregado_bob: 100 }
      );
      assert.equal(missingReceptor.ok, false);

      const zeroAmount = validateDeliveryRegistration(
        { tipo_donacion: 'economica', monto_bob: 500 },
        [],
        { receptor_nombre: 'Comunidad A', responsable_entrega: 'Equipo', recibido_por_receptor: 'Ana', monto_entregado_bob: 0 }
      );
      assert.equal(zeroAmount.ok, false);

      const validEcon = validateDeliveryRegistration(
        { tipo_donacion: 'economica', monto_bob: 500 },
        [{ estado: 'entregada', monto_entregado_bob: 200 }],
        {
          receptor_nombre: 'Comunidad A',
          responsable_entrega: 'Equipo Kirikú',
          recibido_por_receptor: 'Ana Pérez',
          monto_entregado_bob: 150.555,
          estado: 'en_camino',
        }
      );
      assert.deepEqual(validEcon, { ok: true, estado: 'en_camino', monto_entregado_bob: 150.56 });

      const missingInKindDetail = validateDeliveryRegistration(
        { tipo_donacion: 'especie' },
        [],
        { receptor_nombre: 'Comunidad A', responsable_entrega: 'Equipo', recibido_por_receptor: 'Ana' }
      );
      assert.equal(missingInKindDetail.ok, false);

      const validInKind = validateDeliveryRegistration(
        { tipo_donacion: 'especie' },
        [],
        {
          receptor_id: 3,
          responsable_entrega: 'Equipo Kirikú',
          recibido_por_receptor: 'Ana Pérez',
          detalle_bienes_entregados: '10 cajas de víveres',
        }
      );
      assert.deepEqual(validInKind, { ok: true, estado: 'entregada', monto_entregado_bob: null });
    });

    it('calcula saldos y deriva estados para donaciones económicas y en especie', () => {
      const bal = calculateDonationBalance('economica', 1000, [
        { estado: 'programada', monto_entregado_bob: 400 },
        { estado: 'entregada', monto_entregado_bob: 600 },
      ]);
      assert.equal(bal.monto_total_bob, 1000);
      assert.equal(bal.monto_entregado_bob, 1000);
      assert.equal(bal.saldo_disponible_bob, 0);
      assert.equal(bal.entregas_completadas, 1);
      assert.equal(bal.entregas_pendientes, 1);

      assert.equal(
        deriveDonationDeliveryStatus('economica', 1000, [
          { estado: 'programada', monto_entregado_bob: 400 },
          { estado: 'entregada', monto_entregado_bob: 600 },
        ]),
        'entrega_parcial'
      );
      assert.equal(deriveDonationDeliveryStatus('especie', null, [{ estado: 'programada' }]), 'en_preparacion');
      assert.equal(
        deriveDonationDeliveryStatus('especie', null, [{ estado: 'entregada' }, { estado: 'en_camino' }]),
        'entrega_parcial'
      );
      assert.equal(deriveDonationDeliveryStatus('especie', null, [{ estado: 'verificada' }]), 'entregada');

      assert.equal(canTransitionDeliveryState('programada', 'verificada'), true);
      assert.equal(canTransitionDeliveryState('en_camino', 'programada'), false);
    });
  });

  describe('Autenticación JWT, RBAC y SSL PostgreSQL', () => {
    it('verifyAuthToken rechaza tokens expirados y malformados', () => {
      const expired = signAuthToken({ sub: 'u-1', email: 'a@kiriku.org', rol: 'administrador' }, -10);
      assert.equal(verifyAuthToken(expired), null);
      assert.equal(verifyAuthToken('invalid.token'), null);
      assert.equal(verifyAuthToken('a.b.c'), null);
    });

    it('authenticate acepta dev-admin-token con permisos completos y requirePermission registra PERMISSION_DENIED', async () => {
      clearMemoryLogsForTest(true);
      try {
        const req = { headers: { authorization: 'Bearer dev-admin-token' } } as AuthenticatedRequest;
        const { res } = createMockRes();
        let nextCalled = false;
        await authenticate(req, res, () => {
          nextCalled = true;
        });
        assert.equal(nextCalled, true);
        assert.equal(req.userRole, 'administrador');
        assert.ok(req.permissions?.includes('reports.export'));
        assert.ok(req.permissions?.includes('audit.read'));

        let deniedNext = false;
        const guard = requirePermission('roles.manage');
        const unprivReq = {
          userId: 'u-eval',
          userEmail: 'eval@kiriku.org',
          userRole: 'evaluador',
          permissions: ['applications.read'],
          params: {},
          path: '/roles',
        } as unknown as AuthenticatedRequest;
        const unprivRes = createMockRes();
        guard(unprivReq, unprivRes.res, () => {
          deniedNext = true;
        });
        assert.equal(deniedNext, false);
        assert.equal(unprivRes.state.statusCode, 403);

        await new Promise((r) => setTimeout(r, 15));
        const logs = await querySystemLogs({ action: 'PERMISSION_DENIED' });
        assert.equal(logs.items.length, 1);
        assert.equal(logs.items[0].module, 'roles');
      } finally {
        setMemoryLogsModeForTest(false);
      }
    });

    it('shouldUseSsl desactiva SSL en hosts Docker/locales y lo activa en hosts remotos/Supabase', () => {
      assert.equal(shouldUseSsl('postgresql://postgres:pass@postgres:5432/kiriku', undefined), false);
      assert.equal(shouldUseSsl('postgresql://postgres:pass@localhost:5432/kiriku', undefined), false);
      assert.equal(shouldUseSsl('postgresql://postgres:pass@127.0.0.1:5432/kiriku', undefined), false);
      assert.equal(shouldUseSsl('postgresql://user:pass@aws-0-us-west-2.pooler.supabase.com:5432/postgres?sslmode=disable', undefined), false);
      assert.equal(shouldUseSsl('postgresql://user:pass@aws-0-us-west-2.pooler.supabase.com:5432/postgres', undefined), true);
      assert.equal(shouldUseSsl('postgresql://postgres:pass@postgres:5432/kiriku', 'true'), true);
      assert.equal(shouldUseSsl('postgresql://user:pass@aws-0-us-west-2.pooler.supabase.com:5432/postgres', 'false'), false);
    });
  });

  describe('Filtros, Caché TTL y Especificación OpenAPI', () => {
    it('normalizeCategoryFilter y normalizeSortOrder aplican valores por defecto seguros', () => {
      assert.equal(normalizeCategoryFilter('Todas'), '');
      assert.equal(normalizeCategoryFilter('  todos '), '');
      assert.equal(normalizeCategoryFilter(' ONG '), 'ONG');
      assert.equal(normalizeSortOrder('no_existe', PROJECT_SORT_OPTIONS, 'recientes'), 'recientes');
      assert.equal(normalizeSortOrder('cupos_desc', PROJECT_SORT_OPTIONS, 'recientes'), 'cupos_desc');
    });

    it('CacheService expira entradas al cumplirse el TTL y reinicia métricas con clear()', async () => {
      const origRedis = process.env.REDIS_URL;
      delete process.env.REDIS_URL;
      try {
        const cache = new CacheService();
        await cache.set('k:ttl', { ok: true }, 1);
        assert.deepEqual(await cache.get('k:ttl'), { ok: true });
        await new Promise((r) => setTimeout(r, 1050));
        assert.equal(await cache.get('k:ttl'), null);
        cache.clear();
        const stats = cache.getStats();
        assert.equal(stats.hits, 0);
        assert.equal(stats.misses, 0);
        assert.equal(stats.activeKeys, 0);
      } finally {
        if (origRedis !== undefined) process.env.REDIS_URL = origRedis;
      }
    });

    it('swaggerSpec define OpenAPI 3.0.0 y documenta rutas críticas del sistema', () => {
      assert.equal(swaggerSpec.openapi, '3.0.0');
      assert.ok(swaggerSpec.paths['/proyectos']);
      assert.ok(swaggerSpec.paths['/postulaciones']);
      assert.ok(swaggerSpec.paths['/donaciones']);
      assert.ok(swaggerSpec.paths['/exports/{modulo}']);
      assert.ok(swaggerSpec.paths['/logs']);
    });
  });
});
