import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Pagination,
  Select,
  Skeleton,
  Table,
  TextInput,
} from '@mantine/core';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ArrowRight, Clock3, GitCompareArrows, Search } from 'lucide-react';
import { timelineSchema, type TimelineQuery } from '../../shared/research';
import { researchApi } from './api';
import { date, number } from '../lib';
import { VideoDrawer } from './VideoDrawer';
import './research.css';
type TimelineVideo = {
  youtube_video_id: string;
  title: string;
  published_at: string | null;
  url: string;
  episode_number: number | null;
  episode_status: string;
  pattern_a?: boolean;
  pattern_b?: boolean;
};
type Pattern = {
  pattern: string;
  total: number;
  first: TimelineVideo | null;
  last: TimelineVideo | null;
  buckets: { period: string; count: number }[];
  undated: number;
  ambiguous: number;
  ambiguousExamples: TimelineVideo[];
  duplicates: { n: number; count: number }[];
  gaps: number[];
  gapCount: number;
  resets: (TimelineVideo & { previous: number })[];
};
type TimelineResult = {
  a: Pattern;
  b: Pattern | null;
  total: number;
  rows: TimelineVideo[];
  nearTransition: TimelineVideo[];
};
function Occurrence({
  video,
  label,
  onOpen,
}: {
  video: TimelineVideo | null;
  label: string;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="pattern-occurrence">
      <span>{label}</span>
      <strong>{date(video?.published_at)}</strong>
      {video ? (
        <button onClick={() => onOpen(video.youtube_video_id)}>
          {video.title}
          <ArrowRight size={13} />
        </button>
      ) : (
        <small>Nenhum registro datado encontrado.</small>
      )}
    </div>
  );
}
function PatternPanel({
  pattern,
  color,
  onOpen,
}: {
  pattern: Pattern;
  color: 'yellow' | 'teal';
  onOpen: (id: string) => void;
}) {
  return (
    <section className={`panel pattern-panel ${color}`}>
      <div className="panel-heading">
        <div>
          <Badge color={color} variant="light">
            {pattern.pattern}
          </Badge>
          <h2>
            {number(pattern.total)}{' '}
            {pattern.total === 1 ? 'vídeo encontrado' : 'vídeos encontrados'}
          </h2>
        </div>
      </div>
      <Occurrence video={pattern.first} label="Primeira ocorrência encontrada" onOpen={onOpen} />
      <Occurrence video={pattern.last} label="Última ocorrência encontrada" onOpen={onOpen} />
      <div className="pattern-episodes">
        <h3>Numeração observada</h3>
        <p>
          <b>{number(pattern.gapCount)}</b> lacunas entre o menor e o maior episódio identificado.{' '}
          {pattern.undated > 0 &&
            `${number(pattern.undated)} registros sem data não entram na sequência temporal.`}
        </p>
        {pattern.gaps.length > 0 && (
          <div className="term-cloud">
            {pattern.gaps.map((n) => (
              <span key={n}>{n}</span>
            ))}
          </div>
        )}
        {pattern.gapCount > 200 && (
          <p className="small muted">Exibindo as primeiras 200 lacunas.</p>
        )}
        <details>
          <summary>
            Números recorrentes · {pattern.duplicates.length}
            {pattern.duplicates.length === 200 ? ' ou mais' : ''}
          </summary>
          <ul>
            {pattern.duplicates.map((d) => (
              <li key={d.n}>
                Episódio {d.n}: {number(d.count)} registros
              </li>
            ))}
          </ul>
        </details>
        <details>
          <summary>
            Reinícios aparentes · {pattern.resets.length}
            {pattern.resets.length === 100 ? ' ou mais' : ''}
          </summary>
          <ul>
            {pattern.resets.map((v) => (
              <li key={v.youtube_video_id}>
                <button onClick={() => onOpen(v.youtube_video_id)}>
                  {v.previous} → {v.episode_number} · {date(v.published_at)} · {v.title}
                </button>
              </li>
            ))}
          </ul>
        </details>
        <details>
          <summary>Números ambíguos para revisão · {number(pattern.ambiguous)}</summary>
          <p className="small muted">
            Até 20 exemplos. Anos, datas, preços e números sem marcador explícito não viram
            episódios confirmados.
          </p>
          <ul>
            {pattern.ambiguousExamples.map((v) => (
              <li key={v.youtube_video_id}>
                <button onClick={() => onOpen(v.youtube_video_id)}>{v.title}</button>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </section>
  );
}
export default function TimelinePage() {
  const initial: TimelineQuery = timelineSchema.parse({ a: 'Fala Carlão', b: 'Canal do Boi' });
  const [draft, setDraft] = useState(initial),
    [applied, setApplied] = useState(initial),
    [selected, setSelected] = useState<string | null>(null);
  const valid = timelineSchema.safeParse(applied);
  const query = useQuery({
    queryKey: ['research-timeline', applied],
    enabled: valid.success,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => researchApi<TimelineResult>('timeline', applied, signal),
  });
  const result = valid.success ? query.data : undefined;
  const periods = [
    ...new Set([
      ...(result?.a.buckets.map((v) => v.period) ?? []),
      ...(result?.b?.buckets.map((v) => v.period) ?? []),
    ]),
  ].sort();
  const max = Math.max(
    ...(result?.a.buckets.map((v) => v.count) ?? []),
    ...(result?.b?.buckets.map((v) => v.count) ?? []),
    1,
  );
  function page(page: number) {
    setDraft((d) => ({ ...d, page }));
    setApplied((q) => ({ ...q, page }));
  }
  return (
    <div className="timeline-page">
      <div className="research-intro">
        <div className="research-intro-icon">
          <Clock3 size={25} />
        </div>
        <div>
          <span className="section-kicker">INVESTIGAÇÃO HISTÓRICA</span>
          <h2>Compare nomes. Confira as evidências.</h2>
          <p>Distribuição das datas de publicação usando os títulos atualmente armazenados.</p>
        </div>
      </div>
      <Alert color="yellow" mb="lg">
        Primeiras e últimas ocorrências não comprovam a data oficial de uma mudança editorial. A API
        não oferece um histórico geral das alterações de títulos. Lacunas indicam números não
        encontrados neste recorte, não episódios necessariamente inexistentes.
      </Alert>
      <form
        className="panel timeline-form"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied({ ...draft, page: 1 });
          setDraft((d) => ({ ...d, page: 1 }));
        }}
      >
        <div className="research-grid-3">
          <TextInput
            required
            minLength={3}
            maxLength={120}
            label="Padrão A"
            value={draft.a}
            onChange={(e) => setDraft((d) => ({ ...d, a: e.target.value }))}
          />
          <TextInput
            label="Padrão B · comparação opcional"
            maxLength={120}
            value={draft.b}
            onChange={(e) => setDraft((d) => ({ ...d, b: e.target.value }))}
          />
          <Select
            label="Como localizar no título"
            value={draft.match}
            data={[
              { value: 'prefix', label: 'Começa com o padrão' },
              { value: 'contains', label: 'Contém a expressão' },
            ]}
            onChange={(v) => setDraft((d) => ({ ...d, match: v as TimelineQuery['match'] }))}
          />
        </div>
        <div className="timeline-filter-row">
          <TextInput
            label="Data inicial (UTC)"
            type="date"
            value={draft.from ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value || undefined }))}
          />
          <TextInput
            label="Data final (UTC)"
            type="date"
            value={draft.to ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value || undefined }))}
          />
          <Select
            label="Distribuição"
            value={draft.bucket}
            data={[
              { value: 'year', label: 'Por ano' },
              { value: 'month', label: 'Por mês' },
            ]}
            onChange={(v) => setDraft((d) => ({ ...d, bucket: v as TimelineQuery['bucket'] }))}
          />
          <Button
            type="submit"
            loading={query.isFetching}
            leftSection={<GitCompareArrows size={17} />}
          >
            Comparar padrões
          </Button>
        </div>
      </form>
      {(!valid.success || query.isError) && (
        <Alert color="red" my="lg">
          {!valid.success
            ? valid.error.issues.map((i) => i.message).join(' ')
            : query.error?.message}
        </Alert>
      )}
      {query.isPending ? (
        <Skeleton height={300} mt="lg" />
      ) : (
        result && (
          <>
            <div className="pattern-comparison">
              <PatternPanel pattern={result.a} color="yellow" onOpen={setSelected} />
              {result.b && <PatternPanel pattern={result.b} color="teal" onOpen={setSelected} />}
            </div>
            <section className="panel temporal-chart">
              <div className="panel-heading">
                <div>
                  <h2>Distribuição e sobreposição</h2>
                  <p>
                    Períodos com ocorrências de ambos os padrões são marcados como sobreposição
                    textual.
                  </p>
                </div>
              </div>
              <div className="period-chart">
                {periods.length === 0 && (
                  <p className="muted">Nenhuma publicação datada corresponde a esses padrões.</p>
                )}
                {periods.map((period) => {
                  const a = result.a.buckets.find((v) => v.period === period)?.count ?? 0,
                    b = result.b?.buckets.find((v) => v.period === period)?.count ?? 0;
                  return (
                    <div className="period-row" key={period}>
                      <strong>{period}</strong>
                      <div className="period-bars">
                        <div>
                          <i className="bar-a" style={{ width: `${(100 * a) / max}%` }} />
                          <span>A: {number(a)}</span>
                        </div>
                        {result.b && (
                          <div>
                            <i className="bar-b" style={{ width: `${(100 * b) / max}%` }} />
                            <span>B: {number(b)}</span>
                          </div>
                        )}
                      </div>
                      <span className="overlap-note">{a && b ? 'Sobreposição' : ''}</span>
                    </div>
                  );
                })}
              </div>
            </section>
            {result.b && (
              <section className="panel transition-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Próximos às ocorrências de transição</h2>
                    <p>
                      Até 30 vídeos em ±90 dias da primeira ocorrência de B ou da última ocorrência
                      de A, no recorte pesquisado.
                    </p>
                  </div>
                </div>
                <div className="transition-list">
                  {!result.nearTransition.length && (
                    <p className="muted">Nenhum registro próximo às datas encontradas.</p>
                  )}
                  {result.nearTransition.map((v) => (
                    <button
                      key={v.youtube_video_id}
                      onClick={() => setSelected(v.youtube_video_id)}
                    >
                      <span>{date(v.published_at)}</span>
                      <b>{v.title}</b>
                      <Group gap={5}>
                        {v.pattern_a && (
                          <Badge size="xs" color="yellow">
                            A
                          </Badge>
                        )}
                        {v.pattern_b && (
                          <Badge size="xs" color="teal">
                            B
                          </Badge>
                        )}
                      </Group>
                      <ArrowRight size={14} />
                    </button>
                  ))}
                </div>
              </section>
            )}
            <section className="panel chronological-list">
              <div className="panel-heading">
                <div>
                  <h2>Lista cronológica · {number(result.total)} vídeos</h2>
                  <p>Ordem global por publicação; títulos sem data aparecem ao final.</p>
                </div>
              </div>
              <Table.ScrollContainer minWidth={800} h={440}>
                <Table stickyHeader verticalSpacing="md" horizontalSpacing="lg">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Publicação</Table.Th>
                      <Table.Th>Título</Table.Th>
                      <Table.Th>Padrão</Table.Th>
                      <Table.Th>Numeração</Table.Th>
                      <Table.Th>Ações</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {result.rows.map((v) => (
                      <Table.Tr key={v.youtube_video_id}>
                        <Table.Td>{date(v.published_at)}</Table.Td>
                        <Table.Td>
                          <button
                            className="timeline-title"
                            onClick={() => setSelected(v.youtube_video_id)}
                          >
                            {v.title}
                          </button>
                        </Table.Td>
                        <Table.Td>
                          {v.pattern_a ? 'A' : ''}
                          {v.pattern_a && v.pattern_b ? ' + ' : ''}
                          {v.pattern_b ? 'B' : ''}
                        </Table.Td>
                        <Table.Td>
                          {v.episode_number ?? (v.episode_status === 'ambiguous' ? 'Revisar' : '—')}
                        </Table.Td>
                        <Table.Td>
                          <Button
                            size="compact-xs"
                            variant="light"
                            onClick={() => setSelected(v.youtube_video_id)}
                          >
                            Descrição
                          </Button>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
              <div className="table-pagination">
                <span>
                  Página {applied.page} · {number(result.total)} registros
                </span>
                <Group>
                  <Select
                    aria-label="Vídeos por página"
                    value={String(draft.pageSize)}
                    w={78}
                    data={['25', '50', '100']}
                    onChange={(v) => {
                      const pageSize = Number(v) as TimelineQuery['pageSize'];
                      setDraft((d) => ({ ...d, pageSize, page: 1 }));
                      setApplied((q) => ({ ...q, pageSize, page: 1 }));
                    }}
                  />
                  <Pagination
                    value={applied.page}
                    total={Math.max(1, Math.ceil(result.total / applied.pageSize))}
                    onChange={page}
                    size="sm"
                  />
                </Group>
              </div>
            </section>
          </>
        )
      )}
      <p className="research-disclaimer">
        Refine o padrão para uma série específica antes de investigar sequências. Séries diferentes
        podem compartilhar prefixos e números. Só marcadores explícitos (“episódio”, “ep.”,
        “episode” ou #) geram candidatos; anos e casos ambíguos ficam para revisão.
      </p>
      <VideoDrawer
        id={selected}
        onClose={() => setSelected(null)}
        terms={[
          { text: applied.a, kind: 'fragment' },
          ...(applied.b ? [{ text: applied.b, kind: 'fragment' as const }] : []),
        ]}
      />
    </div>
  );
}
