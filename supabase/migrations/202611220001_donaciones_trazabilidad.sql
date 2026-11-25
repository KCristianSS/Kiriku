-- KIR-38: Diseño relacional donante - donación - receptor y entregas trazables (KIR-32)

CREATE TABLE IF NOT EXISTS donantes (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR NOT NULL,
  tipo_donante VARCHAR NOT NULL DEFAULT 'persona',
  documento_identidad VARCHAR,
  email VARCHAR,
  telefono VARCHAR,
  ciudad VARCHAR,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS receptores (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR NOT NULL,
  tipo_receptor VARCHAR NOT NULL DEFAULT 'comunidad',
  documento_identidad VARCHAR,
  email VARCHAR,
  telefono VARCHAR,
  ubicacion VARCHAR,
  proyecto_id INTEGER REFERENCES proyectos(id) ON DELETE SET NULL,
  organizacion_id INTEGER REFERENCES organizaciones(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE donaciones
  ADD COLUMN IF NOT EXISTS donante_id INTEGER REFERENCES donantes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS donante_tipo VARCHAR NOT NULL DEFAULT 'persona',
  ADD COLUMN IF NOT EXISTS donante_telefono VARCHAR,
  ADD COLUMN IF NOT EXISTS donante_documento VARCHAR,
  ADD COLUMN IF NOT EXISTS codigo_donacion VARCHAR,
  ADD COLUMN IF NOT EXISTS estado_entrega VARCHAR NOT NULL DEFAULT 'recibida',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS entregas_donaciones (
  id SERIAL PRIMARY KEY,
  donacion_id INTEGER NOT NULL REFERENCES donaciones(id) ON DELETE CASCADE,
  donante_id INTEGER REFERENCES donantes(id) ON DELETE SET NULL,
  receptor_id INTEGER NOT NULL REFERENCES receptores(id) ON DELETE RESTRICT,
  proyecto_id INTEGER REFERENCES proyectos(id) ON DELETE SET NULL,
  organizacion_id INTEGER REFERENCES organizaciones(id) ON DELETE SET NULL,
  codigo_entrega VARCHAR NOT NULL,
  estado VARCHAR NOT NULL DEFAULT 'entregada',
  monto_entregado_bob NUMERIC(12, 2),
  detalle_bienes_entregados TEXT,
  responsable_entrega VARCHAR NOT NULL,
  recibido_por_receptor VARCHAR NOT NULL,
  fecha_entrega TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  observaciones TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_donaciones_donante_id ON donaciones(donante_id);
CREATE INDEX IF NOT EXISTS idx_donaciones_estado_entrega ON donaciones(estado_entrega);
CREATE INDEX IF NOT EXISTS idx_entregas_donaciones_donacion_id ON entregas_donaciones(donacion_id);
CREATE INDEX IF NOT EXISTS idx_entregas_donaciones_donante_id ON entregas_donaciones(donante_id);
CREATE INDEX IF NOT EXISTS idx_entregas_donaciones_receptor_id ON entregas_donaciones(receptor_id);

-- Completar códigos de donación faltantes en registros históricos
UPDATE donaciones
SET codigo_donacion = 'KIR-DON-' || id
WHERE codigo_donacion IS NULL OR codigo_donacion = '';
