import { Alert, Badge, Skeleton } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { FileSearch, ArrowRight } from 'lucide-react';
import { researchApi } from './api';
import { number } from '../lib';
import './research.css';
type Overview = {
  withDescription: number;
  withoutDescription: number;
  peakYear: { year: number; count: number } | null;
  groups: { id: string; name: string; kind: string; count: number }[];
};
export function useResearchOverview() {
  return useQuery({
    queryKey: ['research-overview'],
    staleTime: 60000,
    queryFn: ({ signal }) => researchApi<Overview>('overview', undefined, signal),
  });
}
export function ResearchOverview({ onResearch }: { onResearch: () => void }) {
  const query = useResearchOverview();
  if (query.isPending) return <Skeleton height={170} mt="lg" />;
  if (query.isError)
    return (
      <Alert color="yellow" mt="lg" title="Indicadores de pesquisa pendentes">
        {query.error.message}
      </Alert>
    );
  const data = query.data;
  return (
    <section className="panel research-overview">
      <div className="panel-heading">
        <div>
          <h2>Cobertura dos metadados</h2>
        </div>
        <button className="research-link" onClick={onResearch}>
          Abrir pesquisa avançada <ArrowRight size={15} />
        </button>
      </div>
      <div className="research-coverage">
        <div>
          <span>Com descrição preenchida</span>
          <strong>{number(data.withDescription)}</strong>
        </div>
        <div>
          <span>Ano com mais publicações</span>
          <strong>
            {data.peakYear?.year ?? '—'}{' '}
            <small>{data.peakYear ? `${number(data.peakYear.count)} vídeos` : ''}</small>
          </strong>
        </div>
      </div>
      <div className="overview-group-list">
        {data.groups.map((g) => (
          <div key={g.id}>
            <span>{g.name}</span>
            <div>
              <i
                style={{
                  width: `${Math.max(0, (100 * g.count) / Math.max(...data.groups.map((x) => x.count), 1))}%`,
                }}
              />
            </div>
            <b>{number(g.count)}</b>
          </div>
        ))}
      </div>
      <p className="research-disclaimer">
        Frequência de palavras-chave configuradas em títulos ou descrições, não classificação
        confirmada de assuntos ou cargos. Um vídeo pode corresponder a várias listas.
      </p>
    </section>
  );
}
