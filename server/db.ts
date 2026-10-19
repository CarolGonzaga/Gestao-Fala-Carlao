import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
export function serviceDb() {
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no backend.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export function userDb(token: string) {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Configure as variáveis públicas do Supabase no servidor.');
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function checked<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
