import { useState } from 'react';
import { Bike, Dumbbell, Timer } from 'lucide-react';
import type { QndHealthApi } from './api';
import { activityPresets, buildPresetPlan, presetProgressValue, type ActivityPresetId } from './activity-presets';

const icons = { pushups: Dumbbell, hang: Timer, stationary_bike: Bike } as const;

export function QuickActivityPresets({
  api,
  date,
  onCreated,
  onError,
}: {
  api: QndHealthApi;
  date: string;
  onCreated: () => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const [values, setValues] = useState<Record<ActivityPresetId, string>>({ pushups: '', hang: '', stationary_bike: '' });
  const [busy, setBusy] = useState<ActivityPresetId | null>(null);

  async function submit(id: ActivityPresetId) {
    if (busy) return;
    const value = Number(values[id]);
    try {
      const plan = buildPresetPlan(id, date, value);
      setBusy(id);
      const created = await api.createPlan(plan);
      await api.updateProgress(created.id, presetProgressValue(id, value));
      setValues(current => ({ ...current, [id]: '' }));
      await onCreated();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Nie udało się zapisać aktywności.');
    } finally {
      setBusy(null);
    }
  }

  return <div className="quick-activities" aria-label="Szybkie aktywności">
    {activityPresets.map(preset => {
      const Icon = icons[preset.id];
      return <div className="quick-activity" key={preset.id}>
        <span className="quick-activity-icon"><Icon size={16} /></span>
        <div className="quick-activity-copy"><strong>{preset.label}</strong><span>{preset.id === 'stationary_bike' ? 'czas treningu' : preset.id === 'hang' ? 'czas wiszenia' : 'powtórzenia'}</span></div>
        <div className="quick-activity-input">
          <input
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            aria-label={`${preset.label} – ${preset.inputUnit}`}
            placeholder={preset.id === 'stationary_bike' ? '30' : preset.id === 'hang' ? '30' : '10'}
            value={values[preset.id]}
            onChange={event => setValues(current => ({ ...current, [preset.id]: event.target.value }))}
            onKeyDown={event => { if (event.key === 'Enter') void submit(preset.id); }}
          />
          <span>{preset.inputUnit}</span>
          <button className="ghost tiny" onClick={() => void submit(preset.id)} disabled={busy !== null || !values[preset.id]}>Dodaj</button>
        </div>
      </div>;
    })}
  </div>;
}
