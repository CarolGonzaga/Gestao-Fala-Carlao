import { Fragment } from 'react';
import type { Span, Term } from '../../shared/research';
import { findSpans } from '../../shared/research-evidence';
export function Highlights({
  text,
  spans,
  terms = [],
}: {
  text: string;
  spans?: Span[];
  terms?: Term[];
}) {
  const found = spans ?? findSpans(text, terms);
  let cursor = 0;
  const parts: React.ReactNode[] = [];
  for (const span of found) {
    parts.push(<Fragment key={`t${cursor}`}>{text.slice(cursor, span.start)}</Fragment>);
    parts.push(<mark key={`m${span.start}`}>{text.slice(span.start, span.end)}</mark>);
    cursor = span.end;
  }
  parts.push(<Fragment key={`t${cursor}`}>{text.slice(cursor)}</Fragment>);
  return <>{parts}</>;
}
