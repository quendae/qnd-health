import { Database, HeartPulse, LockKeyhole, Settings, Watch } from 'lucide-react';
import type { QndHealthApi } from './api';
import { ProfileSettings } from './ProfileSettings';
import type { EnergyEstimate } from './types';

const datasets = ['Aktywności', 'Kroki', 'Sen', 'Tętno', 'HRV', 'Body Battery', 'Stres', 'Waga'];

export function SettingsView({
  api,
  energy,
  onSaved,
  onError,
}: {
  api: QndHealthApi;
  energy: EnergyEstimate | null;
  onSaved: () => void | Promise<void>;
  onError: (message: string) => void;
}) {
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

      <article className="panel settings-card">
        <header><div className="settings-icon"><LockKeyhole /></div><div><h2>Dostęp API</h2><p>Web i Hermes mają oddzielne tokeny</p></div></header>
        <p className="settings-copy">Tokeny można rozdzielać według zakresów odczytu i zapisu. Sekretów integracji nie zapisujemy w repozytorium.</p>
      </article>

      <article className="panel settings-card">
        <header><div className="settings-icon"><Settings /></div><div><h2>Widok Dzisiaj</h2><p>Dynamiczne widżety</p></div></header>
        <p className="settings-copy">Widżety można już ukrywać i zmieniać ich kolejność z poziomu „Dostosuj widok”. Kolejny krok to zapis układu w profilu zamiast tylko w tej przeglądarce.</p>
      </article>
    </div>
  </section>;
}
