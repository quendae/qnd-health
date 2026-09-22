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
      <div><h2>Profil zdrowotny</h2><p>Dane do celów oraz szacowania BMR/TDEE</p></div>
    </header>

    <p className="settings-copy">BMR liczymy lokalnie wzorem Mifflina–St Jeora. TDEE to osobny szacunek wydatku energii. Cele kalorii, makro, kroków i współczynnik aktywności są wersjonowane w czasie — zmiana obowiązuje od dnia zapisu, bez zmiany historii.</p>

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
          <small>Wpływa na szacowane TDEE i może być zmieniany także przez Coacha.</small>
        </label>
        <label>Domyślny cel kroków
          <input type="number" min="1" max="100000" step="100" value={form.defaultStepsGoal} onChange={event => update('defaultStepsGoal', event.target.value)} />
          <small>Używany tylko, gdy Garmin nie dostarcza celu na dany dzień.</small>
        </label>
        <label>Dzienny cel kcal
          <input type="number" min="1" max="20000" step="50" value={form.dailyCaloriesGoalKcal} onChange={event => update('dailyCaloriesGoalKcal', event.target.value)} placeholder="np. 2200" />
        </label>
        <label>Dzienny cel białka (g)
          <input type="number" min="1" max="1000" step="5" value={form.dailyProteinGoalGrams} onChange={event => update('dailyProteinGoalGrams', event.target.value)} placeholder="np. 160" />
        </label>
        <label>Dzienny cel węglowodanów (g)
          <input type="number" min="1" max="2000" step="5" value={form.dailyCarbsGoalGrams} onChange={event => update('dailyCarbsGoalGrams', event.target.value)} placeholder="np. 220" />
        </label>
        <label>Dzienny cel tłuszczu (g)
          <input type="number" min="1" max="1000" step="5" value={form.dailyFatGoalGrams} onChange={event => update('dailyFatGoalGrams', event.target.value)} placeholder="np. 70" />
        </label>
        <label>Dzienny cel błonnika (g)
          <input type="number" min="1" max="500" step="1" value={form.dailyFiberGoalGrams} onChange={event => update('dailyFiberGoalGrams', event.target.value)} placeholder="np. 30" />
          <small>Puste pole wyłącza śledzenie danego celu. Coach może zmieniać te same cele na podstawie rozmowy i danych.</small>
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
      {saved && <div className="profile-saved">Profil i cele zapisane od dzisiaj.</div>}
    </>}
  </article>;
}
