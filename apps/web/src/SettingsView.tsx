import { useEffect, useState, type FormEvent } from 'react';
import { Brain, Database, HeartPulse, Settings, Watch } from 'lucide-react';
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
  const [promptDraft, setPromptDraft] = useState('');
  const [promptLoaded, setPromptLoaded] = useState(false);
  const [promptIsDefault, setPromptIsDefault] = useState(true);
  const [savingPrompt, setSavingPrompt] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api.getCoachSettings()
      .then(settings => {
        if (cancelled) return;
        setPromptDraft(settings.systemPrompt);
        setPromptIsDefault(settings.isDefault);
        setPromptLoaded(true);
      })
      .catch(error => {
        if (cancelled) return;
        setPromptLoaded(true);
        onError(error instanceof Error ? error.message : 'Nie udało się wczytać promptu Coacha.');
      });
    return () => { cancelled = true; };
  }, [api, onError]);

  async function savePrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = promptDraft.trim();
    if (!value || savingPrompt) return;
    setSavingPrompt(true);
    try {
      const settings = await api.updateCoachSettings(value);
      setPromptDraft(settings.systemPrompt);
      setPromptIsDefault(settings.isDefault);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Nie udało się zapisać promptu Coacha.');
    } finally {
      setSavingPrompt(false);
    }
  }

  async function resetPrompt() {
    if (savingPrompt) return;
    setSavingPrompt(true);
    try {
      const settings = await api.updateCoachSettings(null);
      setPromptDraft(settings.systemPrompt);
      setPromptIsDefault(settings.isDefault);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Nie udało się przywrócić domyślnego promptu Coacha.');
    } finally {
      setSavingPrompt(false);
    }
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

      <article className="panel settings-card coach-prompt-card">
        <header>
          <div className="settings-icon"><Brain /></div>
          <div><h2>Główny prompt Coacha</h2><p>Instrukcja systemowa używana przy każdej rozmowie</p></div>
          <span className={`provider-status ${promptIsDefault ? 'pending' : 'connected'}`}><i /> {promptIsDefault ? 'Domyślny' : 'Własny'}</span>
        </header>
        <p className="settings-copy">Możesz zmienić sposób pracy, ton i priorytety Coacha. Zapisany prompt zacznie obowiązywać od następnej wiadomości i jest przechowywany w lokalnej bazie QND Health.</p>
        <form className="coach-prompt-form" onSubmit={savePrompt}>
          <label>
            <span>Prompt systemowy</span>
            <textarea
              rows={14}
              value={promptDraft}
              disabled={!promptLoaded || savingPrompt}
              placeholder={promptLoaded ? 'Wpisz główny prompt Coacha…' : 'Wczytywanie promptu…'}
              onChange={event => setPromptDraft(event.target.value)}
            />
          </label>
          <div className="coach-prompt-actions">
            <button className="primary" type="submit" disabled={!promptLoaded || !promptDraft.trim() || savingPrompt}>Zapisz prompt</button>
            <button className="ghost" type="button" onClick={() => void resetPrompt()} disabled={!promptLoaded || promptIsDefault || savingPrompt}>Przywróć domyślny</button>
          </div>
        </form>
      </article>

      <article className="panel settings-card">
        <header><div className="settings-icon"><Database /></div><div><h2>Dane i dostęp</h2><p>SQLite + lokalna sesja webowa</p></div></header>
        <p className="settings-copy">Dane aplikacji pozostają w lokalnej bazie QND Health. Przeglądarka loguje się lokalnym kontem i bezpiecznym cookie sesyjnym, a Hermes i inne integracje nadal używają osobnych tokenów API z ograniczonymi zakresami.</p>
      </article>

      <article className="panel settings-card">
        <header><div className="settings-icon"><Settings /></div><div><h2>Widok Dzisiaj</h2><p>Dynamiczne widżety</p></div></header>
        <p className="settings-copy">Widżety można już ukrywać i zmieniać ich kolejność z poziomu „Dostosuj widok”. Kolejny krok to zapis układu w profilu zamiast tylko w tej przeglądarce.</p>
      </article>
    </div>
  </section>;
}
