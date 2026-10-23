import { createClient } from '@supabase/supabase-js';

const url =
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://zijlhvezhtgzdgojstbk.supabase.co';

const anonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_6XFGoRvhPdz0P-zA9YKA_Q_j8NuKOix';

export const supabaseAuth = url && anonKey ? createClient(url, anonKey) : null;

export function getAuthSetupError() {
  return supabaseAuth ? '' : 'Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env para iniciar sesión.';
}
