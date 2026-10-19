import { describe, it, expect, vi } from 'vitest';
import { QuotaPause, toVideo, YouTube } from '../server/youtube';
const video = {
  id: 'old-video',
  snippet: {
    channelId: 'UC-test',
    title: 'Uma história antiga',
    description: 'Descrição\ncom quebra',
    publishedAt: '2007-03-01T10:00:00Z',
    thumbnails: {},
  },
  statistics: { viewCount: '321' },
  contentDetails: { duration: 'PT5M' },
};
describe('YouTube adapter', () => {
  it('resolves handle and uploads playlist through channels.list', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({
          items: [
            {
              id: 'UC-test',
              snippet: { title: 'Canal' },
              contentDetails: { relatedPlaylists: { uploads: 'UU-test' } },
            },
          ],
        }),
      );
    const c = await new YouTube('test', fetcher).channel('@falacarlao');
    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.searchParams.get('forHandle')).toBe('@falacarlao');
    expect(url.pathname).toMatch(/channels$/);
    expect(c.uploads_playlist_id).toBe('UU-test');
  });
  it('uses the exact nextPageToken and maxResults 50', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({
          items: [
            {
              snippet: { publishedAt: '2007-01-01T00:00:00Z' },
              contentDetails: { videoId: 'old' },
            },
          ],
          nextPageToken: 'next',
        }),
      );
    const result = await new YouTube('test', fetcher).playlist('UU', 'previous');
    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.searchParams.get('pageToken')).toBe('previous');
    expect(url.searchParams.get('maxResults')).toBe('50');
    expect(url.searchParams.has('publishedAfter')).toBe(false);
    expect(result.nextPageToken).toBe('next');
  });
  it('retrieves pre-2009 dates without a cutoff and keeps missing statistics null', () => {
    const v = toVideo(video);
    expect(v.published_at).toBe('2007-03-01T10:00:00Z');
    expect(v.views).toBe(321);
    expect(v.likes).toBeNull();
    expect(v.comments).toBeNull();
    expect(v.content_type).toBeNull();
    expect(v.description).toContain('\n');
  });
  it('requests all metadata in batches of at most 50', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ items: [video] }));
    const yt = new YouTube('test', fetcher);
    await yt.videos(['old-video']);
    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.searchParams.get('part')).toBe('snippet,statistics,contentDetails');
    await expect(yt.videos(Array(51).fill('id'))).rejects.toThrow('50');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not substitute real zero with null', () => {
    expect(
      toVideo({ ...video, statistics: { viewCount: '0', likeCount: '0', commentCount: '0' } })
        .likes,
    ).toBe(0);
  });
  it('pauses for quota exhaustion and does not leak request keys', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({ error: { errors: [{ reason: 'quotaExceeded' }] } }, { status: 403 }),
      );
    await expect(new YouTube('secret', fetcher).channel('@falacarlao')).rejects.toBeInstanceOf(
      QuotaPause,
    );
  });
  it('handles a missing channel explicitly', async () => {
    await expect(
      new YouTube('test', vi.fn().mockResolvedValue(Response.json({ items: [] }))).channel('@none'),
    ).rejects.toThrow('não encontrado');
  });
});
