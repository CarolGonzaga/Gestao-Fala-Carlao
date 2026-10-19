import { Anchor } from '@mantine/core';
import { Fragment } from 'react';
export function Description({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>]+)/g);
  return (
    <div className="description-text">
      {parts.map((part, i) => {
        if (!/^https?:\/\//i.test(part)) return <Fragment key={i}>{part}</Fragment>;
        try {
          const url = new URL(part);
          if (!['http:', 'https:'].includes(url.protocol)) return part;
          return (
            <Anchor key={i} href={url.href} target="_blank" rel="noopener noreferrer">
              {part}
            </Anchor>
          );
        } catch {
          return part;
        }
      })}
    </div>
  );
}
