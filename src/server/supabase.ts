import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// -------------------------------------------------------------
// VALIDACIÓN ESTRICTA DEL ARCHIVO .ENV
// -------------------------------------------------------------
if (!DATABASE_URL) {
  console.error('\n=============================================================');
  console.error('❌ ERROR FATAL: FALTA CONFIGURACIÓN DE BASE DE DATOS (.env)');
  console.error('El sistema requiere obligatoriamente que exista el archivo .env');
  console.error('Por favor crea el archivo .env en la raíz del proyecto basándote en .env.example:');
  console.error('DATABASE_URL=postgresql://postgres:...@db...supabase.co:5432/postgres');
  console.error('=============================================================\n');
  throw new Error('Configuración de base de datos no encontrada en .env');
}

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Faltan SUPABASE_URL y SUPABASE_ANON_KEY en .env.');
  throw new Error('Configuración de Supabase Auth incompleta');
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

// This privileged client is server-only and is required only for administrator invitations.
export const supabaseAdmin = SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
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
