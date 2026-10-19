import { useEffect, useState } from 'react';
import {
  Alert,
  Anchor,
  Avatar,
  Badge,
  Button,
  Drawer,
  Group,
  Menu,
  Pagination,
  Progress,
  Select,
  Skeleton,
  Table,
  TextInput,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { DataTable, type DataTableSortStatus } from 'mantine-datatable';
import {
  ArrowDownToLine,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
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
  Sparkles,
  Wifi,
  Youtube,
} from 'lucide-react';
import type { Channel, Job, Summary, Video } from '../shared/types';
import { applyFilters, defaults, filterSchema, type Filters } from '../shared/filters';
import { api, date, nextSchedule, number, supabase, thumbnail } from './lib';
import { Description } from './Description';
function useJobs() {
  return useQuery({
    queryKey: ['jobs'],
    refetchInterval: 15000,
    queryFn: async () => {
      const r = await supabase!
        .from('sync_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);
      if (r.error) throw r.error;
      return r.data as Job[];
    },
  });
}
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
  onNavigate: (p: 'videos' | 'sync') => void;
  onImport: () => void;
  busy: boolean;
}) {
  const summary = useSummary(),
    jobs = useJobs();
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
  const cards = [
    {
      label: 'Vídeos no acervo',
      value: stats?.total,
      icon: Film,
      note: 'Histórias catalogadas',
      known: undefined,
    },
    {
      label: 'Visualizações',
      value: stats?.views,
      icon: Eye,
      note: 'Em todo o acervo',
      known: stats?.views_known,
    },
    {
      label: 'Curtidas',
      value: stats?.likes,
      icon: Heart,
      note: 'Interações registradas',
      known: stats?.likes_known,
    },
    {
      label: 'Comentários',
      value: stats?.comments,
      icon: MessageCircle,
      note: 'Conversas que continuam',
      known: stats?.comments_known,
    },
  ];
  return (
    <>
      {summary.isError && <ErrorState retry={() => summary.refetch()} />}
      <section className="hero">
        <div className="hero-copy">
          <div className="hero-chip">
            <span className="tiny-dot" /> O ACERVO DO FALA CARLÃO
          </div>
          <h2>
            Boas conversas
            <br />
            merecem ser <em>reencontradas.</em>
          </h2>
          <p>
            Um lugar para explorar o passado, acompanhar o presente
            <br className="desktop-break" /> e preservar cada história do canal.
          </p>
          <Button
            variant="white"
            color="dark"
            rightSection={<ArrowRight size={17} />}
            onClick={() => onNavigate('videos')}
          >
            Explorar acervo
          </Button>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="hero-circle" />
          <div className="hero-word">
            FALA
            <br />
            <b>CARLÃO</b>
            <span>BOA CONVERSA. SEMPRE.</span>
          </div>
          <span className="hero-play">
            <Play size={30} fill="currentColor" />
          </span>
        </div>
      </section>
      <div className="section-heading">
        <div>
          <span className="section-kicker">O CANAL EM NÚMEROS</span>
          <h2>Um acervo que conta histórias.</h2>
        </div>
        <span className="muted small">
          <Clock3 size={14} />{' '}
          {channel?.last_synced_at
            ? `Atualizado em ${date(channel.last_synced_at, true)}`
            : 'Aguardando primeira importação'}
        </span>
      </div>
      <div className="stats-grid">
        {cards.map((c) => (
          <article className="stat-card" key={c.label}>
            <div className="stat-top">
              <span>{c.label}</span>
              <c.icon size={19} />
            </div>
            {summary.isPending ? (
              <Skeleton height={40} width="65%" mt={20} />
            ) : (
              <strong>{number(c.value)}</strong>
            )}
            <small>
              {c.known != null && c.known < (stats?.total ?? 0)
                ? `${number(c.known)} de ${number(stats?.total)} com dados disponíveis`
                : c.note}
            </small>
          </article>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel recent-panel">
          <div className="panel-heading">
            <div>
              <h2>Últimas histórias</h2>
              <p>Os vídeos mais recentes do canal.</p>
            </div>
            <Button
              variant="subtle"
              color="dark"
              size="xs"
              rightSection={<ArrowRight size={14} />}
              onClick={() => onNavigate('videos')}
            >
              Ver todos
            </Button>
          </div>
          {recent.isPending ? (
            <div className="skeleton-list">
              {[0, 1, 2].map((i) => (
                <Skeleton height={70} key={i} />
              ))}
            </div>
          ) : recent.isError ? (
            <ErrorState retry={() => recent.refetch()} />
          ) : !recent.data?.length ? (
            <Empty
              title="Sua próxima descoberta começa aqui."
              description="Importe o histórico do canal para reunir todas as conversas neste acervo."
              action={
                <Button
                  variant="light"
                  leftSection={<ArrowDownToLine size={16} />}
                  loading={busy}
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
                      {date(v.published_at)}
                      <span>·</span>
                      {number(v.views)} visualizações
                    </small>
                  </div>
                  <ExternalLink size={16} />
                </a>
              ))}
            </div>
          )}
        </section>
        <section className="panel sync-card">
          <div className="sync-card-icon">
            <RefreshCw size={22} />
          </div>
          <h2>Sempre em sintonia.</h2>
          <p>O acervo acompanha o canal com três atualizações programadas por dia.</p>
          <div className="schedule-chips">
            <span>08:00</span>
            <span>14:00</span>
            <span>20:00</span>
          </div>
          <span className="small muted">Horário de Brasília · GitHub Actions</span>
          <div className="sync-card-status">
            <span className={`tiny-dot ${ready ? 'green' : 'amber'}`} />
            {jobs.data?.[0]?.status === 'running'
              ? 'Sincronização em andamento'
              : ready
                ? 'Integração configurada'
                : 'Configuração pendente'}
          </div>
          <Button
            variant="default"
            fullWidth
            rightSection={<ArrowRight size={16} />}
            onClick={() => onNavigate('sync')}
          >
            Acompanhar sincronizações
          </Button>
        </section>
      </div>
      <div className="timeline-strip">
        <div>
          <CalendarDays size={21} />
          <span>
            Primeira história<strong>{date(stats?.oldest)}</strong>
          </span>
        </div>
        <div className="timeline-line">
          <span />
          <i />
          <span />
        </div>
        <div>
          <History size={21} />
          <span>
            História mais recente<strong>{date(stats?.newest)}</strong>
          </span>
        </div>
        <p>Do primeiro vídeo à próxima conversa.</p>
      </div>
    </>
  );
}

export function VideoPage() {
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
      <section className="panel catalogue">
        <div className="panel-heading">
          <div>
            <h2>
              Acervo de vídeos{' '}
              <Badge color="gray" variant="light" ml={8}>
                {number(count)} vídeos
              </Badge>
            </h2>
            <p>O canal completo, a uma busca de distância.</p>
          </div>
          <Menu position="bottom-end">
            <Menu.Target>
              <Button
                variant="default"
                loading={exporting}
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
                disabled={!valid.success}
                onClick={() => download('csv')}
              >
                Exportar CSV
              </Menu.Item>
              <Menu.Item
                leftSection={<FileSpreadsheet size={15} />}
                disabled={!valid.success}
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
            placeholder="Encontre uma história pelo título…"
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
            verticalSpacing="md"
            fetching={videos.isFetching}
            records={valid.success ? (videos.data?.rows ?? []) : []}
            pinFirstColumn
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
                    ? 'Nenhuma história com esses filtros.'
                    : 'O acervo está esperando a primeira importação.'
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
            {count
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
        title="Uma história do acervo"
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
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  const active = jobs.data?.find((j) => j.status === 'running' || j.status === 'queued');
  const last = jobs.data?.[0];
  return (
    <>
      <div className="sync-overview">
        <section className="panel connection-panel">
          <div className="panel-heading">
            <div className="connection-brand">
              <Avatar src={channel?.thumbnail_url} color="red" size={48} radius="md">
                <Youtube size={27} />
              </Avatar>
              <div>
                <h2>{channel?.title ?? 'Fala Carlão'}</h2>
                <p>@falacarlao · YouTube Data API v3</p>
              </div>
            </div>
            <Badge variant="light" color={channel?.last_synced_at ? 'green' : 'yellow'}>
              {channel?.last_synced_at ? 'Última coleta concluída' : 'Aguardando coleta'}
            </Badge>
          </div>
          <dl>
            <div>
              <dt>ID do canal</dt>
              <dd>{channel?.id ?? 'Será identificado na primeira importação'}</dd>
            </div>
            <div>
              <dt>Playlist de uploads</dt>
              <dd>{channel?.uploads_playlist_id ?? 'Aguardando identificação do canal'}</dd>
            </div>
            <div>
              <dt>Última sincronização concluída</dt>
              <dd>{date(channel?.last_synced_at, true)}</dd>
            </div>
            <div>
              <dt>Próxima execução prevista</dt>
              <dd>{date(nextSchedule(now), true)} · Brasília</dd>
            </div>
          </dl>
          <div className="connection-note">
            <Wifi size={16} />
            {config?.youtube && config.worker
              ? 'Credenciais presentes. A conexão com o YouTube será verificada pelo worker.'
              : 'Configure YOUTUBE_API_KEY e SUPABASE_SERVICE_ROLE_KEY no backend e no GitHub.'}
          </div>
        </section>
        <section className="panel import-panel">
          <span className="section-kicker">DA PRIMEIRA HISTÓRIA ATÉ HOJE</span>
          <h2>Seu canal por completo.</h2>
          <p>
            A importação percorre todas as páginas de uploads, incluindo os vídeos mais antigos
            disponíveis. Você pode fechar esta página durante o processo.
          </p>
          <Button
            fullWidth
            leftSection={<ArrowDownToLine size={17} />}
            loading={busy}
            disabled={!!active}
            onClick={() => requestSync('full')}
          >
            Importar histórico completo
          </Button>
          <Button
            fullWidth
            variant="subtle"
            color="dark"
            mt="xs"
            leftSection={<RefreshCw size={15} />}
            loading={busy}
            disabled={!!active}
            onClick={() => requestSync('retry')}
          >
            Reprocessar registros com falha
          </Button>
          <small>Sem duplicações. Com retomada automática por lote.</small>
        </section>
      </div>
      {active && (
        <div className="panel active-job">
          <div>
            <RefreshCw size={20} className={active.status === 'running' ? 'spin' : ''} />
            <div>
              <h3>
                {statusLabel[active.status]} · {modeLabel[active.mode]}
              </h3>
              <p>
                {number(active.processed)} vídeos processados · Etapa:{' '}
                {active.phase === 'discovery' ? 'descoberta de uploads' : 'atualização do catálogo'}
              </p>
            </div>
            <Badge color={statusColor[active.status]}>{statusLabel[active.status]}</Badge>
          </div>
          <Progress value={100} animated={active.status === 'running'} color="yellow" size="xs" />
          {active.error && <p className="small muted">{active.error}</p>}
          <p className="small muted">
            O total só será conhecido ao terminar a paginação da playlist. Última atividade:{' '}
            {date(active.heartbeat_at, true)}
          </p>
        </div>
      )}
      <div className="sync-metrics">
        <div>
          <span>Vídeos cadastrados</span>
          <strong>{number(summary.data?.total)}</strong>
        </div>
        <div>
          <span>Inseridos na última execução</span>
          <strong>{number(last?.inserted)}</strong>
        </div>
        <div>
          <span>Atualizados na última execução</span>
          <strong>{number(last?.updated)}</strong>
        </div>
        <div>
          <span>Indisponíveis na última execução</span>
          <strong>{number(last?.unavailable)}</strong>
        </div>
      </div>
      <section className="panel jobs-panel">
        <div className="panel-heading">
          <div>
            <h2>Diário de sincronizações</h2>
            <p>As 30 execuções mais recentes, com progresso persistido no banco.</p>
          </div>
          <Badge color="gray" variant="light">
            3 vezes ao dia
          </Badge>
        </div>
        {jobs.isError ? (
          <ErrorState retry={() => jobs.refetch()} />
        ) : jobs.isPending ? (
          <Skeleton height={160} m="lg" />
        ) : !jobs.data?.length ? (
          <Empty
            title="O primeiro capítulo ainda vai começar."
            description="Configure as credenciais e importe o histórico completo para iniciar seu diário."
          />
        ) : (
          <Table.ScrollContainer minWidth={920}>
            <Table verticalSpacing="md" horizontalSpacing="lg">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Execução / modo</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Processados</Table.Th>
                  <Table.Th>Inseridos / atualizados</Table.Th>
                  <Table.Th>Duração</Table.Th>
                  <Table.Th>Resultado</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {jobs.data.map((j) => (
                  <Table.Tr key={j.id}>
                    <Table.Td>
                      <b>{date(j.started_at ?? j.created_at, true)}</b>
                      <small className="block muted">{modeLabel[j.mode]}</small>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={statusColor[j.status]} variant="light">
                        {statusLabel[j.status]}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{number(j.processed)}</Table.Td>
                    <Table.Td>
                      {number(j.inserted)} / {number(j.updated)}
                    </Table.Td>
                    <Table.Td>
                      {j.started_at && j.finished_at
                        ? `${Math.max(0, Math.round((+new Date(j.finished_at) - +new Date(j.started_at)) / 1000))} s`
                        : '—'}
                    </Table.Td>
                    <Table.Td className="job-error">
                      {j.error ??
                        (j.status === 'completed'
                          ? `${number(j.api_requests)} requisições à API`
                          : 'Aguardando término')}
                      <small className="block muted">{j.id}</small>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </section>
      <p className="table-note">
        <Clock3 size={14} /> Horários previstos: 08:00, 14:00 e 20:00 em America/Sao_Paulo. A
        execução depende do workflow publicado e pode sofrer atrasos no GitHub.
      </p>
    </>
  );
}
