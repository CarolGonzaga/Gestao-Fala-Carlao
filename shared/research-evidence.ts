import type { Criteria, SearchRow, Span, Term } from './research.js';
// Map normalized characters back to the original grapheme boundaries. Never rewrite source text.
function mappedText(text: string) {
  let normalized = '';
  const starts: number[] = [],
    ends: number[] = [];
  const replacements: Record<string, string> = {
    æ: 'ae',
    Æ: 'AE',
    œ: 'oe',
    Œ: 'OE',
    ß: 'ss',
    ø: 'o',
    Ø: 'O',
    ł: 'l',
    Ł: 'L',
    ð: 'd',
    Ð: 'D',
    þ: 'th',
    Þ: 'TH',
  };
  for (const { segment, index } of new Intl.Segmenter('pt-BR', { granularity: 'grapheme' }).segment(
    text,
  )) {
    const value = [...segment]
      .map((c) => replacements[c] ?? c)
      .join('')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase();
    for (const c of value) {
      if (/\s/u.test(c)) {
        if (normalized.endsWith(' ')) {
          ends[ends.length - 1] = index + segment.length;
          continue;
        }
        normalized += ' ';
      } else normalized += c;
      starts.push(index);
      ends.push(index + segment.length);
      // Index offsets are UTF-16, as required by String.slice and PostgreSQL-returned source strings.
      if (c.length === 2) {
        starts.push(index);
        ends.push(index + segment.length);
      }
    }
  }
  return { normalized, starts, ends };
}
function spansInMap(m: ReturnType<typeof mappedText>, terms: Term[]): Span[] {
  const spans: Span[] = [];
  for (const term of terms) {
    const needle = mappedText(term.text).normalized;
    if (!needle) continue;
    let cursor = 0;
    while (cursor < m.normalized.length) {
      const index = m.normalized.indexOf(needle, cursor);
      if (index < 0) break;
      const end = index + needle.length;
      cursor = end;
      if (
        term.kind === 'word' &&
        (/[\p{L}\p{N}]/u.test(m.normalized.slice(Math.max(0, index - 1), index)) ||
          /[\p{L}\p{N}]/u.test(m.normalized.slice(end, end + 1)))
      )
        continue;
      spans.push({ start: m.starts[index], end: m.ends[end - 1] });
    }
  }
  const merged: Span[] = [];
  for (const span of spans.sort((a, b) => a.start - b.start || b.end - a.end)) {
    const previous = merged.at(-1);
    if (previous && span.start <= previous.end) previous.end = Math.max(previous.end, span.end);
    else merged.push({ ...span });
  }
  return merged;
}
export function findSpans(text: string, terms: Term[]): Span[] {
  return terms.length ? spansInMap(mappedText(text), terms) : [];
}
export function matchingTerms(text: string, terms: Term[]): Term[] {
  if (!terms.length) return [];
  const mapped = mappedText(text);
  return terms.filter((t) => spansInMap(mapped, [t]).length > 0);
}
export function evidenceForRow(row: SearchRow, c: Criteria): NonNullable<SearchRow['evidence']> {
  const positive = [...c.all, ...c.any, ...c.groups.flat()];
  const titleTerms = [...c.title, ...(c.filters.scope !== 'description' ? positive : [])];
  const descriptionTerms = [...c.description, ...(c.filters.scope !== 'title' ? positive : [])];
  if (c.filters.prefix) titleTerms.push({ text: c.filters.prefix, kind: 'fragment' });
  if (c.filters.series) titleTerms.push({ text: c.filters.series, kind: 'fragment' });
  const description = row.description ?? '',
    titleMap = mappedText(row.title),
    descriptionMap = mappedText(description);
  const titleSpans = spansInMap(titleMap, titleTerms),
    descriptionSpans = spansInMap(descriptionMap, descriptionTerms);
  const start = Math.max(0, (descriptionSpans[0]?.start ?? 0) - 90),
    end = Math.min(description.length, Math.max(start + 320, descriptionSpans[0]?.end ?? 0));
  const snippet = descriptionSpans.length ? description.slice(start, end) : '';
  const snippetSpans = descriptionSpans
    .filter((s) => s.start >= start && s.end <= end)
    .map((s) => ({ start: s.start - start, end: s.end - start }));
  const found = [
    ...titleTerms.filter((t) => spansInMap(titleMap, [t]).length),
    ...descriptionTerms.filter((t) => spansInMap(descriptionMap, [t]).length),
  ].map((t) => t.text);
  return {
    field: titleSpans.length
      ? descriptionSpans.length
        ? 'both'
        : 'title'
      : descriptionSpans.length
        ? 'description'
        : 'filters',
    titleSpans,
    snippet,
    snippetSpans,
    terms: [...new Set(found)],
  };
}
