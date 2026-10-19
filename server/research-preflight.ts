// Optional CI preflight: aggregate counts only, no source metadata or credentials in logs.
import 'dotenv/config';
import { serviceDb, checked } from './db.js';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.log('Verificação remota ignorada: secrets do Supabase não disponíveis neste contexto.');
} else {
  try {
    const db = serviceDb();
    const count = async (table: string, column: string) => {
      const result = await db.from(table).select(column, { count: 'exact', head: true });
      checked(result);
      return result.count;
    };
    let stable = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = await count('videos', 'youtube_video_id');
      const indexed = await count('video_search', 'youtube_video_id');
      const after = await count('videos', 'youtube_video_id');
      if (before !== after) continue;
      if (before !== indexed)
        throw new Error(`Índice de pesquisa incompleto: ${before} vídeos e ${indexed} indexados.`);
      console.log(JSON.stringify({ videos: before, indexados: indexed, indiceConsistente: true }));
      stable = true;
      break;
    }
    if (!stable)
      throw new Error('O catálogo mudou durante a verificação; repita após a sincronização.');
    await count('research_groups', 'id');
    await count('saved_research', 'id');
    const episode = checked(await db.rpc('research_episode', { title: 'Teste Ep. 7' }));
    if (episode?.number !== 7) throw new Error('Regra de numeração indisponível.');
    console.log('Objetos da pesquisa acessíveis. Nenhum registro foi alterado.');
  } catch (e) {
    const error = e as { code?: string; message?: string };
    console.error(
      JSON.stringify({
        verificacao: 'pesquisa',
        code: error.code ?? null,
        error: error.message ?? 'Falha na verificação remota',
      }),
    );
    process.exitCode = 1;
  }
}
