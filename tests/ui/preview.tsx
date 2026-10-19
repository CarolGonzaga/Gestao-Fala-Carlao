// Local visual QA only. This entry is not part of the production Vite build.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider, Button, Group, createTheme } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@mantine/core/styles.layer.css';
import 'mantine-datatable/styles.layer.css';
import '../../src/styles.css';
import ResearchPage from '../../src/research/ResearchPage';
import TimelinePage from '../../src/research/TimelinePage';
import { ResearchOverview } from '../../src/research/Overview';
function Preview() {
  const [page, setPage] = useState('research');
  return (
    <div style={{ maxWidth: 1400, margin: 'auto', padding: '20px' }}>
      <p style={{ fontSize: 11, color: '#9b7c24' }}>
        QA LOCAL · DADOS ISOLADOS DE TESTE · NÃO É O ACERVO DE PRODUÇÃO
      </p>
      <Group mb="lg">
        <Button variant="default" onClick={() => setPage('research')}>
          Pesquisa
        </Button>
        <Button variant="default" onClick={() => setPage('timeline')}>
          Linha do Tempo
        </Button>
        <Button variant="default" onClick={() => setPage('overview')}>
          Indicadores
        </Button>
      </Group>
      {page === 'research' ? (
        <ResearchPage />
      ) : page === 'timeline' ? (
        <TimelinePage />
      ) : (
        <ResearchOverview onResearch={() => setPage('research')} />
      )}
    </div>
  );
}
const root = createRoot(document.getElementById('root')!);
root.render(
  <MantineProvider
    theme={createTheme({
      primaryColor: 'yellow',
      fontFamily: 'Inter,"Segoe UI",sans-serif',
      defaultRadius: 'md',
    })}
  >
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Preview />
    </QueryClientProvider>
  </MantineProvider>,
);

if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
