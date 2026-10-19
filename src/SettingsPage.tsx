import { Badge } from '@mantine/core';
import { CircleHelp, Radio, RefreshCw, Youtube } from 'lucide-react';
export function SetupGuide() {
  return (
    <div className="setup-guide">
      <strong>Configuração inicial</strong>
      <ol>
        <li>Execute as migrations SQL no Supabase.</li>
        <li>
          Crie um usuário e autorize seu ID em <code>admin_users</code>.
        </li>
        <li>
          Configure <code>YOUTUBE_API_KEY</code> e <code>SUPABASE_SERVICE_ROLE_KEY</code> no backend
          e no GitHub Actions.
        </li>
        <li>Publique o workflow e importe o histórico completo.</li>
      </ol>
      <p>Os comandos de instalação e publicação estão no README do projeto.</p>
    </div>
  );
}
export function SettingsPage({
  config,
}: {
  config?: { youtube: boolean; worker: boolean; dispatch: boolean };
}) {
  return (
    <>
      <section className="panel settings-panel">
        <div className="panel-heading">
          <h2>Integrações</h2>
        </div>
        <div className="integration-line">
          <Radio size={21} />
          <div>
            <b>Banco de dados</b>
            <small>
              {import.meta.env.VITE_SUPABASE_URL
                ? new URL(import.meta.env.VITE_SUPABASE_URL).hostname
                : 'Endereço não configurado'}
            </small>
          </div>
          <Badge color="gray" variant="light">
            Supabase
          </Badge>
        </div>
        <div className="integration-line">
          <Youtube size={21} />
          <div>
            <b>YouTube Data API v3</b>
            <small>
              {config
                ? config.youtube
                  ? 'Chave cadastrada no servidor'
                  : 'Chave não cadastrada'
                : 'Configuração não verificada'}
            </small>
          </div>
          <Badge color={config?.youtube ? 'gray' : 'yellow'} variant="light">
            {config?.youtube ? 'Credencial cadastrada' : 'Verificar configuração'}
          </Badge>
        </div>
        <div className="integration-line">
          <RefreshCw size={21} />
          <div>
            <b>Sincronização</b>
            <small>
              {config
                ? config.dispatch
                  ? 'Disparo imediato pelo painel configurado'
                  : 'Disparo imediato não configurado; solicitações aguardam o agendador'
                : 'Configuração não verificada'}
            </small>
            <small>
              {config?.worker
                ? 'Credencial do worker cadastrada'
                : 'Credencial do worker não verificada'}
            </small>
          </div>
        </div>
        <p className="settings-note muted">
          Credenciais cadastradas não comprovam uma conexão ativa. Consulte os resultados em
          Sincronizações.
        </p>
      </section>
      <details className="panel context-help settings-help">
        <summary>
          <CircleHelp size={18} aria-hidden="true" /> Ajuda e configuração
        </summary>
        <SetupGuide />
        <p>
          Execuções previstas às 08h, 14h e 20h, no horário de Brasília. O agendador do GitHub pode
          apresentar atrasos.
        </p>
      </details>
    </>
  );
}
