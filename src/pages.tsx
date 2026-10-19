import { useEffect, useState } from 'react';
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Drawer,
  Group,
  Menu,
  Pagination,
  Select,
  Skeleton,
  Table,
  TextInput,
} from '@mantine/core';
import { useDebouncedValue, useMediaQuery } from '@mantine/hooks';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { DataTable, type DataTableSortStatus } from 'mantine-datatable';
import {
  ArrowDownToLine,
  ArrowRight,
  ChevronDown,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  Film,
  Heart,
  History,
  MessageCircle,
  Play,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import type { Channel, Job, Summary, Video } from '../shared/types';
import { applyFilters, defaults, filterSchema, type Filters } from '../shared/filters';
import { api, date, nextSchedule, number, supabase, thumbnail } from './lib';
import { Description } from './Description';
import { useResearchOverview } from './research/Overview';
import { useJobs } from './useJobs';
function useSummary() {
  return useQuery({
    queryKey: ['summary'],
    refetchInterval: 60000,
    queryFn: async () => {
      const r = await supabase!.rpc('catalog_summary');
      if (r.error) throw r.error;
      return r.data as Summary;
    },
  });
}
function ErrorState({ retry }: { retry: () => void }) {
  return (
    <Alert color="red" title="Não foi possível carregar os dados">
      Verifique a conexão e se a migração SQL foi aplicada.
      <Button variant="subtle" color="red" size="xs" onClick={retry}>
        Tentar novamente
      </Button>
    </Alert>
  );
}
function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Film size={29} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
function VideoThumb({ video }: { video: Video }) {
  const src = thumbnail(video);
  return src ? (
    <img className="video-thumb" src={src} alt="" loading="lazy" referrerPolicy="no-referrer" />
  ) : (
    <div className="video-thumb thumb-placeholder">
      <Play size={21} />
    </div>
  );
}
const statusLabel: Record<Job['status'], string> = {
  queued: 'Na fila',
  running: 'Em andamento',
  completed: 'Concluída',
  failed: 'Falhou',
};
const statusColor: Record<Job['status'], string> = {
  queued: 'yellow',
  running: 'blue',
  completed: 'green',
  failed: 'red',
};
const modeLabel: Record<Job['mode'], string> = {
  full: 'Histórico completo',
  incremental: 'Incremental',
  retry: 'Reprocessamento',
};

export function Dashboard({
  channel,
  ready,
  onNavigate,
  onImport,
  busy,
}: {
  channel: Channel | null;
  ready: boolean;
  onNavigate: (p: 'videos' | 'sync' | 'research' | 'timeline') => void;
  onImport: () => void;
  busy: boolean;
}) {
  const summary = useSummary(),
    jobs = useJobs();
  const coverage = useResearchOverview();
  const recent = useQuery({
    queryKey: ['recent'],
    queryFn: async () => {
      const r = await supabase!
        .from('videos')
        .select('*')
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(4);
      if (r.error) throw r.error;
      return r.data as Video[];
    },
  });
  const stats = summary.data;
  const latest = jobs.data?.[0];
  const cards = [
    { label: 'Total de vídeos', value: stats?.total, icon: Film, known: undefined },
    { label: 'Visualizações', value: stats?.views, icon: Eye, known: stats?.views_known },
    { label: 'Curtidas', value: stats?.likes, icon: Heart, known: stats?.likes_known },
    {
      label: 'Comentários',
      value: stats?.comments,
      icon: MessageCircle,
      known: stats?.comments_known,
    },
  ];
  return (
    <>
      {summary.isError && <ErrorState retry={() => summary.refetch()} />}
      <div className="stats-grid" aria-label="Resumo do acervo">
        {cards.map((c) => (
          <article className="stat-card" key={c.label}>
            <div className="stat-top">
              <span>{c.label}</span>
              <c.icon size={18} aria-hidden="true" />
            </div>
            {summary.isPending ? (
              <Skeleton height={34} width="65%" mt={12} />
            ) : (
              <strong>{number(c.value)}</strong>
            )}
            {c.known != null && c.known < (stats?.total ?? 0) && (
              <small>
                {number(c.known)} de {number(stats?.total)} vídeos com dados disponíveis
              </small>
            )}
          </article>
        ))}
      </div>
      <section className="panel operational-panel">
        <div className="panel-heading">
          <h2>Estado do acervo</h2>
          <Button
            variant="subtle"
            size="xs"
            rightSection={<ArrowRight size={14} />}
            onClick={() => onNavigate('sync')}
          >
            Ver sincronizações
          </Button>
        </div>
        {jobs.isError && <ErrorState retry={() => jobs.refetch()} />}
        <dl className="operational-grid">
          <div>
            <dt>Última sincronização concluída</dt>
            <dd>{date(channel?.last_synced_at, true)}</dd>
          </div>
          <div>
            <dt>Última execução</dt>
            <dd>
              {jobs.isPending ? (
                'Carregando…'
              ) : latest ? (
                <Badge color={statusColor[latest.status]} variant="light">
                  {statusLabel[latest.status]}
                </Badge>
              ) : (
                'Nenhuma execução'
              )}
            </dd>
          </div>
          <div>
            <dt>Vídeo mais antigo</dt>
            <dd>{date(stats?.oldest)}</dd>
          </div>
          <div>
            <dt>Vídeo mais recente</dt>
            <dd>{date(stats?.newest)}</dd>
          </div>
          <div>
            <dt>Vídeos sem descrição</dt>
            <dd>{coverage.isError ? 'Indisponível' : number(coverage.data?.withoutDescription)}</dd>
          </div>
        </dl>
        {!ready && (
          <p className="operational-note muted">
            Configuração da sincronização pendente. Confira as integrações em Configurações.
          </p>
        )}
      </section>
      <nav className="quick-links" aria-label="Acesso rápido">
        {(
          [
            {
              page: 'research',
              title: 'Pesquisa avançada',
              text: 'Pesquisar títulos e descrições',
              icon: Search,
            },
            {
              page: 'timeline',
              title: 'Linha do tempo',
              text: 'Comparar padrões de títulos',
              icon: History,
            },
            {
              page: 'videos',
              title: 'Acervo de vídeos',
              text: 'Consultar e exportar vídeos',
              icon: Film,
            },
          ] as const
        ).map((link) => (
          <button key={link.page} onClick={() => onNavigate(link.page)}>
            <link.icon size={20} aria-hidden="true" />
            <span>
              <strong>{link.title}</strong>
              <small>{link.text}</small>
            </span>
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        ))}
      </nav>
      <section className="panel recent-panel">
        <div className="panel-heading">
          <h2>Vídeos recentes</h2>
          <Button variant="subtle" size="xs" onClick={() => onNavigate('videos')}>
            Ver acervo
          </Button>
        </div>
        {recent.isPending ? (
          <div className="skeleton-list">
            <Skeleton height={70} />
            <Skeleton height={70} />
          </div>
        ) : recent.isError ? (
          <ErrorState retry={() => recent.refetch()} />
        ) : !recent.data?.length ? (
          <Empty
            title="Nenhum vídeo cadastrado"
            description="Importe os vídeos públicos do canal para preencher o acervo."
            action={
              <Button
                variant="default"
                loading={busy}
                leftSection={<ArrowDownToLine size={16} />}
                onClick={onImport}
              >
                Importar histórico completo
              </Button>
            }
          />
        ) : (
          <div className="recent-list">
            {recent.data.map((v) => (
              <a
                className="recent-row"
                key={v.youtube_video_id}
                href={v.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <VideoThumb video={v} />
                <div>
                  <b>{v.title}</b>
                  <small>
                    {date(v.published_at)} · {number(v.views)} visualizações
                  </small>
                </div>
                <ExternalLink size={15} aria-hidden="true" />
              </a>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

export function VideoPage() {
  const smallScreen = useMediaQuery('(max-width: 650px)');
  const [filters, setFilters] = useState<Filters>(defaults),
    [search, setSearch] = useState(''),
    [debounced] = useDebouncedValue(search, 350),
    [selected, setSelected] = useState<Video | null>(null),
    [exporting, setExporting] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    setFilters((f) => ({ ...f, q: debounced, page: 1 }));
  }, [debounced]);
  const valid = filterSchema.safeParse(filters);
  const videos = useQuery({
    queryKey: ['videos', filters],
    enabled: valid.success,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const r = await applyFilters(
        supabase!.from('videos').select('*', { count: 'exact' }),
        filters,
      ).range((filters.page - 1) * filters.pageSize, filters.page * filters.pageSize - 1);
      if (r.error) throw r.error;
      return { rows: r.data as Video[], total: r.count ?? 0 };
    },
  });
  function change(patch: Partial<Filters>) {
    setFilters((f) => ({ ...f, ...patch, page: 1 }));
  }
  async function download(format: 'csv' | 'xlsx') {
    setExporting(true);
    setError('');
    try {
      const params = new URLSearchParams(
        Object.entries({ ...filters, format })
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)]),
      );
      const r = await api(`export?${params}`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fala-carlao.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao exportar');
    } finally {
      setExporting(false);
    }
  }
  const count = valid.success ? videos.data?.total : 0;
  return (
    <>
      <section className="panel catalogue" aria-busy={videos.isFetching}>
        <span className="sr-only" role="status">
          {videos.isFetching ? 'Carregando vídeos…' : ''}
        </span>
        <div className="panel-heading">
          <div>
            <h2>
              Vídeos cadastrados{' '}
              <Badge color="gray" variant="light" ml={8}>
                {number(count)} vídeos
              </Badge>
            </h2>
          </div>
          <Menu position="bottom-end">
            <Menu.Target>
              <Button
                variant="default"
                loading={exporting}
                aria-busy={exporting}
                leftSection={<ArrowDownToLine size={16} />}
                rightSection={<ChevronDown size={14} />}
              >
                Exportar
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Todos os resultados dos filtros</Menu.Label>
              <Menu.Item
                leftSection={<ArrowDownToLine size={15} />}
                disabled={!valid.success || exporting}
                onClick={() => download('csv')}
              >
                Exportar CSV
              </Menu.Item>
              <Menu.Item
                leftSection={<FileSpreadsheet size={15} />}
                disabled={!valid.success || exporting}
                onClick={() => download('xlsx')}
              >
                Exportar Excel (.xlsx)
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </div>
        <div className="filter-bar">
          <TextInput
            className="search-input"
            placeholder="Pesquisar por título"
            aria-label="Pesquisar por título"
            leftSection={<Search size={17} />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            aria-label="Ano de publicação"
            placeholder="Todos os anos"
            clearable
            searchable
            data={Array.from({ length: new Date().getFullYear() - 2004 }, (_, i) =>
              String(new Date().getFullYear() - i),
            )}
            value={filters.year ? String(filters.year) : null}
            onChange={(v) => change({ year: v ? Number(v) : undefined })}
          />
          <Select
            aria-label="Ordenação por data"
            value={filters.sort === 'published_at' ? filters.direction : null}
            placeholder="Ordenação da coluna"
            data={[
              { value: 'desc', label: 'Mais recentes' },
              { value: 'asc', label: 'Mais antigos' },
            ]}
            onChange={(v) => change({ sort: 'published_at', direction: v as 'asc' | 'desc' })}
          />
        </div>
        <div className="filter-secondary">
          <span className="filter-label">
            <SlidersHorizontal size={15} /> Refinar busca
          </span>
          <TextInput
            type="date"
            aria-label="Data inicial"
            value={filters.from ?? ''}
            onChange={(e) => change({ from: e.target.value || undefined })}
          />
          <span className="muted small">até</span>
          <TextInput
            type="date"
            aria-label="Data final"
            value={filters.to ?? ''}
            onChange={(e) => change({ to: e.target.value || undefined })}
          />
          <Select
            aria-label="Disponibilidade"
            value={filters.availability}
            data={[
              { value: 'all', label: 'Todos os registros' },
              { value: 'available', label: 'Disponíveis no YouTube' },
              { value: 'unavailable', label: 'Indisponíveis no YouTube' },
              { value: 'missing_stats', label: 'Estatísticas incompletas' },
            ]}
            onChange={(v) => change({ availability: v as Filters['availability'] })}
          />
          <Button
            variant="subtle"
            color="gray"
            size="xs"
            onClick={() => {
              setSearch('');
              setFilters(defaults);
            }}
          >
            Limpar filtros
          </Button>
        </div>
        {!valid.success && (
          <Alert color="yellow" m="md">
            Verifique as datas: a data inicial deve ser anterior à data final.
          </Alert>
        )}
        {error && (
          <Alert color="red" m="md" withCloseButton onClose={() => setError('')}>
            {error}
          </Alert>
        )}
        {videos.isError ? (
          <ErrorState retry={() => videos.refetch()} />
        ) : (
          <DataTable<Video>
            idAccessor="youtube_video_id"
            className="video-table"
            height="clamp(320px, 54vh, 720px)"
            minHeight={320}
            highlightOnHover
            verticalSpacing="sm"
            fetching={videos.isFetching}
            records={valid.success ? (videos.data?.rows ?? []) : []}
            pinFirstColumn={!smallScreen}
            sortStatus={
              {
                columnAccessor: filters.sort,
                direction: filters.direction,
              } as DataTableSortStatus<Video>
            }
            onSortStatusChange={(s) =>
              change({ sort: s.columnAccessor as Filters['sort'], direction: s.direction })
            }
            noRecordsText="Nenhum vídeo encontrado"
            emptyState={
              <Empty
                title={
                  filters.q || filters.from || filters.year
                    ? 'Nenhum vídeo encontrado.'
                    : 'Nenhum vídeo cadastrado.'
                }
                description="Ajuste os filtros ou acompanhe a configuração na página Sincronizações."
              />
            }
            columns={[
              {
                accessor: 'thumbnail',
                title: 'Vídeo',
                width: 128,
                render: (v) => <VideoThumb video={v} />,
              },
              {
                accessor: 'title',
                title: 'Título',
                sortable: true,
                width: 340,
                render: (v) => (
                  <div className="video-title">
                    <button onClick={() => setSelected(v)}>{v.title}</button>
                    <small>
                      {v.youtube_video_id}
                      {!v.available && (
                        <Badge size="xs" color="gray" ml={8}>
                          Indisponível
                        </Badge>
                      )}
                    </small>
                  </div>
                ),
              },
              {
                accessor: 'published_at',
                title: 'Publicação',
                sortable: true,
                width: 125,
                render: (v) => date(v.published_at),
              },
              {
                accessor: 'views',
                title: 'Visualizações',
                sortable: true,
                textAlign: 'right',
                width: 145,
                render: (v) => number(v.views),
              },
              {
                accessor: 'likes',
                title: 'Curtidas',
                sortable: true,
                textAlign: 'right',
                width: 105,
                render: (v) => number(v.likes),
              },
              {
                accessor: 'comments',
                title: 'Comentários',
                sortable: true,
                textAlign: 'right',
                width: 135,
                render: (v) => number(v.comments),
              },
              {
                accessor: 'description',
                title: 'Descrição',
                width: 110,
                render: (v) => (
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="dark"
                    onClick={() => setSelected(v)}
                  >
                    Descrição
                  </Button>
                ),
              },
              {
                accessor: 'url',
                title: 'Ações',
                width: 80,
                textAlign: 'center',
                render: (v) => (
                  <Anchor
                    href={v.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Abrir ${v.title} no YouTube`}
                  >
                    <ExternalLink size={17} />
                  </Anchor>
                ),
              },
            ]}
          />
        )}
        <div className="table-pagination">
          <span>
            {videos.isPending
              ? 'Carregando vídeos…'
              : count
                ? `${number((filters.page - 1) * filters.pageSize + 1)}–${number(Math.min(filters.page * filters.pageSize, count))} de ${number(count)} vídeos`
                : '0 vídeos'}
            <small>Ordenação aplicada a todo o acervo</small>
          </span>
          <Group gap="sm">
            <Select
              aria-label="Vídeos por página"
              value={String(filters.pageSize)}
              data={['25', '50', '100']}
              w={78}
              onChange={(v) => change({ pageSize: Number(v) })}
            />
            <Pagination
              size="sm"
              value={filters.page}
              total={Math.max(1, Math.ceil((count ?? 0) / filters.pageSize))}
              onChange={(page) => setFilters((f) => ({ ...f, page }))}
            />
          </Group>
        </div>
      </section>
      <p className="table-note">
        Estatísticas ausentes aparecem como “—”. Os dados refletem a última coleta disponível.
      </p>
      <Drawer
        opened={!!selected}
        onClose={() => setSelected(null)}
        position="right"
        size="lg"
        title="Detalhes do vídeo"
        closeButtonProps={{ 'aria-label': 'Fechar detalhes do vídeo' }}
      >
        {selected && (
          <div className="video-detail">
            <VideoThumb video={selected} />
            <Badge mt="lg" variant="light" color="gray">
              {selected.content_type ?? 'Vídeo do canal'}
            </Badge>
            <h2>{selected.title}</h2>
            <p className="muted">Publicado em {date(selected.published_at, true)}</p>
            <div className="detail-stats">
              <span>
                <Eye size={17} />
                {number(selected.views)}
              </span>
              <span>
                <Heart size={17} />
                {number(selected.likes)}
              </span>
              <span>
                <MessageCircle size={17} />
                {number(selected.comments)}
              </span>
            </div>
            <Button
              component="a"
              href={selected.url}
              target="_blank"
              rel="noopener noreferrer"
              fullWidth
              mt="lg"
              rightSection={<ExternalLink size={16} />}
            >
              Assistir no YouTube
            </Button>
            <h3>Descrição completa</h3>
            {selected.description ? (
              <Description text={selected.description} />
            ) : (
              <p className="muted">Este vídeo não possui descrição disponível.</p>
            )}
            <p className="small muted">
              Última atualização: {date(selected.updated_at, true)} · Duração (ISO 8601):{' '}
              {selected.duration ?? 'não disponível'}
            </p>
          </div>
        )}
      </Drawer>
    </>
  );
}

function jobDuration(job: Job | undefined, now = new Date()) {
  if (!job?.started_at) return '—';
  return (
    number(
      Math.max(
        0,
        Math.round(
          (+(job.finished_at ? new Date(job.finished_at) : now) - +new Date(job.started_at)) / 1000,
        ),
      ),
    ) + ' s'
  );
}
export function SyncPage({
  channel,
  config,
  requestSync,
  busy,
}: {
  channel: Channel | null;
  config?: { youtube: boolean; worker: boolean; dispatch: boolean };
  requestSync: (mode: 'full' | 'incremental' | 'retry') => void;
  busy: boolean;
}) {
  const jobs = useJobs(),
    summary = useSummary();
  const [now, setNow] = useState(new Date()),
    [selectedJob, setSelectedJob] = useState<Job | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  const active = jobs.data?.find((j) => j.status === 'running' || j.status === 'queued');
  const last = active ?? jobs.data?.[0];
  return (
    <>
      {jobs.isError && <ErrorState retry={() => jobs.refetch()} />}
      <section className="panel sync-status-panel">
        <div className="panel-heading">
          <h2>Estado atual</h2>
          {last && (
            <Badge color={statusColor[last.status]} variant="light">
              {statusLabel[last.status]}
            </Badge>
          )}
        </div>
        <dl className="operational-grid sync-state">
          <div>
            <dt>Última execução</dt>
            <dd>
              {jobs.isPending
                ? 'Carregando…'
                : last
                  ? date(last.started_at ?? last.created_at, true)
                  : 'Nenhuma execução'}
            </dd>
          </div>
          <div>
            <dt>Duração</dt>
            <dd>{jobDuration(last, now)}</dd>
          </div>
          <div>
            <dt>Registros processados</dt>
            <dd>{number(last?.processed)}</dd>
          </div>
          <div>
            <dt>Próxima execução prevista</dt>
            <dd>
              {date(nextSchedule(now), true)}
              <small>Horário de Brasília</small>
            </dd>
          </div>
        </dl>
        {active && (
          <div className="active-job" role="status">
            <RefreshCw
              size={17}
              className={active.status === 'running' ? 'spin' : ''}
              aria-hidden="true"
            />
            <div>
              <strong>
                {active.status === 'running' ? 'Atualizando vídeos…' : 'Solicitação na fila'}
              </strong>
              <p>
                {number(active.processed)} registros processados ·{' '}
                {active.phase === 'discovery' ? 'Descoberta de uploads' : 'Atualização do catálogo'}
              </p>
              <small className="muted">
                Total disponível ao concluir a leitura da playlist. Última atividade:{' '}
                {date(active.heartbeat_at, true)}
              </small>
              {active.error && <p>{active.error}</p>}
            </div>
          </div>
        )}
      </section>
      <section className="panel sync-actions">
        <div>
          <h2>Ações de sincronização</h2>
          <p className="muted">A execução continua mesmo se você fechar a página.</p>
        </div>
        <div className="sync-action-buttons">
          <Button
            variant="default"
            leftSection={<ArrowDownToLine size={16} />}
            loading={busy}
            disabled={!!active}
            onClick={() => requestSync('full')}
          >
            Importar histórico completo
          </Button>
          <Button
            variant="subtle"
            leftSection={<RefreshCw size={16} />}
            loading={busy}
            disabled={!!active}
            onClick={() => requestSync('retry')}
          >
            Reprocessar falhas
          </Button>
        </div>
      </section>
      <section className="panel jobs-panel">
        <div className="panel-heading">
          <h2>Histórico</h2>
          <span className="muted small">Até 30 execuções recentes</span>
        </div>
        {jobs.isPending ? (
          <Skeleton height={160} m="md" />
        ) : !jobs.data?.length ? (
          !jobs.isError && (
            <Empty
              title="Nenhuma sincronização registrada"
              description="Use Sincronizar agora ou importe o histórico completo."
            />
          )
        ) : (
          <Table.ScrollContainer minWidth={1030}>
            <Table verticalSpacing="sm" horizontalSpacing="md">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Data</Table.Th>
                  <Table.Th>Tipo</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Duração</Table.Th>
                  <Table.Th>Processados</Table.Th>
                  <Table.Th>Inseridos</Table.Th>
                  <Table.Th>Atualizados</Table.Th>
                  <Table.Th>Falhas</Table.Th>
                  <Table.Th>Detalhes</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {jobs.data.map((j) => (
                  <Table.Tr key={j.id}>
                    <Table.Td>{date(j.started_at ?? j.created_at, true)}</Table.Td>
                    <Table.Td>{modeLabel[j.mode]}</Table.Td>
                    <Table.Td>
                      <Badge color={statusColor[j.status]} variant="light">
                        {statusLabel[j.status]}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{jobDuration(j, now)}</Table.Td>
                    <Table.Td>{number(j.processed)}</Table.Td>
                    <Table.Td>{number(j.inserted)}</Table.Td>
                    <Table.Td>{number(j.updated)}</Table.Td>
                    <Table.Td>
                      {j.error
                        ? 'Erro registrado'
                        : j.status === 'failed'
                          ? 'Falha na execução'
                          : '—'}
                    </Table.Td>
                    <Table.Td>
                      <Button
                        variant="subtle"
                        size="compact-xs"
                        aria-label={'Detalhes da execução de ' + date(j.created_at, true)}
                        onClick={() => setSelectedJob(j)}
                      >
                        Detalhes
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </section>
      <details className="panel context-help technical-details">
        <summary>Configuração técnica e agendamento</summary>
        <dl className="technical-list">
          <div>
            <dt>Canal</dt>
            <dd>{channel?.title ?? 'Fala Carlão'} · @falacarlao</dd>
          </div>
          <div>
            <dt>ID do canal</dt>
            <dd>{channel?.id ?? 'Aguardando identificação'}</dd>
          </div>
          <div>
            <dt>Playlist de uploads</dt>
            <dd>{channel?.uploads_playlist_id ?? 'Aguardando identificação'}</dd>
          </div>
          <div>
            <dt>Última sincronização concluída</dt>
            <dd>{date(channel?.last_synced_at, true)}</dd>
          </div>
          <div>
            <dt>Vídeos cadastrados</dt>
            <dd>{summary.isError ? 'Indisponível' : number(summary.data?.total)}</dd>
          </div>
        </dl>
        <p>
          {config?.youtube && config.worker
            ? 'Credenciais cadastradas. Consulte o histórico para verificar o resultado da conexão com o YouTube.'
            : 'Configuração pendente. Confira as integrações em Configurações.'}
        </p>
        <p>
          Execuções previstas às 08h, 14h e 20h (Brasília). Os horários dependem do workflow
          publicado e podem sofrer atrasos no GitHub.
        </p>
        <p>
          Uma importação completa percorre todas as páginas de uploads públicos, incluindo vídeos
          antigos. A retomada por lote evita duplicações.
        </p>
        <p>O histórico registra erros por execução; não há um contador de vídeos com falha.</p>
      </details>
      <Drawer
        opened={!!selectedJob}
        onClose={() => setSelectedJob(null)}
        position="right"
        title="Detalhes da sincronização"
        size="md"
        closeButtonProps={{ 'aria-label': 'Fechar detalhes da sincronização' }}
      >
        {selectedJob && (
          <>
            <Badge variant="light" color={statusColor[selectedJob.status]}>
              {statusLabel[selectedJob.status]}
            </Badge>
            <dl className="technical-list">
              <div>
                <dt>ID da execução</dt>
                <dd>{selectedJob.id}</dd>
              </div>
              <div>
                <dt>Tipo</dt>
                <dd>{modeLabel[selectedJob.mode]}</dd>
              </div>
              <div>
                <dt>Criada em</dt>
                <dd>{date(selectedJob.created_at, true)}</dd>
              </div>
              <div>
                <dt>Início</dt>
                <dd>{date(selectedJob.started_at, true)}</dd>
              </div>
              <div>
                <dt>Fim</dt>
                <dd>{date(selectedJob.finished_at, true)}</dd>
              </div>
              <div>
                <dt>Duração</dt>
                <dd>{jobDuration(selectedJob, now)}</dd>
              </div>
              <div>
                <dt>Indisponíveis</dt>
                <dd>{number(selectedJob.unavailable)}</dd>
              </div>
              <div>
                <dt>Requisições à API</dt>
                <dd>{number(selectedJob.api_requests)}</dd>
              </div>
              <div>
                <dt>Última atividade</dt>
                <dd>{date(selectedJob.heartbeat_at, true)}</dd>
              </div>
            </dl>
            {selectedJob.error ? (
              <Alert color="red" title="Erro registrado">
                {selectedJob.error}
              </Alert>
            ) : (
              <p className="muted">
                {selectedJob.status === 'completed'
                  ? 'Sincronização concluída.'
                  : 'Nenhum erro registrado até o momento.'}
              </p>
            )}
          </>
        )}
      </Drawer>
    </>
  );
}
