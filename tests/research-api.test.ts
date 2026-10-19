import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app';
import { researchDefaults } from '../shared/research';
function mockDb() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u' } }, error: null }) },
    rpc: vi.fn(async (name: string, args: any) =>
      name === 'is_admin'
        ? { data: true, error: null }
        : {
            data: {
              total: 1,
              byYear: [{ year: 2007, count: 1 }],
              rows: [
                {
                  youtube_video_id: 'abc',
                  title: 'Entrevista',
                  description: 'Presidente fala de irrigação.',
                  episode_candidates: [],
                },
              ],
            },
            error: null,
          },
    ),
  } as any;
}
describe('authenticated research endpoints / stage 2', () => {
  it('requires auth before exposing search or export', async () => {
    await request(createApp(() => mockDb()))
      .post('/api/research/search')
      .send({ q: 'irrigacao' })
      .expect(401);
    await request(createApp(() => mockDb()))
      .post('/api/research/export')
      .send({})
      .expect(401);
  });
  it('sends validated database criteria and hides full descriptions in result lists', async () => {
    const db = mockDb();
    const r = await request(createApp(() => db))
      .post('/api/research/search')
      .set('Authorization', 'Bearer token')
      .send({ q: 'irrigação', page: 2, pageSize: 25 })
      .expect(200);
    expect(r.body.rows[0].description).toBeUndefined();
    expect(r.body.rows[0].evidence.snippet).toContain('irrigação');
    expect(db.rpc).toHaveBeenCalledWith(
      'search_research',
      expect.objectContaining({ p_offset: 25, p_limit: 25 }),
    );
  });
  it('rejects invalid/abusive input before querying metadata', async () => {
    const db = mockDb();
    await request(createApp(() => db))
      .post('/api/research/search')
      .set('Authorization', 'Bearer token')
      .send({ mode: 'fragment', q: 'ab' })
      .expect(400);
    expect(db.rpc).toHaveBeenCalledTimes(1);
  });
  it('explains a pending additive migration', async () => {
    const db = mockDb();
    db.rpc.mockImplementation(async (name: string) =>
      name === 'is_admin'
        ? { data: true, error: null }
        : { data: null, error: { code: 'PGRST202', message: 'function missing' } },
    );
    const r = await request(createApp(() => db))
      .post('/api/research/search')
      .set('Authorization', 'Bearer token')
      .send({ q: 'irrigacao' })
      .expect(503);
    expect(r.body.error).toContain('002_research.sql');
  });
  it('exports every matching page and protects formula-bearing descriptions', async () => {
    const db = mockDb();
    const rows = Array.from({ length: 501 }, (_, i) => ({
      youtube_video_id: `v${i}`,
      title: `Título ${i}`,
      description: '=1+1',
      episode_status: 'none',
    }));
    db.rpc.mockImplementation(async (name: string, args: any) =>
      name === 'is_admin'
        ? { data: true, error: null }
        : {
            data: { total: 501, rows: rows.slice(args.p_offset, args.p_offset + args.p_limit) },
            error: null,
          },
    );
    const r = await request(createApp(() => db))
      .post('/api/research/export')
      .set('Authorization', 'Bearer token')
      .send({ query: { ...researchDefaults, page: 4 }, format: 'csv', detail: true })
      .expect(200);
    expect(r.text).toContain('Título 500');
    expect(r.text).toContain('"\'=1+1"');
    expect(db.rpc).toHaveBeenCalledWith(
      'search_research',
      expect.objectContaining({ p_offset: 500, p_limit: 500 }),
    );
  });
});
