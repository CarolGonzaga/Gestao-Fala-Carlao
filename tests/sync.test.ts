import { beforeEach, describe, it, expect, vi } from 'vitest';
import { runSync } from '../server/sync';
import { QuotaPause, YouTube } from '../server/youtube';

// Supabase boundary double. SQL atomicity/RLS/upsert are separately exercised on real PostgreSQL.
function database() {
  const tables: Record<string, any[]> = { sync_jobs: [], channels: [], videos: [] };
  let locked = false;
  const commits: any[] = [];
  const db: any = {
    tables,
    commits,
    rpc: vi.fn(async (name: string, args: any) => {
      if (name === 'acquire_sync_lease') return { data: !locked, error: null };
      if (name === 'release_sync_lease') return { data: null, error: null };
      if (name === 'commit_sync_batch') {
        commits.push(structuredClone(args));
        const job = tables.sync_jobs.find((j) => j.id === args.p_job);
        Object.assign(job, args.p_checkpoint);
        for (const video of args.p_videos) {
          const existing = tables.videos.find((v) => v.youtube_video_id === video.youtube_video_id);
          if (existing) Object.assign(existing, video, { last_job_id: job.id });
          else tables.videos.push({ ...video, last_job_id: job.id });
        }
        for (const id of args.p_missing) {
          const v = tables.videos.find((v) => v.youtube_video_id === id);
          if (v) Object.assign(v, { available: false, last_job_id: job.id });
        }
      }
      return { data: true, error: null };
    }),
    setLocked: () => {
      locked = true;
    },
    from: (name: string) => {
      let operation = 'select',
        payload: any,
        single = false,
        limit = Infinity,
        sort: string | undefined;
      const predicates: ((row: any) => boolean)[] = [];
      const builder: any = {
        select: () => builder,
        insert: (p: any) => {
          operation = 'insert';
          payload = p;
          return builder;
        },
        upsert: (p: any) => {
          operation = 'upsert';
          payload = p;
          return builder;
        },
        update: (p: any) => {
          operation = 'update';
          payload = p;
          return builder;
        },
        eq: (k: string, v: any) => {
          predicates.push((r) => r[k] === v);
          return builder;
        },
        in: (k: string, v: any[]) => {
          predicates.push((r) => v.includes(r[k]));
          return builder;
        },
        gt: (k: string, v: string) => {
          predicates.push((r) => r[k] > v);
          return builder;
        },
        or: () => {
          predicates.push(
            (r) => r.last_job_id == null || r.last_job_id !== tables.sync_jobs[0]?.id,
          );
          return builder;
        },
        order: (k: string) => {
          sort = k;
          return builder;
        },
        limit: (n: number) => {
          limit = n;
          return builder;
        },
        single: () => {
          single = true;
          return builder;
        },
        then: (resolve: any, reject: any) =>
          Promise.resolve()
            .then(() => {
              let rows = tables[name].filter((r) => predicates.every((p) => p(r)));
              if (operation === 'insert') {
                const row = {
                  id: 'job-test',
                  status: 'queued',
                  phase: 'discovery',
                  page_token: null,
                  refresh_cursor: null,
                  processed: 0,
                  api_requests: 0,
                  created_at: '2026-01-01',
                  ...payload,
                };
                tables[name].push(row);
                rows = [row];
              }
              if (operation === 'update') rows.forEach((r) => Object.assign(r, payload));
              if (operation === 'upsert') {
                const existing = tables[name].find((r) => r.id === payload.id);
                if (existing) Object.assign(existing, payload);
                else tables[name].push(payload);
                rows = [payload];
              }
              if (sort) rows.sort((a, b) => String(a[sort!]).localeCompare(String(b[sort!])));
              rows = rows.slice(0, limit);
              return { data: structuredClone(single ? rows[0] : rows), error: null };
            })
            .then(resolve, reject),
      };
      return builder;
    },
  };
  return db;
}
const channel = {
  id: 'UC',
  title: 'Canal',
  handle: '@falacarlao',
  uploads_playlist_id: 'UU',
  thumbnail_url: null,
};
const item = (id: string) => ({
  snippet: { publishedAt: '2007-01-01T00:00:00Z' },
  contentDetails: { videoId: id },
});
const video = (id: string) => ({
  id,
  snippet: {
    channelId: 'UC',
    title: id,
    description: '',
    publishedAt: '2007-01-01T00:00:00Z',
    thumbnails: {},
  },
  statistics: { viewCount: '900' },
});
function youtube() {
  const yt = new YouTube('mock');
  yt.channel = vi.fn(async () => channel);
  yt.playlist = vi.fn(async () => ({ items: [item('old')], nextPageToken: null }));
  yt.videos = vi.fn(async (ids: string[]) => ids.map(video));
  return yt;
}
beforeEach(() => vi.stubEnv('STATISTICS_HISTORY', 'true'));
describe('durable worker orchestration with mocked YouTube', () => {
  it('walks every playlist page and persists each checkpoint with videos', async () => {
    const db = database(),
      yt = youtube();
    vi.mocked(yt.playlist)
      .mockResolvedValueOnce({ items: [item('first')], nextPageToken: 'next-page' })
      .mockResolvedValueOnce({ items: [item('old')], nextPageToken: null });
    await runSync(db, { youtube: yt });
    expect(yt.playlist).toHaveBeenNthCalledWith(1, 'UU', null);
    expect(yt.playlist).toHaveBeenNthCalledWith(2, 'UU', 'next-page');
    expect(db.commits[0].p_checkpoint.page_token).toBe('next-page');
    expect(db.tables.videos.map((v: any) => v.youtube_video_id).sort()).toEqual(['first', 'old']);
    expect(db.tables.sync_jobs[0].status).toBe('completed');
  });
  it('pauses at quota and resumes from the persisted page in a new worker', async () => {
    const db = database(),
      yt = youtube();
    vi.mocked(yt.playlist)
      .mockResolvedValueOnce({ items: [item('first')], nextPageToken: 'resume-page' })
      .mockRejectedValueOnce(new QuotaPause('quota'));
    expect((await runSync(db, { youtube: yt })).status).toBe('queued');
    expect(db.tables.sync_jobs[0].page_token).toBe('resume-page');
    const resumed = youtube();
    await runSync(db, { youtube: resumed });
    expect(resumed.playlist).toHaveBeenCalledWith('UU', 'resume-page');
    expect(db.tables.sync_jobs).toHaveLength(1);
    expect(db.tables.sync_jobs[0].status).toBe('completed');
  });
  it('records a network failure without advancing the uncommitted checkpoint', async () => {
    const db = database(),
      yt = youtube();
    vi.mocked(yt.videos).mockRejectedValue(new Error('Network failed'));
    await expect(runSync(db, { youtube: yt })).rejects.toThrow('Network failed');
    expect(db.tables.sync_jobs[0].status).toBe('failed');
    expect(db.tables.sync_jobs[0].page_token).toBeNull();
    expect(db.commits).toHaveLength(0);
  });
  it('stops incremental discovery at known uploads and still refreshes old statistics', async () => {
    const db = database(),
      yt = youtube();
    db.tables.videos.push(
      { youtube_video_id: 'old', channel_id: 'UC', views: 1, last_job_id: 'previous' },
      { youtube_video_id: 'ancient', channel_id: 'UC', views: 2, last_job_id: 'previous' },
    );
    vi.mocked(yt.playlist).mockResolvedValue({ items: [item('old')], nextPageToken: 'not-needed' });
    await runSync(db, { youtube: yt, mode: 'incremental' });
    expect(yt.playlist).toHaveBeenCalledTimes(1);
    expect(yt.videos).toHaveBeenCalledWith(['ancient']);
    expect(db.tables.videos.find((v: any) => v.youtube_video_id === 'ancient').views).toBe(900);
  });
  it('honors the global lock without creating work', async () => {
    const db = database();
    db.setLocked();
    const yt = youtube();
    expect((await runSync(db, { youtube: yt })).status).toBe('locked');
    expect(yt.channel).not.toHaveBeenCalled();
    expect(db.tables.sync_jobs).toHaveLength(0);
  });
  it('rechecks absent records with videos.list and preserves unavailable entries', async () => {
    const db = database(),
      yt = youtube();
    db.tables.videos.push({
      youtube_video_id: 'removed',
      channel_id: 'UC',
      title: 'Preservado',
      views: 5,
      last_job_id: 'previous',
    });
    vi.mocked(yt.videos).mockImplementation(async (ids: string[]) =>
      ids.filter((id) => id !== 'removed').map(video),
    );
    await runSync(db, { youtube: yt });
    const removed = db.tables.videos.find((v: any) => v.youtube_video_id === 'removed');
    expect(removed.available).toBe(false);
    expect(removed.title).toBe('Preservado');
    expect(removed.views).toBe(5);
  });
});
