-- Run once in the Supabase SQL Editor. No public signup or public data access.
-- Supabase may already have pg_trgm installed in its extensions schema.
set search_path = public, extensions;
create extension if not exists pg_trgm;
create table public.admin_users (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.admin_users enable row level security;
create function public.is_admin() returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.admin_users where user_id = auth.uid()) $$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, service_role;

create table public.channels (
 id text primary key, handle text not null unique, title text not null, thumbnail_url text,
 uploads_playlist_id text not null, last_synced_at timestamptz, updated_at timestamptz not null default now()
);
create table public.sync_jobs (
 id uuid primary key default gen_random_uuid(), mode text not null check(mode in ('full','incremental','retry')),
 status text not null default 'queued' check(status in ('queued','running','completed','failed')),
 phase text not null default 'discovery' check(phase in ('discovery','refresh','done')),
 page_token text, refresh_cursor text, processed bigint not null default 0, inserted bigint not null default 0,
 updated bigint not null default 0, unavailable bigint not null default 0, api_requests integer not null default 0,
 error text, created_by uuid references auth.users(id), created_at timestamptz not null default now(),
 started_at timestamptz, finished_at timestamptz, heartbeat_at timestamptz
);
create table public.videos (
 youtube_video_id text primary key, channel_id text not null references public.channels(id), title text not null,
 description text not null default '', url text not null, thumbnails jsonb not null default '{}',
 published_at timestamptz, playlist_added_at timestamptz, views bigint, likes bigint, comments bigint,
 duration text, category_id text, content_type text, available boolean not null default true,
 updated_at timestamptz not null default now(), last_seen_at timestamptz not null default now(), last_job_id uuid references public.sync_jobs(id),
 check(views is null or views >= 0), check(likes is null or likes >= 0), check(comments is null or comments >= 0)
);
create index videos_channel_idx on public.videos(channel_id);
create index videos_date_idx on public.videos(published_at, youtube_video_id);
create index videos_title_trgm on public.videos using gin(title gin_trgm_ops);
create index videos_title_idx on public.videos(title, youtube_video_id);
create index videos_views_idx on public.videos(views, youtube_video_id);
create index videos_likes_idx on public.videos(likes, youtube_video_id);
create index videos_comments_idx on public.videos(comments, youtube_video_id);
create index sync_jobs_created_idx on public.sync_jobs(created_at desc);
create table public.video_statistics_history (
 job_id uuid not null references public.sync_jobs(id), youtube_video_id text not null references public.videos(youtube_video_id),
 collected_at timestamptz not null default now(), views bigint, likes bigint, comments bigint,
 primary key(job_id, youtube_video_id)
);
create index statistics_video_date_idx on public.video_statistics_history(youtube_video_id, collected_at);
create table public.sync_lease (id integer primary key check(id=1), owner uuid, expires_at timestamptz);
insert into public.sync_lease(id) values(1);
create table public.youtube_quota_usage (quota_day date primary key, used integer not null default 0);

alter table public.channels enable row level security;
alter table public.videos enable row level security;
alter table public.sync_jobs enable row level security;
alter table public.video_statistics_history enable row level security;
alter table public.sync_lease enable row level security;
alter table public.youtube_quota_usage enable row level security;
create policy admin_channels on public.channels for select to authenticated using(public.is_admin());
create policy admin_videos on public.videos for select to authenticated using(public.is_admin());
create policy admin_jobs on public.sync_jobs for select to authenticated using(public.is_admin());
create policy admin_history on public.video_statistics_history for select to authenticated using(public.is_admin());
revoke all on public.admin_users, public.sync_lease, public.youtube_quota_usage from anon, authenticated;
grant select on public.channels, public.videos, public.sync_jobs, public.video_statistics_history to authenticated;
grant all on all tables in schema public to service_role;

create function public.catalog_summary() returns jsonb language sql stable security invoker set search_path = public as $$
 select jsonb_build_object('total',count(*),'views',sum(views),'likes',sum(likes),'comments',sum(comments),
 'views_known',count(views),'likes_known',count(likes),'comments_known',count(comments),
 'oldest',min(published_at),'newest',max(published_at)) from public.videos;
$$;
revoke all on function public.catalog_summary() from public;
grant execute on function public.catalog_summary() to authenticated, service_role;

-- Atomic frequency check + queueing; the user JWT, never service_role, calls this RPC.
create function public.enqueue_sync(p_mode text) returns uuid language plpgsql security definer set search_path = public as $$
declare job_id uuid;
begin
 if not public.is_admin() then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
 if p_mode not in ('full','incremental','retry') then raise exception 'Modo inválido'; end if;
 perform pg_advisory_xact_lock(801527);
 if exists(select 1 from public.sync_jobs where status in ('queued','running')) then raise exception 'Já existe uma sincronização pendente'; end if;
 if exists(select 1 from public.sync_jobs where created_by=auth.uid() and created_at > now()-interval '5 minutes') then raise exception 'Aguarde cinco minutos entre solicitações'; end if;
 -- Resume the exact failed checkpoint, including discovery tokens and refresh cursor.
 if p_mode='retry' then
   select id into job_id from public.sync_jobs where status='failed' order by created_at desc limit 1;
   if job_id is not null then
     update public.sync_jobs set status='queued', error=null, finished_at=null, created_by=auth.uid(), created_at=now() where id=job_id;
     return job_id;
   end if;
 end if;
 insert into public.sync_jobs(mode,created_by,phase) values(p_mode,auth.uid(),case when p_mode='retry' then 'refresh' else 'discovery' end) returning id into job_id;
 return job_id;
end $$;
revoke all on function public.enqueue_sync(text) from public;
grant execute on function public.enqueue_sync(text) to authenticated;

create function public.acquire_sync_lease(p_owner uuid) returns boolean language plpgsql security definer set search_path=public as $$
begin
 update public.sync_lease set owner=p_owner, expires_at=now()+interval '5 minutes'
 where id=1 and (expires_at is null or expires_at < now() or owner=p_owner);
 return found;
end $$;
create function public.release_sync_lease(p_owner uuid) returns void language sql security definer set search_path=public as $$
 update public.sync_lease set owner=null,expires_at=null where id=1 and owner=p_owner;
$$;
create function public.consume_youtube_quota(p_limit integer) returns boolean language plpgsql security definer set search_path=public as $$
declare n integer; d date := (now() at time zone 'America/Los_Angeles')::date;
begin
 insert into public.youtube_quota_usage(quota_day,used) values(d,0) on conflict do nothing;
 update public.youtube_quota_usage set used=used+1 where quota_day=d and used<p_limit returning used into n;
 return n is not null;
end $$;

-- Video writes, statistics and checkpoint advance commit together. A stale worker cannot commit.
create function public.commit_sync_batch(p_owner uuid, p_job uuid, p_videos jsonb, p_missing text[], p_checkpoint jsonb, p_history boolean default false)
returns void language plpgsql security definer set search_path=public as $$
declare new_count integer; old_count integer;
begin
 perform 1 from public.sync_lease where id=1 and owner=p_owner and expires_at>now() for update;
 if not found then raise exception 'Lease perdida'; end if;
 select count(*) into old_count from public.videos where youtube_video_id in (select value->>'youtube_video_id' from jsonb_array_elements(p_videos));
 new_count := jsonb_array_length(p_videos)-old_count;
 insert into public.videos select v.* from jsonb_populate_recordset(null::public.videos,p_videos) v
 on conflict(youtube_video_id) do update set
 title=excluded.title, description=excluded.description, url=excluded.url, thumbnails=excluded.thumbnails,
 published_at=excluded.published_at, playlist_added_at=coalesce(excluded.playlist_added_at,public.videos.playlist_added_at),
 views=excluded.views, likes=excluded.likes, comments=excluded.comments, duration=excluded.duration,
 category_id=excluded.category_id, content_type=excluded.content_type, available=true, updated_at=excluded.updated_at,
 last_seen_at=excluded.last_seen_at, last_job_id=p_job;
 update public.videos set last_job_id=p_job where youtube_video_id in (select value->>'youtube_video_id' from jsonb_array_elements(p_videos));
 update public.videos set available=false, updated_at=now(),last_job_id=p_job where youtube_video_id=any(p_missing);
 if p_history then
 insert into public.video_statistics_history(job_id,youtube_video_id,views,likes,comments)
 select p_job,youtube_video_id,views,likes,comments from public.videos where youtube_video_id in (select value->>'youtube_video_id' from jsonb_array_elements(p_videos))
 on conflict(job_id,youtube_video_id) do update set views=excluded.views,likes=excluded.likes,comments=excluded.comments,collected_at=now();
 end if;
 update public.sync_jobs set
 phase=coalesce(p_checkpoint->>'phase',phase), page_token=p_checkpoint->>'page_token', refresh_cursor=p_checkpoint->>'refresh_cursor',
 processed=processed+jsonb_array_length(p_videos)+cardinality(p_missing), inserted=inserted+new_count, updated=updated+old_count,
 unavailable=unavailable+cardinality(p_missing), heartbeat_at=now(), error=null where id=p_job;
 update public.sync_lease set expires_at=now()+interval '5 minutes' where id=1 and owner=p_owner;
end $$;
revoke all on function public.acquire_sync_lease(uuid), public.release_sync_lease(uuid), public.consume_youtube_quota(integer), public.commit_sync_batch(uuid,uuid,jsonb,text[],jsonb,boolean) from public;
grant execute on function public.acquire_sync_lease(uuid), public.release_sync_lease(uuid), public.consume_youtube_quota(integer), public.commit_sync_batch(uuid,uuid,jsonb,text[],jsonb,boolean) to service_role;
