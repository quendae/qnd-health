import { useEffect, useMemo, useState } from 'react';
import { Activity, Link2, X } from 'lucide-react';
import type { QndHealthApi } from './api';
import type { CompletedActivity, WorkoutStructure } from './types';
import { buildCustomActivityPlan } from './custom-activity';
import { activityCatalog, activityCatalogItem, activityLabel } from './activity-catalog';
import { formatDistance, formatDuration } from './view-model';

function optionalPositive(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function optionalNonNegative(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
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
  const [sets, setSets] = useState('');
  const [repsPerSet, setRepsPerSet] = useState('');
  const [secondsPerSet, setSecondsPerSet] = useState('');
  const [restSeconds, setRestSeconds] = useState('');
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
  const selectedType = activityCatalogItem(activityType);

  useEffect(() => {
    if (!selectedGarmin) return;
    setActivityType(selectedGarmin.activityType);
    if (!title.trim()) setTitle(activityLabel(selectedGarmin.activityType));
  }, [selectedGarmin]);

  function changeActivityType(value: string) {
    setActivityType(value);
    if (!title.trim()) setTitle(activityCatalogItem(value).defaultTitle);
  }

  function structure(): WorkoutStructure | null {
    if (selectedGarmin) return null;
    const mode = selectedType.structure;
    if (mode !== 'reps' && mode !== 'seconds') return null;
    const value: WorkoutStructure = {
      sets: optionalPositive(sets),
      restSeconds: optionalNonNegative(restSeconds),
      ...(mode === 'reps' ? { repsPerSet: optionalPositive(repsPerSet) } : { secondsPerSet: optionalPositive(secondsPerSet) }),
    };
    return Object.values(value).some(item => item != null) ? value : null;
  }

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
        workoutStructure: structure(),
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

  const structured = !selectedGarmin && (selectedType.structure === 'reps' || selectedType.structure === 'seconds');
  const timed = !selectedGarmin && !structured;

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
          <select value={activityType} onChange={event => changeActivityType(event.target.value)} disabled={Boolean(selectedGarmin)}>
            {activityCatalog.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label>Data
          <input value={date} disabled />
        </label>
        {timed && <>
          <label>Czas (min)
            <input type="number" min="1" step="1" value={durationMinutes} onChange={event => setDurationMinutes(event.target.value)} placeholder="45" />
          </label>
          <label>Dystans (km)
            <input type="number" min="0" step="0.1" value={distanceKm} onChange={event => setDistanceKm(event.target.value)} placeholder="3.8" />
          </label>
        </>}
        {structured && <>
          <label>Liczba serii
            <input type="number" min="1" step="1" value={sets} onChange={event => setSets(event.target.value)} placeholder="4" />
          </label>
          {selectedType.structure === 'reps' ? <label>Powtórzeń w serii
            <input type="number" min="1" step="1" value={repsPerSet} onChange={event => setRepsPerSet(event.target.value)} placeholder="12" />
          </label> : <label>Czas serii (s)
            <input type="number" min="1" step="1" value={secondsPerSet} onChange={event => setSecondsPerSet(event.target.value)} placeholder="30" />
          </label>}
          <label>Przerwa między seriami (s)
            <input type="number" min="0" step="5" value={restSeconds} onChange={event => setRestSeconds(event.target.value)} placeholder="60" />
          </label>
        </>}
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
            <div><strong>{activityLabel(item.activityType)}</strong><span>{new Date(item.startedAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })} · {formatDuration(item.durationSeconds)} · {formatDistance(item.distanceMeters)}</span></div>
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
