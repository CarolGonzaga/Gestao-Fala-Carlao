import { createClient } from '@supabase/supabase-js';
import type { Video } from '../shared/types';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = url && key ? createClient(url, key) : null;
export const number = (v: number | null | undefined) =>
  v == null ? '—' : new Intl.NumberFormat('pt-BR').format(v);
export const date = (v: string | null | undefined, withTime = false) =>
  v
    ? new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        dateStyle: 'short',
        ...(withTime ? { timeStyle: 'short' as const } : {}),
      }).format(new Date(v))
    : '—';
export const thumbnail = (v: Video) =>
  v.thumbnails.medium?.url ?? v.thumbnails.high?.url ?? v.thumbnails.default?.url;
export async function api(path: string, init: RequestInit = {}) {
  const token = (await supabase?.auth.getSession())?.data.session?.access_token;
  const response = await fetch(`/api/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token ?? ''}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? 'Não foi possível acessar o servidor.');
  }
  return response;
}
export function nextSchedule(now = new Date()) {
  // Current Brasília schedule is UTC-3. Explicit UTC math avoids the browser's timezone.
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const candidates = [11, 17, 23, 35].map((h) => new Date(+start + h * 3600000));
  return candidates.find((d) => +d > +now)!.toISOString();
}
