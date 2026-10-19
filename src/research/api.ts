import { api } from '../lib';
import { readApiJson } from '../../shared/http';
export async function researchApi<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
  method?: string,
): Promise<T> {
  return readApiJson<T>(
    await api(`research/${path}`, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal,
    }),
  );
}
export async function downloadResearch(query: unknown, format: 'csv' | 'xlsx', detail: boolean) {
  const response = await api('research/export', {
    method: 'POST',
    body: JSON.stringify({ query, format, detail }),
  });
  const url = URL.createObjectURL(await response.blob()),
    a = document.createElement('a');
  a.href = url;
  a.download = `fala-carlao-pesquisa.${format}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
