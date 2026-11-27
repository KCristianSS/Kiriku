-- Datos iniciales mínimos para entorno local Docker (sin credenciales expuestas)
INSERT INTO public.organizaciones (nombre, tipo, contacto_nombre, contacto_email, contacto_telefono)
SELECT 'Fundación Kirikú Bolivia', 'ONG', 'Coordinación General', 'contacto@kiriku.org', '+591 70000000'
WHERE NOT EXISTS (SELECT 1 FROM public.organizaciones);

INSERT INTO public.proyectos (
  organizacion_id,
  titulo,
  descripcion,
  ubicacion,
  cupos_disponibles,
  fecha_inicio,
  fecha_fin,
  es_mayor_edad,
  estado,
  publicado,
  fecha_publicacion
)
SELECT
  (SELECT id FROM public.organizaciones ORDER BY id ASC LIMIT 1),
  'Reforestación y Educación Ambiental Comunitaria',
  'Jornadas participativas de arborización urbana y talleres ambientales con vecinos y voluntarios.',
  'La Paz, Zona Sur',
  25,
  CURRENT_DATE + INTERVAL '7 days',
  CURRENT_DATE + INTERVAL '60 days',
  TRUE,
  'aprobado',
  TRUE,
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.proyectos WHERE estado = 'aprobado');
