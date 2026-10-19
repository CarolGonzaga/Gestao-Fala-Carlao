# Fala Carlão · Gerenciador de vídeos

**Interface administrativa:** dashboard compacto, pesquisa com filtros removíveis, monitor de sincronização e login simplificado. Veja a [auditoria e validação de UX/UI](docs/ux-audit.md). Esta refatoração de frontend não exige novas migrations.

**Evolução do acervo:** Pesquisa Avançada, Linha do Tempo, vocabulários editáveis e pesquisas privadas salvas. Para ativar no banco existente, aplique **somente as migrações novas 002 e 003**, nessa ordem. Não reexecute a 001. Veja [auditoria](docs/research-audit.md) e [guia da pesquisa, semântica, ativação e limites](docs/research.md).

Painel privado para catalogar todos os vídeos públicos acessíveis de `@falacarlao`. React + TypeScript + Vite, Mantine UI/DataTable, TanStack Query, Supabase, Node.js e YouTube Data API v3. Não altera vídeos no YouTube e não contém catálogo fictício.

## Estado da entrega

Código, frontend, backend, migração, workflow e testes estão neste repositório. O `.env` local contém somente a URL e a chave pública fornecidas. **Importação e implantação reais exigem as configurações abaixo.** A chave pública não concede acesso administrativo, aplicação de migrações nem permissão de gravação no banco. Não é necessário compartilhar a `service_role` no chat: configure-a diretamente nos ambientes indicados.

## 1. Executar localmente

Requer Node.js 24 e npm.

```powershell
npm ci
Copy-Item .env.example .env # Somente se ainda não houver um .env configurado
npm run dev
```

Frontend: `http://127.0.0.1:5173`. Backend: `http://127.0.0.1:3001`. O Vite encaminha `/api` ao backend. O worker não depende desses servidores:

```powershell
npm run worker
npm run worker -- --incremental
```

## 2. Preparar o Supabase

1. Execute **todo** o arquivo `supabase/migrations/001_catalog.sql` no SQL Editor do projeto, uma única vez (ou aplique com o Supabase CLI em um projeto vinculado). A migração cria tabelas, índices, RLS e funções.
2. Em Authentication → Users, crie o administrador com e-mail/senha. Desabilite novos cadastros públicos se não forem necessários. O aplicativo não disponibiliza cadastro.
3. Autorize o UUID do usuário, executando no SQL Editor:

```sql
insert into public.admin_users (user_id)
values ('UUID_DO_USUARIO_DO_SUPABASE_AUTH');
```

4. Preencha `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` no `.env`. As duas variáveis `VITE_` são públicas por definição. As demais nunca são importadas pelo frontend. O arquivo `.env` é ignorado pelo Git.
5. Entre com o administrador. Usuários autenticados sem autorização veem uma tela de acesso pendente. A mesma autorização é exigida nas políticas do banco e nos endpoints do backend.

Tabelas principais: `channels`, `videos`, `sync_jobs`, `video_statistics_history`. Tabelas operacionais: `admin_users`, `sync_lease`, `youtube_quota_usage`. Nenhuma permite leitura anônima. O cliente só tem leitura autorizada e execução de `enqueue_sync`, que valida usuário, modo, concorrência e frequência no próprio banco. Apenas o worker com `service_role` grava o catálogo.

## 3. Configurar YouTube e importar o histórico

1. No Google Cloud, habilite **YouTube Data API v3**, crie uma API key e restrinja seu uso à API. Se aplicar restrições por IP, considere os IPs de saída do executor escolhido.
2. Configure `YOUTUBE_API_KEY` no `.env` do worker. `YOUTUBE_HANDLE` usa `@falacarlao` por padrão.
3. Execute `npm run worker`. Sem tarefa pendente, ele inicia uma importação completa. Com uma tarefa pendente, retoma o checkpoint mais antigo.

Fluxo: `channels.list(forHandle)` → playlist de uploads → todas as páginas de `playlistItems.list(maxResults=50)` → `videos.list(snippet,statistics,contentDetails)` em lotes de até 50 IDs. Não utiliza `search.list`, `publishedAfter` ou limite inferior de data. Datas anteriores a 2009 são preservadas, se retornadas pela API. Informações indisponíveis permanecem `null`; zero só é registrado se fornecido pela API. Não se infere Shorts por duração; o tipo só é preenchido para transmissões atuais/agendadas identificadas explicitamente.

O banco faz upsert pela chave primária `youtube_video_id`. Cada lote confirma dados, histórico opcional e checkpoint numa transação. Uma falha antes do commit permite repetir o lote. Um token de página expirado reinicia a descoberta com upserts, preservando os registros. A interface pode ser fechada.

**Completa:** percorre todos os uploads e atualiza metadados/estatísticas, depois revalida registros antigos ausentes da playlist. **Incremental:** descobre até uma página cujos IDs já são conhecidos, depois atualiza o restante do catálogo em lotes. O agendamento usa completa para priorizar estatísticas de todo o acervo nas três execuções. Registros não retornados por `videos.list` são marcados indisponíveis sem exclusão; metadados e estatísticas da última coleta continuam preservados. Itens inacessíveis que nunca tiveram metadados públicos não geram títulos ou estatísticas inventados.

Limites padrão: 2.800 requisições por execução e 9.000 por dia, deixando margem sobre a cota usual de 10.000 unidades. As chamadas utilizadas custam uma unidade cada; confirme a cota real do projeto no Google Cloud. O contador diário fica no banco e usa o dia de `America/Los_Angeles`, conforme a renovação da cota do YouTube. Esse orçamento cobre este aplicativo; outros consumidores da mesma chave/cota precisam ser considerados. A cota é consumida antes de cada tentativa, inclusive retries.

Ao alcançar o orçamento, cota da API ou 45 minutos, o job volta à fila, conservando página/etapa/cursor. O próximo worker retoma o mesmo job antes de iniciar outro. Isso permite percorrer catálogos maiores que o orçamento diário sem esquecer permanentemente os registros antigos. Erros permanentes ficam como `failed`; “Reprocessar registros com falha” retoma o checkpoint do job falho mais recente. Sem job falho, revalida os vídeos marcados indisponíveis. O contador “processados” representa itens confirmados em lotes; uma redescoberta após expiração de token pode voltar a contar um item, sem duplicá-lo na tabela.

A lease global dura cinco minutos e é renovada antes das chamadas e em cada commit. O banco confere o dono da lease antes de aceitar o lote. Se um processo morrer, outro worker pode assumir após a expiração. Não execute workers com pausas artificiais maiores que a lease. Backoff exponencial cobre falhas de rede, HTTP 429 e 5xx; mensagens de erro não incluem a chave da API. `STATISTICS_HISTORY=true` registra uma amostra por vídeo/job, atualizando-a quando o mesmo lote é repetido. Defina uma retenção para esse histórico conforme o volume.

## 4. Sincronizações no GitHub Actions

Envie o projeto a um repositório e mantenha `.github/workflows/sync.yml` na branch padrão. Configure em Settings → Secrets and variables → Actions:

| Secret                      | Valor                         |
| --------------------------- | ----------------------------- |
| `SUPABASE_URL`              | URL do projeto                |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave privada de serviço      |
| `YOUTUBE_API_KEY`           | Chave privada do Google Cloud |

O cron `0 11,17,23 * * *` corresponde a **08:00, 14:00 e 20:00 em Brasília (UTC−3)**. O GitHub pode atrasar execuções. Revise o cron caso o fuso mude. O workflow pode ser executado manualmente na aba Actions e tem limite de 55 minutos. Concorrência no workflow e lease no banco protegem execuções sobrepostas. Verifique na aba Actions se o agendamento está ativo, principalmente em repositórios inativos.

Para o botão **Sincronizar agora** iniciar o workflow imediatamente, configure também no **backend**:

```dotenv
GITHUB_TOKEN=token_com_permissao_actions_write_no_repositorio
GITHUB_REPOSITORY=proprietario/repositorio
GITHUB_WORKFLOW=sync.yml
GITHUB_REF=main
```

Use um token de escopo mínimo no repositório escolhido. O backend valida o JWT com `auth.getUser`, verifica `is_admin` e chama `enqueue_sync` com o JWT do usuário. A função aplica um intervalo mínimo de cinco minutos e impede outra tarefa enquanto há job pendente/em andamento. O servidor solicita `workflow_dispatch`; não executa importação longa dentro de uma requisição HTTP. Se o dispatch não estiver configurado ou falhar, o job fica salvo para o próximo worker agendado, e a interface informa isso. Os secrets do GitHub e o backend são ambientes separados: configure ambos. A presença de variáveis indica configuração; o sucesso da conexão com YouTube só é comprovado na execução real.

## 5. Frontend e consultas

- Dashboard agrega o catálogo completo no PostgreSQL e indica cobertura parcial de estatísticas. Valores ausentes aparecem como “—”.
- Tabela Mantine DataTable com cabeçalho fixo, rolagem interna e horizontal, primeira coluna destacada, paginação externa de 25/50/100 itens e miniaturas com lazy loading.
- Busca literal pelo título com debounce de 350 ms e índice trigram; datas, ano e disponibilidade podem ser combinados. A faixa de data/ano filtra o **dia UTC de publicação da API**; horários exibidos usam Brasília.
- Ordenação global no banco por data, título e estatísticas, com `youtube_video_id` como desempate estável. Filtros e ordenação permanecem ao trocar de página. Não há consultas ao YouTube nas interações da tabela.
- Drawer renderiza a descrição como texto escapado, preserva quebras e transforma somente HTTP(S) em links com `noopener noreferrer`.
- CSV e Excel exportam todos os resultados do filtro por lotes de 500 no servidor. CSV usa BOM UTF-8 e `;`, escapa aspas e protege fórmulas. XLSX usa strings literais para títulos. Os totais desconhecidos ficam em branco.

Exportações usam paginação de banco, sem carregar todas as linhas na tabela do navegador. A resposta é transmitida pelo backend; o navegador recebe o arquivo como Blob. Para uma extração consistente, exporte entre sincronizações: alterações concorrentes podem mudar a ordem/participação dos registros durante uma exportação. Para exportações acima do limite de resposta/tempo da Vercel, hospede este backend em um serviço Node persistente com streaming e ajuste o proxy; não há implementação de exportação assíncrona para Storage neste projeto.

## 6. Implantar na Vercel

1. Importe o repositório. O `vercel.json` configura build Vite e o backend Express em `api/index.ts`, com rewrite das rotas `/api/*` e fallback da SPA.
2. Use Node.js 24. Build: `npm run build`; output: `dist`.
3. Adicione `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e `YOUTUBE_API_KEY`. Adicione as variáveis GitHub acima se desejar disparo imediato.
4. Faça deploy. As variáveis `VITE_` são incorporadas no build; mudanças exigem novo deploy.
5. Configure o domínio do aplicativo no Supabase Auth (Site URL e URLs permitidas, conforme seu fluxo de autenticação).
6. Aplique a migração, autorize um usuário e publique/configure o workflow. Abra o painel, faça login, importe o histórico e confirme a execução na aba Actions. Deploy do frontend sozinho não ativa o agendamento.

O worker permanece no GitHub Actions. O backend Vercel só autentica, enfileira, dispara o workflow e exporta dados; não depende de processos em segundo plano após responder ao HTTP.

Se `/api/config` retornar `FUNCTION_INVOCATION_FAILED`, a função falhou ao iniciar, antes de autenticar ou consultar o banco. Confira os Runtime Logs da Vercel e o commit implantado. Os imports relativos do backend usam a extensão `.js` exigida pelo Node ESM; o TypeScript resolve os fontes `.ts` correspondentes. O build verifica isso com `tsconfig.server.json`, e o teste de runtime executa a entrada compilada em Node nativo. Não remova essas extensões ao editar o backend. Erros de backend e de consulta ao canal são apresentados separadamente no painel.

## 7. Verificação

```powershell
npm test
npm run build
npm audit
```

Testes de API usam mocks; testes de banco executam **a migração completa em PostgreSQL embarcado (PGlite)**, incluindo `pg_trgm`, RLS, bloqueio concorrente, upsert, histórico, checkpoints e rollback. Testes do worker usam API YouTube simulada. Isso não substitui uma importação real com as credenciais, o Supabase remoto, o GitHub Actions e a hospedagem configurados.

## Organização

```text
src/                  Painel React, autenticação, consultas e estilos
shared/               Tipos e validação/aplicação dos filtros
server/youtube.ts     Cliente validado da YouTube Data API
server/sync.ts        Orquestração com checkpoints e lease
server/worker.ts      Entrada CLI para importações/sincronizações
server/app.ts         API HTTP autenticada
server/export.ts      Exportação CSV/XLSX em lotes
api/index.ts          Entrada serverless Vercel
supabase/migrations/  Esquema, índices, RLS e transações
.github/workflows/    Sincronização automática
tests/                Validação automatizada
```

Referências oficiais: [channels.list](https://developers.google.com/youtube/data/reference/rest/v3/channels/list), [playlistItems.list](https://developers.google.com/youtube/data/reference/rest/v3/playlistItems/list), [videos.list](https://developers.google.com/youtube/data/reference/rest/v3/videos/list), [cotas](https://developers.google.com/youtube/data/determine_quota_cost), [RLS do Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), [agendamento GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
