import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL?.trim() || '';
export const isDatabaseConfigured = Boolean(DATABASE_URL);
const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_KEY = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  ''
).trim();

export const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      })
    : null;

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
export const supabaseAdmin: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

export const dbPool: Pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: {
        rejectUnauthorized: false,
      },
      max: 10,
      idleTimeoutMillis: 30000,
    })
  : ({
      connect: async () => {
        throw new Error('DATABASE_URL no configurada en variables de entorno (.env)');
      },
      end: async () => {},
    } as unknown as Pool);

// Helper for direct SQL queries with parameterized binding
export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL no configurada en variables de entorno (.env)');
  }
  const client = await dbPool.connect();
  try {
    const res = await client.query(text, params);
    return res.rows as T[];
  } finally {
    client.release();
  }
}

