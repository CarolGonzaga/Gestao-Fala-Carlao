import { describe, it, expect } from 'vitest';
import { compileResearch, researchSchema } from '../shared/research';
import { evidenceForRow, findSpans } from '../shared/research-evidence';
import { csvCell } from '../server/export';
import type { SearchRow } from '../shared/research';
describe('research parsing and original evidence', () => {
  it('parses words, quoted phrases and exclusions without interpreting SQL', () => {
    const c = compileResearch(
      researchSchema.parse({ q: 'presidente "John Deere" -evento -"feira anual"' }),
    );
    expect(c.all).toEqual([
      { text: 'presidente', kind: 'word' },
      { text: 'John Deere', kind: 'phrase' },
    ]);
    expect(c.none.map((t) => t.text)).toEqual(['evento', 'feira anual']);
  });
  it('rejects broad fragments, unclosed quotes and inverted filters', () => {
    expect(() => compileResearch(researchSchema.parse({ mode: 'fragment', q: 'ag' }))).toThrow(
      '3 caracteres',
    );
    expect(() => compileResearch(researchSchema.parse({ q: '"irrigação' }))).toThrow('aspas');
    expect(researchSchema.safeParse({ viewsMin: 10, viewsMax: 1 }).success).toBe(false);
    expect(researchSchema.safeParse({ from: '2020-02-30' }).success).toBe(false);
  });
  it('maps accents, combining marks and collapsed whitespace back to unchanged source', () => {
    const source = '🌾 A produção  sustentável de Carlão';
    const spans = findSpans(source, [
      { text: 'producao sustentavel', kind: 'phrase' },
      { text: 'Carlao', kind: 'word' },
    ]);
    expect(spans.map((s) => source.slice(s.start, s.end))).toEqual([
      'produção  sustentável',
      'Carlão',
    ]);
    expect(findSpans('agropecuária', [{ text: 'agro', kind: 'word' }])).toEqual([]);
  });
  it('finds an original excerpt at the end of a long description and restricts scope', () => {
    const description = 'Introdução. '.repeat(500) + 'Presidente da empresa fala de irrigação.';
    const row = { title: 'Carlão entrevista', description } as SearchRow;
    const c = compileResearch(
      researchSchema.parse({ q: '"presidente da empresa"', scope: 'description' }),
    );
    const evidence = evidenceForRow(row, c);
    expect(evidence.field).toBe('description');
    expect(description).toContain(evidence.snippet);
    expect(evidence.snippetSpans.map((s) => evidence.snippet.slice(s.start, s.end))).toEqual([
      'Presidente da empresa',
    ]);
    expect(
      evidenceForRow(
        row,
        compileResearch(researchSchema.parse({ q: 'presidente', scope: 'title' })),
      ).field,
    ).toBe('filters');
  });
  it('does not permit credentials in saved criteria or infer themes from stemming', () => {
    expect(researchSchema.safeParse({ service_role: 'secret' }).success).toBe(false);
    expect(compileResearch(researchSchema.parse({ q: 'irrigacao' })).all[0].kind).toBe('word');
    expect(csvCell('=HYPERLINK("x")')).toMatch(/^"'/);
  });
});
