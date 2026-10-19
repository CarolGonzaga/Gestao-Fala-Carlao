import { it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import ExcelJS from 'exceljs';
import { exportResearch } from '../server/research-export';
import { compileResearch, researchSchema } from '../shared/research';

it('exports all 501 matches as XLSX with literal external text and original descriptions', async () => {
  const rows = Array.from({ length: 501 }, (_, i) => ({
    youtube_video_id: `v${i}`,
    title: '=1+1',
    description: `Descrição completa ${i}`,
    episode_number: 7,
    episode_status: 'identified',
  }));
  const offsets: number[] = [];
  const db: any = {
    rpc: async (_name: string, args: any) => {
      offsets.push(args.p_offset);
      return {
        data: { rows: rows.slice(args.p_offset, args.p_offset + args.p_limit), total: 501 },
        error: null,
      };
    },
  };
  const output = new PassThrough(),
    chunks: Buffer[] = [];
  output.on('data', (c) => chunks.push(c));
  (output as any).setHeader = () => {};
  await exportResearch(
    db,
    compileResearch(researchSchema.parse({ q: 'CEO', page: 3 })),
    'xlsx',
    true,
    output as any,
  );
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.concat(chunks) as any);
  const sheet = workbook.worksheets[0];
  expect(offsets).toEqual([0, 500]);
  expect(sheet.rowCount).toBe(502);
  expect(sheet.getRow(2).getCell(2).value).toBe('=1+1');
  expect(sheet.getRow(502).getCell(3).value).toBe('Descrição completa 500');
});
