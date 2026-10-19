import { z } from 'zod';

const text = z.string().trim().max(120);
const terms = z.array(text.min(2)).max(20).default([]);
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !isNaN(+new Date(v)) && new Date(v).toISOString().slice(0, 10) === v);
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional();
export const researchSchema = z
  .object({
    q: z.string().trim().max(500).default(''),
    mode: z.enum(['any', 'all', 'exact', 'fragment', 'combined']).default('all'),
    scope: z.enum(['title', 'description', 'both']).default('both'),
    all: terms,
    any: terms,
    none: terms,
    phrases: terms,
    titleTerms: terms,
    descriptionTerms: terms,
    groupIds: z.array(z.string().uuid()).max(8).default([]),
    from: day.optional(),
    to: day.optional(),
    year: z.number().int().min(1900).max(2200).optional(),
    month: z.number().int().min(1).max(12).optional(),
    viewsMin: count,
    viewsMax: count,
    likesMin: count,
    likesMax: count,
    commentsMin: count,
    commentsMax: count,
    prefix: text.default(''),
    series: text.default(''),
    episodeMin: z.number().int().min(1).max(99999).optional(),
    episodeMax: z.number().int().min(1).max(99999).optional(),
    episodeStatus: z.enum(['all', 'identified', 'ambiguous', 'none']).default('all'),
    order: z
      .enum([
        'relevance',
        'newest',
        'oldest',
        'title_asc',
        'title_desc',
        'views_desc',
        'views_asc',
        'likes_desc',
        'comments_desc',
      ])
      .default('relevance'),
    page: z.number().int().min(1).max(100000).default(1),
    pageSize: z.union([z.literal(25), z.literal(50), z.literal(100)]).default(25),
  })
  .strict()
  .superRefine((v, ctx) => {
    for (const [a, b] of [
      ['from', 'to'],
      ['viewsMin', 'viewsMax'],
      ['likesMin', 'likesMax'],
      ['commentsMin', 'commentsMax'],
      ['episodeMin', 'episodeMax'],
    ] as const) {
      if (v[a] !== undefined && v[b] !== undefined && v[a]! > v[b]!)
        ctx.addIssue({
          code: 'custom',
          path: [a],
          message: 'O início/mínimo deve ser menor ou igual ao fim/máximo.',
        });
    }
    if ((v.prefix && v.prefix.length < 3) || (v.series && v.series.length < 3))
      ctx.addIssue({
        code: 'custom',
        path: ['prefix'],
        message: 'Prefixos e séries precisam de pelo menos 3 caracteres.',
      });
  });
export type ResearchQuery = z.infer<typeof researchSchema>;
export const researchDefaults: ResearchQuery = researchSchema.parse({});
export type Term = { text: string; kind: 'word' | 'phrase' | 'fragment' };
export type Criteria = {
  all: Term[];
  any: Term[];
  none: Term[];
  title: Term[];
  description: Term[];
  groups: Term[][];
  filters: ResearchQuery;
};
export type TermGroup = {
  id: string;
  name: string;
  kind: 'theme' | 'role' | 'organization';
  terms: string[];
  enabled: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
export const groupSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    kind: z.enum(['theme', 'role', 'organization']),
    terms: z.array(text.min(2)).min(1).max(30),
    enabled: z.boolean().default(true),
  })
  .strict();
export const savedSchema = z
  .object({ name: z.string().trim().min(2).max(100), query: researchSchema })
  .strict();
export type SavedResearch = {
  id: string;
  owner_id: string;
  name: string;
  query: ResearchQuery;
  created_at: string;
  updated_at: string;
};
export const timelineSchema = z
  .object({
    a: z.string().trim().min(3).max(120),
    b: z.string().trim().max(120).default(''),
    match: z.enum(['prefix', 'contains']).default('prefix'),
    from: day.optional(),
    to: day.optional(),
    bucket: z.enum(['year', 'month']).default('year'),
    page: z.number().int().min(1).max(100000).default(1),
    pageSize: z.union([z.literal(25), z.literal(50), z.literal(100)]).default(25),
  })
  .strict()
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: 'Período inválido.' })
  .refine((v) => !v.b || v.b.length >= 3, {
    message: 'O padrão B precisa de pelo menos 3 caracteres.',
  });
export type TimelineQuery = z.infer<typeof timelineSchema>;

function term(value: string, fragment = false): Term {
  const cleaned = value.trim().replace(/^"(.*)"$/s, '$1');
  if (cleaned.length < (fragment ? 3 : 2))
    throw new Error(
      fragment
        ? 'Fragmentos precisam de pelo menos 3 caracteres.'
        : 'Cada termo precisa de pelo menos 2 caracteres.',
    );
  if (cleaned.length > 120) throw new Error('Cada termo deve ter até 120 caracteres.');
  return {
    text: cleaned,
    kind: fragment ? 'fragment' : /^[\p{L}\p{N}]+$/u.test(cleaned) ? 'word' : 'phrase',
  };
}
export function compileResearch(input: ResearchQuery, groups: TermGroup[] = []): Criteria {
  const f = researchSchema.parse(input);
  const c: Criteria = {
    all: f.all.map((v) => term(v)),
    any: f.any.map((v) => term(v)),
    none: f.none.map((v) => term(v)),
    title: f.titleTerms.map((v) => term(v)),
    description: f.descriptionTerms.map((v) => term(v)),
    groups: [],
    filters: f,
  };
  c.all.push(...f.phrases.map((v) => ({ ...term(v), kind: 'phrase' as const })));
  if (f.q) {
    if (f.mode === 'exact' || f.mode === 'fragment')
      c.all.push({
        ...term(f.q, f.mode === 'fragment'),
        kind: f.mode === 'exact' ? 'phrase' : 'fragment',
      });
    else {
      if ((f.q.match(/"/g)?.length ?? 0) % 2)
        throw new Error('Feche as aspas da expressão pesquisada.');
      const qAny: Term[] = [];
      for (const m of f.q.matchAll(/(-?)(?:"([^"]+)"|(\S+))/g)) {
        const t = term(m[2] ?? m[3]);
        if (m[2]) t.kind = 'phrase';
        if (m[1]) c.none.push(t);
        else if (f.mode === 'any') qAny.push(t);
        else c.all.push(t);
      }
      if (qAny.length) c.groups.push(qAny);
    }
  }
  for (const id of f.groupIds) {
    const group = groups.find((g) => g.id === id && g.enabled);
    if (!group) throw new Error('Um agrupamento foi removido ou desativado. Atualize a seleção.');
    c.groups.push(group.terms.map((v) => term(v)));
  }
  if (
    [...c.all, ...c.any, ...c.none, ...c.title, ...c.description, ...c.groups.flat()].length > 100
  )
    throw new Error('Limite de 100 critérios por consulta.');
  return c;
}

export interface SearchRow {
  youtube_video_id: string;
  title: string;
  url: string;
  published_at: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  thumbnails: Record<string, { url: string }>;
  available: boolean;
  updated_at: string;
  description?: string;
  episode_number: number | null;
  episode_status: 'identified' | 'ambiguous' | 'none';
  episode_candidates: number[];
  score: number;
  evidence?: {
    field: 'title' | 'description' | 'both' | 'filters';
    titleSpans: Span[];
    snippet: string;
    snippetSpans: Span[];
    terms: string[];
  };
}
export type Span = { start: number; end: number };
export type ResearchResult = {
  rows: SearchRow[];
  total: number;
  byYear: { year: number | null; count: number }[];
  terms: Term[];
};
