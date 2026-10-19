# Refatoração administrativa de UX/UI

## Auditoria e escopo

Revisão de `App.tsx`, `pages.tsx`, `src/research` e estilos em 19/10/2026. O dashboard abre com um banner sem dados; o cabeçalho de cada página repete introduções internas da pesquisa e da linha do tempo. A navegação duplica Configurações/Ajuda, o header usa slogan e selo decorativo de segurança. A sincronização prioriza IDs e uma apresentação da importação; o login dedica a maior parte da área a slogans. Há textos auxiliares de 8–11 px e espaçamento excessivo, especialmente no notebook. As tabelas já possuem paginação e ordenação globais e devem ser mantidas.

## Execução

1. Unificar escala de texto, espaçamento, cores semânticas, cabeçalhos, botões e estados. Preservar marca, fonte, amarelo, verde e temas claro/escuro.
2. Extrair a apresentação do layout para reutilização no QA sem alterar os controles de autenticação. Navegação móvel com Drawer, foco contido e fechamento por Escape.
3. Dashboard com quatro métricas, estado operacional, datas e atalhos; pesquisa próxima ao topo com filtros removíveis; análise temporal com limitações contextuais.
4. Monitor de sincronização com estado, ações, histórico e detalhes técnicos recolhidos; login objetivo; acervo/configurações com textos funcionais.
5. Executar testes existentes e build; conferir navegação e tarefas em fixtures explicitamente isoladas, nas larguras 1920, 1366, 768 e 390 px, incluindo tema escuro e estados vazios/erro/carregamento.

## Restrições

Nenhuma alteração em servidor, contratos compartilhados, SQL, APIs, regras de pesquisa, autenticação ou processos de sincronização. Indicadores usam consultas já existentes. Falhas são exibidas como informações conhecidas: o modelo de sincronização expõe estado e erro da execução, sem um contador de falhas por vídeo; não inventar esse contador. A próxima execução é uma previsão e depende do agendador.

Capturas locais em `artifacts/ux` usam dados de teste e não comprovam os resultados do acervo real. A validação autenticada de produção depende da sessão do administrador.

## Validação da entrega

- Testes existentes: 68 aprovados; incluem autenticação/permissões da API, pesquisa SQL/RLS, sincronização, descrições e exportação CSV/Excel. Build de produção com verificação TypeScript.
- QA local usa o próprio `App`, com substituição do cliente de dados exclusivamente no servidor de fixtures. Não há bypass de autenticação, fixtures ou rotas de QA no build de produção.
- Desktop 1920 px: linha do tempo, formulários e distribuição temporal. Notebook 1366 px: pesquisa, filtros recolhíveis/removíveis, tabela/cards, Drawer, pesquisas salvas, acervo/exportação e Configurações.
- Tablet 768 px e celular 390 px: menu recolhível com foco contido/Escape, navegação, sincronizações, pesquisa e login. Tabelas rolam dentro do componente; colunas não ficam fixadas no celular. Sem rolagem horizontal na página.
- Tema claro e escuro; mensagens acessíveis de erro no login e na pesquisa; pesquisa vazia; carregamento anunciado; importação/reprocessamento e sincronização desabilitados quando há execução ativa. O header observa a consulta já existente, sem iniciar outra requisição.
- APIs, worker, contratos compartilhados e SQL preservados. A quantidade de vídeos sem descrição reutiliza `research/overview`; o mesmo resultado em cache atende o dashboard e o painel de cobertura.

### Capturas de comparação (dados isolados)

[Pesquisa antes](../artifacts/ux/pesquisa-antes.jpg) · [Pesquisa depois, notebook](../artifacts/ux/pesquisa-depois-1366.jpg) · [Dashboard depois](../artifacts/ux/dashboard-depois.jpg) · [Linha do tempo, desktop](../artifacts/ux/linha-tempo-1920.jpg) · [Sincronizações, tablet/escuro](../artifacts/ux/sincronizacoes-tablet-escuro.jpg) · [Pesquisa, celular/escuro](../artifacts/ux/pesquisa-mobile-escuro.jpg) · [Login depois](../artifacts/ux/login-depois.jpg) · [Login, celular](../artifacts/ux/login-mobile.jpg).
