import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Select,
  Switch,
  TagsInput,
  TextInput,
} from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark, FolderPlus, Pencil, Plus, Trash2 } from 'lucide-react';
import type { ResearchQuery, SavedResearch, TermGroup } from '../../shared/research';
import { researchApi } from './api';
import { date } from '../lib';
export function useGroups() {
  return useQuery({
    queryKey: ['research-groups'],
    queryFn: ({ signal }) => researchApi<TermGroup[]>('groups', undefined, signal),
  });
}
export function GroupManager() {
  const groups = useGroups(),
    client = useQueryClient();
  const [editing, setEditing] = useState<TermGroup | null>(null),
    [opened, setOpened] = useState(false),
    [name, setName] = useState(''),
    [kind, setKind] = useState<TermGroup['kind']>('theme'),
    [terms, setTerms] = useState<string[]>([]),
    [enabled, setEnabled] = useState(true),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  function edit(g?: TermGroup) {
    setEditing(g ?? null);
    setName(g?.name ?? '');
    setKind(g?.kind ?? 'theme');
    setTerms(g?.terms ?? []);
    setEnabled(g?.enabled ?? true);
    setError('');
    setOpened(true);
  }
  async function remove(g: TermGroup) {
    setBusy(true);
    try {
      await researchApi(`groups/${g.id}`, undefined, undefined, 'DELETE');
      await client.invalidateQueries({ queryKey: ['research-groups'] });
      await client.invalidateQueries({ queryKey: ['research-overview'] });
      await client.invalidateQueries({ queryKey: ['research-results'] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel research-management">
      <div className="panel-heading">
        <div>
          <h2>Vocabulários de pesquisa</h2>
          <p>Listas compartilhadas entre administradores. Cada lista combina seus termos com OU.</p>
        </div>
        <Button leftSection={<Plus size={15} />} onClick={() => edit()}>
          Novo agrupamento
        </Button>
      </div>
      {(error || groups.isError) && !opened && (
        <Alert color="red" m="md">
          {error || groups.error?.message}
        </Alert>
      )}
      <div className="group-grid">
        {groups.data?.map((g) => (
          <article className="vocabulary-card" key={g.id}>
            <div>
              <Badge color={g.enabled ? 'yellow' : 'gray'} variant="light">
                {g.kind === 'theme' ? 'Tema' : g.kind === 'role' ? 'Cargo' : 'Organização'} ·{' '}
                {g.enabled ? 'Ativo' : 'Inativo'}
              </Badge>
              <h3>{g.name}</h3>
            </div>
            <div className="term-cloud">
              {g.terms.map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
            <Group mt="md">
              <Button
                size="xs"
                variant="default"
                leftSection={<Pencil size={13} />}
                onClick={() => edit(g)}
              >
                Editar
              </Button>
              <Button
                size="xs"
                color="red"
                variant="subtle"
                loading={busy}
                leftSection={<Trash2 size={13} />}
                onClick={() => remove(g)}
              >
                Excluir agrupamento
              </Button>
            </Group>
          </article>
        ))}
      </div>
      <p className="research-disclaimer">
        São sugestões de palavras-chave, não uma taxonomia definitiva. “Presidente” no texto não
        comprova o cargo do entrevistado. Desative uma lista para retirá-la de novas seleções.
      </p>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title={editing ? 'Editar agrupamento' : 'Novo agrupamento'}
        closeButtonProps={{ 'aria-label': 'Fechar agrupamento' }}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              await researchApi(
                editing ? `groups/${editing.id}` : 'groups',
                { name, kind, terms, enabled },
                undefined,
                editing ? 'PATCH' : 'POST',
              );
              await client.invalidateQueries({ queryKey: ['research-groups'] });
              await client.invalidateQueries({ queryKey: ['research-overview'] });
              await client.invalidateQueries({ queryKey: ['research-results'] });
              setOpened(false);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <TextInput
            label="Nome"
            required
            minLength={2}
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Select
            label="Tipo"
            mt="md"
            value={kind}
            data={[
              { value: 'theme', label: 'Tema' },
              { value: 'role', label: 'Cargo' },
              { value: 'organization', label: 'Empresa / organização' },
            ]}
            onChange={(v) => setKind(v as TermGroup['kind'])}
          />
          <TagsInput
            label="Palavras e expressões"
            description="Digite cada termo e pressione Enter. Expressões com espaços são literais."
            mt="md"
            value={terms}
            onChange={setTerms}
            maxTags={30}
            splitChars={[',', ';']}
          />
          <Switch
            label="Agrupamento ativo"
            mt="lg"
            checked={enabled}
            onChange={(e) => setEnabled(e.currentTarget.checked)}
          />
          {error && (
            <Alert color="red" mt="md">
              {error}
            </Alert>
          )}
          <Button type="submit" mt="lg" loading={busy} disabled={!terms.length}>
            Salvar agrupamento
          </Button>
        </form>
      </Modal>
    </section>
  );
}
export function SavedManager({
  query,
  onOpen,
}: {
  query: ResearchQuery;
  onOpen: (q: ResearchQuery) => void;
}) {
  const client = useQueryClient();
  const saved = useQuery({
    queryKey: ['research-saved'],
    queryFn: ({ signal }) => researchApi<SavedResearch[]>('saved', undefined, signal),
  });
  const [name, setName] = useState(''),
    [editing, setEditing] = useState<SavedResearch | null>(null),
    [opened, setOpened] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function mutate(path: string, body: unknown, method: string) {
    setBusy(true);
    setError('');
    try {
      await researchApi(path, body, undefined, method);
      await client.invalidateQueries({ queryKey: ['research-saved'] });
      setOpened(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel research-management">
      <div className="panel-heading">
        <div>
          <h2>Minhas pesquisas salvas</h2>
          <p>
            Privadas para o seu usuário. Guardam critérios e ordenação; não congelam os resultados.
          </p>
        </div>
        <Button
          leftSection={<Bookmark size={15} />}
          onClick={() => {
            setEditing(null);
            setName('');
            setOpened(true);
          }}
        >
          Salvar pesquisa atual
        </Button>
      </div>
      {(error || saved.isError) && (
        <Alert color="red" m="md">
          {error || saved.error?.message}
        </Alert>
      )}
      <div className="saved-list">
        {saved.data?.length === 0 && (
          <p className="muted">
            Salve uma pesquisa para reencontrar seus critérios em outras sessões.
          </p>
        )}
        {saved.data?.map((s) => (
          <article key={s.id}>
            <div>
              <h3>{s.name}</h3>
              <p>
                {s.query.q || 'Filtros combinados'} · {date(s.created_at, true)}
              </p>
              <small>
                {
                  {
                    all: 'Todas as palavras',
                    any: 'Qualquer palavra',
                    exact: 'Expressão exata',
                    fragment: 'Fragmento',
                    combined: 'Combinada',
                  }[s.query.mode]
                }{' '}
                ·{' '}
                {
                  { title: 'Títulos', description: 'Descrições', both: 'Títulos e descrições' }[
                    s.query.scope
                  ]
                }{' '}
                ·{' '}
                {
                  {
                    relevance: 'Relevância',
                    newest: 'Mais recentes',
                    oldest: 'Mais antigos',
                    title_asc: 'Título A–Z',
                    title_desc: 'Título Z–A',
                    views_desc: 'Mais visualizados',
                    views_asc: 'Menos visualizados',
                    likes_desc: 'Mais curtidos',
                    comments_desc: 'Mais comentados',
                  }[s.query.order]
                }
              </small>
            </div>
            <Group gap="xs">
              <Button size="xs" variant="light" onClick={() => onOpen(s.query)}>
                Abrir
              </Button>
              <Button
                size="xs"
                variant="default"
                onClick={() => {
                  setEditing(s);
                  setName(s.name);
                  setOpened(true);
                }}
              >
                Renomear
              </Button>
              <Button
                size="xs"
                variant="default"
                loading={busy}
                onClick={() => mutate(`saved/${s.id}`, { query: { ...query, page: 1 } }, 'PATCH')}
              >
                Atualizar com critérios atuais
              </Button>
              <Button
                size="xs"
                color="red"
                variant="subtle"
                loading={busy}
                onClick={() => mutate(`saved/${s.id}`, undefined, 'DELETE')}
              >
                Excluir
              </Button>
            </Group>
          </article>
        ))}
      </div>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title={editing ? 'Renomear pesquisa' : 'Salvar critérios atuais'}
        closeButtonProps={{ 'aria-label': 'Fechar pesquisa salva' }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutate(
              editing ? `saved/${editing.id}` : 'saved',
              editing ? { name } : { name, query: { ...query, page: 1 } },
              editing ? 'PATCH' : 'POST',
            );
          }}
        >
          <TextInput
            label="Nome da pesquisa"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            maxLength={100}
          />
          {error && (
            <Alert color="red" mt="md">
              {error}
            </Alert>
          )}
          <Button type="submit" mt="lg" loading={busy}>
            Salvar
          </Button>
        </form>
      </Modal>
    </section>
  );
}
