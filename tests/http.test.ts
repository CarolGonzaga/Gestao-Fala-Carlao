import { describe, it, expect } from 'vitest';
import { apiErrorMessage, readApiJson } from '../shared/http';

describe('API diagnostics', () => {
  it('identifies a Vercel function startup failure without exposing the raw response', () => {
    const message = apiErrorMessage(
      500,
      'A server error has occurred\nFUNCTION_INVOCATION_FAILED\ngru1::request-id',
    );
    expect(message).toContain('backend não iniciou na Vercel');
    expect(message).toContain('HTTP 500');
    expect(message).not.toContain('request-id');
    expect(message).not.toContain('migração');
  });
  it('preserves the authenticated API error for missing configuration', () => {
    expect(apiErrorMessage(503, JSON.stringify({ error: 'Configure SUPABASE_URL.' }))).toBe(
      'Configure SUPABASE_URL.',
    );
  });
  it('rejects an HTML SPA fallback even if it returns HTTP 200', async () => {
    await expect(
      readApiJson(
        new Response('<html>frontend</html>', { headers: { 'Content-Type': 'text/html' } }),
      ),
    ).rejects.toThrow('Verifique as rotas');
  });
  it('reads JSON configuration responses', async () => {
    await expect(readApiJson(Response.json({ youtube: true }))).resolves.toEqual({ youtube: true });
  });
});
