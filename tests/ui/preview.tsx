// This entry and its fixture transport are excluded from the production build.
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@mantine/core/styles.layer.css';
import 'mantine-datatable/styles.layer.css';
import '../../src/styles.css';
import App from '../../src/App';
import { theme } from '../../src/theme';
const root = createRoot(document.getElementById('root')!);
root.render(
  <MantineProvider theme={theme}>
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <div
        style={{
          position: 'relative',
          zIndex: 30,
          padding: '5px 14px',
          background: '#fff3ca',
          color: '#624900',
          fontSize: 11,
          textAlign: 'center',
        }}
      >
        QA LOCAL · DADOS ISOLADOS DE TESTE · NÃO É O ACERVO DE PRODUÇÃO ·{' '}
        <a href="?login=1">Ver login</a>
      </div>
      <App />
    </QueryClientProvider>
  </MantineProvider>,
);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
