import { z } from 'zod';
import type { Video } from '../shared/types.js';
const thumb = z.record(
  z.string(),
  z.object({ url: z.string().url(), width: z.number().optional(), height: z.number().optional() }),
);
const channelSchema = z.object({
  id: z.string(),
  snippet: z.object({ title: z.string(), thumbnails: thumb.optional() }),
  contentDetails: z.object({ relatedPlaylists: z.object({ uploads: z.string() }) }),
});
const itemSchema = z.object({
  snippet: z.object({ publishedAt: z.string().optional() }),
  contentDetails: z.object({ videoId: z.string(), videoPublishedAt: z.string().optional() }),
});
const videoSchema = z.object({
  id: z.string(),
  snippet: z.object({
    channelId: z.string(),
    title: z.string(),
    description: z.string().default(''),
    publishedAt: z.string().optional(),
    thumbnails: thumb.default({}),
    categoryId: z.string().optional(),
    liveBroadcastContent: z.string().optional(),
  }),
  statistics: z
    .object({
      viewCount: z.string().optional(),
      likeCount: z.string().optional(),
      commentCount: z.string().optional(),
    })
    .optional(),
  contentDetails: z.object({ duration: z.string().optional() }).optional(),
});
export type YoutubeVideo = z.infer<typeof videoSchema>;
export class QuotaPause extends Error {}
export class YoutubeError extends Error {
  constructor(
    public reason: string,
    public status: number,
  ) {
    super(`YouTube: ${reason} (HTTP ${status})`);
  }
}
export class YouTube {
  constructor(
    private key: string,
    private fetcher: typeof fetch = fetch,
    private beforeRequest: () => Promise<void> = async () => {},
  ) {}
  async request(path: string, params: Record<string, string>) {
    for (let attempt = 0; attempt < 4; attempt++) {
      await this.beforeRequest();
      let response: Response;
      try {
        response = await this.fetcher(
          `https://www.googleapis.com/youtube/v3/${path}?${new URLSearchParams({ ...params, key: this.key })}`,
          { signal: AbortSignal.timeout(30000) },
        );
      } catch {
        if (attempt === 3) throw new Error('YouTube indisponível: falha de rede ou tempo esgotado');
        await this.delay(attempt);
        continue;
      }
      const body = await response.json();
      if (response.ok) return body;
      const reason = body.error?.errors?.[0]?.reason ?? 'requestFailed';
      if (['quotaExceeded', 'dailyLimitExceeded'].includes(reason))
        throw new QuotaPause('Cota do YouTube esgotada. A execução será retomada automaticamente.');
      if ((response.status === 429 || response.status >= 500) && attempt < 3) {
        await this.delay(attempt);
        continue;
      }
      throw new YoutubeError(reason, response.status);
    }
    throw new Error('YouTube indisponível');
  }
  private delay(attempt: number) {
    return new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
  }
  async channel(handle: string) {
    const body = await this.request('channels', {
      part: 'snippet,contentDetails',
      forHandle: handle,
    });
    const result = z.array(channelSchema).parse(body.items)[0];
    if (!result) throw new Error('Canal não encontrado pelo handle informado');
    return {
      id: result.id,
      title: result.snippet.title,
      handle,
      uploads_playlist_id: result.contentDetails.relatedPlaylists.uploads,
      thumbnail_url: result.snippet.thumbnails?.default?.url ?? null,
    };
  }
  async playlist(playlistId: string, token?: string | null) {
    const body = await this.request('playlistItems', {
      part: 'snippet,contentDetails',
      playlistId,
      maxResults: '50',
      ...(token ? { pageToken: token } : {}),
    });
    return {
      items: z.array(itemSchema).parse(body.items),
      nextPageToken: typeof body.nextPageToken === 'string' ? body.nextPageToken : null,
    };
  }
  async videos(ids: string[]) {
    if (ids.length > 50) throw new Error('O lote do YouTube excede 50 vídeos');
    if (!ids.length) return [];
    const body = await this.request('videos', {
      part: 'snippet,statistics,contentDetails',
      id: ids.join(','),
    });
    return z.array(videoSchema).parse(body.items);
  }
}
export function toVideo(v: YoutubeVideo, playlistDate?: string | null): Video {
  const now = new Date().toISOString();
  const count = (s: string | undefined) => (s === undefined ? null : Number(s));
  return {
    youtube_video_id: v.id,
    channel_id: v.snippet.channelId,
    title: v.snippet.title,
    description: v.snippet.description,
    url: `https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}`,
    thumbnails: v.snippet.thumbnails,
    published_at: v.snippet.publishedAt ?? null,
    playlist_added_at: playlistDate ?? null,
    views: count(v.statistics?.viewCount),
    likes: count(v.statistics?.likeCount),
    comments: count(v.statistics?.commentCount),
    duration: v.contentDetails?.duration ?? null,
    category_id: v.snippet.categoryId ?? null,
    content_type:
      v.snippet.liveBroadcastContent === 'live'
        ? 'live'
        : v.snippet.liveBroadcastContent === 'upcoming'
          ? 'upcoming'
          : null,
    available: true,
    updated_at: now,
    last_seen_at: now,
  };
}
