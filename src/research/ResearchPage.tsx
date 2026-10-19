import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Collapse,
  CloseButton,
  Group,
  Menu,
  MultiSelect,
  NumberInput,
  Pagination,
  SegmentedControl,
  Select,
  Skeleton,
  Tabs,
  TagsInput,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useDebouncedValue, useMediaQuery } from '@mantine/hooks';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { DataTable, type DataTableSortStatus } from 'mantine-datatable';
import {
  ArrowDownToLine,
  Bookmark,
  ChevronDown,
  ExternalLink,
  Eye,
  FileSearch,
  Heart,
  LayoutGrid,
  List,
  MessageCircle,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import {
  researchDefaults,
  researchSchema,
  type ResearchQuery,
  type ResearchResult,
  type SearchRow,
} from '../../shared/research';
import { date, number } from '../lib';
import { researchApi, downloadResearch } from './api';
import { Highlights } from './Highlights';
import { VideoDrawer } from './VideoDrawer';
import { GroupManager, SavedManager, useGroups } from './Managers';
import './research.css';
const modes = [
  { value: 'all', label: 'Todas as palavras' },
  { value: 'any', label: 'Qualquer palavra' },
  { value: 'exact', label: 'Expressão exata' },
  { value: 'fragment', label: 'Palavra ou fragmento' },
  { value: 'combined', label: 'Critérios combinados' },
];
export const orders = [
  { value: 'relevance', label: 'Relevância textual' },
  { value: 'newest', label: 'Data mais recente' },
  { value: 'oldest', label: 'Data mais antiga' },
  { value: 'title_asc', label: 'Título A–Z' },
  { value: 'title_desc', label: 'Título Z–A' },
  { value: 'views_desc', label: 'Mais visualizados' },
  { value: 'views_asc', label: 'Menos visualizados' },
  { value: 'likes_desc', label: 'Mais curtidos' },
  { value: 'comments_desc', label: 'Mais comentados' },
];
const fields = {
  title: 'Encontrado no título',
  description: 'Encontrado na descrição',
  both: 'Encontrado em ambos',
  filters: 'Resultado dos filtros',
};
export function ResearchThumb({ row }: { row: SearchRow }) {
  const src = row.thumbnails?.medium?.url ?? row.thumbnails?.default?.url;
  return src ? (
    <img className="research-thumb" src={src} alt="" loading="lazy" />
  ) : (
    <div className="research-thumb thumb-placeholder">
      <FileSearch size={23} />
    </div>
  );
}
function Evidence({ row }: { row: SearchRow }) {
  return (
    <div className="research-evidence">
      <Badge
        size="xs"
        variant="light"
        color={row.evidence?.field === 'description' ? 'teal' : 'gray'}
      >
        {fields[row.evidence?.field ?? 'filters']}
      </Badge>
      {row.evidence?.snippet && (
        <blockquote>
          <Highlights text={row.evidence.snippet} spans={row.evidence.snippetSpans} />
        </blockquote>
      )}
    </div>
  );
}
function parseSort(order: ResearchQuery['order']): DataTableSortStatus<SearchRow> {
  const map: Record<string, [string, 'asc' | 'desc']> = {
    newest: ['published_at', 'desc'],
    oldest: ['published_at', 'asc'],
    title_asc: ['title', 'asc'],
    title_desc: ['title', 'desc'],
    views_desc: ['views', 'desc'],
    views_asc: ['views', 'asc'],
    likes_desc: ['likes', 'desc'],
    comments_desc: ['comments', 'desc'],
  };
  const [columnAccessor, direction] = map[order] ?? ['score', 'desc'];
  return { columnAccessor, direction };
}
export default function ResearchPage() {
  const smallScreen = useMediaQuery('(max-width: 650px)');
  const [draft, setDraft] = useState<ResearchQuery>({ ...researchDefaults }),
    [applied, setApplied] = useState<ResearchQuery>({ ...researchDefaults }),
    [debounced] = useDebouncedValue(draft, 400),
    [advanced, setAdvanced] = useState(false),
    [view, setView] = useState('table'),
    [tab, setTab] = useState<string | null>('results'),
    [selected, setSelected] = useState<string | null>(null),
    [exporting, setExporting] = useState(false),
    [error, setError] = useState('');
  useEffect(() => setApplied(debounced), [debounced]);
  const groups = useGroups();
  const valid = researchSchema.safeParse(applied);
  const results = useQuery({
    queryKey: ['research-results', applied],
    enabled: valid.success,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => researchApi<ResearchResult>('search', applied, signal),
  });
  const result = valid.success ? results.data : undefined;
  function change(patch: Partial<ResearchQuery>, reset = true) {
    setDraft((d) => ({ ...d, ...patch, ...(reset ? { page: 1 } : {}) }));
  }
  const active = Object.entries(draft).filter(
    ([key, value]) =>
      !['page', 'pageSize', 'order', 'scope', 'mode'].includes(key) &&
      JSON.stringify(value) !== JSON.stringify(researchDefaults[key as keyof ResearchQuery]) &&
      value !== undefined,
  );
  const filterLabels: Record<string, string> = {
    q: 'Texto',
    all: 'Todas',
    any: 'Qualquer',
    none: 'Excluir',
    phrases: 'Expressões',
    titleTerms: 'No título',
    descriptionTerms: 'Na descrição',
    groupIds: 'Agrupamentos',
    from: 'De',
    to: 'Até',
    year: 'Ano',
    month: 'Mês',
    viewsMin: 'Visualizações mín.',
    viewsMax: 'Visualizações máx.',
    likesMin: 'Curtidas mín.',
    likesMax: 'Curtidas máx.',
    commentsMin: 'Comentários mín.',
    commentsMax: 'Comentários máx.',
    prefix: 'Prefixo',
    series: 'Série',
    episodeMin: 'Episódio mín.',
    episodeMax: 'Episódio máx.',
    episodeStatus: 'Numeração',
  };
  async function download(format: 'csv' | 'xlsx', detail: boolean) {
    setExporting(true);
    setError('');
    try {
      await downloadResearch(applied, format, detail);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }
  return (
    <div className="research-page">
      <Tabs value={tab} onChange={setTab} keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="results" leftSection={<Search size={15} />}>
            Pesquisar
          </Tabs.Tab>
          <Tabs.Tab value="groups">Temas, cargos e empresas</Tabs.Tab>
          <Tabs.Tab value="saved" leftSection={<Bookmark size={15} />}>
            Minhas pesquisas
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="groups">
          <GroupManager />
        </Tabs.Panel>
        <Tabs.Panel value="saved">
          <SavedManager
            query={draft}
            onOpen={(q) => {
              const parsed = researchSchema.safeParse(q);
              if (parsed.success) {
                setDraft({ ...parsed.data, page: 1 });
                setApplied({ ...parsed.data, page: 1 });
                setTab('results');
              } else setError('Esta pesquisa salva contém critérios inválidos.');
            }}
          />
        </Tabs.Panel>
        <Tabs.Panel value="results">
          <section className="panel research-search">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setApplied(draft);
              }}
            >
              <div className="research-main-input">
                <TextInput
                  label="Pesquisar por palavra ou expressão"
                  placeholder="Digite um termo para pesquisar"
                  size="md"
                  leftSection={<Search size={20} />}
                  value={draft.q}
                  onChange={(e) => change({ q: e.target.value })}
                  maxLength={500}
                />
                <Button
                  type="submit"
                  size="md"
                  leftSection={<Search size={17} />}
                  loading={results.isFetching}
                  aria-busy={results.isFetching}
                >
                  Pesquisar
                </Button>
              </div>
              <div className="research-controls">
                <Select
                  label="Correspondência"
                  data={modes}
                  value={draft.mode}
                  onChange={(v) => change({ mode: v as ResearchQuery['mode'] })}
                />
                <Select
                  label="Onde pesquisar"
                  data={[
                    { value: 'both', label: 'Títulos e descrições' },
                    { value: 'title', label: 'Somente títulos' },
                    { value: 'description', label: 'Somente descrições' },
                  ]}
                  value={draft.scope}
                  onChange={(v) => change({ scope: v as ResearchQuery['scope'] })}
                />
                <MultiSelect
                  label="Temas, cargos ou organizações"
                  placeholder="Selecionar agrupamentos"
                  searchable
                  clearable
                  data={
                    groups.data
                      ?.filter((g) => g.enabled)
                      .map((g) => ({ value: g.id, label: g.name })) ?? []
                  }
                  value={draft.groupIds}
                  onChange={(v) => change({ groupIds: v })}
                />
              </div>
              <div className="research-toolbar">
                <Button
                  variant="subtle"
                  color="dark"
                  size="xs"
                  leftSection={<SlidersHorizontal size={14} />}
                  onClick={() => setAdvanced(!advanced)}
                  aria-expanded={advanced}
                >
                  Filtros avançados
                  <ChevronDown size={14} />
                </Button>
                <Badge variant="light" color="gray">
                  {active.length} {active.length === 1 ? 'critério ativo' : 'critérios ativos'}
                </Badge>
                <Button
                  variant="subtle"
                  color="gray"
                  size="xs"
                  onClick={() => {
                    setDraft({ ...researchDefaults });
                    setApplied({ ...researchDefaults });
                  }}
                >
                  Limpar
                </Button>
                <Button
                  variant="subtle"
                  color="dark"
                  size="xs"
                  leftSection={<Bookmark size={14} />}
                  onClick={() => setTab('saved')}
                >
                  Salvar pesquisa
                </Button>
              </div>
              {active.length > 0 && (
                <div className="applied-filters" aria-label="Filtros aplicados">
                  {active.map(([key, value]) => (
                    <span className="filter-chip" key={key}>
                      <span>
                        {filterLabels[key] ?? key}:{' '}
                        {key === 'groupIds'
                          ? (value as string[])
                              .map(
                                (id) =>
                                  groups.data?.find((g) => g.id === id)?.name ?? 'Agrupamento',
                              )
                              .join(', ')
                          : key === 'episodeStatus'
                            ? (
                                {
                                  identified: 'Identificado',
                                  ambiguous: 'Ambíguo',
                                  none: 'Sem números',
                                } as Record<string, string>
                              )[String(value)]
                            : Array.isArray(value)
                              ? value.join(', ')
                              : String(value)}
                      </span>
                      <CloseButton
                        size="xs"
                        aria-label={'Remover filtro ' + (filterLabels[key] ?? key)}
                        onClick={() =>
                          change({ [key]: researchDefaults[key as keyof ResearchQuery] })
                        }
                      />
                    </span>
                  ))}
                </div>
              )}
              <Collapse in={advanced}>
                <div className="advanced-fields">
                  <fieldset>
                    <legend>Critérios visuais · combinados com E</legend>
                    <div className="research-grid-2">
                      {(
                        [
                          ['all', 'Contém todas'],
                          ['any', 'Contém qualquer'],
                          ['none', 'Não contém'],
                          ['phrases', 'Expressões exatas'],
                          ['titleTerms', 'Obrigatórios no título'],
                          ['descriptionTerms', 'Obrigatórios na descrição'],
                        ] as const
                      ).map(([key, label]) => (
                        <TagsInput
                          key={key}
                          label={label}
                          description="Enter adiciona um termo; espaços formam uma expressão."
                          value={draft[key]}
                          onChange={(v) => change({ [key]: v })}
                          maxTags={20}
                          splitChars={[',', ';']}
                        />
                      ))}
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend>Publicação · dia e ano em UTC</legend>
                    <div className="research-grid-4">
                      <TextInput
                        label="Data inicial"
                        type="date"
                        value={draft.from ?? ''}
                        onChange={(e) => change({ from: e.target.value || undefined })}
                      />
                      <TextInput
                        label="Data final"
                        type="date"
                        value={draft.to ?? ''}
                        onChange={(e) => change({ to: e.target.value || undefined })}
                      />
                      <NumberInput
                        label="Ano"
                        min={1900}
                        max={2200}
                        allowDecimal={false}
                        value={draft.year ?? ''}
                        onChange={(v) => change({ year: typeof v === 'number' ? v : undefined })}
                      />
                      <Select
                        label="Mês"
                        clearable
                        value={draft.month ? String(draft.month) : null}
                        data={Array.from({ length: 12 }, (_, i) => ({
                          value: String(i + 1),
                          label: new Intl.DateTimeFormat('pt-BR', {
                            month: 'long',
                            timeZone: 'UTC',
                          }).format(new Date(Date.UTC(2020, i, 1))),
                        }))}
                        onChange={(v) => change({ month: v ? Number(v) : undefined })}
                      />
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend>Estatísticas · ausentes são desconhecidas</legend>
                    <div className="research-grid-3">
                      {(['views', 'likes', 'comments'] as const).map((key) => (
                        <div key={key}>
                          <span className="field-caption">
                            {key === 'views'
                              ? 'Visualizações'
                              : key === 'likes'
                                ? 'Curtidas'
                                : 'Comentários'}
                          </span>
                          <Group grow wrap="nowrap">
                            <NumberInput
                              aria-label={`${key} mínimo`}
                              placeholder="Mínimo"
                              min={0}
                              allowDecimal={false}
                              value={draft[`${key}Min`] ?? ''}
                              onChange={(v) =>
                                change({ [`${key}Min`]: typeof v === 'number' ? v : undefined })
                              }
                            />
                            <NumberInput
                              aria-label={`${key} máximo`}
                              placeholder="Máximo"
                              min={0}
                              allowDecimal={false}
                              value={draft[`${key}Max`] ?? ''}
                              onChange={(v) =>
                                change({ [`${key}Max`]: typeof v === 'number' ? v : undefined })
                              }
                            />
                          </Group>
                        </div>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend>Nomenclatura e numeração · títulos atuais</legend>
                    <div className="research-grid-2">
                      <TextInput
                        label="Título começa com"
                        placeholder="Fala Carlão"
                        value={draft.prefix}
                        onChange={(e) => change({ prefix: e.target.value })}
                      />
                      <TextInput
                        label="Possível série/programa contém"
                        placeholder="Expressão literal do título"
                        value={draft.series}
                        onChange={(e) => change({ series: e.target.value })}
                      />
                      <Group grow wrap="nowrap">
                        <NumberInput
                          label="Episódio mínimo"
                          min={1}
                          max={99999}
                          allowDecimal={false}
                          value={draft.episodeMin ?? ''}
                          onChange={(v) =>
                            change({ episodeMin: typeof v === 'number' ? v : undefined })
                          }
                        />
                        <NumberInput
                          label="Episódio máximo"
                          min={1}
                          max={99999}
                          allowDecimal={false}
                          value={draft.episodeMax ?? ''}
                          onChange={(v) =>
                            change({ episodeMax: typeof v === 'number' ? v : undefined })
                          }
                        />
                      </Group>
                      <Select
                        label="Revisão da numeração"
                        value={draft.episodeStatus}
                        data={[
                          { value: 'all', label: 'Todos os títulos' },
                          { value: 'identified', label: 'Marcador explícito identificado' },
                          { value: 'ambiguous', label: 'Números ambíguos: revisar' },
                          { value: 'none', label: 'Sem números identificados' },
                        ]}
                        onChange={(v) =>
                          change({ episodeStatus: v as ResearchQuery['episodeStatus'] })
                        }
                      />
                    </div>
                  </fieldset>
                </div>
              </Collapse>
            </form>
            <details className="search-help">
              <summary>Ajuda sobre a pesquisa</summary>
              <p>
                Nos modos “todas” e “qualquer”, use aspas para expressões e um sinal − antes do
                termo para excluí-lo: <code>sustentabilidade -evento -"feira anual"</code>. No modo
                “expressão exata”, todo o campo é uma frase literal; no modo “fragmento”, todo o
                campo é um fragmento literal com pelo menos 3 caracteres. Os campos visuais são
                combinados com E; “contém qualquer” e os termos dentro de cada agrupamento usam OU.
                Cada agrupamento selecionado deve corresponder. Caixa e acentos são ignorados e
                espaços consecutivos são equivalentes. Palavras não ampliam automaticamente para
                radicais ou sinônimos. Português auxilia a relevância; títulos têm peso maior. O
                critério “série” é somente um trecho do título. Os resultados comprovam a presença
                dos termos nos metadados armazenados, sem analisar o áudio ou confirmar o conteúdo
                do vídeo.
              </p>
            </details>
          </section>
          {(!valid.success || results.isError || error) && (
            <Alert color="red" my="md" title="Não foi possível concluir a pesquisa.">
              {error ||
                (!valid.success
                  ? valid.error.issues.map((i) => i.message).join(' ')
                  : results.error?.message)}
              <Button
                size="xs"
                variant="subtle"
                onClick={() => {
                  setError('');
                  results.refetch();
                }}
              >
                Tentar novamente
              </Button>
            </Alert>
          )}
          {valid.success && !results.isError && (
            <section className="panel research-results" aria-busy={results.isFetching}>
              <div className="research-results-header">
                <div>
                  <h2>
                    {result ? number(result.total) + ' resultados' : 'Resultados'}{' '}
                    <small role="status" aria-live="polite">
                      {results.isFetching ? 'Pesquisando...' : ''}
                    </small>
                  </h2>
                </div>
                <Group gap="xs">
                  <Select
                    aria-label="Ordenar resultados"
                    data={orders}
                    value={draft.order}
                    onChange={(v) => change({ order: v as ResearchQuery['order'] })}
                    w={190}
                  />
                  <SegmentedControl
                    aria-label="Visualização"
                    value={view}
                    onChange={setView}
                    data={[
                      {
                        value: 'table',
                        label: (
                          <span className="view-option">
                            <List size={15} />
                            Tabela
                          </span>
                        ),
                      },
                      {
                        value: 'cards',
                        label: (
                          <span className="view-option">
                            <LayoutGrid size={15} />
                            Cards
                          </span>
                        ),
                      },
                    ]}
                  />
                  <Menu position="bottom-end">
                    <Menu.Target>
                      <Button
                        variant="default"
                        loading={exporting}
                        aria-busy={exporting}
                        leftSection={<ArrowDownToLine size={15} />}
                        rightSection={<ChevronDown size={13} />}
                      >
                        Exportar
                      </Button>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Label>Todos os resultados dos filtros aplicados</Menu.Label>
                      {(['csv', 'xlsx'] as const).flatMap((format) =>
                        [false, true].map((detail) => (
                          <Menu.Item
                            key={`${format}-${detail}`}
                            disabled={!valid.success || exporting}
                            onClick={() => download(format, detail)}
                          >
                            {format.toUpperCase()} ·{' '}
                            {detail ? 'Detalhado, com descrição' : 'Resumido'}
                          </Menu.Item>
                        )),
                      )}
                    </Menu.Dropdown>
                  </Menu>
                </Group>
              </div>
              {result && result.byYear.length > 0 && (
                <div className="result-years" aria-label="Resultados por ano">
                  {result.byYear.map((y) => (
                    <button
                      key={y.year ?? 'unknown'}
                      onClick={() => {
                        if (y.year) change({ year: y.year });
                      }}
                      disabled={!y.year}
                    >
                      <span>{y.year ?? 'Sem data'}</span>
                      <b>{number(y.count)}</b>
                    </button>
                  ))}
                </div>
              )}
              {view === 'table' ? (
                <DataTable<SearchRow>
                  idAccessor="youtube_video_id"
                  className="research-table"
                  height="clamp(340px, 56vh, 760px)"
                  pinFirstColumn={!smallScreen}
                  pinLastColumn={!smallScreen}
                  highlightOnHover
                  fetching={results.isFetching}
                  records={result?.rows ?? []}
                  sortStatus={parseSort(draft.order)}
                  onSortStatusChange={(s) => {
                    const key = s.columnAccessor;
                    const order =
                      key === 'published_at'
                        ? s.direction === 'asc'
                          ? 'oldest'
                          : 'newest'
                        : key === 'title'
                          ? `title_${s.direction}`
                          : key === 'views'
                            ? `views_${s.direction}`
                            : key === 'likes'
                              ? 'likes_desc'
                              : key === 'comments'
                                ? 'comments_desc'
                                : 'relevance';
                    change({ order: order as ResearchQuery['order'] });
                  }}
                  emptyState={
                    <div className="empty-state">
                      <Search size={30} />
                      <h3>Nenhum vídeo encontrado.</h3>
                      <p>Ajuste os termos ou remova filtros para ampliar a pesquisa.</p>
                    </div>
                  }
                  columns={[
                    {
                      accessor: 'thumbnail',
                      title: 'Vídeo',
                      width: 110,
                      render: (v) => <ResearchThumb row={v} />,
                    },
                    {
                      accessor: 'title',
                      title: 'Título',
                      width: 270,
                      sortable: true,
                      render: (v) => (
                        <div className="video-title">
                          <button onClick={() => setSelected(v.youtube_video_id)}>
                            <Highlights text={v.title} spans={v.evidence?.titleSpans} />
                          </button>
                          <small>
                            {v.youtube_video_id}
                            {v.episode_number != null && ` · Episódio ${v.episode_number}`}
                          </small>
                        </div>
                      ),
                    },
                    {
                      accessor: 'evidence',
                      title: 'Evidência nos metadados',
                      width: 300,
                      render: (v) => <Evidence row={v} />,
                    },
                    {
                      accessor: 'published_at',
                      title: 'Publicação',
                      width: 125,
                      sortable: true,
                      render: (v) => date(v.published_at),
                    },
                    {
                      accessor: 'views',
                      title: 'Visualizações',
                      width: 135,
                      sortable: true,
                      textAlign: 'right',
                      render: (v) => number(v.views),
                    },
                    {
                      accessor: 'likes',
                      title: 'Curtidas',
                      width: 100,
                      sortable: true,
                      textAlign: 'right',
                      render: (v) => number(v.likes),
                    },
                    {
                      accessor: 'comments',
                      title: 'Comentários',
                      width: 125,
                      sortable: true,
                      textAlign: 'right',
                      render: (v) => number(v.comments),
                    },
                    {
                      accessor: 'actions',
                      title: 'Ações',
                      width: 135,
                      render: (v) => (
                        <Group gap={6} wrap="nowrap">
                          <Button
                            variant="light"
                            color="gray"
                            size="compact-xs"
                            onClick={() => setSelected(v.youtube_video_id)}
                          >
                            Descrição
                          </Button>
                          <Button
                            component="a"
                            variant="subtle"
                            color="gray"
                            size="compact-xs"
                            href={v.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Abrir ${v.title}`}
                          >
                            <ExternalLink size={15} />
                          </Button>
                        </Group>
                      ),
                    },
                  ]}
                />
              ) : (
                <div className="research-card-grid">
                  {results.isPending ? (
                    <Skeleton height={250} />
                  ) : result?.rows.length ? (
                    result.rows.map((v) => (
                      <article className="research-result-card" key={v.youtube_video_id}>
                        <ResearchThumb row={v} />
                        <div className="card-body">
                          <span className="small muted">{date(v.published_at)}</span>
                          <h3>
                            <Highlights text={v.title} spans={v.evidence?.titleSpans} />
                          </h3>
                          <div className="card-stats">
                            <span>
                              <Eye size={14} />
                              {number(v.views)}
                            </span>
                            <span>
                              <Heart size={14} />
                              {number(v.likes)}
                            </span>
                            <span>
                              <MessageCircle size={14} />
                              {number(v.comments)}
                            </span>
                          </div>
                          <Evidence row={v} />
                          <Group mt="md">
                            <Button
                              size="xs"
                              variant="default"
                              onClick={() => setSelected(v.youtube_video_id)}
                            >
                              Descrição
                            </Button>
                            <Button
                              size="xs"
                              component="a"
                              href={v.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              rightSection={<ExternalLink size={13} />}
                            >
                              Abrir vídeo
                            </Button>
                          </Group>
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="empty-state">
                      <Search />
                      <h3>Nenhuma correspondência encontrada.</h3>
                    </div>
                  )}
                </div>
              )}
              <div className="table-pagination">
                <span>
                  Exibindo {number(result?.rows.length ?? 0)} de {number(result?.total ?? 0)}{' '}
                  resultados · página {applied.page}
                </span>
                <Group>
                  <Select
                    aria-label="Resultados por página"
                    data={['25', '50', '100']}
                    value={String(draft.pageSize)}
                    w={78}
                    onChange={(v) => change({ pageSize: Number(v) as ResearchQuery['pageSize'] })}
                  />
                  <Pagination
                    total={Math.max(1, Math.ceil((result?.total ?? 0) / applied.pageSize))}
                    value={draft.page}
                    size="sm"
                    onChange={(page) => change({ page }, false)}
                  />
                </Group>
              </div>
            </section>
          )}
        </Tabs.Panel>
      </Tabs>
      <VideoDrawer id={selected} onClose={() => setSelected(null)} terms={result?.terms ?? []} />
    </div>
  );
}
