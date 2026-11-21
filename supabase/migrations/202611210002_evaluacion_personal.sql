ALTER TABLE evaluaciones_etapas
  ADD COLUMN IF NOT EXISTS detalle_criterios_personales JSONB NOT NULL DEFAULT '{}'::jsonb;
