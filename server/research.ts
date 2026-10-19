import { Router } from 'express';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checked } from './db.js';
import {
  compileResearch,
  researchSchema,
  groupSchema,
  savedSchema,
  timelineSchema,
  type ResearchQuery,
  type ResearchResult,
  type TermGroup,
} from '../shared/research.js';
import { evidenceForRow } from '../shared/research-evidence.js';
import { exportResearch } from './research-export.js';

export async function resolveCriteria(db: SupabaseClient, input: ResearchQuery) {
  const groups = input.groupIds.length
    ? (checked(
        await db.from('research_groups').select('*').in('id', input.groupIds).eq('enabled', true),
      ) as TermGroup[])
    : [];
  try {
    return compileResearch(input, groups);
  } catch (e) {
    throw new z.ZodError([
      {
        code: 'custom',
        path: ['q'],
        message: e instanceof Error ? e.message : 'Critérios inválidos',
      },
    ]);
  }
}
export function createResearchRouter() {
  const router = Router();
  router.get('/groups', async (_req, res, next) => {
    try {
      res.json(checked(await res.locals.db.from('research_groups').select('*').order('name')));
    } catch (e) {
      next(e);
    }
  });
  router.post('/groups', async (req, res, next) => {
    try {
      const input = groupSchema.parse(req.body);
      res
        .status(201)
        .json(
          checked(await res.locals.db.from('research_groups').insert(input).select('*').single()),
        );
    } catch (e) {
      next(e);
    }
  });
  router.patch('/groups/:id', async (req, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params.id),
        input = groupSchema.parse(req.body);
      const row = checked(
        await res.locals.db
          .from('research_groups')
          .update({ ...input, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select('*')
          .maybeSingle(),
      );
      if (!row) {
        res.status(404).json({ error: 'Agrupamento não encontrado.' });
        return;
      }
      res.json(row);
    } catch (e) {
      next(e);
    }
  });
  router.delete('/groups/:id', async (req, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params.id);
      const rows = checked<unknown[]>(
        await res.locals.db.from('research_groups').delete().eq('id', id).select('id'),
      );
      res
        .status(rows?.length ? 200 : 404)
        .json(rows?.length ? { deleted: true } : { error: 'Agrupamento não encontrado.' });
    } catch (e) {
      next(e);
    }
  });
  router.get('/saved', async (_req, res, next) => {
    try {
      res.json(
        checked(
          await res.locals.db
            .from('saved_research')
            .select('*')
            .order('created_at', { ascending: false }),
        ),
      );
    } catch (e) {
      next(e);
    }
  });
  router.post('/saved', async (req, res, next) => {
    try {
      const input = savedSchema.parse(req.body);
      await resolveCriteria(res.locals.db, input.query);
      res
        .status(201)
        .json(
          checked(await res.locals.db.from('saved_research').insert(input).select('*').single()),
        );
    } catch (e) {
      next(e);
    }
  });
  router.patch('/saved/:id', async (req, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params.id),
        input = savedSchema
          .partial()
          .refine((v) => Object.keys(v).length > 0)
          .parse(req.body);
      if (input.query) await resolveCriteria(res.locals.db, input.query);
      const row = checked(
        await res.locals.db
          .from('saved_research')
          .update({ ...input, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select('*')
          .maybeSingle(),
      );
      if (!row) {
        res.status(404).json({ error: 'Pesquisa não encontrada para este usuário.' });
        return;
      }
      res.json(row);
    } catch (e) {
      next(e);
    }
  });
  router.delete('/saved/:id', async (req, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params.id);
      const rows = checked<unknown[]>(
        await res.locals.db.from('saved_research').delete().eq('id', id).select('id'),
      );
      res
        .status(rows?.length ? 200 : 404)
        .json(
          rows?.length
            ? { deleted: true }
            : { error: 'Pesquisa não encontrada para este usuário.' },
        );
    } catch (e) {
      next(e);
    }
  });
  router.get('/overview', async (_req, res, next) => {
    try {
      res.json(checked(await res.locals.db.rpc('research_overview')));
    } catch (e) {
      next(e);
    }
  });
  router.post('/timeline', async (req, res, next) => {
    try {
      const input = timelineSchema.parse(req.body);
      res.json(checked(await res.locals.db.rpc('research_timeline', { p_query: input })));
    } catch (e) {
      next(e);
    }
  });
  router.post('/search', async (req, res, next) => {
    try {
      const input = researchSchema.parse(req.body),
        db = res.locals.db as SupabaseClient;
      const criteria = await resolveCriteria(db, input);
      const result = checked(
        await db.rpc('search_research', {
          p_criteria: criteria,
          p_limit: input.pageSize,
          p_offset: (input.page - 1) * input.pageSize,
        }),
      ) as ResearchResult;
      res.json({
        ...result,
        rows: result.rows.map((row) => {
          const evidence = evidenceForRow(row, criteria);
          const { description, ...summary } = row;
          return { ...summary, evidence };
        }),
        terms: [
          ...criteria.all,
          ...criteria.any,
          ...criteria.title,
          ...criteria.description,
          ...criteria.groups.flat(),
          ...(input.prefix ? [{ text: input.prefix, kind: 'fragment' }] : []),
          ...(input.series ? [{ text: input.series, kind: 'fragment' }] : []),
        ],
      });
    } catch (e) {
      next(e);
    }
  });
  router.get('/video/:id', async (req, res, next) => {
    try {
      const id = z
        .string()
        .regex(/^[A-Za-z0-9_-]{1,64}$/)
        .parse(req.params.id);
      const db = res.locals.db as SupabaseClient;
      const row = checked(
        await db.from('videos').select('*').eq('youtube_video_id', id).maybeSingle(),
      );
      if (!row) {
        res.status(404).json({ error: 'Vídeo não encontrado no acervo.' });
        return;
      }
      const derived = checked(
        await db
          .from('video_search')
          .select('episode_number,episode_status,episode_candidates')
          .eq('youtube_video_id', id)
          .single(),
      );
      res.json({ ...row, ...derived });
    } catch (e) {
      next(e);
    }
  });
  router.post('/export', async (req, res, next) => {
    try {
      const input = z
        .object({
          query: researchSchema,
          format: z.enum(['csv', 'xlsx']),
          detail: z.boolean().default(false),
        })
        .strict()
        .parse(req.body);
      const c = await resolveCriteria(res.locals.db, input.query);
      await exportResearch(res.locals.db, c, input.format, input.detail, res);
    } catch (e) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      next(e);
    }
  });
  return router;
}
