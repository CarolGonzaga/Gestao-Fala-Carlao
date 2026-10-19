# Pesquisa avançada e investigação histórica

## Ativar no projeto existente

Não execute novamente `001_catalog.sql`. Com o worker sem importação em andamento, aplique no SQL Editor do Supabase, nesta ordem:

1. `supabase/migrations/002_research.sql`
2. `supabase/migrations/003_research_timeline.sql`

Cada arquivo usa uma transação. Se houver erro, a transação é revertida; corrija a causa antes de tentar novamente. Após sucesso, não reaplique o mesmo arquivo. Não há exclusão, recriação ou reimportação do catálogo. O backfill lê os títulos/descrições atuais e grava uma tabela derivada, `video_search`. Os registros, IDs, estatísticas e timestamps originais permanecem intactos. Os índices e vetores consomem espaço adicional no PostgreSQL. Em catálogos grandes, execute a migração em uma janela com pouco uso e acompanhe a duração no SQL Editor.

O trigger acompanha somente inserções e alterações efetivas de título/descrição. Atualizações de estatísticas não recalculam o texto. A linha `videos` não ganhou colunas, preservando o contrato de `commit_sync_batch` do worker. Os agrupamentos iniciais são sugestões editáveis fornecidas no briefing; não são registros de vídeos nem classificações do acervo.

O usuário deve continuar em `admin_users`. Nenhuma chave nova é necessária. A API usa o JWT do usuário e RLS, inclusive nas pesquisas salvas. Não use `service_role` no navegador. Na ausência de migração, a interface apresenta uma mensagem de ativação pendente; o acervo convencional e a sincronização continuam independentes.

Depois do deploy, confira o registro derivado:

```sql
select (select count(*) from public.videos) as videos,
       (select count(*) from public.video_search) as indexados;
```

Os dois totais devem coincidir. Para uma checagem autenticada, execute pelo painel uma palavra conhecida que esteja somente na descrição de um vídeo e abra a evidência/descrição. A equipe pode usar esse vídeo real como referência de aceite; os testes automatizados usam dados isolados e não alteram produção.

O workflow de validação também faz uma checagem remota opcional de leitura quando os secrets do Supabase estão disponíveis. Compara contagens de vídeos/índice, confirma acesso às tabelas de pesquisas e executa a regra pura de numeração sobre um título de teste. Não registra metadados nem credenciais, não modifica o acervo e não substitui o aceite pela interface autenticada. Em PRs sem secrets, essa etapa é ignorada.

## Semântica verificável

- **Todas as palavras:** cada termo precisa ocorrer no escopo. Em “títulos e descrições”, um termo pode estar no título e outro na descrição.
- **Qualquer palavra:** ao menos um termo do campo principal deve ocorrer. Se o campo visual “contém qualquer” também estiver preenchido, ele é outro grupo obrigatório, combinado com E.
- **Expressão exata:** todo o campo principal é uma sequência literal. Aspas externas são opcionais. O hífen nesse modo faz parte do texto.
- **Fragmento:** todo o campo é um trecho literal com pelo menos três caracteres. `%`, `_`, barras e caracteres SQL não são curingas.
- **Exclusões:** nos modos todas/qualquer/combinados, `-evento` exclui uma palavra; `-"feira anual"` exclui uma expressão. Feche as aspas. Frases entre aspas permanecem como uma sequência dentro de um único campo, sem atravessar título/descrição.
- **Critérios visuais:** todos os campos e filtros diferentes se combinam com E; alternativas dentro de “contém qualquer” ou de cada agrupamento usam OU. Para vários agrupamentos selecionados, cada agrupamento precisa ter ao menos uma correspondência.
- **Escopo:** os critérios principais, exclusões e agrupamentos respeitam título/descrição/ambos. Os campos “obrigatórios no título” e “obrigatórios na descrição” refinam explicitamente seus campos, independentemente do escopo principal.

Caixa e acentos são ignorados; espaços consecutivos são equivalentes. Palavras usam o léxico `simple` do PostgreSQL, sem stemming, para preservar nomes próprios, siglas e termos técnicos. Frases e fragmentos usam texto normalizado e índices trigram. O vetor português ponderado auxilia o ranking dentro dos registros já elegíveis; não inclui silenciosamente palavras de mesmo radical. A relevância dá preferência às correspondências no título. Isso não representa classificação semântica de assuntos ou pessoas.

Os destaques usam limites de grafemas para preservar acentos, caracteres combinados e offsets do texto original. Não há `dangerouslySetInnerHTML` nem HTML retornado pelo banco. O trecho exibido é um recorte literal da descrição. A descrição integral só é enviada ao navegador ao abrir o Drawer; a lista recebe título, metadados, trechos e posições de destaque. No banco, as descrições completas só são juntadas após selecionar a página dos resultados; não são materializadas para todos os resultados da tabela.

## Filtros e limites

Datas, anos, meses e distribuições usam UTC; datas/horários de exibição usam Brasília, conforme a plataforma existente. Estatísticas ausentes permanecem desconhecidas: um filtro “mínimo 0” exclui `NULL`, pois ausência não equivale a zero.

Limites: campo principal de 500 caracteres; termos de 2 a 120 caracteres; fragmentos, prefixos e séries de pelo menos 3; até 100 termos expandidos por consulta; até 8 agrupamentos selecionados; até 30 termos por agrupamento; página de 25/50/100 vídeos. A exportação usa lotes internos de 500. O corpo HTTP é limitado a 32 KB e as RPCs têm limites independentes e configuração de timeout. O timeout operacional do projeto Supabase/PostgREST também se aplica.

Buscas usam parâmetros vinculados (`EXECUTE ... USING`) e templates SQL fixos. A ordenação é escolhida por lista permitida; texto externo não é interpolado em SQL. Todos os modos consultam o acervo completo e desempatar por ID evita ordem instável. Ao trocar pesquisa, o TanStack Query cancela o fetch anterior pelo `AbortSignal`; uma consulta SQL já iniciada pode terminar no banco, mas sua resposta cancelada não substitui a pesquisa atual. Metadados que mudem durante uma pesquisa/exportação podem mudar participação ou ordem entre páginas; não se oferece um snapshot transacional de longa duração.

## Agrupamentos e pesquisas salvas

Administradores podem criar, editar, excluir, ativar e desativar listas de **temas**, **cargos** e **organizações**. As listas são compartilhadas pela equipe, e a contagem do dashboard mede correspondências textuais, não conteúdo confirmado. Desativar/remover uma lista referenciada por uma pesquisa salva exige revisar a seleção; a API não ignora silenciosamente o filtro, pois isso ampliaria a consulta. O dashboard mostra até 20 listas ativas para manter a consulta limitada.

Pesquisas salvas são privadas por `owner_id = auth.uid()`. Permitem salvar, abrir, renomear, atualizar os critérios com a consulta atual e excluir. Guardam somente os campos permitidos do formulário, a ordem, nome e timestamps. JWTs e credenciais não fazem parte desse contrato. Resultados não ficam congelados: abrir novamente pesquisa os metadados e as definições atuais dos agrupamentos. A autenticação existente limpa o cache ao mudar de usuário.

## Linha do Tempo

Dois padrões opcionais de comparação (A obrigatório; B opcional), por prefixo ou expressão literal no título. Exibe primeiro/último vídeo datado, contagens por ano/mês, sobreposição de períodos e lista cronológica global paginada. A amostra próxima às datas de transição contém até 30 vídeos em ±90 dias da primeira ocorrência de B ou da última de A, dentro do recorte aplicado. “Primeiro” e “último” referem-se ao período filtrado. Registros sem data são contados e indicados separadamente.

A numeração aceita marcadores explícitos: “episódio”, “episode”, “ep.” e `#`. Anos de 1900 a 2199, datas, valores e números sem marcador são ambíguos ou não identificados, sem conversão automática em episódio. Marcadores conflitantes ficam para revisão. O Drawer informa o número candidato, a regra conservadora e os candidatos ambíguos. A revisão é somente de leitura; esta entrega não oferece edição dos metadados de origem.

Lacunas são números não encontrados **entre o menor e o maior candidato** do padrão. Exibe até 200 lacunas e o total; até 200 números recorrentes; até 100 reinícios aparentes e 20 exemplos ambíguos. Não sugere lacunas antes do menor número nem depois do maior. Lacunas não comprovam episódios inexistentes, privados ou removidos. Reinícios são quedas na numeração em ordem de publicação; séries diferentes com o mesmo prefixo podem produzir esse indício. Refine o padrão antes de concluir.

Os títulos são os atuais. A API não fornece o histórico geral de suas edições. Não se afirma que a primeira/última ocorrência ou a sobreposição corresponde a uma mudança editorial oficial.

## Exportação e verificação

CSV UTF-8 com BOM e `;`, ou XLSX, em modo resumido/detalhado. Sempre percorre todas as páginas dos filtros/ordenação aplicados. Inclui ID, título, data, URL, estatísticas e numeração derivada/status. O modo detalhado inclui a descrição integral. Campos ausentes não viram zero. CSV escapa aspas e neutraliza fórmulas; XLSX grava títulos/descrições como valores literais, sem criar objetos de fórmula. O limite de texto por célula do Excel é 32.767 caracteres; as descrições da API do YouTube cabem nesse limite.

Como no exportador original, os limites de tempo/resposta da Vercel se aplicam. Exportações muito grandes exigem um backend Node com streaming apropriado ou uma futura exportação assíncrona. Não foi criada uma fila de arquivos em Storage nesta etapa.

```powershell
npm test
npm run build
```

Cobertura: SQL real em PostgreSQL/PGlite com `unaccent` e trigram, consultas combinadas, descrições longas, período/estatísticas, nomes/siglas, ordenação, paginação, vetores, injeção SQL, RLS entre dois administradores, episódios, comparação histórica, preservação da transação antiga do worker, exportação CSV/XLSX de mais de 500 resultados e inicialização Node ESM.

Para repetir QA visual em um servidor **somente local**, com fixtures explicitamente identificadas e sem tocar o catálogo:

```powershell
npx tsx tests/ui/server.ts
```

Abra `http://127.0.0.1:5174/tests/ui/index.html`. Essa entrada não faz parte do build de produção. Verifique tabela/cards, filtros recolhíveis, Drawer, agrupamentos, pesquisas salvas e linha do tempo em desktop, tablet e celular. Não use as fixtures como resultados reais do acervo.

## Separação de responsabilidades

`videos`: origem; `video_search`: índice derivado; `research_groups`: regras configuráveis; `saved_research`: preferências privadas. `shared/research.ts`: contrato de consulta; `research-evidence.ts`: evidências; `server/research.ts`: serviço autenticado; `research-export.ts`: exportação; RPCs históricas: agregações; `src/research`: apresentação. Não há dependências, tabelas, modelos ou serviços de IA instalados nesta entrega.

Referências técnicas: [busca textual no PostgreSQL](https://www.postgresql.org/docs/current/textsearch-controls.html), [unaccent](https://www.postgresql.org/docs/current/unaccent.html), [trigram](https://www.postgresql.org/docs/current/pgtrgm.html).
