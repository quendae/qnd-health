import { useState, type FormEvent } from 'react';

export function LoginGate({
  onLogin,
  error,
}: {
  onLogin: (username: string, password: string) => Promise<void>;
  error?: string | null;
}) {
  const [username, setUsername] = useState('quendae');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!username.trim() || !password || busy) return;
    setBusy(true);
    setLocalError(null);
    try {
      await onLogin(username.trim(), password);
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : 'Logowanie nie powiodło się.');
    } finally {
      setBusy(false);
    }
  }

  const visibleError = localError ?? error;
  return <div className="token-page"><form className="token-card login-card" onSubmit={submit}>
    <div className="brand-mark">Q</div>
    <h1>QND Health</h1>
    <p>Zaloguj się do swojej prywatnej aplikacji zdrowotnej.</p>
    {visibleError && <div className="error-box">{visibleError}</div>}
    <label className="login-field">
      <span>Użytkownik</span>
      <input autoFocus autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} />
    </label>
    <label className="login-field">
      <span>Hasło</span>
      <input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} />
    </label>
    <button className="primary" type="submit" disabled={!username.trim() || !password || busy}>{busy ? 'Logowanie…' : 'Zaloguj się'}</button>
    <small>Logowanie jest lokalne. Hasło nie jest przechowywane w przeglądarce.</small>
  </form></div>;
}
