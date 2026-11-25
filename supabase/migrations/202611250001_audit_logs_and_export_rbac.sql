-- Sprint 1 Correcciones: RBAC de exportaciones/auditoría y Logs de Sistema con tamaño y duración

CREATE TABLE IF NOT EXISTS public.system_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT,
  user_email TEXT,
  user_role TEXT,
  action TEXT NOT NULL,
  module TEXT NOT NULL,
  format TEXT,
  file_size_bytes INTEGER,
  row_count INTEGER,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  filters_json JSONB,
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'denied', 'error')),
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON public.system_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_module_action ON public.system_logs(module, action);
CREATE INDEX IF NOT EXISTS idx_system_logs_status ON public.system_logs(status);

-- Las tablas se consultan únicamente desde el backend con DATABASE_URL.
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

-- Nuevos permisos RBAC para limitar exportación y consulta de logs (principio de privilegios mínimos)
INSERT INTO public.permissions (code, name, description) VALUES
  ('reports.export', 'Exportar reportes', 'Descargar reportes exportables en formato CSV desde las pantallas del sistema'),
  ('audit.read', 'Consultar logs de auditoría', 'Visualizar historial de operaciones y exportaciones del sistema')
ON CONFLICT (code) DO NOTHING;

-- Nuevo rol de auditoría con privilegios mínimos de solo lectura + auditoría
INSERT INTO public.roles (code, name, description) VALUES
  ('auditor', 'Auditor de Sistema', 'Consulta de logs de operaciones, exportaciones y métricas de cumplimiento')
ON CONFLICT (code) DO NOTHING;

-- Administrador recibe todos los permisos (incluyendo reports.export y audit.read)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code IN ('reports.export', 'audit.read')
WHERE r.code = 'administrador'
ON CONFLICT DO NOTHING;

-- Gestor de proyectos recibe permiso de exportación de reportes (sin acceso a roles ni logs globales)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code IN ('reports.export')
WHERE r.code = 'gestor_proyectos'
ON CONFLICT DO NOTHING;

-- Auditor recibe lectura de auditoría y postulaciones (sin permisos de edición ni gestión de roles)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code IN ('audit.read', 'applications.read', 'reports.export')
WHERE r.code = 'auditor'
ON CONFLICT DO NOTHING;
