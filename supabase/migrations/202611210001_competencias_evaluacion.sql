ALTER TABLE evaluaciones_etapas
  ADD COLUMN IF NOT EXISTS detalle_criterios JSONB NOT NULL DEFAULT '{}'::jsonb;
