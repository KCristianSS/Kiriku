import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCsvReport,
  clearMemoryLogsForTest,
  querySystemLogs,
  recordSystemLog,
  sanitizeCsvCell,
} from './audit-logs';
import {
  authenticate,
  requirePermission,
  signAuthToken,
  verifyAuthToken,
  type AuthenticatedRequest,
} from './authorization';

function createMockRes() {
  const state: { statusCode: number; body: any } = {
    statusCode: 200,
    body: null,
  };
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

test('sanitizeCsvCell neutraliza inyección de fórmulas y formatea comillas RFC 4180', () => {
  assert.equal(sanitizeCsvCell('=CMD|calc'), "'=CMD|calc");
  assert.equal(sanitizeCsvCell('+SUM(A1:A2)'), "'+SUM(A1:A2)");
  assert.equal(sanitizeCsvCell('-10+2'), "'-10+2");
  assert.equal(sanitizeCsvCell('@HYPERLINK'), "'@HYPERLINK");
  assert.equal(sanitizeCsvCell('Proyecto "Kirikú", Tarija'), '"Proyecto ""Kirikú"", Tarija"');
  assert.equal(sanitizeCsvCell(null), '');
});

test('prueba de regresión del catálogo exportado: BOM UTF-8, columnas exactas, conteo y tamaño en bytes', () => {
  const catalogRows = [
    {
      id: 1,
      titulo: 'Brigada Verde, Tarija',
      organizacion_nombre: 'Nativa Bolivia',
      organizacion_tipo: 'ONG',
      ubicacion: 'Tarija',
      cupos_disponibles: 12,
      estado: 'aprobado',
      publicado: true,
    },
    {
      id: 2,
      titulo: '=Malicioso',
      organizacion_nombre: 'Fundación "Sol"',
      organizacion_tipo: 'Fundación',
      ubicacion: 'La Paz',
      cupos_disponibles: 8,
      estado: 'aprobado',
      publicado: true,
    },
  ];

  const report = buildCsvReport(
    [
      { header: 'ID', value: (r) => r.id },
      { header: 'Título', value: (r) => r.titulo },
      { header: 'Organización', value: (r) => r.organizacion_nombre },
      { header: 'Categoría', value: (r) => r.organizacion_tipo },
      { header: 'Ubicación', value: (r) => r.ubicacion },
      { header: 'Cupos', value: (r) => r.cupos_disponibles },
      { header: 'Estado', value: (r) => r.estado },
      { header: 'Publicado', value: (r) => (r.publicado ? 'Sí' : 'No') },
    ],
    catalogRows
  );

  assert.equal(report.rowCount, 2);
  assert.equal(report.csv.startsWith('\uFEFFID,Título,Organización,Categoría,Ubicación,Cupos,Estado,Publicado\r\n'), true);
  assert.equal(report.sizeBytes, Buffer.byteLength(report.csv, 'utf8'));
  assert.match(report.csv, /"Brigada Verde, Tarija",Nativa Bolivia,ONG,Tarija,12,aprobado,Sí/);
  assert.match(report.csv, /2,'=Malicioso,"Fundación ""Sol""",Fundación,La Paz,8,aprobado,Sí/);
});

test('recordSystemLog y querySystemLogs registran exportaciones con tamaño, duración y filtros', async () => {
  clearMemoryLogsForTest();

  await recordSystemLog({
    user_id: 'u-1',
    user_email: 'admin@kiriku.org',
    user_role: 'administrador',
    action: 'EXPORT_CSV',
    module: 'catalogo',
    format: 'csv',
    file_size_bytes: 1024,
    row_count: 15,
    duration_ms: 42,
    filters_json: { categoria: 'ONG', ordenar: 'cupos_desc' },
    status: 'success',
    details: 'Exportación de catálogo',
  });

  await recordSystemLog({
    user_id: 'u-2',
    user_email: 'voluntario@kiriku.org',
    user_role: 'voluntario',
    action: 'EXPORT_DENIED',
    module: 'donaciones',
    format: 'csv',
    duration_ms: 5,
    status: 'denied',
    details: 'Sin permiso reports.export',
  });

  const allLogs = await querySystemLogs({ ordenar: 'tamano_desc' });
  assert.equal(allLogs.resumen.total_logs, 2);
  assert.equal(allLogs.resumen.total_exportaciones, 2);
  assert.equal(allLogs.resumen.tamano_total_bytes, 1024);
  assert.equal(allLogs.resumen.intentos_denegados, 1);
  assert.equal(allLogs.items[0].module, 'catalogo');
  assert.equal(allLogs.items[0].file_size_bytes, 1024);
  assert.equal(allLogs.items[0].duration_ms, 42);

  const deniedOnly = await querySystemLogs({ status: 'denied' });
  assert.equal(deniedOnly.items.length, 1);
  assert.equal(deniedOnly.items[0].action, 'EXPORT_DENIED');
});

test('JWT y RBAC protegen la exportación por rol y registran intentos denegados', async () => {
  clearMemoryLogsForTest();

  const token = signAuthToken({ sub: 'user-99', email: 'coord@kiriku.org', rol: 'coordinador' }, 600);
  const verified = verifyAuthToken(token);
  assert.ok(verified);
  assert.equal(verified.sub, 'user-99');
  assert.equal(verified.rol, 'coordinador');

  const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
  assert.equal(verifyAuthToken(tampered), null);

  // Sin token -> 401
  const noAuthReq = { headers: {} } as AuthenticatedRequest;
  const noAuthRes = createMockRes();
  let nextCalled = false;
  await authenticate(noAuthReq, noAuthRes.res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(noAuthRes.state.statusCode, 401);

  // Rol sin permiso reports.export -> 403 + log EXPORT_DENIED
  const guard = requirePermission('reports.export');
  const unprivReq = {
    userId: 'user-vol',
    userEmail: 'vol@kiriku.org',
    userRole: 'voluntario',
    permissions: ['projects.read'],
    params: { modulo: 'catalogo' },
    path: '/exports/catalogo',
  } as unknown as AuthenticatedRequest;
  const unprivRes = createMockRes();
  guard(unprivReq, unprivRes.res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(unprivRes.state.statusCode, 403);

  await new Promise((r) => setTimeout(r, 20));
  const logs = await querySystemLogs({ action: 'EXPORT_DENIED' });
  assert.equal(logs.items.length, 1);
  assert.equal(logs.items[0].module, 'catalogo');
  assert.equal(logs.items[0].status, 'denied');

  // Rol con permiso reports.export -> next()
  const privReq = {
    userId: 'user-admin',
    userEmail: 'admin@kiriku.org',
    userRole: 'administrador',
    permissions: ['reports.export'],
    params: { modulo: 'catalogo' },
    path: '/exports/catalogo',
  } as unknown as AuthenticatedRequest;
  const privRes = createMockRes();
  guard(privReq, privRes.res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
});
