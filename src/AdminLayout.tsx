import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Avatar, Button, Drawer, Menu, useMantineColorScheme } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  ArrowRight,
  ChevronDown,
  ExternalLink,
  Film,
  History,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  Moon,
  Play,
  RefreshCw,
  Search,
  Settings2,
  Sun,
} from 'lucide-react';

export type Page = 'dashboard' | 'videos' | 'research' | 'timeline' | 'sync' | 'settings';
export const navigation = [
  { id: 'dashboard', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'videos', label: 'Acervo de vídeos', icon: Film },
  { id: 'research', label: 'Pesquisa avançada', icon: Search },
  { id: 'timeline', label: 'Linha do tempo', icon: History },
  { id: 'sync', label: 'Sincronizações', icon: RefreshCw },
  { id: 'settings', label: 'Configurações', icon: Settings2 },
] as const;
const descriptions: Partial<Record<Page, string>> = {
  research: 'Pesquise títulos e descrições em todo o acervo.',
  timeline: 'Analise títulos, nomenclaturas e sequências de episódios.',
  sync: 'Importações e atualizações do YouTube.',
};
export function Brand() {
  return (
    <div className="brand">
      <span className="brand-icon">
        <Play size={19} fill="currentColor" aria-hidden="true" />
      </span>
      <span>
        fala <b>carlão</b>
        <small>Gerenciador de vídeos</small>
      </span>
    </div>
  );
}
export function AdminLayout({
  page,
  onNavigate,
  email,
  onSignOut,
  onSync,
  busy,
  syncDisabled,
  children,
}: {
  page: Page;
  onNavigate: (p: Page) => void;
  email?: string;
  onSignOut: () => void;
  onSync: () => void;
  busy: boolean;
  syncDisabled?: boolean;
  children: ReactNode;
}) {
  const [mobile, setMobile] = useState(false);
  const small = useMediaQuery('(max-width: 800px)');
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const heading = useRef<HTMLHeadingElement>(null);
  const previous = useRef(page);
  useEffect(() => {
    if (!small) setMobile(false);
  }, [small]);
  useEffect(() => {
    if (previous.current !== page) {
      heading.current?.focus();
      previous.current = page;
    }
    document.title = `${navigation.find((n) => n.id === page)?.label} · Fala Carlão`;
  }, [page]);
  const title = navigation.find((n) => n.id === page)!.label;
  function navigate(p: Page) {
    onNavigate(p);
    setMobile(false);
  }
  const links = (
    <nav aria-label="Navegação principal">
      {navigation.map((item) => (
        <button
          key={item.id}
          className={page === item.id ? 'active' : ''}
          aria-current={page === item.id ? 'page' : undefined}
          onClick={() => navigate(item.id)}
        >
          <item.icon size={18} aria-hidden="true" />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
  return (
    <div className="app">
      <a href="#main-content" className="skip-link">
        Ir para o conteúdo
      </a>
      <aside className="sidebar">
        <Brand />
        {links}
        <a
          className="sidebar-channel"
          href="https://www.youtube.com/@falacarlao"
          target="_blank"
          rel="noopener noreferrer"
        >
          Abrir canal no YouTube <ExternalLink size={14} aria-hidden="true" />
        </a>
      </aside>
      <Drawer
        opened={mobile}
        onClose={() => setMobile(false)}
        position="left"
        size={270}
        title={<Brand />}
        closeButtonProps={{ 'aria-label': 'Fechar menu' }}
        className="navigation-drawer"
      >
        {links}
      </Drawer>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-title">
            <button
              className="mobile-toggle icon-button"
              aria-label="Abrir menu"
              aria-expanded={mobile}
              onClick={() => setMobile(true)}
            >
              <MenuIcon size={21} />
            </button>
            <span>Painel administrativo</span>
          </div>
          <div className="topbar-actions">
            <button
              className="icon-button"
              onClick={toggleColorScheme}
              aria-label={colorScheme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
            >
              {colorScheme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <Menu position="bottom-end">
              <Menu.Target>
                <button className="user-menu" aria-label="Menu do usuário">
                  <Avatar color="yellow" radius="xl" size={29}>
                    {email?.[0]?.toUpperCase() ?? 'A'}
                  </Avatar>
                  <span>Administrador</span>
                  <ChevronDown size={14} />
                </button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>{email}</Menu.Label>
                <Menu.Item
                  leftSection={<Settings2 size={16} />}
                  onClick={() => navigate('settings')}
                >
                  Configurações e ajuda
                </Menu.Item>
                <Menu.Item leftSection={<LogOut size={16} />} onClick={onSignOut}>
                  Sair
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </div>
        </header>
        <main className="content" id="main-content" tabIndex={-1}>
          <div className="page-top">
            <div>
              <h1 ref={heading} tabIndex={-1}>
                {title}
              </h1>
              {descriptions[page] && <p className="muted">{descriptions[page]}</p>}
            </div>
            <div className="page-actions">
              {page === 'dashboard' && (
                <Button
                  variant="default"
                  rightSection={<ArrowRight size={16} />}
                  onClick={() => navigate('videos')}
                >
                  Acessar acervo
                </Button>
              )}
              {(page === 'dashboard' || page === 'sync') && (
                <Button
                  leftSection={<RefreshCw size={16} />}
                  loading={busy}
                  disabled={syncDisabled}
                  aria-busy={busy}
                  onClick={onSync}
                >
                  {busy ? 'Solicitando…' : 'Sincronizar agora'}
                </Button>
              )}
            </div>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
