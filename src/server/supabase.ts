import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = 
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;

// -------------------------------------------------------------
// VALIDACIÓN ESTRICTA DEL ARCHIVO .ENV
// -------------------------------------------------------------
if (!DATABASE_URL) {
  console.error('\n=============================================================');
  console.error('❌ ERROR FATAL: Falta la variable DATABASE_URL.');
  console.error('Configúrala en el entorno del servidor o en el archivo .env local.');
  console.error('=============================================================\n');
  throw new Error('DATABASE_URL es obligatoria para conectar a PostgreSQL');
}

if (!SUPABASE_URL) {
  throw new Error('SUPABASE_URL o VITE_SUPABASE_URL es obligatoria');
}

if (!SUPABASE_KEY) {
  throw new Error('Configura SUPABASE_SERVICE_ROLE_KEY, SUPABASE_KEY o VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const supabaseAdmin = SUPABASE_SERVICE_ROLE_KEY
  ? createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: { persistSession: false, autoRefreshToken: false },
      }
    )
  : null;

export const dbPool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
  max: 10,
  idleTimeoutMillis: 30000,
});

// Helper for direct SQL queries with robust error handling
export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const client = await dbPool.connect();
  try {
    const res = await client.query(text, params);
    return res.rows as T[];
  } finally {
    client.release();
  }
}
