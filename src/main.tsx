import React from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider, createTheme } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@mantine/core/styles.layer.css';
import 'mantine-datatable/styles.layer.css';
import './styles.css';
import App from './App';
const theme = createTheme({
  primaryColor: 'yellow',
  defaultRadius: 'md',
  fontFamily: 'Inter, "Segoe UI", sans-serif',
  headings: { fontFamily: 'Inter, "Segoe UI", sans-serif' },
  colors: {
    yellow: [
      '#fffae6',
      '#fff1bb',
      '#ffe789',
      '#ffdb55',
      '#ffd12b',
      '#f9c30b',
      '#dda900',
      '#b58a00',
      '#916e00',
      '#745700',
    ],
  },
});
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
