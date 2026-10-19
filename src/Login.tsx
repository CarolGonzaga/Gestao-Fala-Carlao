import { useEffect, useRef, useState } from 'react';
import { Alert, Button, PasswordInput, TextInput } from '@mantine/core';
import { Play } from 'lucide-react';
import { Brand } from './AdminLayout';
import { supabase } from './lib';

export function Login({ error: accessError }: { error?: string }) {
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    document.title = 'Entrar · Fala Carlão';
  }, []);
  return (
    <div className="login">
      <aside className="login-brand">
        <Brand />
        <div className="login-identity">
          <span className="login-symbol" aria-hidden="true">
            <Play size={52} fill="currentColor" />
          </span>
          <h2>
            Gerenciador
            <br />
            de vídeos
          </h2>
          <span>Acervo Fala Carlão</span>
        </div>
      </aside>
      <main className="login-main">
        <div className="login-form">
          <h1>Entrar</h1>
          <p className="muted">Acesse com sua conta administrativa.</p>
          {!supabase ? (
            <Alert color="yellow" title="Acesso indisponível">
              A configuração do painel está pendente. Entre em contato com o administrador.
            </Alert>
          ) : (
            <form
              aria-busy={busy}
              onSubmit={async (e) => {
                e.preventDefault();
                if (lock.current) return;
                lock.current = true;
                setBusy(true);
                setError('');
                try {
                  const result = await supabase!.auth.signInWithPassword({ email, password });
                  if (result.error)
                    setError('Não foi possível entrar. Confira o e-mail e a senha.');
                } catch {
                  setError('Não foi possível entrar. Verifique a conexão e tente novamente.');
                } finally {
                  lock.current = false;
                  setBusy(false);
                }
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
                visibilityToggleButtonProps={{ 'aria-label': 'Mostrar ou ocultar senha' }}
                placeholder="Sua senha"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                size="md"
                mt="md"
              />
              {(error || accessError) && (
                <Alert color="red" mt="md">
                  {error || accessError}
                </Alert>
              )}
              <Button fullWidth mt="lg" size="md" type="submit" loading={busy}>
                {busy ? 'Entrando…' : 'Entrar'}
              </Button>
              <span className="sr-only" role="status">
                {busy ? 'Autenticando…' : ''}
              </span>
            </form>
          )}
          <details className="context-help">
            <summary>Precisa de acesso?</summary>
            <p>Solicite ao administrador o cadastro ou a revisão da permissão da sua conta.</p>
          </details>
        </div>
      </main>
    </div>
  );
}
