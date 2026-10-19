# Auditoria e plano da pesquisa histórica

## Base existente

Auditoria de código e migração em 19/10/2026. Não foi usada uma credencial administrativa do banco remoto para inspecionar registros privados. A importação concluída foi informada pela equipe; a integridade das descrições é confirmada pelo contrato de gravação e pelos testes locais, não por amostragem autenticada do banco de produção.

- `channels`, `videos`, `sync_jobs`, `video_statistics_history`: dados de origem e operação.
- `admin_users`, `sync_lease`, `youtube_quota_usage`: autorização, concorrência e orçamento.
- `server/youtube.ts` conserva `snippet.description` integralmente; `commit_sync_batch` grava sem truncamento.
- `shared/filters.ts`: título por `ilike`, faixa UTC/ano, disponibilidade; ordenação global com desempate pelo ID; `range` no PostgreSQL. Não há pesquisa em descrições.
- Índices existentes: PK do ID, canal, data, título B-tree/trigram, views, likes, comments. Sem FTS.
- RLS limita a leitura a administradores. Escrita no catálogo é exclusiva do worker. API valida JWT e `is_admin` antes de qualquer endpoint.
- Reutilizáveis: Mantine DataTable, QueryClient, autenticação, estilos, Description (links seguros), miniaturas, helpers de datas/números e exportação CSV/XLSX.

## Etapas e arquivos

1. `002_research.sql`, `shared/research.ts`, testes PostgreSQL: tabela derivada com normalização, vetores simple/português, trigram, backfill, trigger de metadados e RPC de pesquisa. **Não adicionar colunas à linha `videos`**, pois o worker usa `jsonb_populate_recordset(null::videos)` e deve continuar funcionando sem alteração. Não recriar tabelas existentes.
2. `server/research.ts`, `server/research-export.ts`, `src/research/`: parâmetros validados, consulta global paginada, trechos extraídos do texto original, filtros, Drawer sob demanda e exportação de todas as páginas.
3. Tabelas/políticas para agrupamentos compartilhados e pesquisas salvas com proprietário. UI de CRUD e endpoints autenticados.
4. RPC e serviços de análise temporal, comparação e episódios conservadores; página Linha do Tempo. Números sem marcador são revisáveis, e ausência de número não prova episódio inexistente.
5. Testes por etapa, verificação Node ESM, responsividade, documentação de aplicação da migração e limites.

## Semântica

Correspondência textual, nunca classificação de assunto/cargo. Palavras usam léxico simple sem stemming para preservar nomes e siglas. Português auxilia o ranking, sem ampliar silenciosamente a elegibilidade. Frases e fragmentos usam correspondência literal normalizada: caixa e acentos ignorados; espaços consecutivos equivalentes. Resultados mostram os termos e os trechos originais, sem HTML do banco ou geração de texto. Filtros diferentes são combinados com AND; alternativas de um agrupamento usam OR. O histórico usa títulos atuais e datas de publicação, não um histórico de alterações editoriais.

## Preservação e ativação

A migração adiciona objetos derivados e políticas; não apaga nem reimporta vídeos. O backfill usa os metadados já existentes e a atualização é acionada somente quando título/descrição mudam. Deve ser aplicada uma vez no SQL Editor antes de usar os novos recursos. Sem acesso administrativo remoto autorizado, a entrega deve informar explicitamente que a ativação no banco de produção está pendente.
