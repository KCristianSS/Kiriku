-- Esquema base idempotente para PostgreSQL local en Docker (compatible con las migraciones de Supabase)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aud TEXT DEFAULT 'authenticated',
  role TEXT DEFAULT 'authenticated',
  email TEXT UNIQUE,
  raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
  raw_app_meta_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'voluntario',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.organizaciones (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL,
  contacto_nombre TEXT,
  contacto_email TEXT,
  contacto_telefono TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.proyectos (
  id SERIAL PRIMARY KEY,
  organizacion_id INTEGER REFERENCES public.organizaciones(id) ON DELETE SET NULL,
  titulo TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  ubicacion TEXT NOT NULL,
  cupos_disponibles INTEGER NOT NULL DEFAULT 10,
  fecha_inicio DATE,
  fecha_fin DATE,
  es_mayor_edad BOOLEAN NOT NULL DEFAULT TRUE,
  estado VARCHAR NOT NULL DEFAULT 'pendiente_revision',
  publicado BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_publicacion TIMESTAMPTZ,
  motivo_rechazo TEXT,
  portada_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.postulantes (
  id SERIAL PRIMARY KEY,
  ci TEXT NOT NULL UNIQUE,
  nombres TEXT NOT NULL,
  apellidos TEXT NOT NULL,
  fecha_nacimiento DATE NOT NULL,
  email TEXT NOT NULL,
  telefono TEXT,
  profesion_ocupacion TEXT,
  habilidades TEXT,
  motivacion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.postulaciones (
  id SERIAL PRIMARY KEY,
  postulante_id INTEGER NOT NULL REFERENCES public.postulantes(id) ON DELETE CASCADE,
  proyecto_id INTEGER NOT NULL REFERENCES public.proyectos(id) ON DELETE CASCADE,
  estado_general VARCHAR NOT NULL DEFAULT 'pendiente',
  es_reasignacion BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (postulante_id, proyecto_id)
);

CREATE TABLE IF NOT EXISTS public.evaluaciones_etapas (
  id SERIAL PRIMARY KEY,
  postulacion_id INTEGER NOT NULL REFERENCES public.postulaciones(id) ON DELETE CASCADE,
  etapa VARCHAR NOT NULL,
  estado VARCHAR NOT NULL DEFAULT 'pendiente',
  evaluador TEXT,
  comentarios TEXT,
  fecha_evaluacion TIMESTAMPTZ,
  UNIQUE (postulacion_id, etapa)
);

CREATE TABLE IF NOT EXISTS public.donaciones (
  id SERIAL PRIMARY KEY,
  donante_nombre TEXT NOT NULL,
  donante_email TEXT,
  tipo_donacion VARCHAR NOT NULL,
  monto_bob NUMERIC(12, 2),
  descripcion_especie TEXT,
  proyecto_destino_id INTEGER REFERENCES public.proyectos(id) ON DELETE SET NULL,
  recibido_por TEXT NOT NULL,
  fecha_recepcion TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.imagenes (
  id SERIAL PRIMARY KEY,
  clave TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  url TEXT,
  tipo_mime TEXT,
  datos_base64 TEXT,
  tamano_bytes INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
