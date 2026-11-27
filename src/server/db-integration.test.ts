import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import express from 'express';
import { api, apiClient } from '../api/client';
import apiRouter from './api';
import { dbPool, query } from './supabase';

describe('Pruebas de integración real Frontend ↔ Backend ↔ PostgreSQL (Conexión, Consulta, Registro, Actualización y Detección de Errores)', () => {
  let server: http.Server;
  let baseRootUrl = '';
  let originalBaseUrl: string | undefined;
  let originalLocalStorage: Storage | undefined;
  const memoryStorage = new Map<string, string>();

  before(async () => {
    originalBaseUrl = apiClient.defaults.baseURL;
    originalLocalStorage = (globalThis as any).localStorage;
    (globalThis as any).localStorage = {
      getItem: (k: string) => memoryStorage.get(k) ?? null,
      setItem: (k: string, v: string) => {
        memoryStorage.set(k, v);
      },
      removeItem: (k: string) => {
        memoryStorage.delete(k);
      },
      clear: () => {
        memoryStorage.clear();
      },
      key: (i: number) => Array.from(memoryStorage.keys())[i] ?? null,
      get length() {
        return memoryStorage.size;
      },
    };

    const app = express();
    app.use(express.json());
    app.use('/api', apiRouter);

    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const { port } = server.address() as AddressInfo;
    baseRootUrl = `http://127.0.0.1:${port}`;
    apiClient.defaults.baseURL = `${baseRootUrl}/api`;
  });

  after(async () => {
    apiClient.defaults.baseURL = originalBaseUrl;
    if (originalLocalStorage === undefined) {
      delete (globalThis as any).localStorage;
    } else {
      (globalThis as any).localStorage = originalLocalStorage;
    }
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await dbPool.end();
  });

  it('1. Conexión real con PostgreSQL (SELECT 1 y GET /api/health)', async () => {
    const dbCheck = await query<{ ok: number }>('SELECT 1 AS ok');
    assert.equal(dbCheck[0].ok, 1);

    const healthRes = await fetch(`${baseRootUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    const healthJson = (await healthRes.json()) as any;
    assert.equal(healthJson.status, 'ok');
    assert.equal(healthJson.database, 'connected');
  });

  it('2. Flujo completo Consulta → Registro → Actualización → Auditoría y Detección de Errores en PostgreSQL vía Frontend apiClient', async () => {
    memoryStorage.set('kiriku_admin_token', 'dev-admin-token');

    const stamp = Date.now();
    let orgId: number | null = null;
    let proyectoId: number | null = null;
    let postulanteId: number | null = null;
    let postulacionId: number | null = null;
    let donacionId: number | null = null;
    let donanteId: number | null = null;

    try {
      // A. REGISTRO DE ORGANIZACIÓN (POST /api/organizaciones -> INSERT INTO organizaciones)
      const org = await api.createOrganizacion({
        nombre: `Org Integración ${stamp}`,
        tipo: 'ONG',
        contacto_nombre: 'Lucía Fernández',
        contacto_email: `org.${stamp}@kiriku.test`,
        contacto_telefono: '+591 70012345',
      });
      orgId = Number(org.id);
      assert.ok(orgId > 0, 'Organización debe registrarse en PostgreSQL');

      // B. REGISTRO DE PROPUESTA DE PROYECTO (POST /api/proyectos -> INSERT INTO proyectos)
      const propuesta = await api.proposeProject({
        titulo: `Proyecto Integración ${stamp}`,
        descripcion: 'Proyecto comunitario creado desde prueba de integración real.',
        ubicacion: 'Cochabamba, Cercado',
        cupos_disponibles: 18,
        fecha_inicio: '2026-12-01',
        fecha_fin: '2026-12-20',
        es_mayor_edad: true,
        organizacion_id: String(orgId),
      });
      proyectoId = Number(propuesta.proyecto.id);
      assert.equal(propuesta.proyecto.estado, 'pendiente_revision');

      // DETECCIÓN DE ERRORES: No debe permitir publicar un proyecto antes de aprobarlo
      await assert.rejects(
        () => api.publishProject(proyectoId!, { publicado: true }),
        (err: any) => err?.response?.status === 400
      );

      // DETECCIÓN DE ERRORES: Rechazar sin motivo debe devolver 400
      await assert.rejects(
        () => api.reviewProject(proyectoId!, { estado: 'rechazado' }),
        (err: any) => err?.response?.status === 400
      );

      // C. ACTUALIZACIÓN DE PROYECTO: Aprobar y Publicar (PATCH /revision y PATCH /publicacion)
      const reviewed = await api.reviewProject(proyectoId, { estado: 'aprobado' });
      assert.equal(reviewed.estado, 'aprobado');

      const published = await api.publishProject(proyectoId, { publicado: true });
      assert.equal(published.proyecto.publicado, true);

      // D. CONSULTA DE PROYECTOS PUBLICADOS (GET /api/proyectos/publicados con filtros y orden)
      const publicCatalog = await api.getPublishedProjects({
        q: `Proyecto Integración ${stamp}`,
        categoria: 'ONG',
        cupos_min: 10,
        cupos_max: 25,
        ordenar: 'cupos_desc',
      });
      assert.equal(publicCatalog.length, 1);
      assert.equal(Number(publicCatalog[0].id), proyectoId);

      // DETECCIÓN DE ERRORES: Rango numérico inválido en filtros debe retornar 400
      await assert.rejects(
        () => api.getPublishedProjects({ cupos_min: 30, cupos_max: 5 }),
        (err: any) => err?.response?.status === 400
      );

      // E. REGISTRO DE POSTULACIÓN Y CONSULTA DE SEGUIMIENTO (POST /api/postulaciones + GET /api/postulaciones/:id/estado)
      const appResp = await api.submitApplication({
        nombres: 'Andrea',
        apellidos: `Integración ${stamp}`,
        email: `andrea.${stamp}@kiriku.test`,
        telefono: '+591 71110000',
        ci: `CI-INT-${stamp}`,
        fecha_nacimiento: '1999-04-10',
        profesion_ocupacion: 'Trabajadora Social',
        habilidades: 'Logística comunitaria',
        motivacion: 'Apoyar proyectos locales',
        proyecto_id: proyectoId,
        confirmacion_mayor_edad: true,
      });
      postulacionId = Number(appResp.postulacion_id);
      postulanteId = Number(appResp.postulante_id);
      assert.equal(appResp.etapas_creadas, 5);

      const appStatus = await api.getApplicationStatus(postulacionId);
      assert.equal(appStatus.avance.porcentaje, 0);
      assert.equal(appStatus.avance.etapa_actual?.codigo, 'inicial');

      // DETECCIÓN DE ERRORES: Postulante menor de edad debe ser rechazado (400)
      await assert.rejects(
        () =>
          api.submitApplication({
            nombres: 'Menor',
            apellidos: 'Prueba',
            email: `menor.${stamp}@kiriku.test`,
            ci: `CI-MIN-${stamp}`,
            fecha_nacimiento: `${new Date().getFullYear() - 16}-01-01`,
            proyecto_id: proyectoId!,
            confirmacion_mayor_edad: true,
          }),
        (err: any) => err?.response?.status === 400
      );

      // F. REGISTRO Y CONSULTA DE DONACIÓN + AUDITORÍA EN system_logs
      const donacion = await api.createDonacion({
        donante_nombre: `Donante Integración ${stamp}`,
        donante_tipo: 'persona',
        donante_email: `donante.${stamp}@kiriku.test`,
        tipo_donacion: 'economica',
        monto_bob: 300,
        proyecto_destino_id: proyectoId,
        recibido_por: 'Equipo Tesorería',
      });
      donacionId = Number(donacion.id);
      donanteId = donacion.donante_id ? Number(donacion.donante_id) : null;
      assert.equal(donacion.codigo_donacion, `KIR-DON-${donacionId}`);

      const donaciones = await api.getDonaciones({
        q: `Donante Integración ${stamp}`,
        monto_min: 100,
        monto_max: 500,
      });
      assert.equal(donaciones.length, 1);

      const logs = await api.getSystemLogs({ module: 'proyectos', limite: 10 });
      assert.ok(logs.items.length >= 1, 'Las operaciones deben quedar auditadas en system_logs');
    } finally {
      if (postulacionId) {
        await query('DELETE FROM evaluaciones_etapas WHERE postulacion_id = $1', [postulacionId]);
        await query('DELETE FROM postulaciones WHERE id = $1', [postulacionId]);
      }
      if (postulanteId) {
        await query('DELETE FROM postulantes WHERE id = $1', [postulanteId]);
      }
      if (donacionId) {
        await query('DELETE FROM donaciones WHERE id = $1', [donacionId]);
      }
      if (donanteId) {
        await query('DELETE FROM donantes WHERE id = $1', [donanteId]);
      }
      if (proyectoId) {
        await query('DELETE FROM proyectos WHERE id = $1', [proyectoId]);
      }
      if (orgId) {
        await query('DELETE FROM organizaciones WHERE id = $1', [orgId]);
      }
    }
  });
});
