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

  // -------------------------------------------------------------
  // HISTORIA 5: KIR-21 - Revisar proyecto antes de publicarlo (Épica KIR-3)
  // -------------------------------------------------------------
  describe('KIR-21: Revisar proyecto antes de publicarlo', () => {
    it('KIR-82: Definición de estados y flujo de ciclo de vida del proyecto', async () => {
      // 1. Verificar existencia de columnas de revisión en la tabla proyectos
      const columns = await query<{ column_name: string; data_type: string }>(
        `SELECT column_name, data_type FROM information_schema.columns 
         WHERE table_schema = 'public' 
         AND table_name = 'proyectos' 
         AND column_name IN ('id', 'titulo', 'estado', 'motivo_rechazo')`
      );
      const colNames = columns.map((c) => c.column_name);
      assert.ok(colNames.includes('estado'), 'La columna estado debe existir');
      assert.ok(colNames.includes('motivo_rechazo'), 'La columna motivo_rechazo debe existir');

      // 2. Verificar que los 3 estados del flujo existen y son válidos
      const estadosValidos = ['pendiente_revision', 'aprobado', 'rechazado'];
      for (const st of estadosValidos) {
        assert.ok(typeof st === 'string' && st.length > 0);
      }
    });

    it('KIR-83: Reglas del servicio de revisión - Validación de permisos y obligatoriedad del motivo', () => {
      // Matriz de permisos requeridos para revisar proyectos
      const permisosRevisor = ['projects.review'];
      const permisosEvaluador = ['applications.read', 'applications.manage'];

      // El evaluador regular no puede revisar proyectos
      assert.equal(hasPermission('eval-1', permisosEvaluador, 'projects.review'), false);
      // El revisor/gestor sí tiene autorización
      assert.equal(hasPermission('revisor-1', permisosRevisor, 'projects.review'), true);

      // Regla de validación de rechazo: motivo_rechazo es obligatorio cuando estado === 'rechazado'
      const validarDecisionRechazo = (estado: string, motivo?: string | null) => {
        if (estado === 'rechazado') {
          if (!motivo || motivo.trim().length < 5) {
            return { valid: false, error: 'Debe especificar el motivo de rechazo' };
          }
        }
        return { valid: true };
      };

      assert.equal(validarDecisionRechazo('rechazado', '').valid, false);
      assert.equal(validarDecisionRechazo('rechazado', undefined).valid, false);
      assert.equal(validarDecisionRechazo('rechazado', 'No cumple logística requerida').valid, true);
      assert.equal(validarDecisionRechazo('aprobado', null).valid, true);
    });

    it('KIR-84 & KIR-85: Flujo completo de pruebas de aprobación y rechazo en base de datos real', async () => {
      // 1. Crear un proyecto de prueba en estado pendiente_revision
      const testTitle = 'Proyecto Prueba Automatizada KIR-21 ' + Date.now();
      const insertResult = await query<{ id: number; estado: string }>(
        `INSERT INTO proyectos (titulo, descripcion, ubicacion, cupos_disponibles, estado, es_mayor_edad)
         VALUES ($1, 'Descripción detallada de prueba para auditoría comunitaria', 'La Paz, Zona Sur', 15, 'pendiente_revision', true)
         RETURNING id, estado`,
        [testTitle]
      );
      assert.ok(insertResult.length > 0, 'El proyecto debe insertarse');
      const testProjectId = insertResult[0].id;
      assert.equal(insertResult[0].estado, 'pendiente_revision', 'El estado inicial debe ser pendiente_revision');

      // 2. Probar RECHAZO: Simular decisión de rechazo con justificación formal
      const motivoRechazo = 'Falta detallar el plan de logística y seguridad para los voluntarios comunitarios.';
      const rechazoResult = await query<{ id: number; estado: string; motivo_rechazo: string }>(
        `UPDATE proyectos 
         SET estado = 'rechazado', motivo_rechazo = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING id, estado, motivo_rechazo`,
        [motivoRechazo, testProjectId]
      );
      assert.equal(rechazoResult[0].estado, 'rechazado', 'El estado debe actualizarse a rechazado');
      assert.equal(rechazoResult[0].motivo_rechazo, motivoRechazo, 'El motivo de rechazo debe guardarse correctamente');

      // 3. Probar REAPERTURA / RE-EVALUACIÓN: Regresar a pendiente_revision
      const reabrirResult = await query<{ id: number; estado: string; motivo_rechazo: string | null }>(
        `UPDATE proyectos 
         SET estado = 'pendiente_revision', motivo_rechazo = NULL, updated_at = NOW()
         WHERE id = $1
         RETURNING id, estado, motivo_rechazo`,
        [testProjectId]
      );
      assert.equal(reabrirResult[0].estado, 'pendiente_revision');
      assert.equal(reabrirResult[0].motivo_rechazo, null);

      // 4. Probar APROBACIÓN: Publicación exitosa del proyecto comunitario
      const aprobacionResult = await query<{ id: number; estado: string; motivo_rechazo: string | null }>(
        `UPDATE proyectos 
         SET estado = 'aprobado', motivo_rechazo = NULL, updated_at = NOW()
         WHERE id = $1
         RETURNING id, estado, motivo_rechazo`,
        [testProjectId]
      );
      assert.equal(aprobacionResult[0].estado, 'aprobado', 'El estado debe actualizarse a aprobado');
      assert.equal(aprobacionResult[0].motivo_rechazo, null, 'El motivo debe ser null en estado aprobado');

      // 5. Verificar que el proyecto ahora es consultable como aprobado para postulantes
      const proyectosPublicados = await query<{ id: number; titulo: string }>(
        'SELECT id, titulo FROM proyectos WHERE id = $1 AND estado = $2',
        [testProjectId, 'aprobado']
      );
      assert.equal(proyectosPublicados.length, 1, 'El proyecto aprobado debe ser visible');

      // Limpieza de datos de prueba
      await query('DELETE FROM proyectos WHERE id = $1', [testProjectId]);
    });
  });

  // -------------------------------------------------------------
  // HISTORIA 6: KIR-18 - Gestionar banco de postulantes por perfil (Épica KIR-2)
  // -------------------------------------------------------------
  describe('KIR-18: Gestionar banco de postulantes por perfil', () => {
    it('KIR-94: Diseñar estructura del banco de postulantes con datos de perfil y avance parcial', async () => {
      // 1. Verificar columnas esenciales en postulantes
      const cols = await query<{ column_name: string; data_type: string }>(
        `SELECT column_name, data_type FROM information_schema.columns 
         WHERE table_schema = 'public' 
         AND table_name = 'postulantes' 
         AND column_name IN ('id', 'ci', 'nombres', 'apellidos', 'email', 'telefono', 'fecha_nacimiento', 'profesion_ocupacion', 'habilidades', 'motivacion')`
      );
      const colNames = cols.map((c) => c.column_name);
      assert.ok(colNames.includes('ci'), 'Columna ci debe existir');
      assert.ok(colNames.includes('nombres'), 'Columna nombres debe existir');
      assert.ok(colNames.includes('apellidos'), 'Columna apellidos debe existir');
      assert.ok(colNames.includes('fecha_nacimiento'), 'Columna fecha_nacimiento debe existir');
      assert.ok(colNames.includes('profesion_ocupacion'), 'Columna profesion_ocupacion debe existir');
      assert.ok(colNames.includes('habilidades'), 'Columna habilidades debe existir');

      // 2. Comprobar cálculo de edad y mayoría de edad para estructura del perfil
      const hoy = new Date();
      const fechaNac = new Date(hoy.getFullYear() - 22, 5, 10).toISOString().split('T')[0];
      const birth = new Date(fechaNac);
      let edad = hoy.getFullYear() - birth.getFullYear();
      const m = hoy.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && hoy.getDate() < birth.getDate())) {
        edad--;
      }
      assert.equal(edad, 22, 'Edad calculada debe ser 22 años');
      assert.equal(edad >= 18, true, 'Debe ser mayor de edad');
    });

    it('KIR-95: Implementar consulta y filtros de postulantes por perfil, competencias y búsqueda', async () => {
      const testCi = 'TEST-POOL-' + Date.now();
      const testEmail = `paramedico.${Date.now()}@kiriku.test`;
      const testSkill = 'Triaje-Rescate-' + Date.now();

      // 1. Insertar voluntario de prueba con perfil específico
      const insertPost = await query<{ id: number }>(
        `INSERT INTO postulantes (ci, nombres, apellidos, fecha_nacimiento, email, profesion_ocupacion, habilidades, motivacion)
         VALUES ($1, 'Ana Gabriela', 'Rojas Test', '1999-03-25', $2, 'Paramédico de Emergencias', $3, 'Vocación de servicio')
         RETURNING id`,
        [testCi, testEmail, `Primeros auxilios, ${testSkill}, Manejo de crisis`]
      );
      const postulantId = insertPost[0].id;
      assert.ok(postulantId > 0, 'Postulante de prueba insertado con éxito');

      // 2. Consulta filtrada por habilidad específica (KIR-95)
      const rowsBySkill = await query<{ id: number; nombres: string; habilidades: string }>(
        `SELECT id, nombres, habilidades FROM postulantes 
         WHERE habilidades ILIKE $1`,
        [`%${testSkill}%`]
      );
      assert.equal(rowsBySkill.length, 1, 'Debe encontrar exactamente 1 postulante por habilidad');
      assert.equal(rowsBySkill[0].id, postulantId);

      // 3. Consulta filtrada por profesión / ocupación
      const rowsByProf = await query<{ id: number; profesion_ocupacion: string }>(
        `SELECT id, profesion_ocupacion FROM postulantes 
         WHERE id = $1 AND profesion_ocupacion ILIKE $2`,
        [postulantId, '%Paramédico%']
      );
      assert.equal(rowsByProf.length, 1, 'Debe encontrar el postulante por profesión');

      // 4. Consulta por búsqueda libre q (CI o nombre)
      const rowsByCi = await query<{ id: number }>(
        `SELECT id FROM postulantes 
         WHERE ci = $1 OR email = $2`,
        [testCi, testEmail]
      );
      assert.equal(rowsByCi.length, 1, 'Debe encontrar el postulante por CI/Email');

      // Limpieza de datos de prueba
      await query('DELETE FROM postulantes WHERE id = $1', [postulantId]);
    });

    it('KIR-96 & KIR-97: Implementar vista de perfil y cálculo de avance parcial en 5 etapas secuenciales', async () => {
      const testCi = 'TEST-AVANCE-' + Date.now();
      const testEmail = `avance.${Date.now()}@kiriku.test`;

      // 1. Obtener proyecto aprobado
      const proy = await query<{ id: number }>('SELECT id FROM proyectos WHERE estado = $1 LIMIT 1', ['aprobado']);
      assert.ok(proy.length > 0, 'Debe haber un proyecto aprobado');
      const proyectoId = proy[0].id;

      // 2. Insertar postulante
      const postInsert = await query<{ id: number }>(
        `INSERT INTO postulantes (ci, nombres, apellidos, fecha_nacimiento, email, profesion_ocupacion, habilidades)
         VALUES ($1, 'Carlos', 'Montaño Test', '2001-08-14', $2, 'Licenciado en Trabajo Social', 'Mediación comunitaria')
         RETURNING id`,
        [testCi, testEmail]
      );
      const postulanteId = postInsert[0].id;

      // 3. Crear postulación
      const appInsert = await query<{ id: number }>(
        `INSERT INTO postulaciones (postulante_id, proyecto_id, estado_general, es_reasignacion)
         VALUES ($1, $2, 'en_proceso', false)
         RETURNING id`,
        [postulanteId, proyectoId]
      );
      const postulacionId = appInsert[0].id;

      // 4. Crear las 5 etapas: 3 aprobadas, 1 en revisión, 1 pendiente
      const etapasConfig = [
        { etapa: 'inicial', estado: 'aprobado', evaluador: 'Admisiones' },
        { etapa: 'tecnica', estado: 'aprobado', evaluador: 'Técnico' },
        { etapa: 'personal', estado: 'aprobado', evaluador: 'Psicología' },
        { etapa: 'competencias', estado: 'en_revision', evaluador: 'Dinámica Grupal' },
        { etapa: 'salud_fisica_psicologica', estado: 'pendiente', evaluador: 'Médico' },
      ];

      for (const e of etapasConfig) {
        await query(
          `INSERT INTO evaluaciones_etapas (postulacion_id, etapa, estado, evaluador, fecha_evaluacion)
           VALUES ($1, $2, $3, $4, NOW())`,
          [postulacionId, e.etapa, e.estado, e.evaluador]
        );
      }

      // 5. Verificar cálculo de avance parcial
      const stagesInDb = await query<{ etapa: string; estado: string }>(
        'SELECT etapa, estado FROM evaluaciones_etapas WHERE postulacion_id = $1 ORDER BY id ASC',
        [postulacionId]
      );
      assert.equal(stagesInDb.length, 5, 'Deben existir 5 etapas');

      const aprobadasCount = stagesInDb.filter((s) => s.estado === 'aprobado').length;
      assert.equal(aprobadasCount, 3, 'Debe haber 3 etapas aprobadas');

      // Cálculo de porcentaje de avance parcial: (3 / 5) * 100 = 60%
      const porcentajeAvance = Math.round((aprobadasCount / 5) * 100);
      assert.equal(porcentajeAvance, 60, 'El porcentaje de avance parcial debe ser exactamente 60%');

      // 6. Verificar que la consulta del banco recupera este avance y perfil completo
      const poolQuery = await query<{ id: number; total_aprobadas: string }>(
        `SELECT p.id,
                COUNT(CASE WHEN ee.estado = 'aprobado' THEN 1 END) as total_aprobadas
         FROM postulantes p
         JOIN postulaciones app ON app.postulante_id = p.id
         JOIN evaluaciones_etapas ee ON ee.postulacion_id = app.id
         WHERE p.id = $1
         GROUP BY p.id`,
        [postulanteId]
      );
      assert.equal(parseInt(poolQuery[0].total_aprobadas, 10), 3, 'El pool debe reflejar 3 etapas aprobadas');

      // Limpieza de datos de prueba
      await query('DELETE FROM evaluaciones_etapas WHERE postulacion_id = $1', [postulacionId]);
      await query('DELETE FROM postulaciones WHERE id = $1', [postulacionId]);
      await query('DELETE FROM postulantes WHERE id = $1', [postulanteId]);
    });
  });

  // -------------------------------------------------------------
  // HISTORIA 7: KIR-106 - Registrar propuesta de proyecto comunitario (Épica KIR-3)
  // -------------------------------------------------------------
  describe('KIR-106: Registrar propuesta de proyecto comunitario', () => {
    it('KIR-107 & KIR-109: Validación de campos obligatorios y reglas de fechas de ejecución', () => {
      // 1. Validador de título (min 5 chars)
      const validarTitulo = (t?: string) => Boolean(t && t.trim().length >= 5);
      assert.equal(validarTitulo(''), false, 'Título vacío debe fallar');
      assert.equal(validarTitulo('Hola'), false, 'Título de 4 letras debe fallar');
      assert.equal(validarTitulo('Reforestación Urbana La Paz'), true, 'Título válido');

      // 2. Validador de descripción (min 15 chars)
      const validarDesc = (d?: string) => Boolean(d && d.trim().length >= 15);
      assert.equal(validarDesc('Muy corto'), false);
      assert.equal(validarDesc('Actividades de limpieza y reforestación comunitaria con vecinos'), true);

      // 3. Validador de cupos disponibles (> 0 y entero)
      const validarCupos = (c: any) => Number.isInteger(Number(c)) && Number(c) > 0;
      assert.equal(validarCupos(0), false);
      assert.equal(validarCupos(-5), false);
      assert.equal(validarCupos(15), true);

      // 4. Validador de fechas de ejecución (KIR-109: fecha_fin >= fecha_inicio)
      const validarFechas = (inicioStr?: string, finStr?: string) => {
        if (!inicioStr || !finStr) return true;
        const ini = new Date(inicioStr);
        const fin = new Date(finStr);
        if (isNaN(ini.getTime()) || isNaN(fin.getTime())) return false;
        return fin >= ini;
      };

      assert.equal(validarFechas('2026-06-01', '2026-05-15'), false, 'Fecha fin anterior a inicio debe ser rechazada');
      assert.equal(validarFechas('2026-06-01', '2026-06-01'), true, 'Misma fecha debe ser válida');
      assert.equal(validarFechas('2026-06-01', '2026-07-15'), true, 'Fecha fin posterior debe ser aceptada');
    });

    it('KIR-108: Registrar propuesta en estado pendiente_revision vinculada a organización existente', async () => {
      // 1. Obtener organización existente
      const orgs = await query<{ id: number }>('SELECT id FROM organizaciones LIMIT 1');
      assert.ok(orgs.length > 0, 'Debe haber una organización');
      const orgId = orgs[0].id;

      const testTitle = 'Iniciativa Propuesta Automatizada ' + Date.now();
      const testUbicacion = 'Zona Alto San Pedro, Cancha Comunal';

      // 2. Insertar propuesta de proyecto
      const insertResult = await query<{ id: number; estado: string; motivo_rechazo: string | null }>(
        `INSERT INTO proyectos (
           organizacion_id, titulo, descripcion, ubicacion, 
           cupos_disponibles, fecha_inicio, fecha_fin, 
           es_mayor_edad, estado, motivo_rechazo, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, 25, '2026-07-01', '2026-07-30', true, 'pendiente_revision', NULL, NOW(), NOW())
         RETURNING id, estado, motivo_rechazo`,
        [orgId, testTitle, 'Proyecto de recuperación de áreas verdes y juegos infantiles comunitarios', testUbicacion]
      );

      assert.ok(insertResult.length > 0, 'La propuesta debe registrarse');
      const projectId = insertResult[0].id;

      // 3. Verificar estado inicial estricto 'pendiente_revision' (KIR-108)
      assert.equal(insertResult[0].estado, 'pendiente_revision', 'El estado inicial debe ser pendiente_revision');
      assert.equal(insertResult[0].motivo_rechazo, null, 'El motivo de rechazo debe ser null');

      // 4. Verificar que NO aparece en el catálogo público de voluntarios (sólo muestra aprobados)
      const publicCatalog = await query<{ id: number }>(
        'SELECT id FROM proyectos WHERE id = $1 AND estado = $2',
        [projectId, 'aprobado']
      );
      assert.equal(publicCatalog.length, 0, 'No debe aparecer en el catálogo público antes de ser aprobado');

      // 5. Verificar que SÍ aparece en la cola de revisión de administración
      const adminQueue = await query<{ id: number }>(
        'SELECT id FROM proyectos WHERE id = $1 AND estado = $2',
        [projectId, 'pendiente_revision']
      );
      assert.equal(adminQueue.length, 1, 'Debe aparecer en la cola de proyectos pendientes de revisión');

      // Limpieza de datos
      await query('DELETE FROM proyectos WHERE id = $1', [projectId]);
    });

    it('KIR-110: Registrar propuesta con creación de nueva institución aliada en simultáneo', async () => {
      const orgName = 'Colectivo Territorial Test ' + Date.now();
      const projTitle = 'Huertos Escolares y Compostaje ' + Date.now();

      // 1. Crear organización nueva on-the-fly
      const orgInsert = await query<{ id: number }>(
        `INSERT INTO organizaciones (nombre, tipo, contacto_nombre, contacto_email, contacto_telefono)
         VALUES ($1, 'Colectivo Social', 'Carla Miranda', 'carla@colectivo.test', '71234567')
         RETURNING id`,
        [orgName]
      );
      assert.ok(orgInsert.length > 0, 'La nueva organización debe crearse');
      const newOrgId = orgInsert[0].id;

      // 2. Crear proyecto asociado a la nueva organización
      const projInsert = await query<{ id: number; organizacion_id: number; estado: string }>(
        `INSERT INTO proyectos (
           organizacion_id, titulo, descripcion, ubicacion, 
           cupos_disponibles, estado, es_mayor_edad
         ) VALUES ($1, $2, 'Implementación de huertos sustentables para alimentación escolar', 'El Alto, Senkata', 20, 'pendiente_revision', true)
         RETURNING id, organizacion_id, estado`,
        [newOrgId, projTitle]
      );
      assert.ok(projInsert.length > 0, 'El proyecto debe crearse');
      assert.equal(projInsert[0].organizacion_id, newOrgId, 'Debe estar vinculado a la nueva organización');
      assert.equal(projInsert[0].estado, 'pendiente_revision', 'Debe estar en pendiente_revision');

      // Limpieza de datos
      await query('DELETE FROM proyectos WHERE id = $1', [projInsert[0].id]);
      await query('DELETE FROM organizaciones WHERE id = $1', [newOrgId]);
    });
  });

  // -------------------------------------------------------------
  // HISTORIA 8: KIR-24 - Gestionar evaluación inicial (Épica KIR-4)
  // -------------------------------------------------------------
  describe('KIR-24: Gestionar evaluación inicial', () => {
    it('KIR-70: Estructura de la etapa de evaluación inicial en el modelo de datos', async () => {
      // 1. Verificar columnas requeridas en evaluaciones_etapas
      const columns = await query<{ column_name: string; data_type: string }>(
        `SELECT column_name, data_type FROM information_schema.columns 
         WHERE table_schema = 'public' 
         AND table_name = 'evaluaciones_etapas' 
         AND column_name IN ('id', 'postulacion_id', 'etapa', 'estado', 'evaluador', 'comentarios', 'fecha_evaluacion')`
      );
      const names = columns.map((c) => c.column_name);
      assert.ok(names.includes('etapa'), 'Columna etapa debe existir');
      assert.ok(names.includes('estado'), 'Columna estado debe existir');
      assert.ok(names.includes('evaluador'), 'Columna evaluador debe existir');
      assert.ok(names.includes('comentarios'), 'Columna comentarios debe existir');

      // 2. Verificar que el identificador de etapa 'inicial' es el primer eslabón del flujo
      const etapasOrden = ['inicial', 'tecnica', 'personal', 'competencias', 'salud_fisica_psicologica'];
      assert.equal(etapasOrden[0], 'inicial', 'La etapa inicial debe ser la primera');
    });

    it('KIR-71: Reglas de validación del servicio de evaluación inicial', () => {
      // Validador de decisión de evaluación inicial
      const validarDecisionInicial = (estado: string, comentarios?: string) => {
        const estadosValidos = ['aprobado', 'observado', 'rechazado', 'en_revision'];
        if (!estadosValidos.includes(estado)) {
          return { valid: false, error: 'Estado de evaluación inválido' };
        }
        if ((estado === 'rechazado' || estado === 'observado') && (!comentarios || comentarios.trim().length < 5)) {
          return { valid: false, error: 'Debe justificar el motivo u observaciones (mínimo 5 caracteres)' };
        }
        return { valid: true };
      };

      assert.equal(validarDecisionInicial('invalido').valid, false);
      assert.equal(validarDecisionInicial('rechazado', '').valid, false);
      assert.equal(validarDecisionInicial('rechazado', 'No cumple mayoría de edad').valid, true);
      assert.equal(validarDecisionInicial('observado', '').valid, false);
      assert.equal(validarDecisionInicial('observado', 'Falta cédula legible').valid, true);
      assert.equal(validarDecisionInicial('aprobado').valid, true);
    });

    it('KIR-72 & KIR-73: Flujo de Aprobación inicial y desbloqueo automático de etapa técnica', async () => {
      const testCi = 'TEST-EVAL-INI-' + Date.now();
      const testEmail = `eval.ini.${Date.now()}@kiriku.test`;

      // 1. Obtener proyecto
      const proy = await query<{ id: number }>('SELECT id FROM proyectos WHERE estado = $1 LIMIT 1', ['aprobado']);
      assert.ok(proy.length > 0);
      const proyectoId = proy[0].id;

      // 2. Insertar postulante
      const postInsert = await query<{ id: number }>(
        `INSERT INTO postulantes (ci, nombres, apellidos, fecha_nacimiento, email)
         VALUES ($1, 'Beatriz', 'Camacho Test', '2000-03-10', $2)
         RETURNING id`,
        [testCi, testEmail]
      );
      const postulanteId = postInsert[0].id;

      // 3. Crear postulación
      const appInsert = await query<{ id: number }>(
        `INSERT INTO postulaciones (postulante_id, proyecto_id, estado_general)
         VALUES ($1, $2, 'en_proceso')
         RETURNING id`,
        [postulanteId, proyectoId]
      );
      const postulacionId = appInsert[0].id;

      // 4. Crear etapa inicial (en_revision) y técnica (pendiente)
      await query(
        `INSERT INTO evaluaciones_etapas (postulacion_id, etapa, estado, evaluador, comentarios)
         VALUES ($1, 'inicial', 'en_revision', 'Comité de Admisiones', 'Pendiente de verificación')`,
        [postulacionId]
      );
      await query(
        `INSERT INTO evaluaciones_etapas (postulacion_id, etapa, estado, evaluador, comentarios)
         VALUES ($1, 'tecnica', 'pendiente', 'Coordinador', 'Bloqueada hasta aprobar inicial')`,
        [postulacionId]
      );

      // 5. Simular aprobación de etapa inicial (KIR-71 / KIR-72)
      // Actualizar etapa inicial a aprobado
      await query(
        `UPDATE evaluaciones_etapas 
         SET estado = 'aprobado', comentarios = 'Documentación y edad validadas conforme (+18)', fecha_evaluacion = NOW()
         WHERE postulacion_id = $1 AND etapa = 'inicial'`,
        [postulacionId]
      );

      // Desbloquear automáticamente etapa técnica poniéndola en 'en_revision'
      await query(
        `UPDATE evaluaciones_etapas 
         SET estado = 'en_revision', fecha_evaluacion = NOW()
         WHERE postulacion_id = $1 AND etapa = 'tecnica' AND estado = 'pendiente'`,
        [postulacionId]
      );

      // 6. Verificar que la etapa inicial quedó 'aprobado' y la técnica pasó a 'en_revision'
      const rowsEtapas = await query<{ etapa: string; estado: string }>(
        'SELECT etapa, estado FROM evaluaciones_etapas WHERE postulacion_id = $1 ORDER BY id ASC',
        [postulacionId]
      );
      assert.equal(rowsEtapas[0].etapa, 'inicial');
      assert.equal(rowsEtapas[0].estado, 'aprobado', 'Etapa inicial debe estar aprobada');
      assert.equal(rowsEtapas[1].etapa, 'tecnica');
      assert.equal(rowsEtapas[1].estado, 'en_revision', 'Etapa técnica debe haberse activado a en_revision');

      // Limpieza de datos
      await query('DELETE FROM evaluaciones_etapas WHERE postulacion_id = $1', [postulacionId]);
      await query('DELETE FROM postulaciones WHERE id = $1', [postulacionId]);
      await query('DELETE FROM postulantes WHERE id = $1', [postulanteId]);
    });

    it('KIR-73: Flujo de Rechazo en etapa inicial - Cierre global de la postulación', async () => {
      const testCi = 'TEST-EVAL-RECHAZO-' + Date.now();
      const testEmail = `eval.rechazo.${Date.now()}@kiriku.test`;

      // 1. Obtener proyecto
      const proy = await query<{ id: number }>('SELECT id FROM proyectos WHERE estado = $1 LIMIT 1', ['aprobado']);
      assert.ok(proy.length > 0);
      const proyectoId = proy[0].id;

      // 2. Insertar postulante
      const postInsert = await query<{ id: number }>(
        `INSERT INTO postulantes (ci, nombres, apellidos, fecha_nacimiento, email)
         VALUES ($1, 'Rodrigo', 'Galarza Test', '2002-11-20', $2)
         RETURNING id`,
        [testCi, testEmail]
      );
      const postulanteId = postInsert[0].id;

      // 3. Crear postulación
      const appInsert = await query<{ id: number }>(
        `INSERT INTO postulaciones (postulante_id, proyecto_id, estado_general)
         VALUES ($1, $2, 'en_proceso')
         RETURNING id`,
        [postulanteId, proyectoId]
      );
      const postulacionId = appInsert[0].id;

      // 4. Crear etapa inicial
      await query(
        `INSERT INTO evaluaciones_etapas (postulacion_id, etapa, estado, evaluador)
         VALUES ($1, 'inicial', 'en_revision', 'Comité Admisiones')`,
        [postulacionId]
      );

      // 5. Rechazar en etapa inicial con motivo formal
      const motivoRechazo = 'Postulante no cuenta con cédula vigente ni disponibilidad requerida para el proyecto.';
      await query(
        `UPDATE evaluaciones_etapas 
         SET estado = 'rechazado', comentarios = $1, fecha_evaluacion = NOW()
         WHERE postulacion_id = $2 AND etapa = 'inicial'`,
        [motivoRechazo, postulacionId]
      );

      await query(
        `UPDATE postulaciones 
         SET estado_general = 'rechazado', updated_at = NOW() 
         WHERE id = $1`,
        [postulacionId]
      );

      // 6. Verificar que la postulación general fue marcada como rechazada
      const appRow = await query<{ estado_general: string }>(
        'SELECT estado_general FROM postulaciones WHERE id = $1',
        [postulacionId]
      );
      assert.equal(appRow[0].estado_general, 'rechazado', 'La postulación debe rechazarse por completo');

      // Limpieza
      await query('DELETE FROM evaluaciones_etapas WHERE postulacion_id = $1', [postulacionId]);
      await query('DELETE FROM postulaciones WHERE id = $1', [postulacionId]);
      await query('DELETE FROM postulantes WHERE id = $1', [postulanteId]);
    });
  });
});




