-- Research aggregations and conservative historical analysis. No source mutations.
begin;
set search_path=public,extensions;
create function public.research_group_match(t text,d text,tw tsvector,dw tsvector,terms text[]) returns boolean
language sql stable set search_path=public,extensions as $$
 select exists(select 1 from unnest(terms) term where
 case when term ~ '^[[:alnum:]]+$' then (tw||dw) @@ plainto_tsquery('simple',public.research_normalize(term))
 else t like '%'||public.research_escape(public.research_normalize(term))||'%' or d like '%'||public.research_escape(public.research_normalize(term))||'%' end);
$$;
create function public.research_overview() returns jsonb language sql stable security invoker
set search_path=public,extensions set statement_timeout='15s' as $$
 select jsonb_build_object(
 'withDescription',(select count(*) from public.videos where description ~ '\S'),
 'withoutDescription',(select count(*) from public.videos where description !~ '\S'),
 'peakYear',(select jsonb_build_object('year',publication_year,'count',n) from (select extract(year from published_at at time zone 'UTC')::integer as publication_year,count(*) as n from public.videos where published_at is not null group by 1 order by n desc,publication_year asc limit 1) y),
 'groups',coalesce((select jsonb_agg(to_jsonb(g)) from (
 select id,name,kind,(select count(*) from public.video_search s where public.research_group_match(s.title_norm,s.description_norm,s.title_words,s.description_words,research_groups.terms)) as count
 from public.research_groups where enabled order by name limit 20) g),'[]'::jsonb));
$$;

create function public.research_pattern_analysis(p_pattern text,p_match text,p_from date default null,p_to date default null,p_bucket text default 'year')
returns jsonb language sql stable security invoker set search_path=public,extensions as $$
 with matched as materialized (
 select v.youtube_video_id,v.title,v.published_at,v.url,s.episode_number,s.episode_status from public.videos v join public.video_search s using(youtube_video_id)
 where public.is_admin() and p_pattern<>'' and s.title_norm like
 (case when p_match='contains' then '%' else '' end||public.research_escape(public.research_normalize(p_pattern))||'%')
 and (p_from is null or v.published_at>=p_from::timestamp at time zone 'UTC') and (p_to is null or v.published_at<(p_to+1)::timestamp at time zone 'UTC')
 ), buckets as (
 select to_char(date_trunc(case when p_bucket='month' then 'month' else 'year' end,published_at at time zone 'UTC'),case when p_bucket='month' then 'YYYY-MM' else 'YYYY' end) as period,count(*) as count
 from matched where published_at is not null group by 1 order by 1
 ), episodes as (select episode_number n,count(*) as count from matched where episode_number is not null group by 1),
 sequence as (select *,lag(episode_number) over(order by published_at,youtube_video_id) previous from matched where episode_number is not null and published_at is not null),
 bounds as(select min(n) lo,max(n) hi from episodes),
 gaps as (select n from bounds cross join lateral generate_series(lo,hi) n where not exists(select 1 from episodes e where e.n=n.n))
 select jsonb_build_object('pattern',p_pattern,'total',(select count(*) from matched),
 'first',(select to_jsonb(m) from matched m where published_at is not null order by published_at,youtube_video_id limit 1),
 'last',(select to_jsonb(m) from matched m where published_at is not null order by published_at desc,youtube_video_id limit 1),
 'buckets',coalesce((select jsonb_agg(to_jsonb(buckets)) from buckets),'[]'::jsonb),
 'undated',(select count(*) from matched where published_at is null),
 'ambiguous',(select count(*) from matched where episode_status='ambiguous'),
 'ambiguousExamples',coalesce((select jsonb_agg(to_jsonb(a)) from (select * from matched where episode_status='ambiguous' order by published_at nulls last,youtube_video_id limit 20) a),'[]'::jsonb),
 'duplicates',coalesce((select jsonb_agg(to_jsonb(e)) from (select * from episodes where count>1 order by n limit 200) e),'[]'::jsonb),
 'gapCount',(select count(*) from gaps),'gaps',coalesce((select jsonb_agg(n order by n) from (select n from gaps order by n limit 200) g),'[]'::jsonb),
 'resets',coalesce((select jsonb_agg(to_jsonb(r)) from (select youtube_video_id,title,url,published_at,episode_number,previous from sequence where episode_number<previous order by published_at,youtube_video_id limit 100) r),'[]'::jsonb));
$$;

create function public.research_timeline(p_query jsonb) returns jsonb language plpgsql security invoker
set search_path=public,extensions set statement_timeout='15s' as $$
declare a jsonb; b jsonb; result jsonb; a_pattern text:=p_query->>'a';b_pattern text:=coalesce(p_query->>'b','');
 mode text:=p_query->>'match';start_date date:=(p_query->>'from')::date;end_date date:=(p_query->>'to')::date;
 bucket text:=p_query->>'bucket';lim integer:=coalesce((p_query->>'pageSize')::integer,25);off integer:=(coalesce((p_query->>'page')::integer,1)-1)*lim;
begin
 if not public.is_admin() then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
 if length(a_pattern) not between 3 and 120 or (b_pattern<>'' and length(b_pattern) not between 3 and 120) or mode not in ('prefix','contains') or lim not in(25,50,100) or off not between 0 and 10000000 then raise exception 'Padrões fora dos limites'; end if;
 a:=public.research_pattern_analysis(a_pattern,mode,start_date,end_date,bucket);
 b:=case when b_pattern<>'' then public.research_pattern_analysis(b_pattern,mode,start_date,end_date,bucket) else null end;
 with matches as materialized (
 select v.youtube_video_id,v.title,v.published_at,v.url,v.thumbnails,s.episode_number,s.episode_status,
 (s.title_norm like (case when mode='contains' then '%' else '' end||public.research_escape(public.research_normalize(a_pattern))||'%')) as pattern_a,
 (b_pattern<>'' and s.title_norm like (case when mode='contains' then '%' else '' end||public.research_escape(public.research_normalize(b_pattern))||'%')) as pattern_b
 from public.videos v join public.video_search s using(youtube_video_id)
 where (start_date is null or v.published_at>=start_date::timestamp at time zone 'UTC') and (end_date is null or v.published_at<(end_date+1)::timestamp at time zone 'UTC')
 ), related as(select * from matches where pattern_a or pattern_b),
 page as(select * from related order by published_at nulls last,youtube_video_id limit lim offset off),
 near_transition as(
 select * from related where b_pattern<>'' and (
 abs(extract(epoch from published_at-(b#>>'{first,published_at}')::timestamptz))<=7776000
 or abs(extract(epoch from published_at-(a#>>'{last,published_at}')::timestamptz))<=7776000)
 order by published_at nulls last,youtube_video_id limit 30
 )
 select jsonb_build_object('a',a,'b',b,'total',(select count(*) from related),
 'rows',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb),
 'nearTransition',coalesce((select jsonb_agg(to_jsonb(near_transition)) from near_transition),'[]'::jsonb)) into result;
 return result;
end $$;

revoke all on function public.research_overview(),public.research_pattern_analysis(text,text,date,date,text),public.research_timeline(jsonb) from public;
grant execute on function public.research_overview(),public.research_pattern_analysis(text,text,date,date,text),public.research_timeline(jsonb) to authenticated;
revoke all on function public.research_group_match(text,text,tsvector,tsvector,text[]) from public;
grant execute on function public.research_group_match(text,text,tsvector,tsvector,text[]) to authenticated;
commit;
