import { createTheme } from '@mantine/core';
export const theme = createTheme({
  primaryColor: 'yellow',
  autoContrast: true,
  fontSizes: { xs: '0.75rem', sm: '0.8125rem', md: '0.875rem' },
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
