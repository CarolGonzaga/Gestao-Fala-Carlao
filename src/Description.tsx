import { Anchor } from '@mantine/core';
import { Fragment } from 'react';
import type { Term } from '../shared/research';
import { Highlights } from './research/Highlights';
export function Description({ text, terms = [] }: { text: string; terms?: Term[] }) {
  const parts = text.split(/(https?:\/\/[^\s<>]+)/g);
  return (
    <div className="description-text">
      {parts.map((part, i) => {
        if (!/^https?:\/\//i.test(part))
          return (
            <Fragment key={i}>
              <Highlights text={part} terms={terms} />
            </Fragment>
          );
        try {
          const url = new URL(part);
          if (!['http:', 'https:'].includes(url.protocol)) return part;
          return (
            <Anchor key={i} href={url.href} target="_blank" rel="noopener noreferrer">
              <Highlights text={part} terms={terms} />
            </Anchor>
          );
        } catch {
          return part;
        }
      })}
    </div>
  );
}
