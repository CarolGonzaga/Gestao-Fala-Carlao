import { useState } from 'react';
import { Alert, Badge, Button, Drawer, Group, Skeleton } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { Copy, ExternalLink, Eye, Heart, MessageCircle } from 'lucide-react';
import { researchApi } from './api';
import type { SearchRow, Term } from '../../shared/research';
import { date, number } from '../lib';
import { Description } from '../Description';
import { Highlights } from './Highlights';
import { matchingTerms } from '../../shared/research-evidence';
export function VideoDrawer({
  id,
  onClose,
  terms = [],
}: {
  id: string | null;
  onClose: () => void;
  terms?: Term[];
}) {
  const [notice, setNotice] = useState('');
  const detail = useQuery({
    queryKey: ['research-video', id],
    enabled: !!id,
    queryFn: ({ signal }) =>
      researchApi<SearchRow>(`video/${encodeURIComponent(id!)}`, undefined, signal),
  });
  const v = detail.data,
    src = v?.thumbnails?.high?.url ?? v?.thumbnails?.medium?.url;
  const foundTerms = v
    ? [
        ...new Map(
          [...matchingTerms(v.title, terms), ...matchingTerms(v.description ?? '', terms)].map(
            (t) => [`${t.kind}:${t.text}`, t],
          ),
        ).values(),
      ]
    : [];
  async function copy(basic = false) {
    if (!v) return;
    try {
      await navigator.clipboard.writeText(
        basic
          ? `${v.title}\nPublicado em: ${date(v.published_at, true)}\n${v.url}\nVisualizações: ${number(v.views)} · Curtidas: ${number(v.likes)} · Comentários: ${number(v.comments)}`
          : v.url,
      );
      setNotice('Copiado.');
    } catch {
      setNotice('O navegador não permitiu copiar. Use o link do vídeo abaixo.');
    }
  }
  return (
    <Drawer
      opened={!!id}
      onClose={() => {
        setNotice('');
        onClose();
      }}
      position="right"
      size="lg"
      title="Evidências do acervo"
      closeButtonProps={{ 'aria-label': 'Fechar descrição' }}
    >
      {detail.isPending ? (
        <Skeleton height={280} />
      ) : detail.isError ? (
        <Alert color="red">{detail.error.message}</Alert>
      ) : (
        v && (
          <div className="video-detail research-detail">
            {src && <img className="video-thumb" src={src} alt="" loading="lazy" />}
            <h2>
              <Highlights text={v.title} terms={terms} />
            </h2>
            <p className="muted">
              {date(v.published_at, true)} · {v.youtube_video_id}
            </p>
            <div className="detail-stats">
              <span>
                <Eye size={17} />
                {number(v.views)}
              </span>
              <span>
                <Heart size={17} />
                {number(v.likes)}
              </span>
              <span>
                <MessageCircle size={17} />
                {number(v.comments)}
              </span>
            </div>
            <Group my="lg">
              <Button
                component="a"
                href={v.url}
                target="_blank"
                rel="noopener noreferrer"
                rightSection={<ExternalLink size={15} />}
              >
                Abrir no YouTube
              </Button>
              <Button
                variant="default"
                size="xs"
                leftSection={<Copy size={14} />}
                onClick={() => copy()}
              >
                Copiar link
              </Button>
              <Button variant="default" size="xs" onClick={() => copy(true)}>
                Copiar dados
              </Button>
            </Group>
            {notice && (
              <Alert color="yellow" mb="md">
                {notice}
              </Alert>
            )}
            <div className="found-terms">
              {foundTerms.map((t) => (
                <Badge key={`${t.kind}:${t.text}`} variant="light" color="yellow">
                  {t.text}
                </Badge>
              ))}
            </div>
            <p className="research-disclaimer">
              Destaques são correspondências textuais. Não confirmam tema, cargo ou identidade do
              entrevistado.
            </p>
            <div className="episode-note">
              Numeração:{' '}
              {v.episode_status === 'identified'
                ? `episódio ${v.episode_number}, identificado por marcador explícito no título`
                : v.episode_status === 'ambiguous'
                  ? 'título com números ambíguos; revisar manualmente'
                  : 'nenhum marcador explícito identificado'}
              .
              {v.episode_candidates?.length > 0 &&
                ` Candidatos: ${v.episode_candidates.join(', ')}.`}
            </div>
            <h3>Descrição integral</h3>
            {v.description ? (
              <Description text={v.description} terms={terms} />
            ) : (
              <p className="muted">Descrição não preenchida no registro.</p>
            )}
            <p className="small muted">
              Metadados atuais · Coletados em {date(v.updated_at, true)}. A consulta não altera o
              vídeo.
            </p>
          </div>
        )
      )}
    </Drawer>
  );
}
