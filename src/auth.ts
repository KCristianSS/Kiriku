import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseAuth = url && anonKey ? createClient(url, anonKey) : null;

export function getAuthSetupError() {
  return supabaseAuth ? '' : 'Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env para iniciar sesión.';
}
