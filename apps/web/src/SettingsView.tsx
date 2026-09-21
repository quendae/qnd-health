import { useState } from 'react';
import { Database, HeartPulse, LockKeyhole, Settings, Watch } from 'lucide-react';
import type { QndHealthApi } from './api';
import { ProfileSettings } from './ProfileSettings';
import type { EnergyEstimate } from './types';

const datasets = ['Aktywności', 'Kroki', 'Sen', 'Tętno', 'HRV', 'Body Battery', 'Stres', 'Waga'];
const WEB_TOKEN_KEY = 'qnd-health.web-token';

function browserHasWebToken(): boolean {
  return typeof sessionStorage !== 'undefined' && Boolean(sessionStorage.getItem(WEB_TOKEN_KEY));
}

function saveBrowserWebToken(token: string): void {
  sessionStorage.setItem(WEB_TOKEN_KEY, token);
  window.location.reload();
}

function clearBrowserWebToken(): void {
  sessionStorage.removeItem(WEB_TOKEN_KEY);
  window.location.reload();
}

export function SettingsView({
  api,
  energy,
  onSaved,
  onError,
  hasWebToken,
  onSaveWebToken,
  onClearWebToken,
}: {
  api: QndHealthApi;
  energy: EnergyEstimate | null;
  onSaved: () => void | Promise<void>;
  onError: (message: string) => void;
  hasWebToken?: boolean;
  onSaveWebToken?: (token: string) => void;
  onClearWebToken?: () => void;
}) {
  const [tokenDraft, setTokenDraft] = useState('');
  const tokenStored = hasWebToken ?? browserHasWebToken();

  function submitToken(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = tokenDraft.trim();
    if (!value) return;
    (onSaveWebToken ?? saveBrowserWebToken)(value);
    setTokenDraft('');
  }

  function clearToken() {
    (onClearWebToken ?? clearBrowserWebToken)();
  }

  return <section className="settings-view">
    <div className="insight-toolbar"><div><span className="eyebrow">Integracje i prywatność</span><h1>Ustawienia</h1></div></div>
    <div className="settings-grid">
      <ProfileSettings api={api} energy={energy} onSaved={onSaved} onError={onError} />

      <article className="panel settings-card garmin-settings">
        <header><div className="settings-icon"><Watch /></div><div><h2>Garmin</h2><p>Oficjalne Garmin Health API</p></div><span className="provider-status pending"><i /> Nie skonfigurowano</span></header>
        <p className="settings-copy">Po otrzymaniu danych klienta OAuth dodamy je po stronie serwera. Hasło do Garmin Connect nie będzie potrzebne w aplikacji webowej.</p>
        <div className="dataset-list">{datasets.map(item => <span key={item}>{item}</span>)}</div>
        <div className="settings-note"><HeartPulse size={16} /><span>Widoki Dzisiaj, Historia i Postępy są już przygotowane na te dane. Po włączeniu synchronizacji nie będzie potrzebna przebudowa UI.</span></div>
      </article>

      <article className="panel settings-card">
        <header><div className="settings-icon"><Database /></div><div><h2>Dane</h2><p>SQLite na Twoim serwerze</p></div></header>
        <p className="settings-copy">Dane aplikacji pozostają w lokalnej bazie QND Health. Integracje dostają tylko zakres dostępu wynikający z ich tokenu API.</p>
      </article>

      <article className="panel settings-card api-access-card">
        <header>
          <div className="settings-icon"><LockKeyhole /></div>
          <div><h2>Dostęp API</h2><p>Web i Hermes mają oddzielne tokeny</p></div>
          <span className={`provider-status ${tokenStored ? 'connected' : 'pending'}`}><i /> {tokenStored ? 'Token zapisany' : 'Brak tokenu'}</span>
        </header>
        <p className="settings-copy">Token web jest przechowywany wyłącznie w <code>sessionStorage</code> tej przeglądarki. Aktualnego sekretu nie pokazujemy ponownie.</p>
        <form className="api-token-form" onSubmit={submitToken}>
          <label>
            <span>Token web tej sesji</span>
            <input
              type="password"
              autoComplete="off"
              placeholder="Wklej nowy token qndh_…"
              value={tokenDraft}
              onChange={event => setTokenDraft(event.target.value)}
            />
          </label>
          <div className="api-token-actions">
            <button className="primary" type="submit" disabled={!tokenDraft.trim()}>Zapisz token</button>
            <button className="ghost" type="button" onClick={clearToken} disabled={!tokenStored}>Wyczyść</button>
          </div>
        </form>
        <small className="api-token-note">Po zapisaniu tokenu aplikacja odświeży sesję i zacznie używać nowych zakresów, w tym <code>coach:read</code> i <code>coach:write</code>.</small>
      </article>

      <article className="panel settings-card">
        <header><div className="settings-icon"><Settings /></div><div><h2>Widok Dzisiaj</h2><p>Dynamiczne widżety</p></div></header>
        <p className="settings-copy">Widżety można już ukrywać i zmieniać ich kolejność z poziomu „Dostosuj widok”. Kolejny krok to zapis układu w profilu zamiast tylko w tej przeglądarce.</p>
      </article>
    </div>
  </section>;
}
