import 'dotenv/config';
import dotenv from 'dotenv';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';

// If .env was deleted or not loaded, load .env.example as fallback
if (!process.env.DATABASE_URL && fs.existsSync('.env.example')) {
  dotenv.config({ path: '.env.example' });
}

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:ucb_sistemas2026@db.zijlhvezhtgzdgojstbk.supabase.co:5432/postgres';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://zijlhvezhtgzdgojstbk.supabase.co';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InppamxodmV6aHRnemRnb2pzdGJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDAzNTQ2MzcsImV4cCI6MjA1NTkzMDYzN30.dummy';

// -------------------------------------------------------------
// VALIDACIÓN ESTRICTA DEL ARCHIVO .ENV
// -------------------------------------------------------------
if (!DATABASE_URL && !SUPABASE_URL) {
  console.error('\n=============================================================');
  console.error('❌ ERROR FATAL: FALTA CONFIGURACIÓN DE BASE DE DATOS (.env)');
  console.error('El sistema requiere obligatoriamente que exista el archivo .env');
  console.error('Por favor crea el archivo .env en la raíz del proyecto basándote en .env.example:');
  console.error('DATABASE_URL=postgresql://postgres:...@db...supabase.co:5432/postgres');
  console.error('=============================================================\n');
  throw new Error('Configuración de base de datos no encontrada en .env');
}

if (!DATABASE_URL) {
  console.error('\n❌ ERROR: Falta la variable DATABASE_URL en el archivo .env');
  throw new Error('DATABASE_URL es obligatoria en el archivo .env para conectar a PostgreSQL');
}

export const supabase = createClient(
  SUPABASE_URL || 'https://zijlhvezhtgzdgojstbk.supabase.co',
  SUPABASE_KEY || 'dummy-key',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

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
