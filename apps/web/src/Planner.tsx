import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Dumbbell, Pencil, Plus, Target, Trash2, X } from 'lucide-react';
import { QndHealthApi, type PlanWriteInput } from './api';
import type { PlanItem } from './types';
import { formatDistance, formatDuration } from './view-model';

function isoDate(value: Date) { return value.toISOString().slice(0, 10); }
function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return isoDate(value);
}
function mondayOf(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() - day + 1);
  return isoDate(value);
}
function weekTitle(from: string, to: string) {
  const a = new Date(`${from}T12:00:00`);
  const b = new Date(`${to}T12:00:00`);
  const sameMonth = a.getMonth() === b.getMonth();
  if (sameMonth) return `${a.getDate()}–${b.getDate()} ${new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' }).format(b)}`;
  return `${new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short' }).format(a)} – ${new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' }).format(b)}`;
}
function dayHeading(date: string) {
  const value = new Date(`${date}T12:00:00`);
  return {
    weekday: new Intl.DateTimeFormat('pl-PL', { weekday: 'long' }).format(value),
    date: new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short' }).format(value),
  };
}
function statusLabel(status: PlanItem['status']) {
  return ({ planned: 'Zaplanowane', partial: 'W trakcie', completed: 'Wykonane', skipped: 'Pominięte', moved: 'Przeniesione', replaced: 'Zastąpione' } as const)[status];
}
function kindLabel(kind: PlanItem['kind']) {
  return ({ workout: 'Trening', metric_goal: 'Cel z Garmina', count_goal: 'Licznik ręczny', manual: 'Zadanie' } as const)[kind];
}
function itemDetail(item: PlanItem) {
  if (item.kind === 'workout') {
    const bits = [item.activityType, item.plannedDurationSeconds ? formatDuration(item.plannedDurationSeconds) : null, item.plannedDistanceMeters ? formatDistance(item.plannedDistanceMeters) : null];
    return bits.filter(Boolean).join(' · ');
  }
  if (item.targetValue != null) return `${item.targetValue} ${item.unit ?? ''}`.trim();
  return 'Do wykonania';
}

interface FormState {
  date: string;
  kind: PlanItem['kind'];
  title: string;
  metricKey: string;
  targetValue: string;
  unit: string;
  activityType: string;
  durationMinutes: string;
  distanceKm: string;
}

function emptyForm(date: string): FormState {
  return { date, kind: 'workout', title: '', metricKey: 'steps', targetValue: '', unit: '', activityType: 'walking', durationMinutes: '', distanceKm: '' };
}
function formFromItem(item: PlanItem): FormState {
  return {
    date: item.date,
    kind: item.kind,
    title: item.title,
    metricKey: item.metricKey ?? 'steps',
    targetValue: item.targetValue?.toString() ?? '',
    unit: item.unit ?? '',
    activityType: item.activityType ?? 'walking',
    durationMinutes: item.plannedDurationSeconds ? String(Math.round(item.plannedDurationSeconds / 60)) : '',
    distanceKm: item.plannedDistanceMeters ? String(item.plannedDistanceMeters / 1000) : '',
  };
}
function toPayload(form: FormState): PlanWriteInput {
  const common = { date: form.date, kind: form.kind, title: form.title.trim() };
  if (form.kind === 'metric_goal') {
    return { ...common, completionStrategy: 'metric_auto', metricKey: form.metricKey, targetValue: Number(form.targetValue), unit: form.unit.trim() || (form.metricKey === 'steps' ? 'kroków' : '') };
  }
  if (form.kind === 'count_goal') {
    return { ...common, completionStrategy: 'count_manual', targetValue: Number(form.targetValue), unit: form.unit.trim() || 'razy' };
  }
  if (form.kind === 'manual') return { ...common, completionStrategy: 'manual' };
  return {
    ...common,
    completionStrategy: 'activity_link',
    activityType: form.activityType.trim() || 'other',
    plannedDurationSeconds: form.durationMinutes ? Number(form.durationMinutes) * 60 : null,
    plannedDistanceMeters: form.distanceKm ? Number(form.distanceKm) * 1000 : null,
  };
}

function PlanDialog({ initialDate, item, busy, onClose, onSave }: { initialDate: string; item: PlanItem | null; busy: boolean; onClose: () => void; onSave: (payload: PlanWriteInput) => void }) {
  const [form, setForm] = useState<FormState>(() => item ? formFromItem(item) : emptyForm(initialDate));
  const set = (patch: Partial<FormState>) => setForm(current => ({ ...current, ...patch }));
  const needsTarget = form.kind === 'metric_goal' || form.kind === 'count_goal';
  const valid = form.title.trim() && (!needsTarget || Number(form.targetValue) > 0);

  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) onClose(); }}>
    <div className="plan-dialog" role="dialog" aria-modal="true" aria-labelledby="plan-dialog-title">
      <header><div><h2 id="plan-dialog-title">{item ? 'Edytuj pozycję' : 'Dodaj do planu'}</h2><p>{item ? 'Możesz także przenieść pozycję na inny dzień.' : 'Wybierz typ i uzupełnij tylko potrzebne dane.'}</p></div><button className="icon-button" onClick={onClose} aria-label="Zamknij"><X size={18} /></button></header>
      <div className="plan-form">
        <label><span>Data</span><input type="date" value={form.date} onChange={e => set({ date: e.target.value })} /></label>
        <label><span>Typ</span><select value={form.kind} onChange={e => set({ kind: e.target.value as FormState['kind'] })}><option value="workout">Trening</option><option value="metric_goal">Cel z Garmina</option><option value="count_goal">Licznik ręczny</option><option value="manual">Zadanie</option></select></label>
        <label className="wide"><span>Nazwa</span><input autoFocus value={form.title} onChange={e => set({ title: e.target.value })} placeholder={form.kind === 'workout' ? 'np. Spokojny marsz' : 'np. Schody'} /></label>
        {form.kind === 'metric_goal' && <><label><span>Metryka</span><select value={form.metricKey} onChange={e => set({ metricKey: e.target.value })}><option value="steps">Kroki</option><option value="floorsAscended">Piętra</option><option value="intensityMinutes">Minuty intensywne</option><option value="activeCalories">Kalorie aktywne</option></select></label><label><span>Jednostka</span><input value={form.unit} onChange={e => set({ unit: e.target.value })} placeholder="np. kroków" /></label></>}
        {needsTarget && <label><span>Cel</span><input type="number" min="0" step="any" value={form.targetValue} onChange={e => set({ targetValue: e.target.value })} /></label>}
        {form.kind === 'count_goal' && <label><span>Jednostka</span><input value={form.unit} onChange={e => set({ unit: e.target.value })} placeholder="np. rund" /></label>}
        {form.kind === 'workout' && <><label><span>Aktywność</span><select value={form.activityType} onChange={e => set({ activityType: e.target.value })}><option value="walking">Marsz</option><option value="running">Bieg</option><option value="cycling">Rower</option><option value="strength_training">Siłownia</option><option value="other">Inna</option></select></label><label><span>Czas (min)</span><input type="number" min="1" value={form.durationMinutes} onChange={e => set({ durationMinutes: e.target.value })} /></label><label><span>Dystans (km)</span><input type="number" min="0" step="0.1" value={form.distanceKm} onChange={e => set({ distanceKm: e.target.value })} /></label></>}
      </div>
      <footer><button className="ghost" onClick={onClose}>Anuluj</button><button className="primary" disabled={!valid || busy} onClick={() => onSave(toPayload(form))}>{busy ? 'Zapisywanie…' : item ? 'Zapisz zmiany' : 'Dodaj do planu'}</button></footer>
    </div>
  </div>;
}

export function Planner({ api, selectedDate, onError }: { api: QndHealthApi; selectedDate: string; onError: (message: string | null) => void }) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(selectedDate));
  const [items, setItems] = useState<PlanItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialogDate, setDialogDate] = useState<string | null>(null);
  const [editing, setEditing] = useState<PlanItem | null>(null);
  const weekEnd = addDays(weekStart, 6);
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);

  const load = useCallback(async () => {
    setLoading(true); onError(null);
    try { setItems((await api.listPlans(weekStart, weekEnd)).items); }
    catch (error) { onError(error instanceof Error ? error.message : 'Nie udało się wczytać planu'); }
    finally { setLoading(false); }
  }, [api, onError, weekEnd, weekStart]);

  useEffect(() => { void load(); }, [load]);

  async function save(payload: PlanWriteInput) {
    setBusy(true); onError(null);
    try {
      if (editing) await api.updatePlan(editing.id, payload);
      else await api.createPlan(payload);
      setEditing(null); setDialogDate(null); await load();
    } catch (error) { onError(error instanceof Error ? error.message : 'Nie udało się zapisać planu'); }
    finally { setBusy(false); }
  }

  async function remove(item: PlanItem) {
    if (!window.confirm(`Usunąć „${item.title}” z planu?`)) return;
    setBusy(true); onError(null);
    try { await api.deletePlan(item.id); await load(); }
    catch (error) { onError(error instanceof Error ? error.message : 'Nie udało się usunąć pozycji'); }
    finally { setBusy(false); }
  }

  return <section className="planner-view">
    <div className="planner-toolbar">
      <div><span className="eyebrow">Plan tygodnia</span><h1>{weekTitle(weekStart, weekEnd)}</h1></div>
      <div className="planner-nav"><button className="icon-button" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Poprzedni tydzień"><ChevronLeft /></button><button className="ghost" onClick={() => setWeekStart(mondayOf(selectedDate))}>Bieżący tydzień</button><button className="icon-button" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Następny tydzień"><ChevronRight /></button></div>
    </div>
    <div className="planner-summary"><CalendarDays size={18} /><span>{items.length} {items.length === 1 ? 'pozycja' : 'pozycji'} w tym tygodniu</span>{loading && <em>Odświeżanie…</em>}</div>
    <div className="week-planner">
      {days.map(date => {
        const heading = dayHeading(date);
        const dayItems = items.filter(item => item.date === date);
        return <section className="planner-day" key={date}>
          <header><div><strong>{heading.weekday}</strong><span>{heading.date}</span></div><button className="icon-button add-day" onClick={() => { setEditing(null); setDialogDate(date); }} aria-label={`Dodaj pozycję: ${heading.weekday}`}><Plus size={16} /></button></header>
          <div className="planner-items">
            {dayItems.length === 0 && <button className="planner-empty" onClick={() => { setEditing(null); setDialogDate(date); }}>Brak planu<br /><span>+ dodaj</span></button>}
            {dayItems.map(item => <article className={`planner-item ${item.status}`} key={item.id}>
              <div className="planner-item-icon">{item.kind === 'workout' ? <Dumbbell size={17} /> : <Target size={17} />}</div>
              <div className="planner-item-copy"><span>{kindLabel(item.kind)}</span><strong>{item.title}</strong><small>{itemDetail(item)}</small><em>{statusLabel(item.status)}</em></div>
              <div className="planner-item-actions"><button onClick={() => { setEditing(item); setDialogDate(item.date); }} aria-label="Edytuj"><Pencil size={14} /></button><button onClick={() => void remove(item)} disabled={busy} aria-label="Usuń"><Trash2 size={14} /></button></div>
            </article>)}
          </div>
        </section>;
      })}
    </div>
    {dialogDate && <PlanDialog initialDate={dialogDate} item={editing} busy={busy} onClose={() => { setDialogDate(null); setEditing(null); }} onSave={payload => void save(payload)} />}
  </section>;
}
