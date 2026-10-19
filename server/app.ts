import express from 'express';
import { z } from 'zod';
import { userDb, checked } from './db';
import { filterSchema } from '../shared/filters';
import { exportVideos } from './export';
export function createApp(makeDb = userDb) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10kb' }));
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.use('/api', async (req, res, next) => {
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) {
      res.status(401).json({ error: 'Faça login para continuar.' });
      return;
    }
    try {
      const db = makeDb(token);
      const { data, error } = await db.auth.getUser(token);
      if (error || !data.user) {
        res.status(401).json({ error: 'Sessão inválida ou expirada.' });
        return;
      }
      const allowed = checked(await db.rpc('is_admin'));
      if (!allowed) {
        res
          .status(403)
          .json({ error: 'Seu usuário ainda não está autorizado como administrador.' });
        return;
      }
      res.locals.db = db;
      next();
    } catch {
      res.status(503).json({ error: 'Supabase indisponível ou migração administrativa pendente.' });
    }
  });
  app.get('/api/config', (_req, res) =>
    res.json({
      youtube: !!process.env.YOUTUBE_API_KEY,
      worker: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      dispatch: !!(process.env.GITHUB_TOKEN && process.env.GITHUB_REPOSITORY),
      schedule: '08:00, 14:00 e 20:00 · Brasília',
    }),
  );
  app.post('/api/sync', async (req, res, next) => {
    try {
      const { mode } = z.object({ mode: z.enum(['full', 'incremental', 'retry']) }).parse(req.body);
      if (!process.env.YOUTUBE_API_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        res
          .status(503)
          .json({
            error:
              'Configure YOUTUBE_API_KEY e SUPABASE_SERVICE_ROLE_KEY no backend e nos secrets do GitHub Actions.',
          });
        return;
      }
      const result = await res.locals.db.rpc('enqueue_sync', { p_mode: mode });
      if (result.error) {
        res.status(409).json({ error: result.error.message });
        return;
      }
      let dispatched = false;
      if (process.env.GITHUB_TOKEN && process.env.GITHUB_REPOSITORY) {
        try {
          const repo = process.env.GITHUB_REPOSITORY;
          if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Repositório inválido');
          const response = await fetch(
            `https://api.github.com/repos/${repo}/actions/workflows/${encodeURIComponent(process.env.GITHUB_WORKFLOW ?? 'sync.yml')}/dispatches`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
                Accept: 'application/vnd.github+json',
                'Content-Type': 'application/json',
                'X-GitHub-Api-Version': '2022-11-28',
              },
              body: JSON.stringify({ ref: process.env.GITHUB_REF ?? 'main' }),
              signal: AbortSignal.timeout(12000),
            },
          );
          dispatched = response.ok;
        } catch {
          /* Queued job remains durable; the scheduled worker will pick it up. */
        }
      }
      res
        .status(202)
        .json({
          jobId: result.data,
          dispatched,
          message: dispatched
            ? 'Sincronização enviada ao GitHub Actions.'
            : 'Solicitação salva. A execução será iniciada pelo próximo worker agendado.',
        });
    } catch (e) {
      next(e);
    }
  });
  app.get('/api/export', async (req, res, next) => {
    try {
      const filters = filterSchema.parse(req.query);
      const format = z.enum(['csv', 'xlsx']).parse(req.query.format);
      await exportVideos(res.locals.db, filters, format, res);
    } catch (e) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      next(e);
    }
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint não encontrado.' }));
  app.use(
    (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res
        .status(error instanceof z.ZodError ? 400 : 500)
        .json({
          error:
            error instanceof z.ZodError
              ? 'Parâmetros inválidos.'
              : 'Não foi possível concluir a solicitação.',
        });
    },
  );
  return app;
}
export default createApp();
