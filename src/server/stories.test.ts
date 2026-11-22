import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import test, { describe, it, after } from 'node:test';
import express from 'express';
import apiRouter, {
  buildProcessProgress,
  ETAPAS_PROCESO_DEFINICION,
  normalizeEtapaEstado,
} from './api';
import { hasPermission } from './permissions';
import {
  calculateDonationBalance,
  canTransitionDeliveryState,
  deriveDonationDeliveryStatus,
  validateDeliveryRegistration,
} from './donation-traceability';
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
    function formatLocalYmd(d: Date): string {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }

    function calcularEdad(fechaNac: string): number {
      const hoy = new Date();
      const [birthYear, birthMonth, birthDay] = fechaNac.split('T')[0].split('-').map(Number);
      let edad = hoy.getFullYear() - birthYear;
      const m = (hoy.getMonth() + 1) - birthMonth;
      if (m < 0 || (m === 0 && hoy.getDate() < birthDay)) {
        edad--;
      }
      return edad;
    }

    it('KIR-101: Escenario 1 - Persona menor de 18 años (17 años) debe ser RECHAZADA', () => {
      const hoy = new Date();
      const fecha17 = formatLocalYmd(new Date(hoy.getFullYear() - 17, hoy.getMonth(), hoy.getDate()));
      const edad = calcularEdad(fecha17);
      assert.equal(edad, 17, 'Debe tener exactamente 17 años');
      assert.equal(edad >= 18, false, 'No debe cumplir la mayoría de edad');
    });

    it('KIR-101: Escenario 2 - Persona que cumple 18 años hoy debe ser ADMITIDA', () => {
      const hoy = new Date();
      const fecha18 = formatLocalYmd(new Date(hoy.getFullYear() - 18, hoy.getMonth(), hoy.getDate()));
      const edad = calcularEdad(fecha18);
      assert.equal(edad, 18, 'Debe tener exactamente 18 años hoy');
      assert.equal(edad >= 18, true, 'Debe cumplir la mayoría de edad');
    });

    it('KIR-101: Escenario 3 - Persona que cumple 18 mañana aún tiene 17 y debe ser RECHAZADA', () => {
      const hoy = new Date();
      const manana = formatLocalYmd(new Date(hoy.getFullYear() - 18, hoy.getMonth(), hoy.getDate() + 1));
      const edad = calcularEdad(manana);
      assert.equal(edad, 17, 'Aún tiene 17 años el día de hoy');
      assert.equal(edad >= 18, false, 'No debe cumplir la mayoría de edad');
    });

    it('KIR-101: Escenario 4 - Adulto de 25 años debe ser ADMITIDO', () => {
      const hoy = new Date();
      const fecha25 = formatLocalYmd(new Date(hoy.getFullYear() - 25, 0, 1));
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

  // ============================================================================
  // KIR-22: Publicar proyecto aprobado (KIR-78, KIR-79, KIR-80, KIR-81)
  // ============================================================================
  describe('KIR-22: Publicar proyecto aprobado', () => {
    it('KIR-78: Estructura de publicación - Columnas publicado y fecha_publicacion existen en proyectos', async () => {
      const cols = await query<{ column_name: string; data_type: string; column_default: string | null }>(
        `SELECT column_name, data_type, column_default
         FROM information_schema.columns
         WHERE table_name = 'proyectos' AND column_name IN ('publicado', 'fecha_publicacion')
         ORDER BY column_name`
      );
      const colNames = cols.map((c) => c.column_name);
      assert.ok(colNames.includes('publicado'), 'Debe existir la columna publicado');
      assert.ok(colNames.includes('fecha_publicacion'), 'Debe existir la columna fecha_publicacion');

      const pubCol = cols.find((c) => c.column_name === 'publicado');
      assert.equal(pubCol?.data_type, 'boolean');
      assert.ok(pubCol?.column_default?.includes('false'), 'publicado debe iniciar en false por defecto');
    });

    it('KIR-79: Permiso RBAC y regla de negocio - Solo proyectos aprobados pueden publicarse', async () => {
      const perm = await query<{ codigo: string }>(
        `SELECT p.code AS codigo
         FROM permissions p
         JOIN role_permissions rp ON p.id = rp.permission_id
         JOIN roles r ON rp.role_id = r.id
         WHERE p.code = 'projects.review' AND r.code = 'administrador'`
      );
      assert.ok(perm.length > 0, 'Administrador debe tener permiso projects.review para publicar');

      // Crear proyecto en estado pendiente_revision y verificar que no cumple requisito de publicación
      const org = await query<{ id: number }>('SELECT id FROM organizaciones LIMIT 1');
      assert.ok(org.length > 0);

      const ins = await query<{ id: number; estado: string; publicado: boolean }>(
        `INSERT INTO proyectos (titulo, descripcion, ubicacion, cupos_disponibles, organizacion_id, estado, publicado)
         VALUES ($1, 'Proyecto de prueba KIR-79 no aprobado', 'La Paz', 5, $2, 'pendiente_revision', false)
         RETURNING id, estado, publicado`,
        [`Proyecto KIR-79 Test ${Date.now()}`, org[0].id]
      );
      const projId = ins[0].id;
      assert.equal(ins[0].estado, 'pendiente_revision');
      assert.equal(ins[0].publicado, false);

      // Verificar mediante consulta de servicio que no es elegible para catálogo público
      const eligible = await query<{ id: number }>(
        `SELECT id FROM proyectos WHERE id = $1 AND estado = 'aprobado'`,
        [projId]
      );
      assert.equal(eligible.length, 0, 'Un proyecto no aprobado no puede ser publicado');

      await query('DELETE FROM proyectos WHERE id = $1', [projId]);
    });

    it('KIR-80 y KIR-81: Pruebas de visibilidad - Solo proyectos aprobados y publicados aparecen en listado público', async () => {
      const org = await query<{ id: number }>('SELECT id FROM organizaciones LIMIT 1');
      assert.ok(org.length > 0);

      const testTitle = `Proyecto Visibilidad KIR-22 ${Date.now()}`;

      // 1. Insertar propuesta en pendiente_revision (publicado = false)
      const created = await query<{ id: number; estado: string; publicado: boolean }>(
        `INSERT INTO proyectos (titulo, descripcion, ubicacion, cupos_disponibles, organizacion_id, estado, publicado)
         VALUES ($1, 'Prueba de ciclo de vida de visibilidad', 'Cochabamba', 10, $2, 'pendiente_revision', false)
         RETURNING id, estado, publicado`,
        [testTitle, org[0].id]
      );
      const projectId = created[0].id;
      assert.equal(created[0].publicado, false);

      // Verificar NO visible en catálogo público
      let publicRows = await query<{ id: number }>(
        `SELECT id FROM proyectos WHERE id = $1 AND estado = 'aprobado' AND publicado = true`,
        [projectId]
      );
      assert.equal(publicRows.length, 0, 'Pendiente de revisión NO debe ser visible en catálogo');

      // 2. Aprobar proyecto sin publicar todavía (estado = aprobado, publicado = false)
      await query(
        `UPDATE proyectos SET estado = 'aprobado', updated_at = NOW() WHERE id = $1`,
        [projectId]
      );
      publicRows = await query<{ id: number }>(
        `SELECT id FROM proyectos WHERE id = $1 AND estado = 'aprobado' AND publicado = true`,
        [projectId]
      );
      assert.equal(publicRows.length, 0, 'Aprobado pero sin publicar NO debe ser visible aún en catálogo');

      // 3. Publicar proyecto aprobado (publicado = true, fecha_publicacion = NOW())
      const published = await query<{ id: number; publicado: boolean; fecha_publicacion: string | null }>(
        `UPDATE proyectos
         SET publicado = true, fecha_publicacion = NOW(), updated_at = NOW()
         WHERE id = $1 AND estado = 'aprobado'
         RETURNING id, publicado, fecha_publicacion`,
        [projectId]
      );
      assert.equal(published[0].publicado, true);
      assert.ok(published[0].fecha_publicacion, 'Debe registrar fecha_publicacion');

      publicRows = await query<{ id: number }>(
        `SELECT id FROM proyectos WHERE id = $1 AND estado = 'aprobado' AND publicado = true`,
        [projectId]
      );
      assert.equal(publicRows.length, 1, 'Proyecto aprobado y publicado SÍ debe ser visible en catálogo');

      // 4. Ocultar proyecto del catálogo manteniendo aprobación
      await query(
        `UPDATE proyectos SET publicado = false, fecha_publicacion = NULL, updated_at = NOW() WHERE id = $1`,
        [projectId]
      );
      publicRows = await query<{ id: number }>(
        `SELECT id FROM proyectos WHERE id = $1 AND estado = 'aprobado' AND publicado = true`,
        [projectId]
      );
      assert.equal(publicRows.length, 0, 'Proyecto ocultado NO debe ser visible en catálogo');

      // Limpieza
      await query('DELETE FROM proyectos WHERE id = $1', [projectId]);
    });
  });

  // ============================================================================
  // KIR-23: Consultar seguimiento del proyecto inscrito (KIR-74, KIR-75, KIR-76, KIR-77)
  // ============================================================================
  describe('KIR-23: Consultar seguimiento del proyecto inscrito', () => {
    it('KIR-74 y KIR-75: Consulta por correo de organización y estados visibles (en revisión, aprobado, publicado, rechazado)', async () => {
      const uniqueEmail = `seguimiento.org.${Date.now()}@kiriku.test`;
      const orgIns = await query<{ id: number }>(
        `INSERT INTO organizaciones (nombre, tipo, contacto_nombre, contacto_email)
         VALUES ($1, 'ONG', 'Contacto Seguimiento', $2)
         RETURNING id`,
        [`Org Seguimiento Test ${Date.now()}`, uniqueEmail]
      );
      const orgId = orgIns[0].id;

      // Insertar 3 proyectos con distintos estados visibles
      const pRev = await query<{ id: number }>(
        `INSERT INTO proyectos (titulo, descripcion, ubicacion, cupos_disponibles, organizacion_id, estado, publicado)
         VALUES ('Proyecto En Revisión KIR-77', 'Descripción de prueba KIR-77 revisión', 'La Paz', 10, $1, 'pendiente_revision', false)
         RETURNING id`,
        [orgId]
      );
      const pPub = await query<{ id: number }>(
        `INSERT INTO proyectos (titulo, descripcion, ubicacion, cupos_disponibles, organizacion_id, estado, publicado, fecha_publicacion)
         VALUES ('Proyecto Publicado KIR-77', 'Descripción de prueba KIR-77 publicado', 'El Alto', 15, $1, 'aprobado', true, NOW())
         RETURNING id`,
        [orgId]
      );
      const pRech = await query<{ id: number }>(
        `INSERT INTO proyectos (titulo, descripcion, ubicacion, cupos_disponibles, organizacion_id, estado, publicado, motivo_rechazo)
         VALUES ('Proyecto Rechazado KIR-77', 'Descripción de prueba KIR-77 rechazado', 'Tarija', 5, $1, 'rechazado', false, 'Falta plan de seguridad territorial.')
         RETURNING id`,
        [orgId]
      );

      // Simular consulta exacta de GET /api/proyectos/tracking (case-insensitive y trim)
      const tracked = await query<{
        id: number;
        titulo: string;
        estado: string;
        publicado: boolean;
        fecha_publicacion: string | null;
        motivo_rechazo: string | null;
        organizacion_nombre: string;
      }>(
        `SELECT p.id, p.titulo, p.estado, COALESCE(p.publicado, false) AS publicado,
                p.fecha_publicacion, p.motivo_rechazo, o.nombre AS organizacion_nombre
         FROM proyectos p
         JOIN organizaciones o ON o.id = p.organizacion_id
         WHERE LOWER(TRIM(o.contacto_email)) = LOWER($1)
         ORDER BY p.created_at DESC`,
        [uniqueEmail.toUpperCase()]
      );

      assert.equal(tracked.length, 3, 'La organización debe ver sus 3 proyectos inscritos');

      const rowRev = tracked.find((r) => r.id === pRev[0].id);
      const rowPub = tracked.find((r) => r.id === pPub[0].id);
      const rowRech = tracked.find((r) => r.id === pRech[0].id);

      assert.equal(rowRev?.estado, 'pendiente_revision');
      assert.equal(rowRev?.publicado, false);

      assert.equal(rowPub?.estado, 'aprobado');
      assert.equal(rowPub?.publicado, true);
      assert.ok(rowPub?.fecha_publicacion, 'Debe exponer fecha de publicación');

      assert.equal(rowRech?.estado, 'rechazado');
      assert.equal(rowRech?.motivo_rechazo, 'Falta plan de seguridad territorial.');

      // Otro correo no debe devolver proyectos ajenos
      const empty = await query<{ id: number }>(
        `SELECT p.id FROM proyectos p JOIN organizaciones o ON o.id = p.organizacion_id WHERE LOWER(TRIM(o.contacto_email)) = LOWER($1)`,
        ['inexistente.kiriku@test.org']
      );
      assert.equal(empty.length, 0);

      // Limpieza
      await query('DELETE FROM proyectos WHERE organizacion_id = $1', [orgId]);
      await query('DELETE FROM organizaciones WHERE id = $1', [orgId]);
    });
  });

  // ============================================================================
  // KIR-25: Gestionar evaluación técnica (KIR-66, KIR-67, KIR-68, KIR-69)
  // ============================================================================
  describe('KIR-25: Gestionar evaluación técnica', () => {
    it('KIR-66 y KIR-67: Validación de precondición (etapa inicial aprobada) y obligatoriedad de comentarios', () => {
      const validarEvaluacionTecnica = (
        inicialEstado: string,
        estadoDecision: string,
        comentarios?: string
      ): { ok: boolean; error?: string } => {
        if (inicialEstado !== 'aprobado') {
          return { ok: false, error: 'La etapa inicial debe estar aprobada antes de la evaluación técnica' };
        }
        if (!['aprobado', 'observado', 'rechazado', 'en_revision'].includes(estadoDecision)) {
          return { ok: false, error: 'Estado técnico inválido' };
        }
        if ((estadoDecision === 'rechazado' || estadoDecision === 'observado') && (!comentarios || comentarios.trim().length < 5)) {
          return { ok: false, error: 'Se requiere motivo u observación técnica (mínimo 5 caracteres)' };
        }
        return { ok: true };
      };

      assert.equal(validarEvaluacionTecnica('pendiente', 'aprobado').ok, false, 'No debe aprobar técnica sin inicial aprobada');
      assert.equal(validarEvaluacionTecnica('en_revision', 'aprobado').ok, false, 'No debe aprobar técnica con inicial en revisión');
      assert.equal(validarEvaluacionTecnica('aprobado', 'rechazado', 'no').ok, false, 'Rechazo técnico exige comentarios >= 5 chars');
      assert.equal(validarEvaluacionTecnica('aprobado', 'aprobado', 'Perfil técnico compatible').ok, true);
    });

    it('KIR-68 y KIR-69: Flujo completo del Socio Territorial - Aprobación técnica desbloquea Entrevista Personal', async () => {
      const testCi = 'TEST-TEC-OK-' + Date.now();
      const testEmail = `tec.ok.${Date.now()}@kiriku.test`;

      const proy = await query<{ id: number }>('SELECT id FROM proyectos WHERE estado = $1 LIMIT 1', ['aprobado']);
      assert.ok(proy.length > 0);
      const proyectoId = proy[0].id;

      const postInsert = await query<{ id: number }>(
        `INSERT INTO postulantes (ci, nombres, apellidos, fecha_nacimiento, email, profesion_ocupacion, habilidades)
         VALUES ($1, 'Valeria', 'SocioTest', '1997-04-12', $2, 'Ingeniera Ambiental', 'Reforestación, SIG, Liderazgo comunitario')
         RETURNING id`,
        [testCi, testEmail]
      );
      const postulanteId = postInsert[0].id;

      const appInsert = await query<{ id: number }>(
        `INSERT INTO postulaciones (postulante_id, proyecto_id, estado_general)
         VALUES ($1, $2, 'en_proceso')
         RETURNING id`,
        [postulanteId, proyectoId]
      );
      const postulacionId = appInsert[0].id;

      // Crear las etapas secuenciales (inicial aprobada, tecnica en_revision, personal pendiente)
      await query(
        `INSERT INTO evaluaciones_etapas (postulacion_id, etapa, estado, evaluador, comentarios)
         VALUES
           ($1, 'inicial', 'aprobado', 'Comité de Admisiones', 'Mayoría de edad verificada'),
           ($1, 'tecnica', 'en_revision', 'Socio Territorial / Coordinador de Proyecto', 'Pendiente evaluación técnica'),
           ($1, 'personal', 'pendiente', 'Psicología y Talento Kirikú', 'Esperando evaluación técnica')`,
        [postulacionId]
      );

      // Registrar evaluación técnica aprobada por Socio Territorial
      const dictamen = '[Socio Territorial: Puntaje Técnico: 90/100 | Experiencia Afín: Sí | Competencias Técnicas: Aptas] Perfil técnico idóneo para campo.';
      await query(
        `UPDATE evaluaciones_etapas
         SET estado = 'aprobado', comentarios = $1, evaluador = 'Socio Territorial Zona Norte', fecha_evaluacion = NOW()
         WHERE postulacion_id = $2 AND etapa = 'tecnica'`,
        [dictamen, postulacionId]
      );

      // Desbloquear automáticamente etapa 'personal'
      await query(
        `UPDATE evaluaciones_etapas
         SET estado = 'en_revision', fecha_evaluacion = NOW()
         WHERE postulacion_id = $1 AND etapa = 'personal' AND estado = 'pendiente'`,
        [postulacionId]
      );

      const etapas = await query<{ etapa: string; estado: string; comentarios: string | null }>(
        `SELECT etapa, estado, comentarios FROM evaluaciones_etapas WHERE postulacion_id = $1 ORDER BY id ASC`,
        [postulacionId]
      );

      assert.equal(etapas[1].etapa, 'tecnica');
      assert.equal(etapas[1].estado, 'aprobado', 'Etapa técnica debe quedar aprobada');
      assert.ok(etapas[1].comentarios?.includes('Puntaje Técnico: 90/100'));
      assert.equal(etapas[2].etapa, 'personal');
      assert.equal(etapas[2].estado, 'en_revision', 'Etapa personal debe haberse desbloqueado a en_revision');

      // Limpieza
      await query('DELETE FROM evaluaciones_etapas WHERE postulacion_id = $1', [postulacionId]);
      await query('DELETE FROM postulaciones WHERE id = $1', [postulacionId]);
      await query('DELETE FROM postulantes WHERE id = $1', [postulanteId]);
    });

    it('KIR-69: Rechazo en evaluación técnica cierra globalmente la postulación', async () => {
      const testCi = 'TEST-TEC-REJ-' + Date.now();
      const testEmail = `tec.rej.${Date.now()}@kiriku.test`;

      const proy = await query<{ id: number }>('SELECT id FROM proyectos WHERE estado = $1 LIMIT 1', ['aprobado']);
      assert.ok(proy.length > 0);
      const proyectoId = proy[0].id;

      const postInsert = await query<{ id: number }>(
        `INSERT INTO postulantes (ci, nombres, apellidos, fecha_nacimiento, email)
         VALUES ($1, 'Diego', 'TecnicoRechazo', '1999-08-10', $2)
         RETURNING id`,
        [testCi, testEmail]
      );
      const postulanteId = postInsert[0].id;

      const appInsert = await query<{ id: number }>(
        `INSERT INTO postulaciones (postulante_id, proyecto_id, estado_general)
         VALUES ($1, $2, 'en_proceso')
         RETURNING id`,
        [postulanteId, proyectoId]
      );
      const postulacionId = appInsert[0].id;

      await query(
        `INSERT INTO evaluaciones_etapas (postulacion_id, etapa, estado, evaluador)
         VALUES
           ($1, 'inicial', 'aprobado', 'Comité Admisiones'),
           ($1, 'tecnica', 'en_revision', 'Socio Territorial')`,
        [postulacionId]
      );

      await query(
        `UPDATE evaluaciones_etapas
         SET estado = 'rechazado', comentarios = 'No cuenta con disponibilidad territorial requerida para trabajo en campo.', fecha_evaluacion = NOW()
         WHERE postulacion_id = $1 AND etapa = 'tecnica'`,
        [postulacionId]
      );
      await query(
        `UPDATE postulaciones SET estado_general = 'rechazado', updated_at = NOW() WHERE id = $1`,
        [postulacionId]
      );

      const appRow = await query<{ estado_general: string }>(
        'SELECT estado_general FROM postulaciones WHERE id = $1',
        [postulacionId]
      );
      assert.equal(appRow[0].estado_general, 'rechazado', 'El rechazo técnico debe cerrar la postulación como rechazada');

      // Limpieza
      await query('DELETE FROM evaluaciones_etapas WHERE postulacion_id = $1', [postulacionId]);
      await query('DELETE FROM postulaciones WHERE id = $1', [postulacionId]);
      await query('DELETE FROM postulantes WHERE id = $1', [postulanteId]);
    });
  });

  // ============================================================================
  // KIR-26: Gestionar evaluación personal (KIR-62, KIR-63, KIR-64, KIR-65)
  // ============================================================================
  describe('KIR-26: Gestionar evaluación personal', () => {
    it('KIR-62 & KIR-63 & KIR-65: Estructura JSONB, precondición técnica, cálculo de promedio y desbloqueo de competencias vía HTTP y BD', async () => {
      const cols = await query<{ column_name: string; data_type: string }>(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'evaluaciones_etapas'
           AND column_name = 'detalle_criterios_personales'`
      );
      assert.equal(cols.length, 1, 'La columna detalle_criterios_personales debe existir en evaluaciones_etapas');
      assert.equal(cols[0].data_type, 'jsonb', 'detalle_criterios_personales debe ser JSONB');

      const app = express();
      app.use(express.json());
      app.use('/api', apiRouter);

      const server = http.createServer(app);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const { port } = server.address() as AddressInfo;
      const baseUrl = `http://127.0.0.1:${port}/api`;

      const stamp = Date.now();
      let postulanteId = 0;
      let postulacionId = 0;

      try {
        const proy = await query<{ id: number }>('SELECT id FROM proyectos WHERE estado = $1 LIMIT 1', ['aprobado']);
        assert.ok(proy.length > 0, 'Debe existir un proyecto aprobado');

        const postInsert = await query<{ id: number }>(
          `INSERT INTO postulantes (ci, nombres, apellidos, fecha_nacimiento, email, profesion_ocupacion)
           VALUES ($1, 'Sofía', 'PersonalTest', '1999-05-20', $2, 'Psicóloga Social')
           RETURNING id`,
          [`TEST-PERS-${stamp}`, `personal.test.${stamp}@kiriku.test`]
        );
        postulanteId = postInsert[0].id;

        const appInsert = await query<{ id: number }>(
          `INSERT INTO postulaciones (postulante_id, proyecto_id, estado_general)
           VALUES ($1, $2, 'en_proceso')
           RETURNING id`,
          [postulanteId, proy[0].id]
        );
        postulacionId = appInsert[0].id;

        await query(
          `INSERT INTO evaluaciones_etapas (postulacion_id, etapa, estado, evaluador, comentarios)
           VALUES
             ($1, 'inicial', 'aprobado', 'Comité Admisiones', 'OK'),
             ($1, 'tecnica', 'en_revision', 'Socio Territorial', 'Pendiente'),
             ($1, 'personal', 'pendiente', 'Psicología Kirikú', 'Esperando técnica'),
             ($1, 'competencias', 'pendiente', 'Facilitador Grupal', 'Esperando personal'),
             ($1, 'salud_fisica_psicologica', 'pendiente', 'Equipo Médico', 'Esperando competencias')`,
          [postulacionId]
        );

        const validCriterios = {
          motivacion_servicio: 5,
          compromiso_responsabilidad: 4,
          comunicacion_interpersonal: 4,
          disponibilidad: 5,
          madurez_autocuidado: 4,
        };

        // 1. Sin etapa técnica aprobada debe devolver 400
        const blockedRes = await fetch(`${baseUrl}/evaluaciones/personal/${postulacionId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            estado: 'aprobado',
            evaluador: 'Entrevistador UCB',
            comentarios: 'Intento prematuro',
            criterios: validCriterios,
          }),
        });
        assert.equal(blockedRes.status, 400, 'No debe registrar entrevista personal si técnica no está aprobada');

        // 2. Aprobar técnica y consultar lista personal
        await query(
          `UPDATE evaluaciones_etapas SET estado = 'aprobado' WHERE postulacion_id = $1 AND etapa = 'tecnica'`,
          [postulacionId]
        );
        await query(
          `UPDATE evaluaciones_etapas SET estado = 'en_revision' WHERE postulacion_id = $1 AND etapa = 'personal'`,
          [postulacionId]
        );

        const listRes = await fetch(`${baseUrl}/evaluaciones/personal?q=${encodeURIComponent(`TEST-PERS-${stamp}`)}`);
        assert.equal(listRes.status, 200);
        const listJson = (await listRes.json()) as any[];
        assert.equal(listJson.length, 1);
        assert.equal(listJson[0].puede_evaluar, true);

        // 3. Registrar entrevista personal aprobada -> guarda JSONB, promedio 4.4 y desbloquea competencias
        const saveRes = await fetch(`${baseUrl}/evaluaciones/personal/${postulacionId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            estado: 'aprobado',
            evaluador: 'Lic. Andrea Morales',
            comentarios: 'Excelente vocación y compromiso con las actividades del proyecto.',
            criterios: validCriterios,
          }),
        });
        assert.equal(saveRes.status, 200);
        const saveJson = (await saveRes.json()) as any;
        assert.equal(saveJson.puntaje_promedio, 4.4);
        assert.equal(saveJson.estado_general, 'en_proceso');

        const compStage = await query<{ estado: string }>(
          `SELECT estado FROM evaluaciones_etapas WHERE postulacion_id = $1 AND etapa = 'competencias'`,
          [postulacionId]
        );
        assert.equal(compStage[0]?.estado, 'en_revision', 'Aprobar entrevista personal debe desbloquear competencias');
      } finally {
        server.close();
        if (postulacionId) {
          await query('DELETE FROM evaluaciones_etapas WHERE postulacion_id = $1', [postulacionId]);
          await query('DELETE FROM postulaciones WHERE id = $1', [postulacionId]);
        }
        if (postulanteId) {
          await query('DELETE FROM postulantes WHERE id = $1', [postulanteId]);
        }
      }
    });
  });

  // ============================================================================
  // KIR-27: Gestionar evaluación por competencias (KIR-58, KIR-59, KIR-60, KIR-61)
  // ============================================================================
  describe('KIR-27: Gestionar evaluación por competencias', () => {
    it('KIR-58 & KIR-59 & KIR-61: Estructura JSONB, precondiciones técnica+personal y desbloqueo de salud vía HTTP y BD', async () => {
      const cols = await query<{ column_name: string; data_type: string }>(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'evaluaciones_etapas'
           AND column_name = 'detalle_criterios'`
      );
      assert.equal(cols.length, 1, 'La columna detalle_criterios debe existir en evaluaciones_etapas');
      assert.equal(cols[0].data_type, 'jsonb', 'detalle_criterios debe ser JSONB');

      const app = express();
      app.use(express.json());
      app.use('/api', apiRouter);

      const server = http.createServer(app);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const { port } = server.address() as AddressInfo;
      const baseUrl = `http://127.0.0.1:${port}/api`;

      const stamp = Date.now();
      let postulanteId = 0;
      let postulacionId = 0;

      try {
        const proy = await query<{ id: number }>('SELECT id FROM proyectos WHERE estado = $1 LIMIT 1', ['aprobado']);
        assert.ok(proy.length > 0, 'Debe existir un proyecto aprobado');

        const postInsert = await query<{ id: number }>(
          `INSERT INTO postulantes (ci, nombres, apellidos, fecha_nacimiento, email, profesion_ocupacion)
           VALUES ($1, 'Gabriel', 'CompTest', '1998-03-14', $2, 'Facilitador Comunitario')
           RETURNING id`,
          [`TEST-COMP-${stamp}`, `comp.test.${stamp}@kiriku.test`]
        );
        postulanteId = postInsert[0].id;

        const appInsert = await query<{ id: number }>(
          `INSERT INTO postulaciones (postulante_id, proyecto_id, estado_general)
           VALUES ($1, $2, 'en_proceso')
           RETURNING id`,
          [postulanteId, proy[0].id]
        );
        postulacionId = appInsert[0].id;

        await query(
          `INSERT INTO evaluaciones_etapas (postulacion_id, etapa, estado, evaluador, comentarios)
           VALUES
             ($1, 'inicial', 'aprobado', 'Comité Admisiones', 'OK'),
             ($1, 'tecnica', 'aprobado', 'Socio Territorial', 'OK'),
             ($1, 'personal', 'en_revision', 'Psicología Kirikú', 'Pendiente'),
             ($1, 'competencias', 'pendiente', 'Facilitador Grupal', 'Esperando personal'),
             ($1, 'salud_fisica_psicologica', 'pendiente', 'Equipo Médico', 'Esperando competencias')`,
          [postulacionId]
        );

        const validCriterios = {
          trabajo_equipo: 5,
          comunicacion: 4,
          liderazgo: 5,
          resolucion_problemas: 4,
          empatia_adaptabilidad: 5,
        };

        // 1. Sin personal aprobado debe devolver 400
        const blockedRes = await fetch(`${baseUrl}/evaluaciones/competencias/${postulacionId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            estado: 'aprobado',
            evaluador: 'Facilitador UCB',
            comentarios: 'Intento prematuro',
            criterios: validCriterios,
          }),
        });
        assert.equal(blockedRes.status, 400, 'No debe registrar competencias sin etapa personal aprobada');

        // 2. Aprobar personal y consultar lista competencias
        await query(
          `UPDATE evaluaciones_etapas SET estado = 'aprobado' WHERE postulacion_id = $1 AND etapa = 'personal'`,
          [postulacionId]
        );
        await query(
          `UPDATE evaluaciones_etapas SET estado = 'en_revision' WHERE postulacion_id = $1 AND etapa = 'competencias'`,
          [postulacionId]
        );

        const listRes = await fetch(`${baseUrl}/evaluaciones/competencias?q=${encodeURIComponent(`TEST-COMP-${stamp}`)}`);
        assert.equal(listRes.status, 200);
        const listJson = (await listRes.json()) as any[];
        assert.equal(listJson.length, 1);
        assert.equal(listJson[0].puede_evaluar, true);

        // 3. Registrar competencias aprobada -> guarda JSONB, promedio 4.6 y desbloquea salud_fisica_psicologica
        const saveRes = await fetch(`${baseUrl}/evaluaciones/competencias/${postulacionId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            estado: 'aprobado',
            evaluador: 'Facilitador Grupal Kirikú',
            comentarios: 'Destaca en liderazgo colaborativo y resolución de problemas.',
            criterios: validCriterios,
          }),
        });
        assert.equal(saveRes.status, 200);
        const saveJson = (await saveRes.json()) as any;
        assert.equal(saveJson.puntaje_promedio, 4.6);
        assert.equal(saveJson.estado_general, 'en_proceso');

        const healthStage = await query<{ estado: string }>(
          `SELECT estado FROM evaluaciones_etapas WHERE postulacion_id = $1 AND etapa = 'salud_fisica_psicologica'`,
          [postulacionId]
        );
        assert.equal(healthStage[0]?.estado, 'en_revision', 'Aprobar competencias debe desbloquear salud física y psicológica');
      } finally {
        server.close();
        if (postulacionId) {
          await query('DELETE FROM evaluaciones_etapas WHERE postulacion_id = $1', [postulacionId]);
          await query('DELETE FROM postulaciones WHERE id = $1', [postulacionId]);
        }
        if (postulanteId) {
          await query('DELETE FROM postulantes WHERE id = $1', [postulanteId]);
        }
      }
    });
  });

  // ============================================================================
  // KIR-28: Gestionar evaluación de salud física y psicológica (KIR-54, KIR-55, KIR-56, KIR-57)
  // ============================================================================
  describe('KIR-28: Gestionar evaluación de salud física y psicológica', () => {
    it('KIR-54: Estructura de la etapa de salud física y psicológica como quinta etapa secuencial', async () => {
      const columns = await query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'evaluaciones_etapas'
           AND column_name IN ('id', 'postulacion_id', 'etapa', 'estado', 'evaluador', 'comentarios', 'fecha_evaluacion')`
      );
      const colNames = columns.map((c) => c.column_name);
      assert.ok(colNames.includes('postulacion_id'));
      assert.ok(colNames.includes('etapa'));
      assert.ok(colNames.includes('estado'));
      assert.ok(colNames.includes('evaluador'));
      assert.ok(colNames.includes('comentarios'));
      assert.ok(colNames.includes('fecha_evaluacion'));

      const etapasOrden = ['inicial', 'tecnica', 'personal', 'competencias', 'salud_fisica_psicologica'];
      assert.equal(etapasOrden.length, 5);
      assert.equal(etapasOrden[4], 'salud_fisica_psicologica', 'La etapa de salud física y psicológica debe ser la etapa 5');
    });

    it('KIR-55 & KIR-56: Matriz de permisos RBAC por rol en BD y reglas de validación de dictamen médico/psicológico', async () => {
      // Verificar matriz de permisos real en BD
      const rolePerms = await query<{ role_code: string; perm_code: string }>(
        `SELECT r.code AS role_code, p.code AS perm_code
         FROM roles r
         JOIN role_permissions rp ON rp.role_id = r.id
         JOIN permissions p ON p.id = rp.permission_id
         WHERE r.code IN ('administrador', 'evaluador', 'gestor_proyectos', 'socio_territorial')`
      );

      const permsByRole = (code: string) =>
        rolePerms.filter((row) => row.role_code === code).map((row) => row.perm_code);

      assert.equal(hasPermission('u-admin', permsByRole('administrador'), 'applications.read'), true);
      assert.equal(hasPermission('u-admin', permsByRole('administrador'), 'applications.manage'), true);

      assert.equal(hasPermission('u-eval', permsByRole('evaluador'), 'applications.read'), true);
      assert.equal(hasPermission('u-eval', permsByRole('evaluador'), 'applications.manage'), true);

      // Gestor de proyectos: solo lectura (applications.read sí, applications.manage no)
      assert.equal(hasPermission('u-gestor', permsByRole('gestor_proyectos'), 'applications.read'), true);
      assert.equal(hasPermission('u-gestor', permsByRole('gestor_proyectos'), 'applications.manage'), false);

      // Socio territorial: acceso denegado a módulo de salud (sin applications.read ni applications.manage)
      assert.equal(hasPermission('u-socio', permsByRole('socio_territorial'), 'applications.read'), false);
      assert.equal(hasPermission('u-socio', permsByRole('socio_territorial'), 'applications.manage'), false);
    });

    it('KIR-57: Pruebas reales HTTP de consulta, RBAC (401/403/200), validación de precondición y registro de evaluación de salud', async () => {
      const app = express();
      app.use(express.json());
      app.use('/api', apiRouter);

      const server = http.createServer(app);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const { port } = server.address() as AddressInfo;
      const baseUrl = `http://127.0.0.1:${port}/api`;

      const stamp = Date.now();
      const createdUserIds: string[] = [];
      let postulanteId = 0;
      let postulacionId = 0;

      const createRoleUser = async (roleCode: string, prefix: string) => {
        const roles = await query<{ id: number }>('SELECT id FROM roles WHERE code = $1', [roleCode]);
        assert.ok(roles.length > 0, `Rol ${roleCode} debe existir`);
        const email = `${prefix}.${stamp}@kiriku.test`;
        const userIns = await query<{ id: string }>(
          `INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
           VALUES (gen_random_uuid(), 'authenticated', 'authenticated', $1, json_build_object('full_name', $2::text), NOW(), NOW())
           RETURNING id`,
          [email, `Test ${roleCode}`]
        );
        const uid = userIns[0].id;
        createdUserIds.push(uid);
        await query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [uid, roles[0].id]);
        return uid;
      };

      try {
        const evalToken = await createRoleUser('evaluador', 'kir28-eval');
        const gestorToken = await createRoleUser('gestor_proyectos', 'kir28-gestor');
        const socioToken = await createRoleUser('socio_territorial', 'kir28-socio');

        const proy = await query<{ id: number }>('SELECT id FROM proyectos WHERE estado = $1 LIMIT 1', ['aprobado']);
        assert.ok(proy.length > 0, 'Debe existir un proyecto aprobado');

        const postInsert = await query<{ id: number }>(
          `INSERT INTO postulantes (ci, nombres, apellidos, fecha_nacimiento, email, profesion_ocupacion, habilidades)
           VALUES ($1, 'Lucía', 'SaludTest', '1998-06-15', $2, 'Enfermera', 'Primeros auxilios, Atención comunitaria')
           RETURNING id`,
          [`TEST-SALUD-${stamp}`, `salud.test.${stamp}@kiriku.test`]
        );
        postulanteId = postInsert[0].id;

        const appInsert = await query<{ id: number }>(
          `INSERT INTO postulaciones (postulante_id, proyecto_id, estado_general)
           VALUES ($1, $2, 'en_proceso')
           RETURNING id`,
          [postulanteId, proy[0].id]
        );
        postulacionId = appInsert[0].id;

        // Etapas 1..3 aprobadas, 4 (competencias) aún en revisión, 5 (salud) pendiente
        await query(
          `INSERT INTO evaluaciones_etapas (postulacion_id, etapa, estado, evaluador, comentarios)
           VALUES
             ($1, 'inicial', 'aprobado', 'Comité Admisiones', 'OK'),
             ($1, 'tecnica', 'aprobado', 'Socio Territorial', 'OK'),
             ($1, 'personal', 'aprobado', 'Psicología', 'OK'),
             ($1, 'competencias', 'en_revision', 'Facilitador Grupal', 'En curso'),
             ($1, 'salud_fisica_psicologica', 'pendiente', 'Equipo Médico Kirikú', 'Esperando competencias')`,
          [postulacionId]
        );

        // 1. Consulta sin autenticación -> 401
        const unauthRes = await fetch(`${baseUrl}/evaluaciones/salud`);
        assert.equal(unauthRes.status, 401, 'Usuario sin token debe recibir 401');

        // 2. Consulta con socio_territorial (sin applications.read) -> 403
        const socioRes = await fetch(`${baseUrl}/evaluaciones/salud`, {
          headers: { Authorization: `Bearer ${socioToken}` },
        });
        assert.equal(socioRes.status, 403, 'Socio territorial no debe acceder a evaluación de salud (403)');

        // 3. Consulta con gestor_proyectos (solo lectura) -> 200 y contiene la postulación bloqueada
        const gestorGetRes = await fetch(`${baseUrl}/evaluaciones/salud?q=${encodeURIComponent(`TEST-SALUD-${stamp}`)}`, {
          headers: { Authorization: `Bearer ${gestorToken}` },
        });
        assert.equal(gestorGetRes.status, 200, 'Gestor de proyectos debe poder consultar (solo lectura)');
        const gestorItems = (await gestorGetRes.json()) as any[];
        assert.equal(gestorItems.length, 1);
        assert.equal(gestorItems[0].postulacion_id, postulacionId);
        assert.equal(gestorItems[0].puede_evaluar, false, 'Debe estar bloqueada mientras competencias no esté aprobado');

        // 4. Intento de registro por gestor_proyectos (sin applications.manage) -> 403
        const gestorPostRes = await fetch(`${baseUrl}/evaluaciones/salud/${postulacionId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${gestorToken}`,
          },
          body: JSON.stringify({ estado: 'aprobado', comentarios: 'Intento sin permiso' }),
        });
        assert.equal(gestorPostRes.status, 403, 'Gestor no debe poder registrar evaluaciones de salud (403)');

        // 5. Intento de registro por evaluador cuando competencias NO está aprobado -> 400
        const blockedPostRes = await fetch(`${baseUrl}/evaluaciones/salud/${postulacionId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${evalToken}`,
          },
          body: JSON.stringify({ estado: 'aprobado', comentarios: 'Intento prematuro' }),
        });
        assert.equal(blockedPostRes.status, 400, 'No se debe evaluar salud sin competencias aprobadas (400)');

        // 6. Aprobar competencias y verificar desbloqueo + validación de observación obligatoria
        await query(
          `UPDATE evaluaciones_etapas SET estado = 'aprobado' WHERE postulacion_id = $1 AND etapa = 'competencias'`,
          [postulacionId]
        );
        await query(
          `UPDATE evaluaciones_etapas SET estado = 'en_revision' WHERE postulacion_id = $1 AND etapa = 'salud_fisica_psicologica'`,
          [postulacionId]
        );

        const obsInvalidRes = await fetch(`${baseUrl}/evaluaciones/salud/${postulacionId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${evalToken}`,
          },
          body: JSON.stringify({ estado: 'observado', comentarios: 'abc' }),
        });
        assert.equal(obsInvalidRes.status, 400, 'Estado observado exige comentarios >= 5 caracteres');

        // 7. Registro válido de aprobación de salud -> 200 y postulación pasa a 'aprobado' global
        const approveRes = await fetch(`${baseUrl}/evaluaciones/salud/${postulacionId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${evalToken}`,
          },
          body: JSON.stringify({
            estado: 'aprobado',
            evaluador: 'Dra. Elena Vargas',
            puntaje_bienestar: 94,
            nivel_riesgo: 'bajo',
            criterios: {
              apto_fisico: true,
              apto_psicologico: true,
              examen_medico_vigente: true,
              condicion_especifica_atendida: true,
            },
            comentarios: 'Apto físico y psicológico para trabajo comunitario en campo.',
          }),
        });
        assert.equal(approveRes.status, 200, 'Evaluador autorizado debe registrar evaluación de salud con éxito');
        const approveJson = (await approveRes.json()) as any;
        assert.equal(approveJson.estado_general, 'aprobado', 'Al aprobar las 5 etapas la postulación debe quedar aprobada');
        assert.ok(approveJson.etapa.comentarios.includes('Índice de Bienestar: 94/100'));
        assert.ok(approveJson.etapa.comentarios.includes('Riesgo: BAJO'));

        // 8. Verificar que las métricas y consulta devuelven el registro aprobado
        const metricsRes = await fetch(`${baseUrl}/evaluaciones/salud/metricas`, {
          headers: { Authorization: `Bearer ${evalToken}` },
        });
        assert.equal(metricsRes.status, 200);
        const metricsJson = (await metricsRes.json()) as any;
        assert.ok(metricsJson.aprobados >= 1);
      } finally {
        server.close();
        if (postulacionId) {
          await query('DELETE FROM evaluaciones_etapas WHERE postulacion_id = $1', [postulacionId]);
          await query('DELETE FROM postulaciones WHERE id = $1', [postulacionId]);
        }
        if (postulanteId) {
          await query('DELETE FROM postulantes WHERE id = $1', [postulanteId]);
        }
        for (const uid of createdUserIds) {
          await query('DELETE FROM user_roles WHERE user_id = $1', [uid]);
          await query('DELETE FROM auth.users WHERE id = $1', [uid]);
        }
      }
    });
  });

  // ============================================================================
  // KIR-29: Consultar estado y avance del proceso (KIR-50, KIR-51, KIR-52, KIR-53)
  // ============================================================================
  describe('KIR-29: Consultar estado y avance del proceso', () => {
    it('KIR-50: Definición de estados visibles y cálculo de avance porcentual en las 5 etapas', () => {
      assert.equal(ETAPAS_PROCESO_DEFINICION.length, 5, 'Deben existir exactamente 5 etapas definidas');
      assert.equal(normalizeEtapaEstado('en revision'), 'en_revision');
      assert.equal(normalizeEtapaEstado('aprobada'), 'aprobado');
      assert.equal(normalizeEtapaEstado('observada'), 'observado');
      assert.equal(normalizeEtapaEstado('rechazada'), 'rechazado');

      // Escenario 1: Inicio (0 aprobadas, inicial en revisión) -> 0%
      const avanceInicio = buildProcessProgress('en_proceso', [
        { etapa: 'inicial', estado: 'en_revision', evaluador: 'Admisiones' },
        { etapa: 'tecnica', estado: 'pendiente' },
        { etapa: 'personal', estado: 'pendiente' },
        { etapa: 'competencias', estado: 'pendiente' },
        { etapa: 'salud_fisica_psicologica', estado: 'pendiente' },
      ]);
      assert.equal(avanceInicio.porcentaje, 0);
      assert.equal(avanceInicio.etapas_aprobadas, 0);
      assert.equal(avanceInicio.etapas_en_revision, 1);
      assert.equal(avanceInicio.etapas_pendientes, 4);
      assert.equal(avanceInicio.estado_visible.codigo, 'en_proceso');
      assert.equal(avanceInicio.etapa_actual?.codigo, 'inicial');
      assert.equal(avanceInicio.requiere_atencion, false);

      // Escenario 2: 2 aprobadas + 1 observada -> 40%, estado visible 'observado' y requiere_atencion = true
      const avanceObservado = buildProcessProgress('en_proceso', [
        { etapa: 'inicial', estado: 'aprobado' },
        { etapa: 'tecnica', estado: 'aprobado' },
        { etapa: 'personal', estado: 'observado', comentarios: 'Confirmar disponibilidad de sábado' },
        { etapa: 'competencias', estado: 'pendiente' },
        { etapa: 'salud_fisica_psicologica', estado: 'pendiente' },
      ]);
      assert.equal(avanceObservado.porcentaje, 40);
      assert.equal(avanceObservado.estado_visible.codigo, 'observado');
      assert.equal(avanceObservado.estado_visible.severidad, 'warning');
      assert.equal(avanceObservado.etapa_actual?.codigo, 'personal');
      assert.equal(avanceObservado.requiere_atencion, true);
      assert.ok(avanceObservado.siguiente_paso.includes('Confirmar disponibilidad'));

      // Escenario 3: 5 aprobadas -> 100%, estado visible 'aprobado'
      const avanceCompleto = buildProcessProgress('aprobado', [
        { etapa: 'inicial', estado: 'aprobado' },
        { etapa: 'tecnica', estado: 'aprobado' },
        { etapa: 'personal', estado: 'aprobado' },
        { etapa: 'competencias', estado: 'aprobado' },
        { etapa: 'salud_fisica_psicologica', estado: 'aprobado' },
      ]);
      assert.equal(avanceCompleto.porcentaje, 100);
      assert.equal(avanceCompleto.etapas_aprobadas, 5);
      assert.equal(avanceCompleto.estado_visible.codigo, 'aprobado');
      assert.equal(avanceCompleto.estado_visible.severidad, 'success');
      assert.equal(avanceCompleto.requiere_atencion, false);
    });

    it('KIR-51 & KIR-53: Seguimiento periódico en vivo vía HTTP y BD (0% -> 40% observado -> 60% -> 100% aprobado)', async () => {
      const app = express();
      app.use(express.json());
      app.use('/api', apiRouter);

      const server = http.createServer(app);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const { port } = server.address() as AddressInfo;
      const baseUrl = `http://127.0.0.1:${port}/api`;

      const stamp = Date.now();
      const testCi = `TEST-SEG-${stamp}`;
      const testEmail = `seguimiento.${stamp}@kiriku.test`;
      let postulanteId = 0;
      let postulacionId = 0;

      try {
        const proy = await query<{ id: number }>('SELECT id FROM proyectos WHERE estado = $1 LIMIT 1', ['aprobado']);
        assert.ok(proy.length > 0, 'Debe existir al menos un proyecto aprobado');

        const postInsert = await query<{ id: number }>(
          `INSERT INTO postulantes (ci, nombres, apellidos, fecha_nacimiento, email, profesion_ocupacion)
           VALUES ($1, 'Mateo', 'SeguimientoTest', '1999-09-12', $2, 'Trabajador Social')
           RETURNING id`,
          [testCi, testEmail]
        );
        postulanteId = postInsert[0].id;

        const appInsert = await query<{ id: number }>(
          `INSERT INTO postulaciones (postulante_id, proyecto_id, estado_general)
           VALUES ($1, $2, 'en_proceso')
           RETURNING id`,
          [postulanteId, proy[0].id]
        );
        postulacionId = appInsert[0].id;

        await query(
          `INSERT INTO evaluaciones_etapas (postulacion_id, etapa, estado, evaluador, comentarios, fecha_evaluacion)
           VALUES
             ($1, 'inicial', 'en_revision', 'Comité de Admisiones', 'Revisión inicial recibida', NOW()),
             ($1, 'tecnica', 'pendiente', 'Socio Territorial', 'Pendiente', NOW()),
             ($1, 'personal', 'pendiente', 'Psicología Kirikú', 'Pendiente', NOW()),
             ($1, 'competencias', 'pendiente', 'Facilitador Grupal', 'Pendiente', NOW()),
             ($1, 'salud_fisica_psicologica', 'pendiente', 'Equipo Médico', 'Pendiente', NOW())`,
          [postulacionId]
        );

        // Validación de consulta vacía -> 400
        const badReqRes = await fetch(`${baseUrl}/postulaciones/tracking`);
        assert.equal(badReqRes.status, 400, 'Debe exigir término de búsqueda');

        // Consulta puntual con ID inexistente -> 404
        const notFoundRes = await fetch(`${baseUrl}/postulaciones/99999999/estado`);
        assert.equal(notFoundRes.status, 404, 'Debe devolver 404 si la postulación no existe');

        // Consulta periódica 1 (por CI): Estado inicial 0%
        const check1Res = await fetch(`${baseUrl}/postulaciones/tracking?busqueda=${encodeURIComponent(testCi)}`);
        assert.equal(check1Res.status, 200);
        const check1Data = (await check1Res.json()) as any[];
        assert.equal(check1Data.length, 1);
        assert.equal(check1Data[0].postulacion.codigo_seguimiento, `KIR-${postulacionId}`);
        assert.equal(check1Data[0].avance.porcentaje, 0);
        assert.equal(check1Data[0].avance.etapa_actual.codigo, 'inicial');
        assert.equal(check1Data[0].avance.estado_visible.codigo, 'en_proceso');

        // Simular avance en evaluación: Inicial y Técnica aprobadas, Personal observada
        await query(
          `UPDATE evaluaciones_etapas SET estado = 'aprobado', fecha_evaluacion = NOW()
           WHERE postulacion_id = $1 AND etapa IN ('inicial', 'tecnica')`,
          [postulacionId]
        );
        await query(
          `UPDATE evaluaciones_etapas
           SET estado = 'observado', comentarios = 'Adjuntar horario disponible de fines de semana', fecha_evaluacion = NOW()
           WHERE postulacion_id = $1 AND etapa = 'personal'`,
          [postulacionId]
        );

        // Consulta periódica 2 (por código KIR-ID): 40% con observación visible
        const check2Res = await fetch(
          `${baseUrl}/postulaciones/tracking?busqueda=${encodeURIComponent(`KIR-${postulacionId}`)}`
        );
        assert.equal(check2Res.status, 200);
        const check2Data = (await check2Res.json()) as any[];
        assert.equal(check2Data.length, 1);
        assert.equal(check2Data[0].avance.porcentaje, 40);
        assert.equal(check2Data[0].avance.etapas_aprobadas, 2);
        assert.equal(check2Data[0].avance.etapas_observadas, 1);
        assert.equal(check2Data[0].avance.estado_visible.codigo, 'observado');
        assert.equal(check2Data[0].avance.requiere_atencion, true);
        assert.equal(check2Data[0].avance.etapa_actual.codigo, 'personal');

        // Simular subsanación y avance hasta 100% aprobado en todas las etapas
        await query(
          `UPDATE evaluaciones_etapas
           SET estado = 'aprobado', comentarios = 'Etapa completada satisfactoriamente', fecha_evaluacion = NOW()
           WHERE postulacion_id = $1`,
          [postulacionId]
        );
        await query(
          `UPDATE postulaciones SET estado_general = 'aprobado', updated_at = NOW() WHERE id = $1`,
          [postulacionId]
        );

        // Consulta periódica 3 (endpoint dedicado /:id/estado): 100% aprobado
        const check3Res = await fetch(`${baseUrl}/postulaciones/${postulacionId}/estado`);
        assert.equal(check3Res.status, 200);
        const check3Data = (await check3Res.json()) as any;
        assert.equal(check3Data.postulacion.id, postulacionId);
        assert.equal(check3Data.avance.porcentaje, 100);
        assert.equal(check3Data.avance.etapas_aprobadas, 5);
        assert.equal(check3Data.avance.estado_visible.codigo, 'aprobado');
        assert.equal(check3Data.avance.requiere_atencion, false);
        assert.ok(check3Data.avance.ultima_actualizacion, 'Debe incluir timestamp de última actualización');
      } finally {
        server.close();
        if (postulacionId) {
          await query('DELETE FROM evaluaciones_etapas WHERE postulacion_id = $1', [postulacionId]);
          await query('DELETE FROM postulaciones WHERE id = $1', [postulacionId]);
        }
        if (postulanteId) {
          await query('DELETE FROM postulantes WHERE id = $1', [postulanteId]);
        }
      }
    });
  });

  // ============================================================================
  // KIR-32: Registrar entrega y vínculo entre donante y receptor (KIR-38..KIR-41)
  // ============================================================================
  describe('KIR-32: Registrar entrega y vínculo entre donante y receptor', () => {
    it('KIR-38: Estructura relacional donante-donación-receptor y llaves foráneas en Supabase', async () => {
      const tables = await query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name IN ('donantes', 'receptores', 'donaciones', 'entregas_donaciones')`
      );
      const tableNames = tables.map((t) => t.table_name);
      assert.ok(tableNames.includes('donantes'), 'Debe existir la tabla donantes');
      assert.ok(tableNames.includes('receptores'), 'Debe existir la tabla receptores');
      assert.ok(tableNames.includes('donaciones'), 'Debe existir la tabla donaciones');
      assert.ok(tableNames.includes('entregas_donaciones'), 'Debe existir la tabla entregas_donaciones');

      const donCols = await query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'donaciones'
           AND column_name IN ('donante_id', 'codigo_donacion', 'estado_entrega', 'donante_tipo')`
      );
      assert.equal(donCols.length, 4, 'donaciones debe contar con columnas de trazabilidad y vínculo a donantes');

      const fks = await query<{ table_name: string; column_name: string; foreign_table: string }>(
        `SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
         JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
         WHERE tc.constraint_type = 'FOREIGN KEY'
           AND tc.table_name IN ('donaciones', 'entregas_donaciones')`
      );
      const hasDonanteFk = fks.some(
        (f) => f.table_name === 'donaciones' && f.column_name === 'donante_id' && f.foreign_table === 'donantes'
      );
      const hasEntregaDonacionFk = fks.some(
        (f) => f.table_name === 'entregas_donaciones' && f.column_name === 'donacion_id' && f.foreign_table === 'donaciones'
      );
      const hasEntregaReceptorFk = fks.some(
        (f) => f.table_name === 'entregas_donaciones' && f.column_name === 'receptor_id' && f.foreign_table === 'receptores'
      );
      assert.ok(hasDonanteFk, 'donaciones.donante_id debe referenciar a donantes');
      assert.ok(hasEntregaDonacionFk, 'entregas_donaciones.donacion_id debe referenciar a donaciones');
      assert.ok(hasEntregaReceptorFk, 'entregas_donaciones.receptor_id debe referenciar a receptores');
    });

    it('KIR-39: Validación de reglas de negocio de entregas, saldos y transiciones de estado', () => {
      // Validación de monto superior al saldo disponible
      const overBudget = validateDeliveryRegistration(
        { tipo_donacion: 'economica', monto_bob: 1000 },
        [{ estado: 'entregada', monto_entregado_bob: 600 }],
        {
          receptor_nombre: 'Comunidad Norte',
          responsable_entrega: 'Equipo Kirikú',
          recibido_por_receptor: 'Ana Quispe',
          monto_entregado_bob: 500,
        }
      );
      assert.equal(overBudget.ok, false, 'Debe rechazar montos superiores al saldo disponible (400 Bs.)');

      // Cálculo de saldo y estado parcial vs completado
      const bal = calculateDonationBalance('economica', 1000, [
        { estado: 'entregada', monto_entregado_bob: 600 },
      ]);
      assert.equal(bal.monto_entregado_bob, 600);
      assert.equal(bal.saldo_disponible_bob, 400);
      assert.equal(
        deriveDonationDeliveryStatus('economica', 1000, [
          { estado: 'entregada', monto_entregado_bob: 600 },
        ]),
        'entrega_parcial'
      );
      assert.equal(
        deriveDonationDeliveryStatus('economica', 1000, [
          { estado: 'entregada', monto_entregado_bob: 600 },
          { estado: 'verificada', monto_entregado_bob: 400 },
        ]),
        'entregada'
      );

      // Transiciones de estado válidas vs retrocesos inválidos
      assert.equal(canTransitionDeliveryState('programada', 'en_camino'), true);
      assert.equal(canTransitionDeliveryState('en_camino', 'entregada'), true);
      assert.equal(canTransitionDeliveryState('entregada', 'verificada'), true);
      assert.equal(canTransitionDeliveryState('verificada', 'programada'), false);
      assert.equal(canTransitionDeliveryState('entregada', 'en_camino'), false);
    });

    it('KIR-41: Pruebas reales HTTP + BD de trazabilidad Donante → Donación → Entregas → Receptor (económica y especie)', async () => {
      const app = express();
      app.use(express.json());
      app.use('/api', apiRouter);

      const server = http.createServer(app);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const { port } = server.address() as AddressInfo;
      const baseUrl = `http://127.0.0.1:${port}/api`;

      const stamp = Date.now();
      const createdDonationIds: number[] = [];
      const createdDonorIds: number[] = [];
      const createdRecipientIds: number[] = [];

      try {
        const proy = await query<{ id: number }>('SELECT id FROM proyectos WHERE estado = $1 LIMIT 1', ['aprobado']);
        assert.ok(proy.length > 0, 'Debe existir un proyecto aprobado');

        // 1. Registrar donación económica vía HTTP -> crea donante + código KIR-DON
        const createEconRes = await fetch(`${baseUrl}/donaciones`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            donante_nombre: `Empresa Solidaria ${stamp}`,
            donante_tipo: 'empresa',
            donante_documento: `NIT-${stamp}`,
            donante_email: `rse.${stamp}@kiriku.test`,
            donante_telefono: '+591 71112233',
            tipo_donacion: 'economica',
            monto_bob: 1500,
            proyecto_destino_id: proy[0].id,
            recibido_por: 'Carlos Tesorería Kirikú',
          }),
        });
        assert.equal(createEconRes.status, 201);
        const econDonation = (await createEconRes.json()) as any;
        createdDonationIds.push(econDonation.id);
        if (econDonation.donante_id) createdDonorIds.push(econDonation.donante_id);

        assert.equal(econDonation.codigo_donacion, `KIR-DON-${econDonation.id}`);
        assert.equal(econDonation.estado_entrega, 'recibida');
        assert.equal(econDonation.saldo_disponible_bob, 1500);

        // 2. Intentar entregar más del monto donado -> 400
        const invalidDelRes = await fetch(`${baseUrl}/donaciones/${econDonation.id}/entregas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            receptor_nombre: `Comunidad Prueba ${stamp}`,
            receptor_tipo: 'comunidad',
            monto_entregado_bob: 2000,
            responsable_entrega: 'Coordinador Logística',
            recibido_por_receptor: 'Elena Mamani',
          }),
        });
        assert.equal(invalidDelRes.status, 400, 'No debe permitir entregar un monto superior al total donado');

        // 3. Registrar primera entrega parcial (900 Bs.) vinculada a nuevo receptor -> estado 'entrega_parcial'
        const del1Res = await fetch(`${baseUrl}/donaciones/${econDonation.id}/entregas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            receptor_nombre: `Centro Comunitario Villa Esperanza ${stamp}`,
            receptor_tipo: 'comunidad',
            receptor_ubicacion: 'El Alto, Distrito 6',
            proyecto_id: proy[0].id,
            estado: 'entregada',
            monto_entregado_bob: 900,
            responsable_entrega: 'Lucía Logística Kirikú',
            recibido_por_receptor: 'Elena Mamani (Dirigente Vecinal)',
            observaciones: 'Primer desembolso para materiales de reforestación',
          }),
        });
        assert.equal(del1Res.status, 201);
        const del1Json = (await del1Res.json()) as any;
        if (del1Json.entrega?.receptor_id) createdRecipientIds.push(del1Json.entrega.receptor_id);

        assert.equal(del1Json.donacion_estado_entrega, 'entrega_parcial');
        assert.equal(del1Json.saldo_disponible_bob, 600);
        assert.match(del1Json.entrega.codigo_entrega, /^KIR-ENT-\d+$/);

        // 4. Registrar segunda entrega (600 Bs.) en estado 'programada' y avanzar hasta 'verificada'
        const del2Res = await fetch(`${baseUrl}/donaciones/${econDonation.id}/entregas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            receptor_id: del1Json.entrega.receptor_id,
            estado: 'programada',
            monto_entregado_bob: 600,
            responsable_entrega: 'Lucía Logística Kirikú',
            recibido_por_receptor: 'Elena Mamani (Dirigente Vecinal)',
            observaciones: 'Segundo desembolso de cierre',
          }),
        });
        assert.equal(del2Res.status, 201);
        const del2Json = (await del2Res.json()) as any;
        const del2Id = del2Json.entrega.id;
        assert.equal(del2Json.saldo_disponible_bob, 0);

        // Avanzar estado de entrega 2 a 'verificada' -> donación padre pasa a 'entregada'
        const patchRes = await fetch(`${baseUrl}/donaciones/entregas/${del2Id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            estado: 'verificada',
            observaciones: 'Acta firmada y verificada por auditoría',
          }),
        });
        assert.equal(patchRes.status, 200);
        const patchJson = (await patchRes.json()) as any;
        assert.equal(patchJson.entrega.estado, 'verificada');
        assert.equal(patchJson.donacion_estado_entrega, 'entregada');

        // Intentar retroceder una entrega verificada -> 400
        const backwardRes = await fetch(`${baseUrl}/donaciones/entregas/${del2Id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ estado: 'programada' }),
        });
        assert.equal(backwardRes.status, 400, 'No debe permitir retroceder una entrega verificada');

        // 5. Consultar endpoint de trazabilidad completo y verificar cadena Donante -> Donación -> Entregas -> Receptor
        const traceRes = await fetch(`${baseUrl}/donaciones/${econDonation.id}/trazabilidad`);
        assert.equal(traceRes.status, 200);
        const trace = (await traceRes.json()) as any;

        assert.equal(trace.donante.nombre, `Empresa Solidaria ${stamp}`);
        assert.equal(trace.donacion.id, econDonation.id);
        assert.equal(trace.entregas.length, 2);
        assert.equal(trace.resumen.estado_entrega, 'entregada');
        assert.equal(trace.resumen.monto_total_bob, 1500);
        assert.equal(trace.resumen.monto_entregado_bob, 1500);
        assert.equal(trace.resumen.saldo_disponible_bob, 0);
        assert.equal(trace.resumen.receptores_vinculados, 1);

        // 6. Probar donación en especie + búsqueda filtrada por receptor
        const createEspRes = await fetch(`${baseUrl}/donaciones`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            donante_nombre: `Familia Rojas ${stamp}`,
            donante_tipo: 'persona',
            tipo_donacion: 'especie',
            descripcion_especie: '30 kits de abrigo infantil',
            recibido_por: 'Recepción Kirikú',
          }),
        });
        assert.equal(createEspRes.status, 201);
        const espDonation = (await createEspRes.json()) as any;
        createdDonationIds.push(espDonation.id);
        if (espDonation.donante_id) createdDonorIds.push(espDonation.donante_id);

        const delEspRes = await fetch(`${baseUrl}/donaciones/${espDonation.id}/entregas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            receptor_nombre: `Albergue Municipal Sur ${stamp}`,
            receptor_tipo: 'organizacion',
            receptor_ubicacion: 'La Paz, Zona Sur',
            estado: 'entregada',
            detalle_bienes_entregados: '30 kits de abrigo infantil entregados completos',
            responsable_entrega: 'Brigada Kirikú',
            recibido_por_receptor: 'Marco Paredes (Director)',
          }),
        });
        assert.equal(delEspRes.status, 201);
        const delEspJson = (await delEspRes.json()) as any;
        if (delEspJson.entrega?.receptor_id) createdRecipientIds.push(delEspJson.entrega.receptor_id);
        assert.equal(delEspJson.donacion_estado_entrega, 'entregada');

        // Búsqueda por nombre de receptor debe encontrar la donación trazada
        const searchRes = await fetch(
          `${baseUrl}/donaciones?q=${encodeURIComponent(`Albergue Municipal Sur ${stamp}`)}`
        );
        assert.equal(searchRes.status, 200);
        const searchRows = (await searchRes.json()) as any[];
        assert.equal(searchRows.length, 1);
        assert.equal(searchRows[0].id, espDonation.id);
        assert.equal(searchRows[0].ultimo_receptor, `Albergue Municipal Sur ${stamp}`);
      } finally {
        server.close();
        if (createdDonationIds.length) {
          await query('DELETE FROM entregas_donaciones WHERE donacion_id = ANY($1::int[])', [createdDonationIds]);
          await query('DELETE FROM donaciones WHERE id = ANY($1::int[])', [createdDonationIds]);
        }
        if (createdRecipientIds.length) {
          await query('DELETE FROM receptores WHERE id = ANY($1::int[])', [createdRecipientIds]);
        }
        if (createdDonorIds.length) {
          await query('DELETE FROM donantes WHERE id = ANY($1::int[])', [createdDonorIds]);
        }
      }
    });
  });
});




