import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app';
function db(admin = true, valid = true) {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: valid ? { id: 'u' } : null }, error: null })),
    },
    rpc: vi.fn(async (name: string) => ({
      data: name === 'is_admin' ? admin : 'job-1',
      error: null,
    })),
  } as any;
}
afterEach(() => vi.unstubAllEnvs());
describe('administrative endpoint protection', () => {
  it('rejects unauthenticated requests before touching the database', async () => {
    const factory = vi.fn();
    await request(createApp(factory)).post('/api/sync').send({ mode: 'full' }).expect(401);
    expect(factory).not.toHaveBeenCalled();
  });
  it('rejects an invalid session', async () => {
    await request(createApp(() => db(true, false)))
      .get('/api/config')
      .set('Authorization', 'Bearer invalid')
      .expect(401);
  });
  it('rejects valid users without admin authorization', async () => {
    await request(createApp(() => db(false)))
      .post('/api/sync')
      .set('Authorization', 'Bearer user')
      .send({ mode: 'full' })
      .expect(403);
  });
  it('validates job mode', async () => {
    await request(createApp(() => db()))
      .post('/api/sync')
      .set('Authorization', 'Bearer admin')
      .send({ mode: 'unsafe' })
      .expect(400);
  });
  it('shows pending configuration without starting a job', async () => {
    vi.stubEnv('YOUTUBE_API_KEY', '');
    const connection = db();
    await request(createApp(() => connection))
      .post('/api/sync')
      .set('Authorization', 'Bearer admin')
      .send({ mode: 'full' })
      .expect(503);
    expect(connection.rpc).toHaveBeenCalledTimes(1);
  });
  it('queues work durably and explains when immediate dispatch is unavailable', async () => {
    vi.stubEnv('YOUTUBE_API_KEY', 'server-key');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'server-secret');
    vi.stubEnv('GITHUB_TOKEN', '');
    const connection = db();
    const result = await request(createApp(() => connection))
      .post('/api/sync')
      .set('Authorization', 'Bearer admin')
      .send({ mode: 'full' })
      .expect(202);
    expect(result.body.dispatched).toBe(false);
    expect(connection.rpc).toHaveBeenCalledWith('enqueue_sync', { p_mode: 'full' });
    expect(JSON.stringify(result.body)).not.toContain('server-secret');
  });
  it('returns rate and concurrency conflicts from the database', async () => {
    vi.stubEnv('YOUTUBE_API_KEY', 'key');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'secret');
    const connection = db();
    connection.rpc.mockImplementation(async (name: string) =>
      name === 'is_admin'
        ? { data: true, error: null }
        : { data: null, error: { message: 'Aguarde cinco minutos' } },
    );
    await request(createApp(() => connection))
      .post('/api/sync')
      .set('Authorization', 'Bearer admin')
      .send({ mode: 'full' })
      .expect(409);
  });
});
