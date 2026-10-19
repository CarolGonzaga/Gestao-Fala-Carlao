import { lazy, Suspense, useEffect, useState } from 'react';
import {
  Alert,
  Anchor,
  Avatar,
  Badge,
  Button,
  Loader,
  PasswordInput,
  TextInput,
  useMantineColorScheme,
} from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import {
  ArrowDownToLine,
  ArrowRight,
  CircleHelp,
  Film,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Play,
  Radio,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sun,
  X,
  Youtube,
} from 'lucide-react';
import { api, supabase } from './lib';
const Dashboard = lazy(() => import('./pages').then((m) => ({ default: m.Dashboard })));
const SyncPage = lazy(() => import('./pages').then((m) => ({ default: m.SyncPage })));
const VideoPage = lazy(() => import('./pages').then((m) => ({ default: m.VideoPage })));
import type { Channel } from '../shared/types';
type Page = 'dashboard' | 'videos' | 'sync' | 'settings';
const nav = [
  { id: 'dashboard', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'videos', label: 'Acervo de vídeos', icon: Film },
  { id: 'sync', label: 'Sincronizações', icon: RefreshCw },
] as const;
export function SetupGuide() {
  return (
    <div className="setup-guide">
      <strong>Conecte as peças do seu acervo</strong>
      <ol>
        <li>Execute a migração SQL no Supabase.</li>
        <li>
          Crie um usuário no Supabase Auth e autorize seu ID em <code>admin_users</code>.
        </li>
        <li>
          Configure <code>YOUTUBE_API_KEY</code> e <code>SUPABASE_SERVICE_ROLE_KEY</code> no backend
          e no GitHub Actions.
        </li>
        <li>Publique o workflow e importe o histórico completo.</li>
      </ol>
      <p>Consulte o README do projeto para os comandos e a configuração da Vercel.</p>
    </div>
  );
}
function Login({ error: accessError }: { error?: string }) {
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <div className="login">
      <aside className="login-brand">
        <Brand />
        <div className="login-message">
          <span className="eyebrow">CADA CONVERSA, UMA HISTÓRIA.</span>
          <h1>
            Um canal inteiro.
            <br />
            Um acervo
            <br />
            <em>sem limites.</em>
          </h1>
          <p>Todas as histórias do Fala Carlão, organizadas em um só lugar.</p>
          <div className="login-art">
            <div className="art-play">
              <Play size={44} fill="currentColor" />
            </div>
            <span>
              FALA
              <br />
              <b>CARLÃO</b>
            </span>
            <div className="art-orbit" />
          </div>
        </div>
        <div className="login-foot">
          <Youtube size={19} /> Feito para quem vive o Fala Carlão.
        </div>
      </aside>
      <main className="login-main">
        <Badge variant="light" color="gray" leftSection={<ShieldCheck size={13} />}>
          ÁREA ADMINISTRATIVA
        </Badge>
        <div className="login-form">
          <span className="eyebrow">BEM-VINDO AO SEU ACERVO</span>
          <h2>
            Histórias que merecem
            <br />
            ser encontradas.
          </h2>
          <p className="muted">Entre para acompanhar, explorar e organizar os vídeos do canal.</p>
          {!supabase ? (
            <Alert color="yellow" title="Configuração pendente">
              Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env.
              <SetupGuide />
            </Alert>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError('');
                const result = await supabase!.auth.signInWithPassword({ email, password });
                setBusy(false);
                if (result.error) setError('Não foi possível entrar. Confira o e-mail e a senha.');
              }}
            >
              <TextInput
                label="E-mail"
                placeholder="seu@email.com"
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                size="md"
              />
              <PasswordInput
                label="Senha"
                placeholder="Sua senha de acesso"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                size="md"
                mt="lg"
              />
              {(error || accessError) && (
                <Alert color="red" mt="md">
                  {error || accessError}
                </Alert>
              )}
              <Button
                fullWidth
                mt="xl"
                size="md"
                type="submit"
                loading={busy}
                rightSection={<ArrowRight size={18} />}
              >
                Entrar no painel
              </Button>
            </form>
          )}
          <div className="access-note">
            <ShieldCheck size={18} />
            <span>
              Acesso exclusivo para administradores autorizados.
              <br />
              Use o usuário criado no Supabase Auth.
            </span>
          </div>
          <details className="first-access">
            <summary>Primeiro acesso? Veja como configurar</summary>
            <SetupGuide />
          </details>
        </div>
        <footer>
          Fala Carlão <span>Gerenciador de vídeos · YouTube</span>
        </footer>
      </main>
    </div>
  );
}
function Brand() {
  return (
    <div className="brand">
      <span className="brand-icon">
        <Play size={19} fill="currentColor" />
      </span>
      <span>
        fala <b>carlão</b>
        <small>GERENCIADOR DE VÍDEOS</small>
      </span>
    </div>
  );
}
export default function App() {
  const [session, setSession] = useState<Session | null>(null),
    [loading, setLoading] = useState(true),
    [page, setPage] = useState<Page>('dashboard'),
    [mobile, setMobile] = useState(false),
    [notice, setNotice] = useState(''),
    [syncing, setSyncing] = useState(false);
  const client = useQueryClient();
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
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
      (await (await api('config')).json()) as {
        youtube: boolean;
        worker: boolean;
        dispatch: boolean;
        schedule: string;
      },
  });
  async function requestSync(mode: 'full' | 'incremental' | 'retry') {
    setSyncing(true);
    setNotice('');
    try {
      const r = await (
        await api('sync', { method: 'POST', body: JSON.stringify({ mode }) })
      ).json();
      setNotice(r.message);
      await client.invalidateQueries({ queryKey: ['jobs'] });
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Falha na solicitação.');
    } finally {
      setSyncing(false);
    }
  }
  if (loading || (session && admin.isPending))
    return (
      <div className="center-screen">
        <Loader color="yellow" />
        <span>Preparando seu acervo…</span>
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
    <div className="app">
      <aside className={`sidebar ${mobile ? 'is-open' : ''}`}>
        <Brand />
        <div className="workspace-label">ESPAÇO DE TRABALHO</div>
        <nav>
          {nav.map((item) => (
            <button
              key={item.id}
              className={page === item.id ? 'active' : ''}
              onClick={() => {
                setPage(item.id);
                setMobile(false);
              }}
            >
              <item.icon size={19} />
              {item.label}
              {page === item.id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="channel-card">
            <span className="channel-card-icon">
              <Youtube size={21} />
            </span>
            <b>
              Fala Carlão<small>@falacarlao</small>
            </b>
            <Anchor
              href="https://www.youtube.com/@falacarlao"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Abrir canal"
            >
              <ArrowRight size={16} />
            </Anchor>
          </div>
          <button
            className={page === 'settings' ? 'active' : ''}
            onClick={() => setPage('settings')}
          >
            <Settings2 size={18} />
            Configurações
          </button>
          <button onClick={() => setPage('settings')}>
            <CircleHelp size={18} />
            Ajuda e configuração
          </button>
          <div className="profile">
            <Avatar color="yellow" radius="xl" size={35}>
              {session.user.email?.[0]?.toUpperCase()}
            </Avatar>
            <span>
              Administrador<small title={session.user.email}>{session.user.email}</small>
            </span>
            <button onClick={() => supabase!.auth.signOut()} aria-label="Sair">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      {mobile && <div className="mobile-shade" onClick={() => setMobile(false)} />}
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-title">
            <button
              className="mobile-toggle icon-button"
              aria-label="Abrir menu"
              onClick={() => setMobile(!mobile)}
            >
              {mobile ? <X size={20} /> : <Menu size={20} />}
            </button>
            <span>Seu canal, em perspectiva.</span>
          </div>
          <div className="topbar-actions">
            <span className="private-label">
              <ShieldCheck size={14} /> Ambiente privado
            </span>
            <button className="icon-button" onClick={toggleColorScheme} aria-label="Alternar tema">
              {colorScheme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <span className="header-divider" />
            <span className="header-channel-name">{channel.data?.title ?? 'Fala Carlão'}</span>
            <Avatar src={channel.data?.thumbnail_url} color="yellow" radius="xl" size={33}>
              FC
            </Avatar>
          </div>
        </header>
        <main className="content">
          <div className="page-top">
            <div>
              <div className="breadcrumb">
                Fala Carlão <span>/</span>{' '}
                {page === 'dashboard'
                  ? 'Visão geral'
                  : page === 'videos'
                    ? 'Acervo de vídeos'
                    : page === 'sync'
                      ? 'Sincronizações'
                      : 'Configurações'}
              </div>
              <h1>
                {page === 'dashboard'
                  ? 'Uma visão do seu acervo.'
                  : page === 'videos'
                    ? 'Todas as suas histórias.'
                    : page === 'sync'
                      ? 'Seu acervo, sempre em dia.'
                      : 'Tudo pronto para conectar.'}
              </h1>
              <p className="muted">
                {page === 'dashboard'
                  ? 'Os números e as histórias que constroem o Fala Carlão.'
                  : page === 'videos'
                    ? 'Explore, pesquise e reencontre cada conversa do canal.'
                    : page === 'sync'
                      ? 'Acompanhe as importações e a atualização dos dados do canal.'
                      : 'Gerencie as conexões que dão vida ao seu painel.'}
              </p>
            </div>
            <Button
              leftSection={<RefreshCw size={16} />}
              loading={syncing}
              onClick={() => requestSync('incremental')}
            >
              Sincronizar agora
            </Button>
          </div>
          {notice && (
            <Alert color="yellow" withCloseButton onClose={() => setNotice('')} mb="lg">
              {notice}
            </Alert>
          )}
          {(config.isError || channel.isError) && (
            <Alert color="red" mb="lg">
              Não foi possível verificar a integração. Confira o backend e as migrações.
              <Button
                variant="subtle"
                size="xs"
                onClick={() => {
                  config.refetch();
                  channel.refetch();
                }}
              >
                Tentar novamente
              </Button>
            </Alert>
          )}
          <Suspense
            fallback={
              <div className="center-screen page-loading">
                <Loader color="yellow" />
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
            {page === 'videos' && <VideoPage />}
            {page === 'sync' && (
              <SyncPage
                channel={channel.data ?? null}
                config={config.data}
                requestSync={requestSync}
                busy={syncing}
              />
            )}
            {page === 'settings' && (
              <>
                <div className="panel settings-grid">
                  <div>
                    <span className="section-kicker">INTEGRAÇÕES</span>
                    <h2>Uma base para todas as histórias.</h2>
                    <p className="muted">
                      Dados persistidos no Supabase. Catálogo atualizado pela API oficial do
                      YouTube.
                    </p>
                    <div className="integration-line">
                      <Radio size={22} />
                      <div>
                        <b>Supabase</b>
                        <small>{new URL(import.meta.env.VITE_SUPABASE_URL).hostname}</small>
                      </div>
                      <Badge color="green" variant="light">
                        Autenticado
                      </Badge>
                    </div>
                    <div className="integration-line">
                      <Youtube size={24} />
                      <div>
                        <b>YouTube Data API v3</b>
                        <small>
                          {config.data?.youtube
                            ? 'Chave configurada no servidor'
                            : 'Aguardando YOUTUBE_API_KEY'}
                        </small>
                      </div>
                      <Badge color={ready ? 'green' : 'yellow'} variant="light">
                        {ready ? 'Configurado' : 'Pendente'}
                      </Badge>
                    </div>
                    <div className="integration-line">
                      <RefreshCw size={22} />
                      <div>
                        <b>GitHub Actions</b>
                        <small>
                          {config.data?.dispatch
                            ? 'Disparo pelo painel configurado'
                            : 'Configure GITHUB_TOKEN e GITHUB_REPOSITORY para disparo imediato'}
                        </small>
                      </div>
                    </div>
                    <p className="muted">
                      Horários previstos: 08:00, 14:00 e 20:00 (Brasília). O GitHub pode atrasar
                      execuções.
                    </p>
                  </div>
                  <SetupGuide />
                </div>
              </>
            )}
          </Suspense>
          <footer className="page-footer">
            <span>
              <span className="tiny-dot" />
              Fala Carlão · Acervo digital
            </span>
            <span>Histórias que ficam.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
