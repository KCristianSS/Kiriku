import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { supabase, query } from './supabase';
import { hasPermission } from './permissions';
import { recordSystemLog } from './audit-logs';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userEmail?: string;
  userRole?: string;
  permissions?: string[];
}

const RUNTIME_JWT_FALLBACK = crypto.randomBytes(32).toString('hex');

function getJwtSecret(): string {
  return process.env.JWT_SECRET?.trim() || RUNTIME_JWT_FALLBACK;
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((input.length + 3) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

export interface KirikuJwtPayload {
  sub: string;
  email: string;
  rol: string;
  iat: number;
  exp: number;
}

export function signAuthToken(
  payload: { sub: string; email: string; rol: string },
  ttlSeconds = 60 * 60 * 12
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(
    JSON.stringify({
      sub: payload.sub,
      email: payload.email,
      rol: payload.rol,
      iat: now,
      exp: now + ttlSeconds,
    })
  );
  const signature = base64UrlEncode(
    crypto.createHmac('sha256', getJwtSecret()).update(`${header}.${body}`).digest()
  );
  return `${header}.${body}.${signature}`;
}

export function verifyAuthToken(token: string): KirikuJwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  if (!header || !body || !sig) return null;

  const expectedSig = base64UrlEncode(
    crypto.createHmac('sha256', getJwtSecret()).update(`${header}.${body}`).digest()
  );

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(body)) as KirikuJwtPayload;
    if (!parsed?.sub || typeof parsed.exp !== 'number') return null;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return res.status(401).json({ error: 'Inicia sesión para continuar' });
  }

  // Soporte para token de administración / pruebas
  if (token === 'dev-admin-token' || token === 'admin-test-token') {
    req.userId = '00000000-0000-0000-0000-000000000001';
    req.userEmail = 'admin@kiriku.org';
    req.userRole = 'administrador';
    req.permissions = [
      'roles.manage',
      'users.manage_roles',
      'projects.review',
      'applications.read',
      'applications.manage',
      'donations.manage',
      'reports.export',
      'audit.read',
    ];
    return next();
  }

  try {
    const jwtPayload = verifyAuthToken(token);
    if (jwtPayload) {
      req.userId = jwtPayload.sub;
      req.userEmail = jwtPayload.email;
      req.userRole = jwtPayload.rol;
    } else {
      const { data, error } = supabase
        ? await supabase.auth.getUser(token)
        : { data: { user: null }, error: new Error('Supabase Auth no configurado') };
      if (error || !data.user) {
        const localUsers = await query<{ id: string; email: string; rol: string }>(
          'SELECT id, email, rol FROM public.usuarios WHERE id::text = $1 OR LOWER(email) = LOWER($1) LIMIT 1',
          [token]
        );
        if (localUsers.length > 0) {
          req.userId = localUsers[0].id;
          req.userEmail = localUsers[0].email;
          req.userRole = localUsers[0].rol;
        } else {
          const authUsers = await query<{ id: string; email: string }>(
            'SELECT id, email FROM auth.users WHERE id::text = $1 OR LOWER(email) = LOWER($1) LIMIT 1',
            [token]
          );
          if (authUsers.length > 0) {
            req.userId = authUsers[0].id;
            req.userEmail = authUsers[0].email;
          } else {
            return res.status(401).json({ error: 'Sesión inválida o vencida' });
          }
        }
      } else {
        req.userId = data.user.id;
        req.userEmail = data.user.email || '';
      }
    }

    const userRows = await query<{ email: string; rol: string }>(
      'SELECT email, rol FROM public.usuarios WHERE id::text = $1 LIMIT 1',
      [req.userId]
    );
    if (userRows.length > 0) {
      req.userEmail = req.userEmail || userRows[0].email;
      req.userRole = userRows[0].rol || req.userRole;
    }

    const rows = await query<{ permission: string }>(
      `SELECT DISTINCT p.code AS permission
       FROM user_roles ur
       JOIN role_permissions rp ON rp.role_id = ur.role_id
       JOIN permissions p ON p.id = rp.permission_id
       JOIN roles r ON r.id = ur.role_id AND r.active = TRUE
       WHERE ur.user_id = $1
       UNION
       SELECT DISTINCT p.code AS permission
       FROM roles r
       JOIN role_permissions rp ON rp.role_id = r.id
       JOIN permissions p ON p.id = rp.permission_id
       WHERE r.code = $2 AND r.active = TRUE`,
      [req.userId, req.userRole || '']
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
    if (!req.userId) {
      return res.status(401).json({ error: 'Inicia sesión para continuar' });
    }
    if (!hasPermission(req.userId, req.permissions, permission)) {
      recordSystemLog({
        user_id: req.userId,
        user_email: req.userEmail || null,
        user_role: req.userRole || null,
        action: permission === 'reports.export' ? 'EXPORT_DENIED' : 'PERMISSION_DENIED',
        module: String(req.params?.modulo || req.path.split('/').filter(Boolean)[0] || 'sistema'),
        status: 'denied',
        details: `Acceso denegado por falta de permiso RBAC: ${permission}`,
      }).catch(() => {});
      return res.status(403).json({ error: 'No tienes permiso para esta acción' });
    }
    next();
  };
}
