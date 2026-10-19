// Fixture transport for browser QA, bound to loopback. Never start this on a public server.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { compileResearch, researchSchema, type SearchRow } from '../../shared/research.js';
import { evidenceForRow } from '../../shared/research-evidence.js';
const rows: SearchRow[] = [
  {
    youtube_video_id: 'qa-one',
    title: 'Fala Carlão — Episódio 1 — Presidente e produção sustentável',
    description:
      'Entrevista de teste.\nPresidente da empresa fala de irrigação e produção sustentável.\nhttps://example.com',
    published_at: '2007-04-01T12:00:00Z',
    url: 'https://www.youtube.com/@falacarlao',
    views: 120,
    likes: 5,
    comments: 2,
    thumbnails: {},
    available: true,
    updated_at: '2026-10-19T12:00:00Z',
    episode_number: 1,
    episode_status: 'identified',
    episode_candidates: [1],
    score: 1,
  },
  {
    youtube_video_id: 'qa-two',
    title: 'Canal do Boi — Episódio 3 — Conversa com CEO',
    description:
      'Descrição integral de teste. '.repeat(180) + 'Sustentabilidade e sistemas de irrigação.',
    published_at: '2010-05-01T12:00:00Z',
    url: 'https://www.youtube.com/@falacarlao',
    views: 300,
    likes: null,
    comments: null,
    thumbnails: {},
    available: true,
    updated_at: '2026-10-19T12:00:00Z',
    episode_number: 3,
    episode_status: 'identified',
    episode_candidates: [3],
    score: 1,
  },
];
let groups: any[] = [
  {
    id: '00000000-0000-4000-8000-000000000021',
    name: 'Irrigação',
    kind: 'theme',
    terms: ['irrigação', 'pivô central'],
    enabled: true,
  },
];
let saved: any[] = [];
const server = await createServer({
  configFile: false,
  appType: 'mpa',
  plugins: [
    react(),
    {
      name: 'qa-fixture-api',
      enforce: 'pre',
      transform(code, id) {
        if (id.replaceAll('\\', '/').split('?')[0].endsWith('/src/lib.ts'))
          return code
            .replace(
              "import { createClient } from '@supabase/supabase-js';",
              "import { supabase } from '../tests/ui/supabase';",
            )
            .replace(
              'export const supabase = url && key ? createClient(url, key) : null;',
              'export { supabase };',
            );
      },
      configureServer(s) {
        s.middlewares.use('/api', async (req, res) => {
          try {
            let source = '';
            for await (const chunk of req) source += chunk;
            const body = source ? JSON.parse(source) : undefined;
            const path = (req.url ?? '').split('?')[0];
            let result: unknown = {};
            const scenario = new URL(req.headers.referer ?? 'http://localhost').searchParams.get(
              'scenario',
            );
            if (scenario === 'loading') await new Promise((r) => setTimeout(r, 2500));
            if (scenario === 'error' && !path?.startsWith('/fixture'))
              throw new Error('Falha de teste ao consultar os dados.');
            if (path === '/config')
              result = {
                youtube: true,
                worker: true,
                dispatch: false,
                schedule: '08:00, 14:00, 20:00',
              };
            else if (path === '/sync')
              result = { message: 'Solicitação de teste salva. Nenhum worker real foi disparado.' };
            else if (path === '/fixture/rpc')
              result = {
                data: {
                  total: rows.length,
                  views: 420,
                  likes: 5,
                  comments: 2,
                  views_known: 2,
                  likes_known: 1,
                  comments_known: 1,
                  oldest: rows[0].published_at,
                  newest: rows[1].published_at,
                },
                error: null,
              };
            else if (path === '/fixture/table') {
              let data: unknown;
              if (body.table === 'channels')
                data = {
                  id: 'qa-channel',
                  title: 'Fala Carlão',
                  handle: '@falacarlao',
                  thumbnail_url: null,
                  uploads_playlist_id: 'qa-playlist',
                  last_synced_at: '2026-10-19T12:00:00Z',
                };
              else if (body.table === 'sync_jobs')
                data =
                  scenario === 'empty'
                    ? []
                    : [
                        {
                          id: 'qa-job',
                          mode: 'full',
                          status:
                            scenario === 'active'
                              ? 'running'
                              : scenario === 'failed'
                                ? 'failed'
                                : 'completed',
                          phase: 'done',
                          processed: 2,
                          inserted: 2,
                          updated: 0,
                          unavailable: 0,
                          api_requests: 3,
                          error: null,
                          created_at: '2026-10-19T11:59:00Z',
                          started_at: '2026-10-19T11:59:00Z',
                          finished_at: '2026-10-19T12:00:00Z',
                          heartbeat_at: '2026-10-19T12:00:00Z',
                        },
                      ];
              else data = scenario === 'empty' ? [] : rows;
              result =
                scenario === 'error'
                  ? { data: null, error: { message: 'Falha de teste ao consultar os dados.' } }
                  : { data, error: null, count: scenario === 'empty' ? 0 : rows.length };
            } else if (path === '/research/search') {
              const criteria = compileResearch(researchSchema.parse(body), groups);
              result = {
                total: scenario === 'empty' ? 0 : rows.length,
                byYear:
                  scenario === 'empty'
                    ? []
                    : [
                        { year: 2007, count: 1 },
                        { year: 2010, count: 1 },
                      ],
                terms: [...criteria.all, ...criteria.any, ...criteria.groups.flat()],
                rows: (scenario === 'empty' ? [] : rows).map((row) => {
                  const { description, ...rest } = row;
                  return { ...rest, evidence: evidenceForRow(row, criteria) };
                }),
              };
            } else if (path?.startsWith('/research/video/'))
              result = rows.find((r) => r.youtube_video_id === path.split('/').at(-1));
            else if (path?.startsWith('/research/groups')) {
              const id = path.split('/')[3];
              if (req.method === 'POST')
                groups.push({ ...body, id: '00000000-0000-4000-8000-000000000022' });
              if (req.method === 'PATCH')
                groups = groups.map((g) => (g.id === id ? { ...g, ...body } : g));
              if (req.method === 'DELETE') groups = groups.filter((g) => g.id !== id);
              result = groups;
            } else if (path?.startsWith('/research/saved')) {
              const id = path.split('/')[3];
              if (req.method === 'POST')
                saved.push({
                  ...body,
                  id: '00000000-0000-4000-8000-000000000023',
                  created_at: new Date().toISOString(),
                });
              if (req.method === 'PATCH')
                saved = saved.map((s) => (s.id === id ? { ...s, ...body } : s));
              if (req.method === 'DELETE') saved = saved.filter((s) => s.id !== id);
              result = saved;
            } else if (path === '/research/overview')
              result = {
                withDescription: 2,
                withoutDescription: 0,
                peakYear: { year: 2007, count: 1 },
                groups: groups.map((g) => ({ ...g, count: 2 })),
              };
            else if (path === '/research/timeline') {
              const pattern = (name: string, index: number) => ({
                pattern: name,
                total: 1,
                first: rows[index],
                last: rows[index],
                buckets: [{ period: index ? '2010' : '2007', count: 1 }],
                undated: 0,
                ambiguous: 0,
                ambiguousExamples: [],
                duplicates: [],
                gaps: [],
                gapCount: 0,
                resets: [],
              });
              result = {
                a: pattern(body.a, 0),
                b: body.b ? pattern(body.b, 1) : null,
                total: 2,
                rows: rows.map((r, i) => ({ ...r, pattern_a: i === 0, pattern_b: i === 1 })),
                nearTransition: rows.map((r, i) => ({
                  ...r,
                  pattern_a: i === 0,
                  pattern_b: i === 1,
                })),
              };
            }
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result));
          } catch (e) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: (e as Error).message }));
          }
        });
      },
    },
  ],
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
});
await server.listen();
console.log('QA local: http://127.0.0.1:5174/tests/ui/index.html');
