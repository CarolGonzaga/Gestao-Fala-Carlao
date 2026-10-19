import React from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@mantine/core/styles.layer.css';
import 'mantine-datatable/styles.layer.css';
import './styles.css';
import App from './App';
import { theme } from './theme';
const client = new QueryClient({
  defaultOptions: { queries: { staleTime: 30000, retry: 1, refetchOnWindowFocus: false } },
});
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light">
      <QueryClientProvider client={client}>
        <App />
      </QueryClientProvider>
    </MantineProvider>
  </React.StrictMode>,
);
