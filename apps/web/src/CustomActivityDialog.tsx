import { useEffect, useMemo, useState } from 'react';
import { Activity, Link2, X } from 'lucide-react';
import type { QndHealthApi } from './api';
import type { CompletedActivity } from './types';
import { buildCustomActivityPlan } from './custom-activity';
import { formatDistance, formatDuration } from './view-model';

const activityTypes = [
  ['walking', 'Spacer'],
  ['running', 'Bieganie'],
  ['cycling', 'Rower'],
  ['strength_training', 'Trening siłowy'],
  ['swimming', 'Pływanie'],
  ['yoga', 'Joga'],
  ['other', 'Inna'],
] as const;

function activityTypeLabel(value: string) {
  return activityTypes.find(([id]) => id === value)?.[1] ?? value;
}

export function CustomActivityDialog({
  api,
  date,
  onClose,
  onCreated,
}: {
  api: QndHealthApi;
  date: string;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [activityType, setActivityType] = useState('walking');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [distanceKm, setDistanceKm] = useState('');
  const [activities, setActivities] = useState<CompletedActivity[]>([]);
  const [selectedGarminId, setSelectedGarminId] = useState('');
  const [loadingGarmin, setLoadingGarmin] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoadingGarmin(true);
    void api.listActivities(date)
      .then(result => {
        if (!active) return;
        setActivities(result.items.filter(item => item.provider === 'garmin'));
      })
      .catch(err => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Nie udało się pobrać aktywności Garmin');
      })
      .finally(() => { if (active) setLoadingGarmin(false); });
    return () => { active = false; };
  }, [api, date]);

  const selectedGarmin = useMemo(
    () => activities.find(item => item.id === selectedGarminId) ?? null,
    [activities, selectedGarminId],
  );

  useEffect(() => {
    if (!selectedGarmin) return;
    setActivityType(selectedGarmin.activityType);
    if (!title.trim()) setTitle(activityTypeLabel(selectedGarmin.activityType));
  }, [selectedGarmin]);

  async function submit() {
    if (!title.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const prepared = buildCustomActivityPlan({
        date,
        title,
        activityType,
        durationMinutes: durationMinutes ? Number(durationMinutes) : null,
        distanceKm: distanceKm ? Number(distanceKm) : null,
        garminActivity: selectedGarmin,
      });
      const created = await api.createPlan(prepared.plan);
      if (prepared.completedActivityId) {
        await api.attachActivity(created.id, prepared.completedActivityId);
      } else if (prepared.manualProgressValue != null) {
        await api.updateProgress(created.id, prepared.manualProgressValue);
      }
      await onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się dodać aktywności');
    } finally {
      setSaving(false);
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) onClose(); }}>
    <section className="modal-card activity-dialog" role="dialog" aria-modal="true" aria-labelledby="custom-activity-title">
      <header className="modal-head">
        <div><h2 id="custom-activity-title"><Activity size={19} /> Dodaj aktywność</h2><p>Dodaj wykonaną aktywność ręcznie lub połącz ją z aktywnością Garmin z tego dnia.</p></div>
        <button className="icon-button" onClick={onClose} aria-label="Zamknij"><X size={17} /></button>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <div className="form-grid activity-form-grid">
        <label className="span-2">Nazwa
          <input autoFocus value={title} onChange={event => setTitle(event.target.value)} placeholder="np. Spacer z psem" />
        </label>
        <label>Typ aktywności
          <select value={activityType} onChange={event => setActivityType(event.target.value)} disabled={Boolean(selectedGarmin)}>
            {activityTypes.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>
        <label>Data
          <input value={date} disabled />
        </label>
        <label>Czas (min)
          <input type="number" min="1" step="1" value={durationMinutes} onChange={event => setDurationMinutes(event.target.value)} disabled={Boolean(selectedGarmin)} placeholder="45" />
        </label>
        <label>Dystans (km)
          <input type="number" min="0" step="0.1" value={distanceKm} onChange={event => setDistanceKm(event.target.value)} disabled={Boolean(selectedGarmin)} placeholder="3.8" />
        </label>
      </div>

      <div className="garmin-picker">
        <div className="garmin-picker-head"><div><strong><Link2 size={16} /> Garmin</strong><span>Opcjonalnie podepnij aktywność zsynchronizowaną dla tego dnia.</span></div></div>
        {loadingGarmin ? <div className="empty">Wczytywanie aktywności Garmin…</div> : activities.length === 0 ? <div className="empty">Brak zsynchronizowanych aktywności Garmin dla tego dnia.</div> : <div className="garmin-activity-list">
          <label className={`garmin-activity-option ${selectedGarminId === '' ? 'selected' : ''}`}>
            <input type="radio" name="garmin-activity" value="" checked={selectedGarminId === ''} onChange={() => setSelectedGarminId('')} />
            <div><strong>Bez połączenia z Garmin</strong><span>Aktywność zostanie zapisana ręcznie jako wykonana.</span></div>
          </label>
          {activities.map(item => <label className={`garmin-activity-option ${selectedGarminId === item.id ? 'selected' : ''}`} key={item.id}>
            <input type="radio" name="garmin-activity" value={item.id} checked={selectedGarminId === item.id} onChange={() => setSelectedGarminId(item.id)} />
            <div><strong>{activityTypeLabel(item.activityType)}</strong><span>{new Date(item.startedAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })} · {formatDuration(item.durationSeconds)} · {formatDistance(item.distanceMeters)}</span></div>
          </label>)}
        </div>}
      </div>

      <footer className="modal-actions">
        <button className="ghost" onClick={onClose} disabled={saving}>Anuluj</button>
        <button className="primary" onClick={() => void submit()} disabled={!title.trim() || saving}>{saving ? 'Zapisywanie…' : 'Dodaj aktywność'}</button>
      </footer>
    </section>
  </div>;
}
