import { z } from 'zod';
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v);
    return !isNaN(+d) && d.toISOString().slice(0, 10) === v;
  });
export const filterSchema = z
  .object({
    q: z.string().trim().max(200).default(''),
    from: date.optional(),
    to: date.optional(),
    year: z.coerce.number().int().min(1900).max(2200).optional(),
    availability: z.enum(['all', 'available', 'unavailable', 'missing_stats']).default('all'),
    sort: z.enum(['published_at', 'title', 'views', 'likes', 'comments']).default('published_at'),
    direction: z.enum(['asc', 'desc']).default('desc'),
    page: z.coerce.number().int().min(1).max(1000000).default(1),
    pageSize: z.coerce
      .number()
      .refine((v) => [25, 50, 100].includes(v))
      .default(25),
  })
  .refine((f) => !f.from || !f.to || f.from <= f.to, {
    message: 'A data inicial deve ser anterior à final.',
  });
export type Filters = z.infer<typeof filterSchema>;
export const defaults: Filters = filterSchema.parse({});
// Escape PostgREST LIKE wildcards: search is a literal substring, never a raw OR expression.
export const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&');
export function applyFilters<T>(query: T, filters: Filters): T {
  // Supabase builders change their generic result type as clauses are added.
  let q: any = query;
  if (filters.q) q = q.ilike('title', `%${escapeLike(filters.q)}%`);
  if (filters.from) q = q.gte('published_at', `${filters.from}T00:00:00Z`);
  if (filters.to) {
    const end = new Date(`${filters.to}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    q = q.lt('published_at', end.toISOString());
  }
  if (filters.year)
    q = q
      .gte('published_at', `${filters.year}-01-01T00:00:00Z`)
      .lt('published_at', `${filters.year + 1}-01-01T00:00:00Z`);
  if (filters.availability === 'available') q = q.eq('available', true);
  if (filters.availability === 'unavailable') q = q.eq('available', false);
  if (filters.availability === 'missing_stats')
    q = q.or('views.is.null,likes.is.null,comments.is.null');
  return q
    .order(filters.sort, { ascending: filters.direction === 'asc', nullsFirst: false })
    .order('youtube_video_id', { ascending: true });
}
