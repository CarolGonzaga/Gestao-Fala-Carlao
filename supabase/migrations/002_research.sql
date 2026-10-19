-- Additive migration: preserve all source rows and the existing worker row type.
begin;
set search_path = public, extensions;
create extension if not exists unaccent;
create extension if not exists pg_trgm;

create function public.research_normalize(value text) returns text
language sql stable set search_path=public,extensions as $$
 select regexp_replace(lower(unaccent(coalesce(value,''))), '\s+', ' ', 'g');
$$;
create function public.research_escape(value text) returns text language sql immutable as $$
 select replace(replace(replace(value,E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_');
$$;

-- Only explicit episode markers are accepted. Bare numbers/years remain reviewable.
create function public.research_episode(title text) returns jsonb language plpgsql stable
set search_path=public,extensions as $$
declare normalized text:=public.research_normalize(title); candidates integer[]; n integer;
begin
 select array_agg(distinct coalesce(m[1],m[2])::integer order by coalesce(m[1],m[2])::integer)
 into candidates from regexp_matches(normalized,
 E'\\m(?:episodio|episode|ep\\.?)[ :#º°n.-]*([0-9]{1,5})(?![0-9])|#\\s*([0-9]{1,5})(?![0-9])','g') m;
 candidates:=coalesce(candidates,'{}'::integer[]);
 n:=case when cardinality(candidates)=1 then candidates[1] else null end;
 if n is not null and n>0 and n not between 1900 and 2199
 and normalized !~ E'(episodio|episode|ep\\.?|#)[ :#º°n.-]*[0-9]+[.,/][0-9]'
 and normalized !~ E'(episodio|episode|ep\\.?|#)[ :#º°n.-]*[0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{2,4}'
 then return jsonb_build_object('number',n,'status','identified','candidates',candidates); end if;
 return jsonb_build_object('number',null,'status',case when normalized ~ '[0-9]' then 'ambiguous' else 'none' end,'candidates',candidates);
end $$;

create table public.video_search (
 youtube_video_id text primary key references public.videos(youtube_video_id) on delete cascade,
 title_norm text not null, description_norm text not null,
 title_words tsvector not null, description_words tsvector not null, portuguese_words tsvector not null,
 episode_number integer, episode_status text not null check(episode_status in ('identified','ambiguous','none')),
 episode_candidates integer[] not null default '{}'
);
alter table public.video_search enable row level security;
create policy admin_search_read on public.video_search for select to authenticated using(public.is_admin());
revoke all on public.video_search from anon,authenticated;
grant select on public.video_search to authenticated;
grant all on public.video_search to service_role;
create index video_search_title_gin on public.video_search using gin(title_words);
create index video_search_description_gin on public.video_search using gin(description_words);
create index video_search_portuguese_gin on public.video_search using gin(portuguese_words);
create index video_search_title_trgm on public.video_search using gin(title_norm gin_trgm_ops);
create index video_search_description_trgm on public.video_search using gin(description_norm gin_trgm_ops);
create index video_search_episode_idx on public.video_search(episode_number);
create index videos_publication_month_idx on public.videos((extract(month from published_at at time zone 'UTC'))) where published_at is not null;

create function public.refresh_video_search() returns trigger language plpgsql security definer
set search_path=public,extensions as $$
declare t text; d text; ep jsonb;
begin
 if TG_OP='UPDATE' and new.title is not distinct from old.title and new.description is not distinct from old.description then return new; end if;
 t:=public.research_normalize(new.title); d:=public.research_normalize(new.description); ep:=public.research_episode(new.title);
 insert into public.video_search values(new.youtube_video_id,t,d,to_tsvector('simple',t),to_tsvector('simple',d),
 setweight(to_tsvector('portuguese',t),'A')||setweight(to_tsvector('portuguese',d),'B'),
 (ep->>'number')::integer,ep->>'status',array(select jsonb_array_elements_text(ep->'candidates'))::integer[])
 on conflict(youtube_video_id) do update set title_norm=excluded.title_norm,description_norm=excluded.description_norm,
 title_words=excluded.title_words,description_words=excluded.description_words,portuguese_words=excluded.portuguese_words,
 episode_number=excluded.episode_number,episode_status=excluded.episode_status,episode_candidates=excluded.episode_candidates;
 return new;
end $$;
revoke all on function public.refresh_video_search() from public;
create trigger videos_search_insert after insert on public.videos for each row execute function public.refresh_video_search();
create trigger videos_search_update after update of title,description on public.videos for each row execute function public.refresh_video_search();

insert into public.video_search
 select v.youtube_video_id,t,d,to_tsvector('simple',t),to_tsvector('simple',d),
 setweight(to_tsvector('portuguese',t),'A')||setweight(to_tsvector('portuguese',d),'B'),
 (ep->>'number')::integer,ep->>'status',array(select jsonb_array_elements_text(ep->'candidates'))::integer[]
 from public.videos v cross join lateral (select public.research_normalize(v.title) t,public.research_normalize(v.description) d,public.research_episode(v.title) ep) normalized;

create table public.research_groups (
 id uuid primary key default gen_random_uuid(),name text not null check(length(name) between 2 and 80),
 kind text not null check(kind in ('theme','role','organization')),terms text[] not null check(cardinality(terms) between 1 and 30),
 enabled boolean not null default true,created_by uuid default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(array_to_string(terms,'')<>'' and length(array_to_string(terms,''))<=3600)
);
create table public.saved_research (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null check(length(name) between 2 and 100),query jsonb not null check(jsonb_typeof(query)='object' and octet_length(query::text)<=16000),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index saved_research_owner_idx on public.saved_research(owner_id,created_at desc);
alter table public.research_groups enable row level security;
alter table public.saved_research enable row level security;
create policy admin_groups on public.research_groups for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy owner_saved on public.saved_research for all to authenticated
 using(public.is_admin() and owner_id=auth.uid()) with check(public.is_admin() and owner_id=auth.uid());
revoke all on public.research_groups,public.saved_research from anon,authenticated;
grant select,insert,update,delete on public.research_groups,public.saved_research to authenticated;
grant all on public.research_groups,public.saved_research to service_role;
insert into public.research_groups(name,kind,terms) values
 ('Sustentabilidade','theme',array['sustentabilidade','desenvolvimento sustentável','agricultura sustentável','produção sustentável']),
 ('Irrigação','theme',array['irrigação','sistemas de irrigação','agricultura irrigada','pivô central']),
 ('Pecuária','theme',array['pecuária','bovinocultura','produção animal','gado']),
 ('Presidência / CEO','role',array['presidente','presidenta','CEO','chief executive officer']),
 ('Diretoria','role',array['diretor','diretora','diretores']),
 ('Executivos','role',array['executivo','executiva','empresário','empresária']),
 ('Pesquisa e instituições','role',array['pesquisador','pesquisadora','representante']);

-- Build only fixed SQL templates. User text is always passed through EXECUTE ... USING.
create function public.research_term_sql(path text[],scope text,kind text) returns text language plpgsql immutable as $$
declare value_sql text:=format('public.research_normalize($1 #>> %L)',path); t text; d text;
begin
 if kind='word' then
 t:=format('s.title_words @@ plainto_tsquery(''simple'',%s)',value_sql);
 d:=format('s.description_words @@ plainto_tsquery(''simple'',%s)',value_sql);
 else
 t:=format('s.title_norm like (''%%'' || public.research_escape(%s) || ''%%'')',value_sql);
 d:=format('s.description_norm like (''%%'' || public.research_escape(%s) || ''%%'')',value_sql);
 end if;
 return case scope when 'title' then '('||t||')' when 'description' then '('||d||')' else '(('||t||') or ('||d||'))' end;
end $$;

create function public.search_research(p_criteria jsonb,p_limit integer default 25,p_offset integer default 0)
returns jsonb language plpgsql security invoker set search_path=public,extensions set statement_timeout='15s' as $$
declare conditions text[]:=array['public.is_admin()']; alternatives text[]; score text:='0::real';
 bucket text; j integer; k integer; term jsonb; part text; path text[]; scope text:=p_criteria#>>'{filters,scope}';
 field text; column_name text; bound text; order_sql text; result jsonb; term_count integer:=0;
begin
 if not public.is_admin() then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
 if p_criteria is null or jsonb_typeof(p_criteria)<>'object' or p_limit is null or p_offset is null or p_limit not between 1 and 500 or p_offset not between 0 and 10000000 or octet_length(p_criteria::text)>32000 then raise exception 'Consulta fora dos limites'; end if;
 if scope is null or scope not in ('title','description','both') then raise exception 'Escopo inválido'; end if;
 for bucket in select unnest(array['all','any','none','title','description']) loop
   if jsonb_array_length(coalesce(p_criteria->bucket,'[]'))>100 then raise exception 'Termos em excesso'; end if;
   alternatives:='{}'; j:=0;
   for term in select value from jsonb_array_elements(coalesce(p_criteria->bucket,'[]')) loop
     term_count:=term_count+1;if term_count>100 then raise exception 'Termos em excesso'; end if;
     if length(term->>'text') not between 2 and 120 or (term->>'kind'='fragment' and length(term->>'text')<3) then raise exception 'Termo fora dos limites'; end if;
     path:=array[bucket,j::text,'text'];
     part:=public.research_term_sql(path,case when bucket in ('title','description') then bucket else scope end,term->>'kind');
     if bucket='any' then alternatives:=array_append(alternatives,part);
     elsif bucket='none' then conditions:=array_append(conditions,'not '||part);
     else conditions:=array_append(conditions,part); end if;
     if bucket<>'none' then
       score:=score||' + case when '||public.research_term_sql(path,case when scope='description' or bucket='description' then 'description' else 'title' end,term->>'kind')||' then 3 else 0 end';
       score:=score||format(' + ts_rank_cd(s.portuguese_words,plainto_tsquery(''portuguese'',public.research_normalize($1 #>> %L)),32)',path);
     end if;
     j:=j+1;
   end loop;
   if cardinality(alternatives)>0 then conditions:=array_append(conditions,'('||array_to_string(alternatives,' or ')||')'); end if;
 end loop;
 if jsonb_array_length(coalesce(p_criteria->'groups','[]'))>9 then raise exception 'Agrupamentos em excesso'; end if;
 j:=0;
 for term in select value from jsonb_array_elements(coalesce(p_criteria->'groups','[]')) loop
   if jsonb_array_length(term) not between 1 and 30 then raise exception 'Agrupamento inválido'; end if;
   alternatives:='{}'; k:=0;
   for part in select value->>'kind' from jsonb_array_elements(term) loop
     term_count:=term_count+1;if term_count>100 then raise exception 'Termos em excesso'; end if;
     if length(p_criteria#>>array['groups',j::text,k::text,'text']) not between 2 and 120 then raise exception 'Termo inválido'; end if;
     path:=array['groups',j::text,k::text,'text'];
     alternatives:=array_append(alternatives,public.research_term_sql(path,scope,part));
     score:=score||' + case when '||public.research_term_sql(path,case when scope='description' then 'description' else 'title' end,part)||' then 3 else 0 end';
     score:=score||format(' + ts_rank_cd(s.portuguese_words,plainto_tsquery(''portuguese'',public.research_normalize($1 #>> %L)),32)',path);
     k:=k+1;
   end loop;
   conditions:=array_append(conditions,'('||array_to_string(alternatives,' or ')||')');j:=j+1;
 end loop;
 for field in select unnest(array['from','to','year','month','viewsMin','viewsMax','likesMin','likesMax','commentsMin','commentsMax','prefix','series','episodeMin','episodeMax','episodeStatus']) loop
   bound:=p_criteria#>>array['filters',field]; if bound is null or bound='' or (field='episodeStatus' and bound='all') then continue; end if;
   part:=format('($1 #>> %L)',array['filters',field]);
   if field='from' then conditions:=array_append(conditions,'v.published_at >= '||part||'::date::timestamp at time zone ''UTC''');
   elsif field='to' then conditions:=array_append(conditions,'v.published_at < ('||part||'::date+1)::timestamp at time zone ''UTC''');
   elsif field='year' then conditions:=array_append(conditions,'v.published_at >= make_date('||part||'::integer,1,1)::timestamp at time zone ''UTC'' and v.published_at < make_date('||part||'::integer+1,1,1)::timestamp at time zone ''UTC''');
   elsif field='month' then conditions:=array_append(conditions,'extract(month from v.published_at at time zone ''UTC'')='||part||'::integer');
   elsif field in ('prefix','series') then
     if length(bound)<3 then raise exception 'Prefixo/série precisa de três caracteres'; end if;
     conditions:=array_append(conditions,'s.title_norm like ('||case when field='series' then '''%'' || ' else '' end||'public.research_escape(public.research_normalize('||part||')) || ''%'')');
   elsif field='episodeStatus' then conditions:=array_append(conditions,'s.episode_status='||part);
   else
     column_name:=case when field like 'views%' then 'v.views' when field like 'likes%' then 'v.likes' when field like 'comments%' then 'v.comments' else 's.episode_number' end;
     conditions:=array_append(conditions,column_name||case when field like '%Min' then '>=' else '<=' end||part||'::bigint');
   end if;
 end loop;
 order_sql:=case p_criteria#>>'{filters,order}' when 'newest' then 'published_at desc nulls last' when 'oldest' then 'published_at asc nulls last'
 when 'title_asc' then 'title asc' when 'title_desc' then 'title desc' when 'views_desc' then 'views desc nulls last' when 'views_asc' then 'views asc nulls last'
 when 'likes_desc' then 'likes desc nulls last' when 'comments_desc' then 'comments desc nulls last' else 'score desc,published_at desc nulls last' end||',youtube_video_id asc';
 execute 'with matched as materialized (
 select v.youtube_video_id,v.title,v.url,v.published_at,v.views,v.likes,v.comments,v.available,v.updated_at,
 s.episode_number,s.episode_status,s.episode_candidates,('||score||') as score
 from public.videos v join public.video_search s using(youtube_video_id) where '||array_to_string(conditions,' and ')||'),
 page as (select m.*,v.description,v.thumbnails from (select * from matched order by '||order_sql||' limit $2 offset $3) m join public.videos v using(youtube_video_id) order by '||order_sql||'),
 years as (select extract(year from published_at at time zone ''UTC'')::integer as year,count(*) as count from matched group by 1 order by 1)
 select jsonb_build_object(''total'',(select count(*) from matched),''rows'',coalesce((select jsonb_agg(to_jsonb(page)) from page),''[]''::jsonb),
 ''byYear'',coalesce((select jsonb_agg(to_jsonb(years)) from years),''[]''::jsonb))'
 into result using p_criteria,p_limit,p_offset;
 return result;
end $$;

revoke all on function public.search_research(jsonb,integer,integer) from public;
grant execute on function public.search_research(jsonb,integer,integer) to authenticated;
revoke all on function public.research_normalize(text),public.research_escape(text),public.research_episode(text),public.research_term_sql(text[],text,text) from public;
grant execute on function public.research_normalize(text),public.research_escape(text),public.research_episode(text),public.research_term_sql(text[],text,text) to authenticated,service_role;
commit;
