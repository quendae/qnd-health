import { useEffect, useState } from 'react';
import { Calculator, Save, UserRound } from 'lucide-react';
import type { QndHealthApi } from './api';
import type { EnergyEstimate } from './types';
import { formatMetric } from './format-number';
import { buildProfilePatch, profileFormDefaults, type ProfileFormState } from './profile-settings';

export function ProfileSettings({
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
  const [form, setForm] = useState<ProfileFormState>(() => profileFormDefaults(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void api.getProfile()
      .then(profile => { if (active) setForm(profileFormDefaults(profile)); })
      .catch(error => { if (active) onError(error instanceof Error ? error.message : 'Nie udało się wczytać profilu.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, onError]);

  function update<K extends keyof ProfileFormState>(key: K, value: ProfileFormState[K]) {
    setSaved(false);
    setForm(current => ({ ...current, [key]: value }));
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setSaved(false);
    try {
      const patch = buildProfilePatch(form);
      const profile = await api.updateProfile(patch);
      setForm(profileFormDefaults(profile));
      await onSaved();
      setSaved(true);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Nie udało się zapisać profilu.');
    } finally {
      setSaving(false);
    }
  }

  return <article className="panel settings-card profile-settings">
    <header>
      <div className="settings-icon"><UserRound /></div>
      <div><h2>Profil zdrowotny</h2><p>Dane do celu kroków oraz szacowania BMR/TDEE</p></div>
    </header>

    <p className="settings-copy">BMR liczymy lokalnie wzorem Mifflina–St Jeora. TDEE to BMR pomnożone przez jawny współczynnik aktywności — wynik jest szacunkiem, nie pomiarem z Garmina.</p>

    {loading ? <div className="empty">Wczytywanie profilu…</div> : <>
      <div className="profile-form">
        <label>Data urodzenia
          <input type="date" value={form.dateOfBirth} onChange={event => update('dateOfBirth', event.target.value)} />
        </label>
        <label>Płeć dla wzoru BMR
          <select value={form.sexForBmr} onChange={event => update('sexForBmr', event.target.value as ProfileFormState['sexForBmr'])}>
            <option value="">Nie ustawiono</option>
            <option value="male">Mężczyzna</option>
            <option value="female">Kobieta</option>
          </select>
        </label>
        <label>Wzrost (cm)
          <input type="number" min="1" max="260" step="0.1" value={form.heightCm} onChange={event => update('heightCm', event.target.value)} placeholder="180" />
        </label>
        <label>Współczynnik aktywności
          <input type="number" min="1" max="3" step="0.05" value={form.activityFactor} onChange={event => update('activityFactor', event.target.value)} />
          <small>Domyślnie 1,2. Możesz go zmieniać jawnie wraz ze zmianą codziennej aktywności.</small>
        </label>
        <label>Domyślny cel kroków
          <input type="number" min="1" max="100000" step="100" value={form.defaultStepsGoal} onChange={event => update('defaultStepsGoal', event.target.value)} />
          <small>Używany tylko, gdy Garmin nie dostarcza celu na dany dzień.</small>
        </label>
      </div>

      <div className="profile-settings-footer">
        <div className="energy-preview">
          <Calculator size={17} />
          {energy
            ? <div><strong>BMR {formatMetric(energy.bmrKcal, 0)} kcal · TDEE {formatMetric(energy.tdeeKcal, 0)} kcal</strong><span>Szacowane · współczynnik {formatMetric(energy.activityFactor, 2)}</span></div>
            : <div><strong>BMR / TDEE —</strong><span>Uzupełnij datę urodzenia, płeć dla wzoru i wzrost; potrzebny jest też aktualny pomiar masy ciała.</span></div>}
        </div>
        <button className="primary" onClick={() => void save()} disabled={saving}><Save size={15} /> {saving ? 'Zapisywanie…' : 'Zapisz profil'}</button>
      </div>
      {saved && <div className="profile-saved">Profil zapisany.</div>}
    </>}
  </article>;
}
