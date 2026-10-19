import type { SupabaseClient } from '@supabase/supabase-js';
import type { Response } from 'express';
import ExcelJS from 'exceljs';
import { csvCell } from './export.js';
import { checked } from './db.js';
import type { Criteria, SearchRow } from '../shared/research.js';

export function researchExportColumns(detail: boolean) {
  return [
    'ID',
    'Título',
    ...(detail ? ['Descrição'] : []),
    'Publicação',
    'URL',
    'Visualizações',
    'Curtidas',
    'Comentários',
    'Número de episódio',
    'Revisão da numeração',
  ];
}
export function researchExportRow(row: SearchRow, detail: boolean) {
  return [
    row.youtube_video_id,
    row.title,
    ...(detail ? [row.description ?? ''] : []),
    row.published_at,
    row.url,
    row.views,
    row.likes,
    row.comments,
    row.episode_number,
    row.episode_status,
  ];
}
export async function exportResearch(
  db: SupabaseClient,
  c: Criteria,
  format: 'csv' | 'xlsx',
  detail: boolean,
  res: Response,
) {
  res.setHeader(
    'Content-Type',
    format === 'csv'
      ? 'text/csv; charset=utf-8'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `attachment; filename="fala-carlao-pesquisa.${format}"`);
  const workbook =
    format === 'xlsx'
      ? new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true })
      : null;
  const sheet = workbook?.addWorksheet('Pesquisa');
  const columns = researchExportColumns(detail);
  if (sheet) {
    sheet.columns = columns.map((header, i) => ({
      header,
      key: String(i),
      width: i === 1 || i === 2 ? 60 : 25,
    }));
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).commit();
  } else res.write('\uFEFF' + columns.map(csvCell).join(';') + '\r\n');
  for (let offset = 0; !res.destroyed; offset += 500) {
    const result = checked(
      await db.rpc('search_research', { p_criteria: c, p_limit: 500, p_offset: offset }),
    ) as { rows: SearchRow[]; total: number };
    for (const row of result.rows) {
      const values = researchExportRow(row, detail);
      // Excel limits cell strings to 32,767 chars. YouTube descriptions are limited to 5,000.
      if (sheet) sheet.addRow(values).commit();
      else if (!res.write(values.map(csvCell).join(';') + '\r\n'))
        await new Promise<void>((resolve) => {
          res.once('drain', resolve);
          res.once('close', resolve);
        });
    }
    if (result.rows.length < 500) break;
  }
  if (workbook) {
    sheet?.commit();
    await workbook.commit();
  } else res.end();
}
