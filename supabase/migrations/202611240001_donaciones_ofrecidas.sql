-- KIR-46: Modelo de donaciones ofrecidas por donantes externos (KIR-30)

ALTER TABLE donaciones
  ALTER COLUMN recibido_por DROP NOT NULL;

ALTER TABLE donaciones
  ADD COLUMN IF NOT EXISTS origen_registro VARCHAR NOT NULL DEFAULT 'recepcion_interna',
  ADD COLUMN IF NOT EXISTS modalidad_entrega VARCHAR,
  ADD COLUMN IF NOT EXISTS fecha_disponible_estimada DATE,
  ADD COLUMN IF NOT EXISTS direccion_recojo TEXT,
  ADD COLUMN IF NOT EXISTS notas_donante TEXT,
  ADD COLUMN IF NOT EXISTS categoria_especie VARCHAR,
  ADD COLUMN IF NOT EXISTS cantidad_especie INTEGER,
  ADD COLUMN IF NOT EXISTS fecha_confirmacion_recepcion TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_donaciones_origen_registro
  ON donaciones(origen_registro);
