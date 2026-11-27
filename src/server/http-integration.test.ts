import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import express from 'express';
import { api, apiClient } from '../api/client';
import apiRouter from './api';
import { authenticate, requirePermission } from './authorization';
import { clearMemoryLogsForTest, querySystemLogs, recordSystemLog } from './audit-logs';
import { cacheService } from './cache';
import { isDatabaseConfigured } from './supabase';
import { setupSwagger } from './swagger';

describe('Pruebas de integración Frontend (Axios client) ↔ Backend (Express/API/Swagger/RBAC)', () => {
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

    // Endpoint controlado de verificación HTTP/RBAC para comprobar la cadena completa Axios -> Express -> Middleware
    app.get(
      '/api/integration-probe/audit',
      authenticate,
      requirePermission('audit.read'),
      async (_req, res) => {
        await cacheService.set('probe:key', { active: true }, 30);
        const cached = await cacheService.get<{ active: boolean }>('probe:key');
        res.setHeader('X-Cache', cached ? 'HIT' : 'MISS');
        res.json({ ok: true, cacheStats: cacheService.getStats() });
      }
    );

    setupSwagger(app);
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
  });

  it('el cliente frontend api.getStatus() se comunica por HTTP real con GET /api/status', async () => {
    const status = await api.getStatus();
    assert.equal(status.databaseConfigured, isDatabaseConfigured);
  });

  it('GET /api/health refleja el estado real de conexión a PostgreSQL (200 si conectado, 503 si no configurado)', async () => {
    const res = await fetch(`${baseRootUrl}/api/health`);
    const body = (await res.json()) as any;
    if (isDatabaseConfigured) {
      assert.equal(res.status, 200);
      assert.equal(body.status, 'ok');
      assert.equal(body.database, 'connected');
    } else {
      assert.equal(res.status, 503);
      assert.equal(body.status, 'error');
      assert.equal(body.database, 'unconfigured');
    }
  });

  it('Swagger UI (/api-docs) y especificación OpenAPI (/api/openapi.json) responden correctamente', async () => {
    const specRes = await fetch(`${baseRootUrl}/api/openapi.json`);
    assert.equal(specRes.status, 200);
    const spec = (await specRes.json()) as any;
    assert.equal(spec.openapi, '3.0.0');
    assert.ok(spec.paths['/proyectos']);

    const docsRes = await fetch(`${baseRootUrl}/api-docs/`);
    assert.equal(docsRes.status, 200);
    const html = await docsRes.text();
    assert.match(html, /Kirikú API Docs - Swagger/i);
    assert.match(html, /id="swagger-ui"/i);
  });

  it('el interceptor Axios inyecta Bearer token desde localStorage y propaga respuestas 401/200 correctamente', async () => {
    memoryStorage.clear();
    clearMemoryLogsForTest();

    // Sin token -> 401 capturado por Axios
    await assert.rejects(
      () => apiClient.get('/integration-probe/audit'),
      (err: any) => err?.response?.status === 401
    );

    // Con token de administrador -> interceptor adjunta Authorization y responde 200 con stats de caché
    memoryStorage.set('kiriku_admin_token', 'dev-admin-token');
    const okRes = await apiClient.get('/integration-probe/audit');
    assert.equal(okRes.status, 200);
    assert.equal(okRes.data.ok, true);
    assert.equal(okRes.headers['x-cache'], 'HIT');
    assert.ok(okRes.data.cacheStats.hits >= 1);
  });

  it('detecta errores reales del backend cuando falta PostgreSQL (503) o validación/RBAC en peticiones del cliente', async () => {
    memoryStorage.set('kiriku_admin_token', 'dev-admin-token');
    if (!isDatabaseConfigured) {
      await assert.rejects(
        () => api.getPublishedProjects(),
        (err: any) =>
          err?.response?.status === 503 &&
          /Base de datos no conectada/i.test(String(err?.response?.data?.error || ''))
      );
      await assert.rejects(
        () => api.getCacheStats(),
        (err: any) => err?.response?.status === 503
      );
    } else {
      const stats = await api.getCacheStats();
      assert.ok(typeof stats.hits === 'number');
      await recordSystemLog({
        user_email: 'admin@kiriku.org',
        action: 'HTTP_INTEGRATION_CHECK',
        module: 'sistema',
        status: 'success',
      });
      const logs = await querySystemLogs({ module: 'sistema' });
      assert.ok(logs.items.length >= 1);
    }
  });
});
