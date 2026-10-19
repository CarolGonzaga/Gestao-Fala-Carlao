import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { checked } from './db';
import { QuotaPause, YouTube, YoutubeError, toVideo } from './youtube';
import type { Job } from '../shared/types';

// Dependency injection keeps all API calls mockable. Every page commits with its durable cursor.
export async function runSync(
  db: SupabaseClient,
  options: {
    mode?: 'full' | 'incremental';
    youtube?: YouTube;
    maxRequests?: number;
    maxMilliseconds?: number;
  } = {},
) {
  const owner = randomUUID();
  if (!checked(await db.rpc('acquire_sync_lease', { p_owner: owner }))) return { status: 'locked' };
  let job: Job | undefined;
  let calls = 0;
  const started = Date.now();
  const maxRequests = options.maxRequests ?? Number(process.env.YOUTUBE_RUN_BUDGET ?? 2800);
  const maxMilliseconds = options.maxMilliseconds ?? 45 * 60 * 1000;
  const heartbeat = async () => {
    if (!checked(await db.rpc('acquire_sync_lease', { p_owner: owner })))
      throw new Error('Outra execução assumiu a sincronização');
  };
  const youtube =
    options.youtube ??
    new YouTube(process.env.YOUTUBE_API_KEY ?? '', fetch, async () => {
      if (calls >= maxRequests || Date.now() - started > maxMilliseconds)
        throw new QuotaPause('Lote concluído; continuação agendada com o checkpoint salvo.');
      await heartbeat();
      if (
        !checked(
          await db.rpc('consume_youtube_quota', {
            p_limit: Number(process.env.YOUTUBE_DAILY_BUDGET ?? 9000),
          }),
        )
      )
        throw new QuotaPause('Orçamento diário da API atingido; aguardando renovação da cota.');
      calls++;
    });
  try {
    job = (
      checked(
        await db
          .from('sync_jobs')
          .select('*')
          .in('status', ['running', 'queued'])
          .order('created_at')
          .limit(1),
      ) ?? []
    ).at(0) as Job | undefined;
    if (!job)
      job = checked(
        await db
          .from('sync_jobs')
          .insert({ mode: options.mode ?? 'full' })
          .select('*')
          .single(),
      ) as Job;
    checked(
      await db
        .from('sync_jobs')
        .update({
          status: 'running',
          started_at: job.started_at ?? new Date().toISOString(),
          heartbeat_at: new Date().toISOString(),
          error: null,
        })
        .eq('id', job.id),
    );
    const channel = await youtube.channel(process.env.YOUTUBE_HANDLE ?? '@falacarlao');
    checked(
      await db
        .from('channels')
        .upsert({ ...channel, updated_at: new Date().toISOString() }, { onConflict: 'id' }),
    );
    while (job.phase !== 'done') {
      if (Date.now() - started > maxMilliseconds)
        throw new QuotaPause('Tempo do lote atingido; continuação agendada.');
      await heartbeat();
      if (job.phase === 'discovery') {
        let page;
        try {
          page = await youtube.playlist(channel.uploads_playlist_id, job.page_token);
        } catch (e) {
          // YouTube page tokens can expire: restarting discovery is safe because writes are upserts.
          if (e instanceof YoutubeError && e.reason === 'invalidPageToken' && job.page_token) {
            checked(await db.from('sync_jobs').update({ page_token: null }).eq('id', job.id));
            job.page_token = null;
            continue;
          }
          throw e;
        }
        const ids = [...new Set(page.items.map((i) => i.contentDetails.videoId))];
        const known = ids.length
          ? (checked(
              await db.from('videos').select('youtube_video_id').in('youtube_video_id', ids),
            ) ?? [])
          : [];
        const videos = await youtube.videos(ids);
        const dates = new Map(
          page.items.map((i) => [i.contentDetails.videoId, i.snippet.publishedAt]),
        );
        const nextPhase =
          !page.nextPageToken ||
          (job.mode === 'incremental' && ids.length > 0 && known.length === ids.length)
            ? 'refresh'
            : 'discovery';
        const checkpoint = {
          phase: nextPhase,
          page_token: nextPhase === 'discovery' ? page.nextPageToken : null,
          refresh_cursor: null,
        };
        checked(
          await db.rpc('commit_sync_batch', {
            p_owner: owner,
            p_job: job.id,
            p_videos: videos.map((v) => toVideo(v, dates.get(v.id))),
            p_missing: ids.filter((id) => !videos.some((v) => v.id === id)),
            p_checkpoint: checkpoint,
            p_history: process.env.STATISTICS_HISTORY === 'true',
          }),
        );
        Object.assign(job, checkpoint);
      } else {
        // Full discovery already refreshed its available videos. The remaining records include
        // videos absent from uploads and old statistics in incremental mode. Cursor is durable.
        let query = db
          .from('videos')
          .select('youtube_video_id')
          .eq('channel_id', channel.id)
          .or(`last_job_id.is.null,last_job_id.neq.${job.id}`)
          .order('youtube_video_id')
          .limit(50);
        if (job.mode === 'retry') query = query.eq('available', false);
        if (job.refresh_cursor) query = query.gt('youtube_video_id', job.refresh_cursor);
        const rows = checked(await query) ?? [];
        const ids = rows.map((v) => v.youtube_video_id as string);
        const videos = await youtube.videos(ids);
        const checkpoint = {
          phase: ids.length === 0 ? 'done' : 'refresh',
          page_token: null,
          refresh_cursor: ids.at(-1) ?? job.refresh_cursor,
        };
        checked(
          await db.rpc('commit_sync_batch', {
            p_owner: owner,
            p_job: job.id,
            p_videos: videos.map((v) => toVideo(v)),
            p_missing: ids.filter((id) => !videos.some((v) => v.id === id)),
            p_checkpoint: checkpoint,
            p_history: process.env.STATISTICS_HISTORY === 'true',
          }),
        );
        Object.assign(job, checkpoint);
      }
    }
    checked(
      await db
        .from('channels')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', channel.id),
    );
    checked(
      await db
        .from('sync_jobs')
        .update({
          status: 'completed',
          finished_at: new Date().toISOString(),
          api_requests: job.api_requests + calls,
          error: null,
        })
        .eq('id', job.id),
    );
    return { status: 'completed', jobId: job.id };
  } catch (error) {
    const paused = error instanceof QuotaPause;
    if (job) {
      // Verify ownership before changing job state; fencing also protects every batch commit.
      await heartbeat();
      checked(
        await db
          .from('sync_jobs')
          .update({
            status: paused ? 'queued' : 'failed',
            error: error instanceof Error ? error.message : 'Falha inesperada',
            api_requests: job.api_requests + calls,
            finished_at: paused ? null : new Date().toISOString(),
            heartbeat_at: new Date().toISOString(),
          })
          .eq('id', job.id),
      );
    }
    if (!paused) throw error;
    return { status: 'queued', jobId: job?.id };
  } finally {
    checked(await db.rpc('release_sync_lease', { p_owner: owner }));
  }
}
