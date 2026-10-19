export interface Video {
  youtube_video_id: string;
  channel_id: string;
  title: string;
  description: string;
  url: string;
  thumbnails: Record<string, { url: string; width?: number; height?: number }>;
  published_at: string | null;
  playlist_added_at: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  duration: string | null;
  category_id: string | null;
  content_type: string | null;
  available: boolean;
  updated_at: string;
  last_seen_at: string;
}
export interface Channel {
  id: string;
  title: string;
  handle: string;
  thumbnail_url: string | null;
  uploads_playlist_id: string;
  last_synced_at: string | null;
}
export interface Job {
  id: string;
  mode: 'full' | 'incremental' | 'retry';
  status: 'queued' | 'running' | 'completed' | 'failed';
  phase: 'discovery' | 'refresh' | 'done';
  page_token: string | null;
  refresh_cursor: string | null;
  processed: number;
  inserted: number;
  updated: number;
  unavailable: number;
  api_requests: number;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  heartbeat_at: string | null;
}
export interface Summary {
  total: number;
  views: number | null;
  likes: number | null;
  comments: number | null;
  views_known: number;
  likes_known: number;
  comments_known: number;
  oldest: string | null;
  newest: string | null;
}
