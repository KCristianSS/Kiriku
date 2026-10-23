import type { NextFunction, Request, Response } from 'express';
import { supabase, query } from './supabase';
import { hasPermission } from './permissions';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  permissions?: string[];
}

export async function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return res.status(401).json({ error: 'Inicia sesión para continuar' });
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return res.status(401).json({ error: 'Sesión inválida o vencida' });
    req.userId = data.user.id;
    const rows = await query<{ permission: string }>(
      `SELECT DISTINCT p.code AS permission
       FROM user_roles ur
       JOIN role_permissions rp ON rp.role_id = ur.role_id
       JOIN permissions p ON p.id = rp.permission_id
       JOIN roles r ON r.id = ur.role_id AND r.active = TRUE
       WHERE ur.user_id = $1`, [data.user.id]
    );
    req.permissions = rows.map((row) => row.permission);
    next();
  } catch (error) {
    console.error('Error validando sesión:', error);
    res.status(503).json({ error: 'No se pudo validar la sesión' });
  }
}

export function requirePermission(permission: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.userId) return res.status(401).json({ error: 'Inicia sesión para continuar' });
    if (!hasPermission(req.userId, req.permissions, permission)) return res.status(403).json({ error: 'No tienes permiso para esta acción' });
    next();
  };
}
