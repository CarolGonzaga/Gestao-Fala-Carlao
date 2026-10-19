import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Alert, Button, Loader } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { api, supabase } from './lib';
import { readApiJson } from '../shared/http';
import type { Channel } from '../shared/types';
import { AdminLayout, Brand, type Page } from './AdminLayout';
import { Login } from './Login';
import { useJobs } from './useJobs';
import { SettingsPage, SetupGuide } from './SettingsPage';
const Dashboard = lazy(() => import('./pages').then((m) => ({ default: m.Dashboard })));
const SyncPage = lazy(() => import('./pages').then((m) => ({ default: m.SyncPage })));
const VideoPage = lazy(() => import('./pages').then((m) => ({ default: m.VideoPage })));
const ResearchPage = lazy(() => import('./research/ResearchPage'));
const TimelinePage = lazy(() => import('./research/TimelinePage'));
const ResearchOverview = lazy(() =>
  import('./research/Overview').then((m) => ({ default: m.ResearchOverview })),
);
export default function App() {
  const [session, setSession] = useState<Session | null>(null),
    [loading, setLoading] = useState(true),
    [page, setPage] = useState<Page>('dashboard'),
    [notice, setNotice] = useState(''),
    [syncing, setSyncing] = useState(false);
  // Subscribe to the jobs already loaded by Dashboard/SyncPage, without extra requests.
  const jobs = useJobs(false);
  const syncLock = useRef(false);
  const client = useQueryClient();
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      client.clear();
    });
    return () => data.subscription.unsubscribe();
  }, [client]);
  const admin = useQuery({
    queryKey: ['admin', session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const result = await supabase!.rpc('is_admin');
      if (result.error) throw new Error('Migração pendente ou conexão indisponível.');
      return !!result.data;
    },
  });
  const channel = useQuery({
    queryKey: ['channel'],
    refetchInterval: 60000,
    enabled: !!admin.data,
    queryFn: async () => {
      const r = await supabase!
        .from('channels')
        .select('*')
        .eq('handle', '@falacarlao')
        .maybeSingle();
      if (r.error) throw r.error;
      return r.data as Channel | null;
    },
  });
  const config = useQuery({
    queryKey: ['config'],
    enabled: !!admin.data,
    queryFn: async () =>
      readApiJson<{
        youtube: boolean;
        worker: boolean;
        dispatch: boolean;
        schedule: string;
      }>(await api('config')),
  });
  async function requestSync(mode: 'full' | 'incremental' | 'retry') {
    if (syncLock.current) return;
    syncLock.current = true;
    setSyncing(true);
    setNotice('');
    try {
      const r = await readApiJson<{ message: string }>(
        await api('sync', { method: 'POST', body: JSON.stringify({ mode }) }),
      );
      setNotice(r.message);
      await client.invalidateQueries({ queryKey: ['jobs'] });
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Falha na solicitação.');
    } finally {
      syncLock.current = false;
      setSyncing(false);
    }
  }
  if (loading || (session && admin.isPending))
    return (
      <div className="center-screen" role="status">
        <Loader color="yellow" />
        <span>Carregando painel…</span>
      </div>
    );
  if (!session) return <Login />;
  if (!admin.data)
    return (
      <div className="access-screen">
        <Brand />
        <h1>Acesso aguardando autorização</h1>
        <p>
          {admin.error?.message ?? 'Este usuário ainda não foi autorizado para acessar o painel.'}
        </p>
        <p>
          Seu ID de usuário: <code>{session.user.id}</code>
        </p>
        <SetupGuide />
        <Button variant="light" onClick={() => supabase!.auth.signOut()}>
          Sair e usar outra conta
        </Button>
        <Button variant="subtle" onClick={() => admin.refetch()}>
          Verificar novamente
        </Button>
      </div>
    );
  const ready = config.data?.youtube && config.data?.worker;
  return (
    <AdminLayout
      page={page}
      onNavigate={setPage}
      email={session.user.email}
      onSignOut={() => {
        void supabase!.auth.signOut();
      }}
      onSync={() => {
        void requestSync('incremental');
      }}
      busy={syncing}
      syncDisabled={jobs.data?.some((j) => j.status === 'running' || j.status === 'queued')}
    >
      {notice && (
        <Alert
          role="status"
          color="yellow"
          withCloseButton
          closeButtonLabel="Fechar mensagem"
          onClose={() => setNotice('')}
          mb="md"
        >
          {notice}
        </Alert>
      )}
      {config.isError && (
        <Alert color="red" title="Não foi possível verificar a integração" mb="md">
          {config.error.message}
          <Button variant="subtle" size="xs" onClick={() => config.refetch()}>
            Tentar novamente
          </Button>
        </Alert>
      )}
      {channel.isError && (
        <Alert color="red" title="Não foi possível carregar o canal" mb="md">
          {channel.error.message}
          <Button variant="subtle" size="xs" onClick={() => channel.refetch()}>
            Tentar novamente
          </Button>
        </Alert>
      )}
      <Suspense
        fallback={
          <div className="center-screen page-loading" role="status">
            <Loader color="yellow" />
            <span>Carregando página…</span>
          </div>
        }
      >
        {page === 'dashboard' && (
          <Dashboard
            channel={channel.data ?? null}
            ready={!!ready}
            onNavigate={setPage}
            onImport={() => requestSync('full')}
            busy={syncing}
          />
        )}
        {page === 'dashboard' && <ResearchOverview onResearch={() => setPage('research')} />}
        {page === 'videos' && <VideoPage />}
        {page === 'research' && <ResearchPage />}
        {page === 'timeline' && <TimelinePage />}
        {page === 'sync' && (
          <SyncPage
            channel={channel.data ?? null}
            config={config.data}
            requestSync={requestSync}
            busy={syncing}
          />
        )}
        {page === 'settings' && <SettingsPage config={config.data} />}
      </Suspense>
    </AdminLayout>
  );
}
