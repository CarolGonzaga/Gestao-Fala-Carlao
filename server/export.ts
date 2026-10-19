import type { Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import { applyFilters, type Filters } from '../shared/filters';
import type { Video } from '../shared/types';
import { checked } from './db';
export const columns = [
  'Título',
  'URL',
  'Publicação',
  'Visualizações',
  'Curtidas',
  'Comentários',
  'Disponível',
];
export const exportRow = (v: Video) => [
  v.title,
  v.url,
  v.published_at,
  v.views,
  v.likes,
  v.comments,
  v.available ? 'Sim' : 'Não',
];
export const csvCell = (value: unknown) => {
  let s = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};
export async function exportVideos(
  db: SupabaseClient,
  filters: Filters,
  format: 'csv' | 'xlsx',
  res: Response,
) {
  res.setHeader(
    'Content-Type',
    format === 'csv'
      ? 'text/csv; charset=utf-8'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="fala-carlao-${new Date().toISOString().slice(0, 10)}.${format}"`,
  );
  const workbook =
    format === 'xlsx'
      ? new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true })
      : null;
  const sheet = workbook?.addWorksheet('Vídeos');
  if (sheet) {
    sheet.columns = columns.map((header, i) => ({
      header,
      key: String(i),
      width: i === 0 ? 65 : i === 1 ? 48 : 22,
    }));
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).commit();
  } else res.write('\uFEFF' + columns.map(csvCell).join(';') + '\r\n');
  // A single server export date bounds membership; edits during export can still affect order.
  const snapshot = new Date().toISOString();
  for (let offset = 0; !res.destroyed; offset += 500) {
    const rows = checked(
      await applyFilters(db.from('videos').select('*').lte('updated_at', snapshot), filters).range(
        offset,
        offset + 499,
      ),
    ) as Video[];
    for (const video of rows) {
      const row = exportRow(video);
      if (sheet) sheet.addRow(row).commit();
      else if (!res.write(row.map(csvCell).join(';') + '\r\n'))
        await new Promise<void>((resolve) => {
          res.once('drain', resolve);
          res.once('close', resolve);
        });
    }
    if (rows.length < 500) break;
  }
  if (workbook) {
    sheet?.commit();
    await workbook.commit();
  } else res.end();
}
