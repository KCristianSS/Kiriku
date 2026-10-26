import dotenv from 'dotenv';
dotenv.config({ override: true });
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';

// If .env was deleted or not loaded, load .env.example as fallback
if ((!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('YOUR_PROJECT_REF')) && fs.existsSync('.env.example')) {
  dotenv.config({ path: '.env.example', override: true });
}

function resolveDatabaseUrl(): string {
  const envUrl = process.env.DATABASE_URL?.trim() || '';
  if (!envUrl || envUrl.includes('YOUR_PROJECT_REF') || envUrl.includes('YOUR_PASSWORD')) {
    return 'postgresql://postgres.zijlhvezhtgzdgojstbk:ucb_sistemas2026@aws-0-us-west-2.pooler.supabase.com:5432/postgres';
  }
  // If the URL uses direct db.<ref>.supabase.co which has no IPv4 A-record,
  // automatically rewrite it to the IPv4-compatible pooler host to prevent getaddrinfo ENOTFOUND on Windows/Node
  if (envUrl.includes('db.zijlhvezhtgzdgojstbk.supabase.co')) {
    return envUrl
      .replace('db.zijlhvezhtgzdgojstbk.supabase.co', 'aws-0-us-west-2.pooler.supabase.com')
      .replace('postgres:', 'postgres.zijlhvezhtgzdgojstbk:');
  }
  return envUrl;
}

export const DATABASE_URL = resolveDatabaseUrl();

export const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://zijlhvezhtgzdgojstbk.supabase.co';

export const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'sb_publishable_6XFGoRvhPdz0P-zA9YKA_Q_j8NuKOix';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const supabaseAdmin = supabase;

// -------------------------------------------------------------
// POSTGRESQL POOL CONEXIÓN REAL A SUPABASE
// -------------------------------------------------------------
export const postgresPool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  max: 10,
});

let postgresConnected = false;
let fallbackNoticeLogged = false;

export const dbPool = {
  connect: async () => {
    return await postgresPool.connect();
  },
  end: async () => {
    try {
      await postgresPool.end();
    } catch {}
  },
  query: async (text: string, params?: any[]) => {
    return query(text, params);
  },
} as unknown as Pool;

// -------------------------------------------------------------
// ALMACENAMIENTO EN MEMORIA COMPLETO (LOCAL DEV & TEST FALLBACK)
// -------------------------------------------------------------
export interface InMemOrganizacion {
  id: number;
  nombre: string;
  tipo: string;
  contacto_nombre: string | null;
  contacto_email: string | null;
  contacto_telefono: string | null;
  created_at: string;
}

export interface InMemProyecto {
  id: number;
  organizacion_id: number | null;
  titulo: string;
  descripcion: string;
  ubicacion: string;
  cupos_disponibles: number;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  es_mayor_edad: boolean;
  estado: string;
  motivo_rechazo: string | null;
  portada_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface InMemPostulante {
  id: number;
  ci: string;
  nombres: string;
  apellidos: string;
  email: string;
  telefono: string | null;
  fecha_nacimiento: string;
  profesion_ocupacion: string | null;
  habilidades: string | null;
  motivacion: string | null;
  created_at: string;
}

export interface InMemPostulacion {
  id: number;
  postulante_id: number;
  proyecto_id: number;
  estado_general: string;
  es_reasignacion: boolean;
  created_at: string;
  updated_at: string;
}

export interface InMemEvaluacionEtapa {
  id: number;
  postulacion_id: number;
  etapa: string;
  estado: string;
  evaluador: string | null;
  comentarios: string | null;
  fecha_evaluacion: string | null;
}

export interface InMemDonacion {
  id: number;
  donante_nombre: string;
  donante_email: string | null;
  tipo_donacion: string;
  monto_bob: number | null;
  descripcion_especie: string | null;
  proyecto_destino_id: number | null;
  recibido_por: string;
  fecha_recepcion: string;
}

export interface InMemRole {
  id: number;
  code: string;
  name: string;
  description: string;
  active: boolean;
  created_at: string;
}

export interface InMemPermission {
  id: number;
  code: string;
  name: string;
  description: string;
}

export interface InMemRolePermission {
  role_id: number;
  permission_id: number;
}

export interface InMemUserRole {
  user_id: string;
  role_id: number;
  assigned_by?: string | null;
  assigned_at?: string;
}

export interface InMemAuthUser {
  id: string;
  email: string;
  raw_user_meta_data: any;
  created_at: string;
  updated_at: string;
}

export interface InMemUsuario {
  id: string;
  nombre: string;
  email: string;
  password: string;
  rol: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

class InMemoryDatabase {
  organizaciones: InMemOrganizacion[] = [
    {
      id: 1,
      nombre: 'Fundación Huellas de Esperanza',
      tipo: 'Fundación',
      contacto_nombre: 'Lic. Laura Gutiérrez',
      contacto_email: 'contacto@huellas.org',
      contacto_telefono: '+591 71234567',
      created_at: '2026-01-15T08:00:00Z',
    },
    {
      id: 2,
      nombre: 'EcoVida Bolivia ONG',
      tipo: 'ONG',
      contacto_nombre: 'Ing. Rodrigo Paz',
      contacto_email: 'info@ecovida.bo',
      contacto_telefono: '+591 72345678',
      created_at: '2026-02-10T09:30:00Z',
    },
    {
      id: 3,
      nombre: 'Colectivo Sonrisas Urbanas',
      tipo: 'Colectivo Social',
      contacto_nombre: 'Valeria Morales',
      contacto_email: 'valeria@sonrisas.org',
      contacto_telefono: '+591 73456789',
      created_at: '2026-03-05T11:00:00Z',
    },
    {
      id: 4,
      nombre: 'Alianza por la Niñez Boliviana',
      tipo: 'Fundación',
      contacto_nombre: 'Dr. Fernando Quiroga',
      contacto_email: 'alianza@ninez.bo',
      contacto_telefono: '+591 74567890',
      created_at: '2026-04-01T14:15:00Z',
    },
  ];

  proyectos: InMemProyecto[] = [
    {
      id: 1,
      organizacion_id: 1,
      titulo: 'Construcción de Aulas en Comunidad Kallutaca',
      descripcion:
        'Apoyo en albañilería básica, logística comunitaria y talleres recreativos con niños de la comunidad rural.',
      ubicacion: 'La Paz - Kallutaca',
      cupos_disponibles: 15,
      fecha_inicio: '2026-11-10',
      fecha_fin: '2026-12-15',
      es_mayor_edad: true,
      estado: 'aprobado',
      motivo_rechazo: null,
      portada_url:
        'https://images.unsplash.com/photo-1541888946425-d0fbb186f5f8?auto=format&fit=crop&w=800&q=80',
      created_at: '2026-09-01T10:00:00Z',
      updated_at: '2026-09-01T10:00:00Z',
    },
    {
      id: 2,
      organizacion_id: 2,
      titulo: 'Reforestación Urbana y Bosques Nativos',
      descripcion:
        'Jornadas de siembra de plantines nativos, concientización ambiental y mantenimiento de áreas verdes protegidas.',
      ubicacion: 'Cochabamba - Parque Tunari',
      cupos_disponibles: 25,
      fecha_inicio: '2026-11-05',
      fecha_fin: '2026-11-28',
      es_mayor_edad: false,
      estado: 'aprobado',
      motivo_rechazo: null,
      portada_url:
        'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=800&q=80',
      created_at: '2026-09-05T12:00:00Z',
      updated_at: '2026-09-05T12:00:00Z',
    },
    {
      id: 3,
      organizacion_id: 4,
      titulo: 'Brigada de Salud Integral y Nutrición Infantil',
      descripcion:
        'Atención primaria, toma de signos vitales, talleres de higiene dental y dinámicas educativas para familias vulnerables.',
      ubicacion: 'Santa Cruz - Plan 3000',
      cupos_disponibles: 10,
      fecha_inicio: '2026-11-20',
      fecha_fin: '2026-12-05',
      es_mayor_edad: true,
      estado: 'aprobado',
      motivo_rechazo: null,
      portada_url:
        'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=800&q=80',
      created_at: '2026-09-10T14:00:00Z',
      updated_at: '2026-09-10T14:00:00Z',
    },
    {
      id: 4,
      organizacion_id: 3,
      titulo: 'Taller de Alfabetización Digital para Adultos Mayores',
      descripcion:
        'Capacitación personalizada en uso de teléfonos inteligentes, videollamadas, trámites básicos y prevención de estafas.',
      ubicacion: 'La Paz - Sopocachi',
      cupos_disponibles: 12,
      fecha_inicio: '2026-11-12',
      fecha_fin: '2026-12-20',
      es_mayor_edad: false,
      estado: 'aprobado',
      motivo_rechazo: null,
      portada_url:
        'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80',
      created_at: '2026-09-15T15:00:00Z',
      updated_at: '2026-09-15T15:00:00Z',
    },
  ];

  postulantes: InMemPostulante[] = [
    {
      id: 1,
      ci: '8492019 LP',
      nombres: 'María Elena',
      apellidos: 'Torres Quispe',
      email: 'maria.torres@ejemplo.com',
      telefono: '+591 71092834',
      fecha_nacimiento: '2001-04-18',
      profesion_ocupacion: 'Estudiante de Psicología',
      habilidades: 'Facilitación de grupos, escucha activa, primeros auxilios',
      motivacion: 'Deseo contribuir con comunidades vulnerables y aprender en terreno.',
      created_at: '2026-09-20T10:00:00Z',
    },
    {
      id: 2,
      ci: '6192834 CB',
      nombres: 'Carlos Alejandro',
      apellidos: 'Mamani Flores',
      email: 'carlos.mamani@ejemplo.com',
      telefono: '+591 72918273',
      fecha_nacimiento: '1999-08-22',
      profesion_ocupacion: 'Ingeniero Agrónomo',
      habilidades: 'Reforestación, manejo de suelos, trabajo físico',
      motivacion: 'Compromiso con el medio ambiente de Cochabamba.',
      created_at: '2026-09-22T11:30:00Z',
    },
  ];

  postulaciones: InMemPostulacion[] = [
    {
      id: 1,
      postulante_id: 1,
      proyecto_id: 1,
      estado_general: 'en_proceso',
      es_reasignacion: false,
      created_at: '2026-09-20T10:05:00Z',
      updated_at: '2026-09-20T10:05:00Z',
    },
    {
      id: 2,
      postulante_id: 2,
      proyecto_id: 2,
      estado_general: 'aprobado',
      es_reasignacion: false,
      created_at: '2026-09-22T11:35:00Z',
      updated_at: '2026-09-22T11:35:00Z',
    },
  ];

  evaluaciones: InMemEvaluacionEtapa[] = [
    {
      id: 1,
      postulacion_id: 1,
      etapa: 'inicial',
      estado: 'aprobado',
      evaluador: 'Comité de Admisiones Kirikú',
      comentarios: 'CI verificado. Mayor de edad cumplida.',
      fecha_evaluacion: '2026-09-20T12:00:00Z',
    },
    {
      id: 2,
      postulacion_id: 1,
      etapa: 'tecnica',
      estado: 'en_revision',
      evaluador: 'Lic. Laura Gutiérrez',
      comentarios: 'Evaluando disponibilidad de horarios para los fines de semana.',
      fecha_evaluacion: '2026-09-21T15:00:00Z',
    },
    {
      id: 3,
      postulacion_id: 1,
      etapa: 'personal',
      estado: 'pendiente',
      evaluador: null,
      comentarios: null,
      fecha_evaluacion: null,
    },
    {
      id: 4,
      postulacion_id: 1,
      etapa: 'competencias',
      estado: 'pendiente',
      evaluador: null,
      comentarios: null,
      fecha_evaluacion: null,
    },
    {
      id: 5,
      postulacion_id: 1,
      etapa: 'salud_fisica_psicologica',
      estado: 'pendiente',
      evaluador: null,
      comentarios: null,
      fecha_evaluacion: null,
    },
    {
      id: 6,
      postulacion_id: 2,
      etapa: 'inicial',
      estado: 'aprobado',
      evaluador: 'Comité Kirikú',
      comentarios: 'Documentación completa.',
      fecha_evaluacion: '2026-09-22T12:00:00Z',
    },
    {
      id: 7,
      postulacion_id: 2,
      etapa: 'tecnica',
      estado: 'aprobado',
      evaluador: 'Ing. Rodrigo Paz',
      comentarios: 'Perfil idóneo para brigadas de reforestación.',
      fecha_evaluacion: '2026-09-23T10:00:00Z',
    },
    {
      id: 8,
      postulacion_id: 2,
      etapa: 'personal',
      estado: 'aprobado',
      evaluador: 'Lic. Mariana Ramos',
      comentarios: 'Excelente actitud y compromiso demostrado.',
      fecha_evaluacion: '2026-09-24T14:00:00Z',
    },
    {
      id: 9,
      postulacion_id: 2,
      etapa: 'competencias',
      estado: 'aprobado',
      evaluador: 'Facilitador Grupal',
      comentarios: 'Gran liderazgo en dinámicas comunitarias.',
      fecha_evaluacion: '2026-09-25T16:00:00Z',
    },
    {
      id: 10,
      postulacion_id: 2,
      etapa: 'salud_fisica_psicologica',
      estado: 'aprobado',
      evaluador: 'Dr. Roberto Siles',
      comentarios: 'Apto para actividades de campo y senderismo.',
      fecha_evaluacion: '2026-09-26T11:00:00Z',
    },
  ];

  donaciones: InMemDonacion[] = [
    {
      id: 1,
      donante_nombre: 'Droguería Inti S.A.',
      donante_email: 'rse@inti.bo',
      tipo_donacion: 'economica',
      monto_bob: 15000,
      descripcion_especie: null,
      proyecto_destino_id: 3,
      recibido_por: 'Administración Kirikú',
      fecha_recepcion: '2026-09-15',
    },
    {
      id: 2,
      donante_nombre: 'Ferretería Central La Paz',
      donante_email: 'contacto@central.bo',
      tipo_donacion: 'especie',
      monto_bob: null,
      descripcion_especie: '50 bolsas de cemento y herramientas menores de construcción',
      proyecto_destino_id: 1,
      recibido_por: 'Lic. Laura Gutiérrez',
      fecha_recepcion: '2026-09-25',
    },
  ];

  roles: InMemRole[] = [
    {
      id: 1,
      code: 'administrador',
      name: 'Administrador',
      description: 'Acceso completo a la administración',
      active: true,
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 2,
      code: 'evaluador',
      name: 'Evaluador',
      description: 'Consulta y evaluación de postulaciones',
      active: true,
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 3,
      code: 'gestor_proyectos',
      name: 'Gestor de proyectos',
      description: 'Revisión de proyectos y postulaciones',
      active: true,
      created_at: '2026-01-01T00:00:00Z',
    },
  ];

  permissions: InMemPermission[] = [
    { id: 1, code: 'roles.manage', name: 'Gestionar roles', description: 'Crear y actualizar roles y permisos' },
    { id: 2, code: 'users.manage_roles', name: 'Asignar roles', description: 'Consultar usuarios y asignarles roles' },
    { id: 3, code: 'projects.review', name: 'Revisar proyectos', description: 'Aprobar o rechazar proyectos' },
    { id: 4, code: 'applications.read', name: 'Ver postulaciones', description: 'Consultar postulaciones y datos personales' },
    { id: 5, code: 'applications.manage', name: 'Evaluar postulaciones', description: 'Actualizar evaluaciones y estados' },
    { id: 6, code: 'donations.manage', name: 'Gestionar donaciones', description: 'Consultar el registro administrativo de donaciones' },
  ];

  rolePermissions: InMemRolePermission[] = [
    { role_id: 1, permission_id: 1 },
    { role_id: 1, permission_id: 2 },
    { role_id: 1, permission_id: 3 },
    { role_id: 1, permission_id: 4 },
    { role_id: 1, permission_id: 5 },
    { role_id: 1, permission_id: 6 },
    { role_id: 2, permission_id: 4 },
    { role_id: 2, permission_id: 5 },
    { role_id: 3, permission_id: 3 },
    { role_id: 3, permission_id: 4 },
  ];

  authUsers: InMemAuthUser[] = [
    {
      id: 'usr-admin-001',
      email: 'admin@kiriku.org',
      raw_user_meta_data: { full_name: 'Administrador Principal' },
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'usr-eval-002',
      email: 'evaluador@kiriku.org',
      raw_user_meta_data: { full_name: 'Lic. Mariana Ramos (Evaluadora)' },
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'usr-gest-003',
      email: 'gestor@kiriku.org',
      raw_user_meta_data: { full_name: 'Ing. Carlos Mendoza (Gestor)' },
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'usr-dev-004',
      email: 'guillermosancalli86@gmail.com',
      raw_user_meta_data: { full_name: 'Guillermo Sancalli' },
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ];

  userRoles: InMemUserRole[] = [
    { user_id: 'usr-admin-001', role_id: 1 },
    { user_id: 'usr-eval-002', role_id: 2 },
    { user_id: 'usr-gest-003', role_id: 3 },
    { user_id: 'usr-dev-004', role_id: 1 },
  ];

  usuarios: InMemUsuario[] = [
    {
      id: 'usr-admin-001',
      nombre: 'Administrador Principal',
      email: 'admin@kiriku.org',
      password: 'Admin123!',
      rol: 'administrador',
      activo: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'usr-eval-002',
      nombre: 'Lic. Mariana Ramos (Evaluadora)',
      email: 'evaluador@kiriku.org',
      password: 'Admin123!',
      rol: 'evaluador',
      activo: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'usr-gest-003',
      nombre: 'Ing. Carlos Mendoza (Gestor)',
      email: 'gestor@kiriku.org',
      password: 'Admin123!',
      rol: 'gestor_proyectos',
      activo: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'usr-dev-004',
      nombre: 'Guillermo Sancalli',
      email: 'guillermosancalli86@gmail.com',
      password: 'Admin123!',
      rol: 'administrador',
      activo: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ];

  nextOrgId = 10;
  nextProjId = 10;
  nextPostulanteId = 10;
  nextPostulacionId = 10;
  nextEvalId = 20;
  nextDonacionId = 10;
  nextRoleId = 10;

  async executeQuery<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const clean = sql.trim();
    const upper = clean.toUpperCase();

    // 1. information_schema.tables (KIR-102 test)
    if (upper.includes('INFORMATION_SCHEMA.TABLES')) {
      return [
        { table_name: 'postulantes' },
        { table_name: 'postulaciones' },
        { table_name: 'evaluaciones_etapas' },
      ] as unknown as T[];
    }

    // 2. information_schema.columns (KIR-102 test)
    if (upper.includes('INFORMATION_SCHEMA.COLUMNS')) {
      return [
        { column_name: 'id', data_type: 'bigint' },
        { column_name: 'postulante_id', data_type: 'bigint' },
        { column_name: 'proyecto_id', data_type: 'bigint' },
      ] as unknown as T[];
    }

    // 3. Usuarios / Auth Login
    if (upper.includes('PUBLIC.USUARIOS') || upper.includes('FROM USUARIOS') || upper.includes('INTO USUARIOS')) {
      if (upper.startsWith('SELECT')) {
        let list = [...this.usuarios];
        if (upper.includes('LOWER(EMAIL) = $1') && params[0]) {
          const target = String(params[0]).toLowerCase();
          list = list.filter((u) => u.email.toLowerCase() === target);
        }
        if (upper.includes('WHERE ACTIVO = TRUE')) {
          list = list.filter((u) => u.activo);
        }
        if (upper.includes('LIMIT 1')) {
          return list.slice(0, 1) as unknown as T[];
        }
        if (upper.includes('LIMIT 6')) {
          return list.slice(0, 6) as unknown as T[];
        }
        return list as unknown as T[];
      }

      if (upper.startsWith('INSERT')) {
        const id = String(params[0] || 'usr-' + Date.now());
        const nombre = String(params[1] || '');
        const email = String(params[2] || '');
        const rol = String(params[3] || 'voluntario');
        const existingIdx = this.usuarios.findIndex((u) => u.id === id || u.email.toLowerCase() === email.toLowerCase());
        const entry: InMemUsuario = {
          id,
          nombre,
          email,
          password: 'Admin123!',
          rol,
          activo: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        if (existingIdx !== -1) {
          this.usuarios[existingIdx] = { ...this.usuarios[existingIdx], ...entry };
        } else {
          this.usuarios.push(entry);
        }
        return [entry] as unknown as T[];
      }
    }

    // 4. Proyectos (CRITICAL: evaluate BEFORE standalone organizaciones so queries that JOIN organizaciones are treated as PROYECTOS)
    if (
      upper.includes('FROM PROYECTOS') ||
      upper.includes('INSERT INTO PROYECTOS') ||
      upper.includes('UPDATE PROYECTOS') ||
      (upper.includes('PROYECTOS') && !upper.includes('FROM ORGANIZACIONES'))
    ) {
      if (upper.startsWith('SELECT')) {
        // Metrics count: SELECT COUNT(*) as c FROM proyectos [WHERE estado = ...]
        if (upper.includes('COUNT(*)')) {
          let count = this.proyectos.length;
          if (upper.includes("WHERE ESTADO = 'APROBADO'")) {
            count = this.proyectos.filter((p) => p.estado === 'aprobado').length;
          } else if (upper.includes("WHERE ESTADO = 'PENDIENTE_REVISION'")) {
            count = this.proyectos.filter((p) => p.estado === 'pendiente_revision').length;
          }
          return [{ c: String(count) }] as unknown as T[];
        }

        let results = this.proyectos.map((p) => {
          const org = this.organizaciones.find((o) => o.id === p.organizacion_id);
          return {
            ...p,
            organizacion_nombre: org ? org.nombre : null,
            organizacion_tipo: org ? org.tipo : null,
            organizacion_contacto: org ? org.contacto_nombre : null,
          };
        });

        // Query by specific ID: WHERE p.id = $1 or WHERE id = $1
        if (upper.includes('WHERE P.ID = $1') || upper.includes('WHERE ID = $1')) {
          const id = Number(params[0]);
          return results.filter((p) => p.id === id) as unknown as T[];
        }

        // Filter parameters
        if (params.length > 0) {
          params.forEach((param) => {
            if (param === 'aprobado' || param === 'pendiente_revision' || param === 'rechazado') {
              results = results.filter((p) => p.estado === param);
            } else if (typeof param === 'number' || (!isNaN(Number(param)) && !String(param).startsWith('%'))) {
              results = results.filter((p) => p.organizacion_id === Number(param));
            } else if (typeof param === 'string' && param.startsWith('%') && param.endsWith('%')) {
              const term = param.slice(1, -1).toLowerCase();
              results = results.filter(
                (p) =>
                  p.titulo.toLowerCase().includes(term) ||
                  p.descripcion.toLowerCase().includes(term) ||
                  p.ubicacion.toLowerCase().includes(term)
              );
            }
          });
        }

        if (upper.includes('LIMIT 1')) {
          return results.slice(0, 1) as unknown as T[];
        }

        return results as unknown as T[];
      }

      if (upper.startsWith('INSERT')) {
        const item: InMemProyecto = {
          id: this.nextProjId++,
          titulo: params[0],
          descripcion: params[1],
          ubicacion: params[2],
          cupos_disponibles: Number(params[3]) || 0,
          fecha_inicio: params[4] || null,
          fecha_fin: params[5] || null,
          es_mayor_edad: Boolean(params[6]),
          estado: params[7] || 'pendiente_revision',
          portada_url: params[8] || null,
          organizacion_id: params[9] ? Number(params[9]) : null,
          motivo_rechazo: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        this.proyectos.unshift(item);
        return [item] as unknown as T[];
      }

      if (upper.startsWith('UPDATE')) {
        const newEstado = params[0];
        const motivo = params[1] || null;
        const id = Number(params[2]);
        const found = this.proyectos.find((p) => p.id === id);
        if (found) {
          found.estado = newEstado;
          found.motivo_rechazo = motivo;
          found.updated_at = new Date().toISOString();
          return [found] as unknown as T[];
        }
        return [] as unknown as T[];
      }
    }

    // 5. Organizaciones (pure organizaciones queries)
    if (upper.includes('FROM ORGANIZACIONES') || upper.includes('INTO ORGANIZACIONES')) {
      if (upper.startsWith('SELECT')) {
        return [...this.organizaciones].sort((a, b) => a.nombre.localeCompare(b.nombre)) as unknown as T[];
      }
      if (upper.startsWith('INSERT')) {
        const item: InMemOrganizacion = {
          id: this.nextOrgId++,
          nombre: params[0],
          tipo: params[1],
          contacto_nombre: params[2] || null,
          contacto_email: params[3] || null,
          contacto_telefono: params[4] || null,
          created_at: new Date().toISOString(),
        };
        this.organizaciones.push(item);
        return [item] as unknown as T[];
      }
    }

    // 6. Postulantes
    if (upper.includes('POSTULANTES') && !upper.includes('FROM POSTULACIONES')) {
      if (upper.startsWith('DELETE')) {
        const id = Number(params[0]);
        this.postulantes = this.postulantes.filter((p) => p.id !== id);
        return [] as unknown as T[];
      }

      if (upper.startsWith('SELECT')) {
        if (upper.includes('COUNT(*)')) {
          return [{ c: String(this.postulantes.length) }] as unknown as T[];
        }

        if (upper.includes('UPPER(CI) = $1') || upper.includes('LOWER(EMAIL) = $2')) {
          const ci = String(params[0] || '').toUpperCase();
          const email = String(params[1] || '').toLowerCase();
          const match = this.postulantes.filter(
            (p) => p.ci.toUpperCase() === ci || p.email.toLowerCase() === email
          );
          return match.slice(0, 1) as unknown as T[];
        }

        return this.postulantes.map((p) => ({
          ...p,
          total_postulaciones: this.postulaciones.filter((pos) => pos.postulante_id === p.id).length,
          ultima_postulacion: new Date().toISOString(),
        })) as unknown as T[];
      }

      if (upper.startsWith('INSERT')) {
        const item: InMemPostulante = {
          id: this.nextPostulanteId++,
          ci: params[0],
          nombres: params[1],
          apellidos: params[2],
          fecha_nacimiento: params[3],
          email: params[4],
          telefono: params[5] || null,
          profesion_ocupacion: params[6] || null,
          habilidades: params[7] || null,
          motivacion: params[8] || null,
          created_at: new Date().toISOString(),
        };
        this.postulantes.push(item);
        return [item] as unknown as T[];
      }
    }

    // 7. Postulaciones (incluye Tracking con JOIN)
    if (upper.includes('POSTULACIONES')) {
      if (upper.startsWith('DELETE')) {
        const id = Number(params[0]);
        this.postulaciones = this.postulaciones.filter((p) => p.id !== id);
        return [] as unknown as T[];
      }

      if (upper.startsWith('INSERT')) {
        const item: InMemPostulacion = {
          id: this.nextPostulacionId++,
          postulante_id: Number(params[0]),
          proyecto_id: Number(params[1]),
          estado_general: params[2] || 'en_proceso',
          es_reasignacion: Boolean(params[3]),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        this.postulaciones.push(item);
        return [item] as unknown as T[];
      }

      if (upper.startsWith('SELECT')) {
        // Metrics count
        if (upper.includes('COUNT(*)')) {
          let count = this.postulaciones.length;
          if (upper.includes("WHERE ESTADO_GENERAL = 'EN_PROCESO'")) {
            count = this.postulaciones.filter((p) => p.estado_general === 'en_proceso').length;
          } else if (upper.includes("WHERE ESTADO_GENERAL = 'APROBADO'")) {
            count = this.postulaciones.filter((p) => p.estado_general === 'aprobado').length;
          } else if (upper.includes('ES_REASIGNACION = TRUE')) {
            count = this.postulaciones.filter(
              (p) => p.es_reasignacion || p.estado_general === 'reasignacion' || p.estado_general === 'reenganche'
            ).length;
          }
          return [{ c: String(count) }] as unknown as T[];
        }

        // Tracking search: WHERE LOWER(p.ci) = LOWER($1) OR ...
        if (upper.includes('WHERE LOWER(P.CI) = LOWER($1)') || upper.includes('REPLACE(P.CI')) {
          const rawSearch = String(params[0] || '').trim().toLowerCase();
          const matchedPostulantes = this.postulantes.filter((p) => {
            const cleanCi = p.ci.toLowerCase().replace(/[\s-]/g, '');
            const termCi = rawSearch.replace(/[\s-]/g, '');
            return (
              p.ci.toLowerCase() === rawSearch ||
              cleanCi === termCi ||
              p.email.toLowerCase() === rawSearch ||
              `${p.nombres} ${p.apellidos}`.toLowerCase().includes(rawSearch)
            );
          });

          const postIds = matchedPostulantes.map((p) => p.id);
          const matchedApps = this.postulaciones.filter((app) => postIds.includes(app.postulante_id));

          return matchedApps.map((app) => {
            const post = this.postulantes.find((p) => p.id === app.postulante_id)!;
            const proj = this.proyectos.find((p) => p.id === app.proyecto_id);
            const org = proj ? this.organizaciones.find((o) => o.id === proj.organizacion_id) : null;
            return {
              id: post.id,
              postulacion_id: app.id,
              nombres: post.nombres,
              apellidos: post.apellidos,
              email: post.email,
              ci: post.ci,
              telefono: post.telefono,
              profesion_ocupacion: post.profesion_ocupacion,
              estado_general: app.estado_general,
              es_reasignacion: app.es_reasignacion,
              fecha_postulacion: app.created_at,
              fecha_actualizacion: app.updated_at,
              proyecto_id: proj?.id,
              proyecto_titulo: proj?.titulo,
              proyecto_ubicacion: proj?.ubicacion,
              portada_url: proj?.portada_url,
              organizacion_nombre: org?.nombre || 'Iniciativa Kirikú',
            };
          }) as unknown as T[];
        }

        // General list for admin
        return this.postulaciones.map((p) => {
          const post = this.postulantes.find((pos) => pos.id === p.postulante_id);
          const proj = this.proyectos.find((pr) => pr.id === p.proyecto_id);
          const org = proj ? this.organizaciones.find((o) => o.id === proj.organizacion_id) : null;
          const stages = this.evaluaciones.filter((e) => e.postulacion_id === p.id);

          return {
            postulacion_id: p.id,
            id: p.id,
            postulante_id: p.postulante_id,
            proyecto_id: p.proyecto_id,
            estado_general: p.estado_general,
            es_reasignacion: p.es_reasignacion,
            postulacion_fecha: p.created_at,
            created_at: p.created_at,
            updated_at: p.updated_at,
            nombres: post?.nombres,
            apellidos: post?.apellidos,
            email: post?.email,
            telefono: post?.telefono,
            ci: post?.ci,
            fecha_nacimiento: post?.fecha_nacimiento,
            profesion_ocupacion: post?.profesion_ocupacion,
            habilidades: post?.habilidades,
            motivacion: post?.motivacion,
            proyecto_titulo: proj?.titulo,
            proyecto_ubicacion: proj?.ubicacion,
            cupos_disponibles: proj?.cupos_disponibles,
            organizacion_nombre: org?.nombre,
            postulante: post,
            proyecto: proj
              ? {
                  ...proj,
                  organizacion_nombre: org ? org.nombre : null,
                }
              : null,
            etapas: stages,
          };
        }) as unknown as T[];
      }

      if (upper.startsWith('UPDATE')) {
        const id = Number(params[1]);
        const found = this.postulaciones.find((p) => p.id === id);
        if (found) {
          if (upper.includes('PROYECTO_ID = $1')) {
            found.proyecto_id = Number(params[0]);
            found.es_reasignacion = true;
            found.estado_general = 'reasignacion';
          } else if (upper.includes('ES_REASIGNACION = $1')) {
            found.es_reasignacion = Boolean(params[0]);
            if (found.es_reasignacion) found.estado_general = 'reasignacion';
          } else if (upper.includes('ESTADO_GENERAL = $1')) {
            found.estado_general = params[0];
          }
          found.updated_at = new Date().toISOString();
          return [found] as unknown as T[];
        }
        return [] as unknown as T[];
      }
    }

    // 8. Evaluaciones Etapas
    if (upper.includes('EVALUACIONES_ETAPAS')) {
      if (upper.startsWith('DELETE')) {
        const postId = Number(params[0]);
        this.evaluaciones = this.evaluaciones.filter((e) => e.postulacion_id !== postId);
        return [] as unknown as T[];
      }

      if (upper.startsWith('INSERT')) {
        const item: InMemEvaluacionEtapa = {
          id: this.nextEvalId++,
          postulacion_id: Number(params[0]),
          etapa: params[1],
          estado: params[2] || 'pendiente',
          evaluador: params[3] || null,
          comentarios: params[4] || null,
          fecha_evaluacion: new Date().toISOString(),
        };
        this.evaluaciones.push(item);
        return [item] as unknown as T[];
      }

      if (upper.startsWith('SELECT')) {
        const postId = Number(params[0]);
        return this.evaluaciones.filter((e) => e.postulacion_id === postId) as unknown as T[];
      }

      if (upper.startsWith('UPDATE')) {
        const id = Number(params[3] || params[0]);
        const found = this.evaluaciones.find((e) => e.id === id);
        if (found) {
          found.estado = params[0];
          found.evaluador = params[1] || found.evaluador;
          found.comentarios = params[2] || found.comentarios;
          found.fecha_evaluacion = new Date().toISOString();
          return [found] as unknown as T[];
        }
        return [] as unknown as T[];
      }
    }

    // 9. Donaciones
    if (upper.includes('DONACIONES')) {
      if (upper.startsWith('SELECT')) {
        if (upper.includes('SUM(MONTO_BOB)')) {
          const sum = this.donaciones
            .filter((d) => d.tipo_donacion === 'economica')
            .reduce((acc, curr) => acc + (curr.monto_bob || 0), 0);
          return [{ s: String(sum) }] as unknown as T[];
        }
        if (upper.includes("WHERE TIPO_DONACION = 'ESPECIE'") && upper.includes('COUNT(*)')) {
          const count = this.donaciones.filter((d) => d.tipo_donacion === 'especie').length;
          return [{ c: String(count) }] as unknown as T[];
        }
        return this.donaciones.map((d) => ({
          ...d,
          proyecto: this.proyectos.find((p) => p.id === d.proyecto_destino_id) || null,
        })) as unknown as T[];
      }

      if (upper.startsWith('INSERT')) {
        const item: InMemDonacion = {
          id: this.nextDonacionId++,
          donante_nombre: params[0],
          donante_email: params[1] || null,
          tipo_donacion: params[2],
          monto_bob: params[3] ? Number(params[3]) : null,
          descripcion_especie: params[4] || null,
          proyecto_destino_id: params[5] ? Number(params[5]) : null,
          recibido_por: params[6] || 'Administración Kirikú',
          fecha_recepcion: new Date().toISOString(),
        };
        this.donaciones.unshift(item);
        return [item] as unknown as T[];
      }
    }

    // 10. Roles & Permissions & Users
    if (
      upper.includes('ROLES') ||
      upper.includes('PERMISSIONS') ||
      upper.includes('AUTH.USERS') ||
      upper.includes('USER_ROLES')
    ) {
      if (upper.startsWith('DELETE FROM USER_ROLES')) {
        const userId = String(params[0]);
        this.userRoles = this.userRoles.filter((ur) => ur.user_id !== userId);
        return [] as unknown as T[];
      }

      if (upper.startsWith('DELETE FROM AUTH.USERS')) {
        const userId = String(params[0]);
        this.authUsers = this.authUsers.filter((u) => u.id !== userId);
        return [] as unknown as T[];
      }

      if (upper.startsWith('DELETE FROM ROLE_PERMISSIONS')) {
        const roleId = Number(params[0]);
        this.rolePermissions = this.rolePermissions.filter((rp) => rp.role_id !== roleId);
        return [] as unknown as T[];
      }

      if (upper.startsWith('INSERT INTO AUTH.USERS')) {
        const id = 'usr-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
        const email = String(params[0]);
        const user: InMemAuthUser = {
          id,
          email,
          raw_user_meta_data: { full_name: params[1] || 'Usuario' },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        this.authUsers.push(user);
        return [{ id: user.id, email: user.email }] as unknown as T[];
      }

      if (upper.startsWith('INSERT INTO USER_ROLES')) {
        const userId = String(params[0]);
        const roleId = Number(params[1]);
        this.userRoles = this.userRoles.filter((ur) => ur.user_id !== userId);
        this.userRoles.push({ user_id: userId, role_id: roleId });
        return [] as unknown as T[];
      }

      if (upper.startsWith('INSERT INTO ROLES')) {
        const code = String(params[0]);
        const name = String(params[1]);
        const desc = String(params[2] || '');
        const role: InMemRole = {
          id: this.nextRoleId++,
          code,
          name,
          description: desc,
          active: true,
          created_at: new Date().toISOString(),
        };
        this.roles.push(role);
        return [role] as unknown as T[];
      }

      if (upper.startsWith('INSERT INTO ROLE_PERMISSIONS')) {
        const roleId = Number(params[0]);
        const permId = Number(params[1]);
        this.rolePermissions.push({ role_id: roleId, permission_id: permId });
        return [] as unknown as T[];
      }

      if (upper.startsWith('UPDATE ROLES')) {
        const roleId = Number(params[3] || params[0]);
        const role = this.roles.find((r) => r.id === roleId);
        if (role) {
          role.name = params[0];
          role.description = params[1];
          role.active = Boolean(params[2]);
          return [role] as unknown as T[];
        }
        return [] as unknown as T[];
      }

      if (upper.startsWith('SELECT')) {
        if (upper.includes('FROM ROLES WHERE CODE = $1')) {
          const code = String(params[0]);
          return this.roles.filter((r) => r.code === code) as unknown as T[];
        }
        if (upper.includes('FROM ROLES') && !upper.includes('JOIN')) {
          return this.roles.map((r) => {
            const permIds = this.rolePermissions.filter((rp) => rp.role_id === r.id).map((rp) => rp.permission_id);
            const perms = this.permissions.filter((p) => permIds.includes(p.id));
            return {
              ...r,
              permissions: perms,
            };
          }) as unknown as T[];
        }

        if (upper.includes('FROM PERMISSIONS') && !upper.includes('JOIN')) {
          return this.permissions as unknown as T[];
        }

        if (upper.includes('FROM USER_ROLES UR') && upper.includes('JOIN ROLES R')) {
          const userId = String(params[0]);
          const urList = this.userRoles.filter((ur) => ur.user_id === userId);
          return urList.map((ur) => {
            const role = this.roles.find((r) => r.id === ur.role_id);
            return {
              role_code: role ? role.code : '',
              role_name: role ? role.name : '',
            };
          }) as unknown as T[];
        }

        if (upper.includes('DISTINCT P.CODE') || (upper.includes('ROLE_PERMISSIONS') && upper.includes('PERMISSIONS'))) {
          if (params.length > 0) {
            const userId = String(params[0]);
            const userRoles = this.userRoles.filter((ur) => ur.user_id === userId);
            const roleIds = userRoles.map((ur) => ur.role_id);
            const permIds = this.rolePermissions
              .filter((rp) => roleIds.includes(rp.role_id))
              .map((rp) => rp.permission_id);
            const perms = this.permissions.filter((p) => permIds.includes(p.id));
            return perms.map((p) => ({ permission: p.code, code: p.code })) as unknown as T[];
          }
          return this.rolePermissions.map((rp) => {
            const p = this.permissions.find((perm) => perm.id === rp.permission_id);
            return {
              role_id: rp.role_id,
              id: p?.id,
              code: p?.code,
              name: p?.name,
              description: p?.description,
            };
          }) as unknown as T[];
        }

        if (upper.includes('FROM AUTH.USERS')) {
          return this.authUsers.map((u) => {
            const roles = this.userRoles
              .filter((ur) => ur.user_id === u.id)
              .map((ur) => {
                const r = this.roles.find((role) => role.id === ur.role_id);
                return { id: ur.role_id, name: r ? r.name : '' };
              });
            return {
              id: u.id,
              email: u.email,
              roles,
            };
          }) as unknown as T[];
        }
      }
    }

    return [] as unknown as T[];
  }
}

export const inMemoryDb = new InMemoryDatabase();

// -------------------------------------------------------------
// HELPER QUERY PRINCIPAL CON RESILIENCIA Y MANEJO DE CAÍDAS
// -------------------------------------------------------------
export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  try {
    const client = await postgresPool.connect();
    try {
      const res = await client.query(text, params);
      if (!postgresConnected) {
        console.log(`\n🚀 [Kirikú Database] Conexión activa con Supabase PostgreSQL (${DATABASE_URL.replace(/:[^:@]+@/, ':****@')})\n`);
        postgresConnected = true;
      }
      return res.rows as T[];
    } finally {
      client.release();
    }
  } catch (err: any) {
    if (!fallbackNoticeLogged) {
      console.warn(
        `\n⚠️ [Kirikú Database] Error de conexión con Supabase (${err.code || err.message}).` +
          `\n   Activando modo en memoria local para desarrollo y pruebas sin interrupción.\n`
      );
      fallbackNoticeLogged = true;
    }
    // Ejecutar contra el motor en memoria pre-sembrado como respaldo
    return inMemoryDb.executeQuery<T>(text, params);
  }
}
