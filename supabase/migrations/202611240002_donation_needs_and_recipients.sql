CREATE TABLE IF NOT EXISTS receptores_donacion (
  id BIGSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  telefono TEXT NOT NULL,
  organizacion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS necesidades_donacion (
  id BIGSERIAL PRIMARY KEY,
  receptor_id BIGINT NOT NULL REFERENCES receptores_donacion(id) ON DELETE RESTRICT,
  proyecto_destino_id BIGINT REFERENCES proyectos(id) ON DELETE SET NULL,
  tipo_necesidad TEXT NOT NULL CHECK (tipo_necesidad IN ('economica', 'especie')),
  titulo TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  monto_objetivo NUMERIC(12, 2),
  cantidad_objetivo NUMERIC(12, 2),
  unidad_medida TEXT,
  fecha_necesaria DATE,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_revision', 'atendida', 'rechazada', 'cancelada')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT necesidades_donacion_monto_positivo CHECK (monto_objetivo IS NULL OR monto_objetivo > 0),
  CONSTRAINT necesidades_donacion_cantidad_positiva CHECK (cantidad_objetivo IS NULL OR cantidad_objetivo > 0),
  CONSTRAINT necesidades_donacion_datos_por_tipo CHECK (
    (tipo_necesidad = 'economica' AND monto_objetivo IS NOT NULL AND cantidad_objetivo IS NULL AND unidad_medida IS NULL)
    OR
    (tipo_necesidad = 'especie' AND monto_objetivo IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_necesidades_donacion_estado ON necesidades_donacion(estado, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_necesidades_donacion_receptor ON necesidades_donacion(receptor_id);

-- Las tablas se consultan únicamente desde el backend con DATABASE_URL.
ALTER TABLE public.receptores_donacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.necesidades_donacion ENABLE ROW LEVEL SECURITY;
