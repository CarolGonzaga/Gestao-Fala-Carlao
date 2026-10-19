import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { readFile } from 'node:fs/promises';
import { compileResearch, researchSchema, type ResearchQuery } from '../shared/research';
import { toVideo } from '../server/youtube';
const db = new PGlite({ extensions: { pg_trgm, unaccent } });
const admin = '00000000-0000-4000-8000-000000000011',
  other = '00000000-0000-4000-8000-000000000012';
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
 create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public to authenticated,service_role; grant execute on function auth.uid() to authenticated,service_role;
 insert into auth.users values('${admin}'),('${other}'),('00000000-0000-4000-8000-000000000013');`);
  await db.exec(
    await readFile(new URL('../supabase/migrations/001_catalog.sql', import.meta.url), 'utf8'),
  );
  // Seed before migration: verify backfill without rewriting source metadata.
  await db.exec(`insert into admin_users values('${admin}'); insert into channels(id,handle,title,uploads_playlist_id) values('UC','@falacarlao','Fala Carlão','UU');
 insert into videos(youtube_video_id,channel_id,title,description,url,published_at,views,likes,comments) values
 ('old','UC','Fala Carlão — Episódio 1 — Presidente John Deere','CEO fala de irrigação e pivô central. Produção sustentável.','https://youtube.com/watch?v=old','2007-01-01',100,5,1),
 ('description','UC','Canal do Boi — Episódio 3','${'Introdução. '.repeat(450)}presidente da empresa pesquisa sustentabilidade e agropecuária','https://youtube.com/watch?v=description','2010-04-01',200,null,2),
 ('event','UC','Fala Carlão — Ep. 3','Evento de sustentabilidade em 2020.','https://youtube.com/watch?v=event','2010-05-01',300,0,0),
 ('reset','UC','Fala Carlão — Episódio 1 — irrigação','Uma CEO fala de agropecuária','https://youtube.com/watch?v=reset','2011-05-01',null,null,null),
 ('ambiguous','UC','Fala Carlão 2020 — R$ 400','outros metadados','https://youtube.com/watch?v=ambiguous','2020-01-01',0,0,0);`);
  await db.exec(
    await readFile(new URL('../supabase/migrations/002_research.sql', import.meta.url), 'utf8'),
  );
  await db.exec(
    await readFile(
      new URL('../supabase/migrations/003_research_timeline.sql', import.meta.url),
      'utf8',
    ),
  );
  await db.exec("insert into admin_users values('00000000-0000-4000-8000-000000000013');");
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${admin}';`);
}, 60000);
afterAll(async () => await db.close());
async function search(p: Partial<ResearchQuery> = {}) {
  const c = compileResearch(researchSchema.parse(p));
  const r = await db.query<any>('select search_research($1::jsonb,$2,$3) as result', [
    JSON.stringify(c),
    c.filters.pageSize,
    (c.filters.page - 1) * c.filters.pageSize,
  ]);
  return r.rows[0].result;
}
describe('research SQL / stage 1', () => {
  it('backfills full descriptions and conserves source data', async () => {
    expect((await search({ q: 'sustentabilidade', scope: 'description' })).total).toBe(2);
    const r = await db.query<any>(
      "select length(description) as n from videos where youtube_video_id='description'",
    );
    expect(r.rows[0].n).toBeGreaterThan(5000);
  });
  it('all terms may occur across title and description', async () => {
    expect(
      (await search({ q: 'presidente agropecuaria' })).rows.map((r: any) => r.youtube_video_id),
    ).toEqual(['description']);
    expect((await search({ q: 'John irrigacao', scope: 'both' })).total).toBe(1);
  });
  it('any terms, exclusions, accents and literal phrases are predictable', async () => {
    expect((await search({ q: 'irrigação sustentabilidade', mode: 'any' })).total).toBe(4);
    expect((await search({ q: 'sustentabilidade -evento' })).total).toBe(1);
    expect((await search({ q: '"presidente da empresa"', mode: 'all' })).total).toBe(1);
    expect((await search({ q: 'presidente empresa', mode: 'exact' })).total).toBe(0);
    expect((await search({ q: 'pivo central', mode: 'exact' })).total).toBe(1);
    expect((await search({ q: 'John irrigacao', mode: 'exact' })).total).toBe(0);
    expect((await search({ q: 'CEO evento', mode: 'any', any: ['sustentável'] })).total).toBe(1);
  });
  it('preserves proper names and technical abbreviations without stemming eligibility', async () => {
    expect((await search({ q: 'John Deere', mode: 'exact' })).total).toBe(1);
    expect((await search({ q: 'CEO' })).total).toBe(2);
    expect((await search({ q: 'irrig', mode: 'fragment' })).total).toBe(2);
    expect((await search({ q: 'sustentavel' })).total).toBe(1);
  });
  it('combines temporal/statistical filters and treats missing values as unknown', async () => {
    expect(
      (await search({ from: '2006-01-01', to: '2010-12-31', month: 4, viewsMin: 150 })).total,
    ).toBe(1);
    expect((await search({ likesMin: 0 })).total).toBe(3);
    expect((await search({ year: 2007 })).total).toBe(1);
  });
  it('sorts globally and paginates, including empty out-of-range pages', async () => {
    const r = await search({ order: 'views_asc' });
    expect(r.rows.map((v: any) => v.youtube_video_id)).toEqual([
      'ambiguous',
      'old',
      'description',
      'event',
      'reset',
    ]);
    const p = await search({ page: 2 });
    expect(p.rows).toEqual([]);
    expect(p.total).toBe(5);
  });
  it('keeps quotes, wildcards and SQL payloads literal', async () => {
    expect((await search({ q: "' OR 1=1 --", mode: 'exact' })).total).toBe(0);
    expect((await search({ q: '%%%', mode: 'fragment' })).total).toBe(0);
    expect((await search({ prefix: 'Fala Carlão' })).total).toBe(4);
  });
  it('guards RLS and RPC for unauthorised users', async () => {
    await db.exec(`set request.jwt.claim.sub='${other}';`);
    try {
      await expect(search({ q: 'CEO' })).rejects.toThrow('Acesso não autorizado');
      expect((await db.query('select * from video_search')).rows).toHaveLength(0);
    } finally {
      await db.exec(`set request.jwt.claim.sub='${admin}';`);
    }
  });
  it('bounds direct RPC pagination and rejects null limits', async () => {
    const criteria = compileResearch(researchSchema.parse({ q: 'CEO' }));
    await expect(
      db.query('select search_research($1::jsonb,null,0)', [JSON.stringify(criteria)]),
    ).rejects.toThrow('fora dos limites');
    await expect(
      db.query('select search_research($1::jsonb,501,0)', [JSON.stringify(criteria)]),
    ).rejects.toThrow('fora dos limites');
  });
  it('extracts only conservative episodes and filters ambiguous titles', async () => {
    expect((await search({ episodeMin: 3, episodeMax: 3 })).total).toBe(2);
    const r = await search({ episodeStatus: 'ambiguous' });
    expect(r.rows[0].youtube_video_id).toBe('ambiguous');
  });
  it('updates the search index only when source metadata changes', async () => {
    await db.exec('reset role');
    try {
      await db.query(
        "update videos set description=description || ' Bioinsumos' where youtube_video_id='old'",
      );
    } finally {
      await db.exec(`set role authenticated;set request.jwt.claim.sub='${admin}';`);
    }
    expect((await search({ q: 'bioinsumos' })).total).toBe(1);
  });
  it('saves, renames, updates and deletes private research without exposing it to another user', async () => {
    const saved = await db.query<any>(
      'insert into saved_research(name,query) values($1,$2) returning *',
      ['Pesquisa CEO', JSON.stringify(researchSchema.parse({ q: 'CEO' }))],
    );
    const id = saved.rows[0].id;
    expect(saved.rows[0].owner_id).toBe(admin);
    await db.exec("set request.jwt.claim.sub='00000000-0000-4000-8000-000000000013';");
    expect((await db.query('select * from saved_research')).rows).toEqual([]);
    expect(
      (
        await db.query('update saved_research set name=$1 where id=$2 returning id', [
          'Não permitido',
          id,
        ])
      ).rows,
    ).toHaveLength(0);
    await db.exec(`set request.jwt.claim.sub='${other}';`);
    try {
      expect((await db.query('select * from saved_research')).rows).toEqual([]);
      await expect(
        db.query('insert into saved_research(name,query,owner_id) values($1,$2,$3)', [
          'Forjada',
          '{}',
          admin,
        ]),
      ).rejects.toThrow();
    } finally {
      await db.exec(`set request.jwt.claim.sub='${admin}';`);
    }
    await db.query('update saved_research set name=$1,query=$2 where id=$3', [
      'CEO atualizado',
      JSON.stringify(researchSchema.parse({ q: 'presidente' })),
      id,
    ]);
    expect(
      (await db.query<any>('select name from saved_research where id=$1', [id])).rows[0].name,
    ).toBe('CEO atualizado');
    await db.query('delete from saved_research where id=$1', [id]);
    expect((await db.query('select * from saved_research')).rows).toHaveLength(0);
  });
  it('allows administrators to maintain literal theme/cargo groups', async () => {
    const group = await db.query<any>(
      'insert into research_groups(name,kind,terms) values($1,$2,$3) returning *',
      ['Empresas', 'organization', ['John Deere']],
    );
    const c = compileResearch(researchSchema.parse({ groupIds: [group.rows[0].id] }), [
      group.rows[0],
    ]);
    const r = await db.query<any>('select search_research($1::jsonb,25,0) as result', [
      JSON.stringify(c),
    ]);
    expect(r.rows[0].result.total).toBe(1);
    await db.query('update research_groups set enabled=false where id=$1', [group.rows[0].id]);
    await db.query('delete from research_groups where id=$1', [group.rows[0].id]);
  });
  it('compares current title patterns and reports counts, gaps, repeats and apparent resets', async () => {
    const r = await db.query<any>('select research_timeline($1::jsonb) as result', [
      JSON.stringify({
        a: 'Fala Carlão',
        b: 'Canal do Boi',
        match: 'prefix',
        bucket: 'year',
        page: 1,
        pageSize: 25,
      }),
    ]);
    const data = r.rows[0].result;
    expect(data.a.total).toBe(4);
    expect(data.b.total).toBe(1);
    expect(data.a.first.youtube_video_id).toBe('old');
    expect(data.b.first.youtube_video_id).toBe('description');
    expect(data.a.gaps).toEqual([2]);
    expect(data.a.resets[0].youtube_video_id).toBe('reset');
    expect(data.a.duplicates).toContainEqual({ n: 1, count: 2 });
    expect(data.a.ambiguous).toBe(1);
    expect(data.total).toBe(5);
    expect(data.nearTransition.length).toBeGreaterThan(0);
  });
  it('aggregates description coverage, busiest year and textual group matches', async () => {
    const r = await db.query<any>('select research_overview() as result');
    expect(r.rows[0].result.withDescription).toBe(5);
    expect(r.rows[0].result.withoutDescription).toBe(0);
    expect(r.rows[0].result.peakYear.year).toBe(2010);
    expect(r.rows[0].result.groups.find((g: any) => g.name === 'Irrigação').count).toBe(2);
  });
  it('preserves the original worker batch transaction after derived search migrations', async () => {
    await db.exec('reset role');
    const owner = '00000000-0000-4000-8000-000000000019';
    try {
      const job = (await db.query<any>("insert into sync_jobs(mode) values('full') returning id"))
        .rows[0].id;
      await db.query('select acquire_sync_lease($1)', [owner]);
      const video = toVideo({
        id: 'legacy-worker',
        snippet: {
          channelId: 'UC',
          title: 'Fala Carlão — Ep. 7',
          description: 'Importação preservada: irrigação',
          thumbnails: {},
        },
      });
      await db.query('select commit_sync_batch($1,$2,$3::jsonb,$4::text[],$5::jsonb,false)', [
        owner,
        job,
        JSON.stringify([video]),
        [],
        JSON.stringify({ phase: 'done', page_token: null, refresh_cursor: null }),
      ]);
      const index = (
        await db.query<any>("select * from video_search where youtube_video_id='legacy-worker'")
      ).rows[0];
      expect(index.episode_number).toBe(7);
    } finally {
      await db.exec(`set role authenticated;set request.jwt.claim.sub='${admin}';`);
    }
    expect((await search({ q: 'preservada' })).total).toBe(1);
  });
  it('rejects dates and prices as confirmed episode numbers', async () => {
    for (const title of [
      'Ep. 12/10/2020',
      'Ep. 12-10-2020',
      'Fala Carlão R$ 1.000',
      'Ep. 2020',
      'Ep. 1 / Ep. 2',
    ]) {
      const r = await db.query<any>('select research_episode($1) as episode', [title]);
      expect(r.rows[0].episode.status).toBe('ambiguous');
      expect(r.rows[0].episode.number).toBeNull();
    }
  });
});
