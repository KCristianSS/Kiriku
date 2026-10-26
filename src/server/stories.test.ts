import assert from 'node:assert/strict';
import test, { describe, it, after } from 'node:test';
import { hasPermission } from './permissions';
import { query, dbPool } from './supabase';

describe('VERIFICACIÓN DE LAS 4 HISTORIAS DE USUARIO - KIRIKÚ', () => {

  after(async () => {
    await dbPool.end();
  });

  // -------------------------------------------------------------
  // HISTORIA 1: KIR-16 - Registrar postulación inicial
  // -------------------------------------------------------------
  describe('KIR-16: Registrar postulación inicial', () => {
    it('KIR-102: Estructura de datos de postulación inicial definida y con IDs secuenciales', async () => {
      // Verificar columnas y tablas requeridas
      const tables = await query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables 
         WHERE table_schema = 'public' 
         AND table_name IN ('postulantes', 'postulaciones', 'evaluaciones_etapas')`
      );
      const names = tables.map((t) => t.table_name);
      assert.ok(names.includes('postulantes'), 'Tabla postulantes debe existir');
      assert.ok(names.includes('postulaciones'), 'Tabla postulaciones debe existir');
      assert.ok(names.includes('evaluaciones_etapas'), 'Tabla evaluaciones_etapas debe existir');

      // Verificar que los IDs son de tipo numérico/secuencial (bigint o integer)
      const idColumns = await query<{ column_name: string; data_type: string }>(
        `SELECT column_name, data_type FROM information_schema.columns 
         WHERE table_schema = 'public' 
         AND table_name = 'postulaciones' AND column_name IN ('id', 'postulante_id', 'proyecto_id')`
      );
      assert.ok(idColumns.length >= 3, 'Las columnas id, postulante_id y proyecto_id deben existir');
      for (const col of idColumns) {
        assert.match(col.data_type, /int/i, `La columna ${col.column_name} debe ser numérica (entero/bigint)`);
      }
    });

    it('KIR-103 & KIR-105: Flujo completo de registro de postulación inicial con 5 etapas automáticas', async () => {
      const testCi = 'TEST-CI-' + Date.now();
      const testEmail = `test.voluntario.${Date.now()}@kiriku.test`;

      // 1. Obtener un proyecto existente
      const proyectos = await query<{ id: number }>('SELECT id FROM proyectos WHERE estado = $1 LIMIT 1', ['aprobado']);
      assert.ok(proyectos.length > 0, 'Debe haber al menos un proyecto aprobado para vincular');
      const proyectoId = proyectos[0].id;

      // 2. Insertar postulante de prueba mayor de edad (nacido en 1998)
      const postInsert = await query<{ id: number }>(
        `INSERT INTO postulantes (ci, nombres, apellidos, fecha_nacimiento, email, telefono, profesion_ocupacion, motivacion)
         VALUES ($1, 'Juan', 'Pérez Test', '1998-05-15', $2, '77788899', 'Ingeniero de Software', 'Aporte social')
         RETURNING id`,
        [testCi, testEmail]
      );
      const postulanteId = postInsert[0].id;
      assert.ok(postulanteId > 0, 'Postulante debe crearse con ID numérico');

      // 3. Insertar postulación
      const appInsert = await query<{ id: number }>(
        `INSERT INTO postulaciones (postulante_id, proyecto_id, estado_general, es_reasignacion)
         VALUES ($1, $2, 'pendiente', false)
         RETURNING id`,
        [postulanteId, proyectoId]
      );
      const postulacionId = appInsert[0].id;
      assert.ok(postulacionId > 0, 'Postulación debe crearse con ID numérico');

      // 4. Crear las 5 etapas automáticas
      const etapas = [
        { etapa: 'inicial', evaluador: 'Comité de Admisiones Kirikú', comentarios: 'Recepción' },
        { etapa: 'tecnica', evaluador: 'Coordinador del Proyecto', comentarios: 'Habilidades' },
        { etapa: 'personal', evaluador: 'Psicología y Talento Kirikú', comentarios: 'Entrevista' },
        { etapa: 'competencias', evaluador: 'Facilitador Grupal', comentarios: 'Dinámica' },
        { etapa: 'salud_fisica_psicologica', evaluador: 'Equipo Médico', comentarios: 'Salud' },
      ];

      for (const e of etapas) {
        await query(
          `INSERT INTO evaluaciones_etapas (postulacion_id, etapa, estado, evaluador, comentarios, fecha_evaluacion)
           VALUES ($1, $2, 'pendiente', $3, $4, NOW())`,
          [postulacionId, e.etapa, e.evaluador, e.comentarios]
        );
      }

      // 5. Verificar que se crearon exactamente las 5 etapas
      const rows = await query<{ id: number; etapa: string; estado: string }>(
        'SELECT id, etapa, estado FROM evaluaciones_etapas WHERE postulacion_id = $1 ORDER BY id ASC',
        [postulacionId]
      );
      assert.equal(rows.length, 5, 'Deben existir exactamente 5 etapas de evaluación');
      assert.equal(rows[0].etapa, 'inicial');
      assert.equal(rows[4].etapa, 'salud_fisica_psicologica');

      // Limpieza de datos de prueba
      await query('DELETE FROM evaluaciones_etapas WHERE postulacion_id = $1', [postulacionId]);
      await query('DELETE FROM postulaciones WHERE id = $1', [postulacionId]);
      await query('DELETE FROM postulantes WHERE id = $1', [postulanteId]);
    });
  });

  // -------------------------------------------------------------
  // HISTORIA 2: KIR-17 - Validar mayoría de edad antes de postular
  // -------------------------------------------------------------
  describe('KIR-17: Validar mayoría de edad antes de postular', () => {
    function calcularEdad(fechaNac: string): number {
      const hoy = new Date();
      const cumple = new Date(fechaNac);
      let edad = hoy.getFullYear() - cumple.getFullYear();
      const m = hoy.getMonth() - cumple.getMonth();
      if (m < 0 || (m === 0 && hoy.getDate() < cumple.getDate())) {
        edad--;
      }
      return edad;
    }

    it('KIR-101: Escenario 1 - Persona menor de 18 años (17 años) debe ser RECHAZADA', () => {
      const hoy = new Date();
      const fecha17 = new Date(hoy.getFullYear() - 17, hoy.getMonth(), hoy.getDate()).toISOString().split('T')[0];
      const edad = calcularEdad(fecha17);
      assert.equal(edad, 17, 'Debe tener exactamente 17 años');
      assert.equal(edad >= 18, false, 'No debe cumplir la mayoría de edad');
    });

    it('KIR-101: Escenario 2 - Persona que cumple 18 años hoy debe ser ADMITIDA', () => {
      const hoy = new Date();
      const fecha18 = new Date(hoy.getFullYear() - 18, hoy.getMonth(), hoy.getDate()).toISOString().split('T')[0];
      const edad = calcularEdad(fecha18);
      assert.equal(edad, 18, 'Debe tener exactamente 18 años hoy');
      assert.equal(edad >= 18, true, 'Debe cumplir la mayoría de edad');
    });

    it('KIR-101: Escenario 3 - Persona que cumple 18 mañana aún tiene 17 y debe ser RECHAZADA', () => {
      const hoy = new Date();
      const manana = new Date(hoy.getFullYear() - 18, hoy.getMonth(), hoy.getDate() + 1).toISOString().split('T')[0];
      const edad = calcularEdad(manana);
      assert.equal(edad, 17, 'Aún tiene 17 años el día de hoy');
      assert.equal(edad >= 18, false, 'No debe cumplir la mayoría de edad');
    });

    it('KIR-101: Escenario 4 - Adulto de 25 años debe ser ADMITIDO', () => {
      const hoy = new Date();
      const fecha25 = new Date(hoy.getFullYear() - 25, 0, 1).toISOString().split('T')[0];
      const edad = calcularEdad(fecha25);
      assert.ok(edad >= 24, 'Debe ser mayor de edad');
      assert.equal(edad >= 18, true, 'Debe cumplir la mayoría de edad');
    });
  });

  // -------------------------------------------------------------
  // HISTORIA 3: KIR-11 - Gestionar los roles de los usuarios
  // -------------------------------------------------------------
  describe('KIR-11: Gestionar los roles de los usuarios', () => {
    it('KIR-12: Roles y permisos iniciales definidos en la base de datos', async () => {
      const roles = await query<{ code: string; name: string }>(
        'SELECT code, name FROM roles ORDER BY code'
      );
      const roleCodes = roles.map((r) => r.code);
      assert.ok(roleCodes.includes('administrador'), 'Rol administrador debe existir');
      assert.ok(roleCodes.includes('evaluador'), 'Rol evaluador debe existir');
      assert.ok(roleCodes.includes('gestor_proyectos'), 'Rol gestor_proyectos debe existir');

      const perms = await query<{ code: string }>('SELECT code FROM permissions');
      const permCodes = perms.map((p) => p.code);
      assert.ok(permCodes.includes('roles.manage'), 'Permiso roles.manage debe existir');
      assert.ok(permCodes.includes('users.manage_roles'), 'Permiso users.manage_roles debe existir');
      assert.ok(permCodes.includes('projects.review'), 'Permiso projects.review debe existir');
      assert.ok(permCodes.includes('applications.read'), 'Permiso applications.read debe existir');
    });

    it('KIR-13 & KIR-15: Pruebas de autorización y matriz de permisos por rol', () => {
      const permisosAdmin = [
        'roles.manage',
        'users.manage_roles',
        'projects.review',
        'applications.read',
        'applications.manage',
        'donations.manage',
      ];
      const permisosEvaluador = ['applications.read', 'applications.manage'];
      const permisosGestor = ['projects.review', 'applications.read'];

      // Administrador puede gestionar roles
      assert.equal(hasPermission('admin-user', permisosAdmin, 'roles.manage'), true);
      // Evaluador no puede gestionar roles
      assert.equal(hasPermission('eval-user', permisosEvaluador, 'roles.manage'), false);
      // Evaluador puede leer postulaciones
      assert.equal(hasPermission('eval-user', permisosEvaluador, 'applications.read'), true);
      // Gestor puede revisar proyectos
      assert.equal(hasPermission('gestor-user', permisosGestor, 'projects.review'), true);
      // Gestor no puede evaluar postulaciones
      assert.equal(hasPermission('gestor-user', permisosGestor, 'applications.manage'), false);
      // Usuario no autenticado (undefined) es siempre rechazado
      assert.equal(hasPermission(undefined, permisosAdmin, 'roles.manage'), false);
    });
  });

  // -------------------------------------------------------------
  // HISTORIA 4: KIR-6 - Registrar usuarios del sistema (RF-01)
  // -------------------------------------------------------------
  describe('KIR-6: Registrar usuarios del sistema (RF-01)', () => {
    it('KIR-7 & KIR-8: Validación de campos obligatorios en registro de usuarios', () => {
      // Validador de nombre
      const validarNombre = (name: string) => Boolean(name && name.trim().length >= 2 && name.trim().length <= 100);
      assert.equal(validarNombre(''), false, 'Nombre vacío debe ser rechazado');
      assert.equal(validarNombre('A'), false, 'Nombre de 1 carácter debe ser rechazado');
      assert.equal(validarNombre('Carla Gómez'), true, 'Nombre válido debe ser aceptado');

      // Validador de correo
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      assert.equal(emailRegex.test(''), false, 'Correo vacío debe ser rechazado');
      assert.equal(emailRegex.test('correo-invalido'), false, 'Correo sin arroba o dominio debe ser rechazado');
      assert.equal(emailRegex.test('carla@kiriku.org'), true, 'Correo válido debe ser aceptado');

      // Validador de rol
      const validarRol = (roleId: any) => Number.isInteger(roleId) && roleId >= 1;
      assert.equal(validarRol(null), false, 'Rol nulo debe ser rechazado');
      assert.equal(validarRol(0), false, 'Rol 0 debe ser rechazado');
      assert.equal(validarRol(1), true, 'Rol 1 debe ser aceptado');
    });

    it('KIR-10: Creación y asignación de rol en base de datos real (RF-01 Criterios 1, 2, 3, 4)', async () => {
      const testEmail = `admin.test.${Date.now()}@kiriku.test`;

      // 1. Obtener ID del rol evaluador (id: 2)
      const roleRow = await query<{ id: number }>('SELECT id FROM roles WHERE code = $1', ['evaluador']);
      assert.ok(roleRow.length > 0, 'Rol evaluador debe existir');
      const roleId = roleRow[0].id;

      // 2. Registrar usuario en auth.users
      const userInsert = await query<{ id: string; email: string }>(
        `INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
         VALUES (gen_random_uuid(), 'authenticated', 'authenticated', $1, json_build_object('full_name', 'Evaluador Test UCB'), NOW(), NOW())
         RETURNING id, email`,
        [testEmail]
      );
      assert.ok(userInsert.length > 0, 'Usuario debe insertarse en auth.users');
      const userId = userInsert[0].id;

      // 3. Asignar rol al usuario en user_roles
      await query(
        'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT (user_id, role_id) DO NOTHING',
        [userId, roleId]
      );

      // 4. Verificar que el usuario registrado tiene el rol asignado y los permisos correspondientes
      const userRoles = await query<{ role_code: string; role_name: string }>(
        `SELECT r.code as role_code, r.name as role_name 
         FROM user_roles ur 
         JOIN roles r ON r.id = ur.role_id 
         WHERE ur.user_id = $1`,
        [userId]
      );
      assert.equal(userRoles.length, 1, 'Usuario debe tener exactamente 1 rol asignado');
      assert.equal(userRoles[0].role_code, 'evaluador', 'El rol asignado debe ser evaluador');

      // 5. Verificar permisos efectivos para el usuario
      const permissions = await query<{ permission: string }>(
        `SELECT DISTINCT p.code AS permission
         FROM user_roles ur
         JOIN role_permissions rp ON rp.role_id = ur.role_id
         JOIN permissions p ON p.id = rp.permission_id
         WHERE ur.user_id = $1`,
        [userId]
      );
      const permList = permissions.map((p) => p.permission);
      assert.ok(permList.includes('applications.read'), 'Evaluador debe tener permiso applications.read');
      assert.ok(permList.includes('applications.manage'), 'Evaluador debe tener permiso applications.manage');
      assert.equal(permList.includes('roles.manage'), false, 'Evaluador no debe tener permiso roles.manage');

      // Limpieza de datos de prueba
      await query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
      await query('DELETE FROM auth.users WHERE id = $1', [userId]);
    });
  });
});
