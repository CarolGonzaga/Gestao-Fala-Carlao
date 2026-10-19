import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MantineProvider } from '@mantine/core';
import { applyFilters, escapeLike, filterSchema } from '../shared/filters';
import { csvCell, exportRow, exportVideos } from '../server/export';
import { toVideo } from '../server/youtube';
import { Description } from '../src/Description';
import ExcelJS from 'exceljs';
import { PassThrough } from 'node:stream';
const sample = toVideo({
  id: 'v1',
  snippet: {
    channelId: 'UC',
    title: '=SUM(1,1)',
    description: '',
    thumbnails: {},
    publishedAt: '2007-01-01T00:00:00Z',
  },
  statistics: { viewCount: '42' },
});
describe('global database filtering', () => {
  it('combines search, year, dates, availability and stable global sorting', () => {
    const q: any = {};
    for (const key of ['ilike', 'gte', 'lt', 'eq', 'or', 'order']) q[key] = vi.fn(() => q);
    applyFilters(
      q,
      filterSchema.parse({
        q: 'Carlão',
        year: 2007,
        from: '2007-01-01',
        to: '2007-12-31',
        availability: 'available',
        sort: 'views',
        direction: 'desc',
        page: 3,
        pageSize: 50,
      }),
    );
    expect(q.ilike).toHaveBeenCalledWith('title', '%Carlão%');
    expect(q.gte).toHaveBeenCalledWith('published_at', '2007-01-01T00:00:00Z');
    expect(q.lt).toHaveBeenCalledWith('published_at', '2008-01-01T00:00:00.000Z');
    expect(q.eq).toHaveBeenCalledWith('available', true);
    expect(q.order.mock.calls).toEqual([
      ['views', { ascending: false, nullsFirst: false }],
      ['youtube_video_id', { ascending: true }],
    ]);
  });
  it('validates page size and dates and escapes wildcard characters', () => {
    expect(filterSchema.safeParse({ pageSize: 999 }).success).toBe(false);
    expect(filterSchema.safeParse({ from: '2026-02-30' }).success).toBe(false);
    expect(filterSchema.safeParse({ from: '2026-10-01', to: '2007-01-01' }).success).toBe(false);
    expect(escapeLike('100%_')).toBe('100\\%\\_');
  });
});
describe('export and descriptions', () => {
  it('preserves null statistics and protects CSV formula injection', () => {
    expect(exportRow(sample)).toEqual([
      '=SUM(1,1)',
      sample.url,
      sample.published_at,
      42,
      null,
      null,
      'Sim',
    ]);
    expect(csvCell('=1+2')).toBe('"\'=1+2"');
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell(null)).toBe('""');
  });
  it('renders descriptions as escaped text and only links HTTP(S)', () => {
    const markup = renderToStaticMarkup(
      <MantineProvider>
        <Description
          text={'Primeira linha\n<script>alert(1)</script> https://example.com javascript:alert(1)'}
        />
      </MantineProvider>,
    );
    expect(markup).toContain('&lt;script&gt;');
    expect(markup).toContain('href="https://example.com/"');
    expect(markup).toContain('noopener noreferrer');
    expect(markup).not.toContain('href="javascript:');
    expect(markup).toContain('Primeira linha\n');
  });
  for (const format of ['csv', 'xlsx'] as const)
    it(`exports all filtered pages as ${format}`, async () => {
      const rows = Array.from({ length: 501 }, (_, i) => ({
        ...sample,
        youtube_video_id: `v${i}`,
        title: `Vídeo ${i}`,
      }));
      const ranges: number[][] = [];
      const query: any = {};
      for (const method of ['select', 'lte', 'order']) query[method] = () => query;
      query.range = async (from: number, to: number) => {
        ranges.push([from, to]);
        return { data: rows.slice(from, to + 1), error: null };
      };
      const db: any = { from: () => query };
      const output = new PassThrough();
      const chunks: Buffer[] = [];
      output.on('data', (c) => chunks.push(c));
      (output as any).setHeader = () => {};
      await exportVideos(db, filterSchema.parse({ page: 7 }), format, output as any);
      const content = Buffer.concat(chunks);
      expect(ranges).toEqual([
        [0, 499],
        [500, 999],
      ]);
      if (format === 'csv') {
        expect(content.toString()).toContain('Vídeo 500');
        expect(content.toString().split('\r\n')).toHaveLength(503);
      } else {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(content as any);
        expect(workbook.worksheets[0].rowCount).toBe(502);
        expect(workbook.worksheets[0].getRow(502).getCell(1).value).toBe('Vídeo 500');
      }
    });
});
