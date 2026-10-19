import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { readFile } from 'node:fs/promises';
import { toVideo } from '../server/youtube';
const db = new PGlite({ extensions: { pg_trgm } });
const admin = '00000000-0000-4000-8000-000000000001',
  other = '00000000-0000-4000-8000-000000000002',
  owner = '00000000-0000-4000-8000-000000000003';
let job: string;
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
 create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth,public to anon,authenticated,service_role; grant execute on function auth.uid() to authenticated,service_role;
 insert into auth.users values('${admin}'),('${other}');`);
  await db.exec(
    await readFile(new URL('../supabase/migrations/001_catalog.sql', import.meta.url), 'utf8'),
  );
  await db.exec(
    `insert into public.admin_users values('${admin}'); insert into public.channels(id,handle,title,uploads_playlist_id) values('UC','@falacarlao','Fala Carlão','UU');`,
  );
  const result = await db.query<{ id: string }>(
    `insert into public.sync_jobs(mode) values('full') returning id`,
  );
  job = result.rows[0].id;
  await db.query('select public.acquire_sync_lease($1)', [owner]);
}, 60000);
afterAll(async () => await db.close());
const fixture = (id: string, views = '123') =>
  toVideo({
    id,
    snippet: {
      channelId: 'UC',
      title: `História ${id}`,
      description: 'Descrição real do fixture\nsegunda linha',
      thumbnails: {},
      publishedAt: '2007-01-01T00:00:00Z',
    },
    statistics: { viewCount: views },
  });
async function commit(
  videos: ReturnType<typeof fixture>[],
  checkpoint: object = {},
  missing: string[] = [],
  lease = owner,
) {
  return db.query('select public.commit_sync_batch($1,$2,$3::jsonb,$4::text[],$5::jsonb,true)', [
    lease,
    job,
    JSON.stringify(videos),
    missing,
    JSON.stringify({
      phase: 'discovery',
      page_token: 'page-two',
      refresh_cursor: null,
      ...checkpoint,
    }),
  ]);
}
describe('actual migration and PostgreSQL integrity', () => {
  it('applies the complete migration including trigrams and stores pre-2009 videos', async () => {
    await commit([fixture('old')]);
    const r = await db.query<any>('select * from videos where youtube_video_id=$1', ['old']);
    expect(new Date(r.rows[0].published_at).getUTCFullYear()).toBe(2007);
    expect(r.rows[0].likes).toBeNull();
  });
  it('upserts without duplicates and updates statistics and history', async () => {
    await commit([fixture('old', '456')]);
    const r = await db.query<any>(
      'select count(*) as n,max(views) as views from videos where youtube_video_id=$1',
      ['old'],
    );
    expect(Number(r.rows[0].n)).toBe(1);
    expect(Number(r.rows[0].views)).toBe(456);
    const h = await db.query<any>(
      'select count(*) as n,max(views) as views from video_statistics_history',
    );
    expect(Number(h.rows[0].n)).toBe(1);
    expect(Number(h.rows[0].views)).toBe(456);
  });
  it('rolls back both data and checkpoint if a batch fails', async () => {
    const bad = { ...fixture('bad'), channel_id: 'missing-channel' };
    await expect(commit([bad], { page_token: 'must-not-save' })).rejects.toThrow();
    const r = await db.query<any>('select page_token from sync_jobs where id=$1', [job]);
    expect(r.rows[0].page_token).toBe('page-two');
    const videos = await db.query<any>(
      "select count(*) as n from videos where youtube_video_id='bad'",
    );
    expect(Number(videos.rows[0].n)).toBe(0);
  });
  it('fences stale workers and prevents concurrent leases', async () => {
    const lease = await db.query<any>('select acquire_sync_lease($1) as ok', [other]);
    expect(lease.rows[0].ok).toBe(false);
    await expect(commit([fixture('stale')], {}, [], other)).rejects.toThrow('Lease perdida');
  });
  it('marks inaccessible videos without deleting their saved metadata', async () => {
    await commit([], { phase: 'refresh' }, ['old']);
    const r = await db.query<any>("select * from videos where youtube_video_id='old'");
    expect(r.rows[0].available).toBe(false);
    expect(Number(r.rows[0].views)).toBe(456);
  });
  it('bounds the daily API budget atomically', async () => {
    const a = await db.query<any>('select consume_youtube_quota(1) as ok');
    const b = await db.query<any>('select consume_youtube_quota(1) as ok');
    expect(a.rows[0].ok).toBe(true);
    expect(b.rows[0].ok).toBe(false);
  });
  it('RLS hides all catalogue records from a non-admin JWT', async () => {
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${other}';`);
    try {
      const r = await db.query('select * from videos');
      expect(r.rows).toHaveLength(0);
      await expect(db.query("select enqueue_sync('full')")).rejects.toThrow(
        'Acesso não autorizado',
      );
    } finally {
      await db.exec('reset role');
    }
  });
  it('RLS allows an admin to read but prevents catalogue writes', async () => {
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${admin}';`);
    try {
      const r = await db.query('select * from videos');
      expect(r.rows).toHaveLength(1);
      await expect(
        db.query(
          "insert into channels(id,handle,title,uploads_playlist_id) values('hack','hack','hack','hack')",
        ),
      ).rejects.toThrow();
    } finally {
      await db.exec('reset role');
    }
  });
  it('prevents concurrent queueing and resumes the saved failed checkpoint', async () => {
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${admin}';`);
    try {
      await expect(db.query("select enqueue_sync('full')")).rejects.toThrow('Já existe');
    } finally {
      await db.exec('reset role');
    }
    await db.query(
      "update sync_jobs set status='failed',page_token='resume-me',phase='discovery' where id=$1",
      [job],
    );
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${admin}';`);
    try {
      const r = await db.query<any>("select enqueue_sync('retry') as id");
      expect(r.rows[0].id).toBe(job);
      const j = await db.query<any>('select * from sync_jobs where id=$1', [job]);
      expect(j.rows[0].page_token).toBe('resume-me');
      expect(j.rows[0].status).toBe('queued');
      await expect(db.query("select enqueue_sync('full')")).rejects.toThrow();
    } finally {
      await db.exec('reset role');
    }
  });
});
