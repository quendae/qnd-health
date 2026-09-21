import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, BatteryCharging, Brain, CalendarDays, ChevronLeft, ChevronRight,
  Dumbbell, Gauge, HeartPulse, History, LayoutDashboard, Link2, LogOut,
  Moon, Pencil, Plus, RefreshCw, Settings, SlidersHorizontal, Sparkles, Trash2, TrendingUp, Utensils, Weight,
} from 'lucide-react';
import { ApiError, QndHealthApi } from './api';
import { CustomActivityDialog } from './CustomActivityDialog';
import { NutritionEntryDialog } from './NutritionEntryDialog';
import { HistoryView } from './HistoryView';
import { Planner } from './Planner';
import { ProgressView } from './ProgressView';
import { SettingsView } from './SettingsView';
import { WidgetSettings } from './WidgetSettings';
import type { ActivityCandidate, NutritionEntry, PlanItem, TodayResponse } from './types';
import { formatMetric } from './format-number';
import { dateLabel, formatDistance, formatDuration, greeting, progressPercent, shortDateLabel, weekCompletion } from './view-model';
import { defaultTodayWidgetLayout, normalizeTodayWidgetLayout, type TodayWidgetId, type TodayWidgetPreference } from './widget-layout';

const TOKEN_KEY = 'qnd-health.web-token';
const WIDGETS_KEY = 'qnd-health.today-widgets';
const navItems = [
  ['today', 'Dzisiaj', LayoutDashboard], ['planner', 'Plan', CalendarDays], ['history', 'Historia', History],
  ['progress', 'Postępy', TrendingUp], ['coach', 'Coach', Brain], ['settings', 'Ustawienia', Settings],
] as const;

type Section = typeof navItems[number][0];

function warsawToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function shiftDate(date: string, delta: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + delta);
  return value.toISOString().slice(0, 10);
}

function statusLabel(item: PlanItem) {
  if (item.status === 'completed') return 'Wykonane';
  if (item.status === 'partial') return 'W trakcie';
  if (item.status === 'skipped') return 'Pominięte';
  return 'Zaplanowane';
}

function sourceLabel(value: string | undefined | null) {
  if (!value) return 'Brak danych';
  return ({ garmin: 'Garmin', hermes: 'Hermes', manual: 'Ręcznie', fit: 'Plik FIT' } as Record<string, string>)[value] ?? value;
}

function MetricCard({ icon: Icon, label, value, unit, sub }: { icon: typeof Weight; label: string; value: string; unit?: string; sub?: string }) {
  return <div className="metric-card">
    <span className="metric-icon"><Icon size={18} /></span>
    <div><span className="metric-label">{label}</span><strong>{value} {unit && <small>{unit}</small>}</strong><span className="metric-sub">{sub ?? 'Najnowszy pomiar'}</span></div>
  </div>;
}

function ProgressBar({ value, tone = 'green' }: { value: number; tone?: 'green' | 'orange' }) {
  return <div className={`progress-track ${tone}`}><span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

function Candidate({ candidate, onAttach, busy }: { candidate: ActivityCandidate; onAttach: () => void; busy: boolean }) {
  return <div className="candidate">
    <div className="garmin-mark">GARMIN</div>
    <div className="candidate-copy"><span>Pasująca aktywność</span><strong>{candidate.activityType} · {formatDistance(candidate.distanceMeters)} · {formatDuration(candidate.durationSeconds)}</strong><small>{new Date(candidate.startedAt).toLocaleString('pl-PL', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}</small></div>
    <button className="primary small" onClick={onAttach} disabled={busy}><Link2 size={15} /> Połącz</button>
  </div>;
}

function ActivityPanel({ today, mutate, busyId, onAddActivity }: {
  today: TodayResponse;
  mutate: (kind: 'progress' | 'attach' | 'detach', item: PlanItem, value?: number | string) => void;
  busyId: string | null;
  onAddActivity: () => void;
}) {
  return <section className="panel activity-panel widget-card">
    <header><div><h2><Activity /> Aktywność</h2><p>Plan na dziś i postęp wykonania.</p></div><div className="panel-header-actions"><span className="section-link">Dzisiaj</span><button className="ghost compact-action" onClick={onAddActivity}><Plus size={15} /> Dodaj aktywność</button></div></header>
    <div className="activity-list">
      {today.activity.items.length === 0 && <div className="empty">Brak zaplanowanej aktywności na ten dzień.</div>}
      {today.activity.items.map((item) => {
        const percent = progressPercent(item.progress.ratio);
        const candidate = item.candidates?.[0];
        return <article className="activity-row" key={item.id}>
          <div className={`status-dot ${item.status}`}><span /></div>
          <div className="activity-main">
            <div className="activity-title"><strong>{item.title}</strong><span>{item.kind === 'workout' ? 'Aktywność / trening' : 'Cel dzienny'}</span></div>
            <div className="activity-progress">
              <div className="activity-value">{item.completionStrategy === 'activity_link'
                ? <>{formatDuration(item.plannedDurationSeconds)}{item.plannedDistanceMeters ? ` / ${formatDistance(item.plannedDistanceMeters)}` : ''}</>
                : item.completionStrategy === 'manual'
                  ? <>{item.status === 'completed' ? 'Wykonane' : 'Do wykonania'}</>
                  : <>{item.progress.currentValue ?? 0}{item.targetValue != null ? ` / ${item.targetValue}` : ''} {item.unit ?? ''}</>}</div>
              {item.targetValue != null && <><ProgressBar value={percent} /><span className="percent">{percent}%</span></>}
            </div>
            {candidate && !item.linkedActivityId && <Candidate candidate={candidate} busy={busyId === item.id} onAttach={() => mutate('attach', item, candidate.id)} />}
          </div>
          <div className="activity-actions">
            <span className={`pill ${item.status}`}>{statusLabel(item)}</span>
            {item.completionStrategy === 'count_manual' && <div className="stepper"><button onClick={() => mutate('progress', item, Math.max(0, (item.progress.currentValue ?? 0) - 1))} disabled={busyId === item.id}>−</button><span>{item.progress.currentValue ?? 0}</span><button onClick={() => mutate('progress', item, (item.progress.currentValue ?? 0) + 1)} disabled={busyId === item.id}>+</button></div>}
            {item.completionStrategy === 'manual' && <button className="ghost tiny" onClick={() => mutate('progress', item, item.status === 'completed' ? 0 : 1)} disabled={busyId === item.id}>{item.status === 'completed' ? 'Cofnij' : 'Wykonane'}</button>}
            {item.linkedActivityId && <button className="ghost tiny" onClick={() => mutate('detach', item)} disabled={busyId === item.id}>Odłącz</button>}
          </div>
        </article>;
      })}
    </div>
  </section>;
}

function NutritionPanel({ today, onEdit, onDelete, deletingId }: {
  today: TodayResponse;
  onEdit: (entry: NutritionEntry) => void;
  onDelete: (entry: NutritionEntry) => void;
  deletingId: string | null;
}) {
  const { totals } = today.nutrition.summary;
  const macro = [
    ['Białko', totals.proteinGrams], ['Węglowodany', totals.carbsGrams],
    ['Tłuszcz', totals.fatGrams], ['Błonnik', totals.fiberGrams],
  ] as const;
  return <section className="panel nutrition-panel widget-card">
    <header><div><h2><Utensils /> Odżywianie</h2><p>Podsumowanie tego, co zostało zapisane.</p></div><span className="section-link orange">Dzienny bilans</span></header>
    <div className="calorie-head"><strong>{formatMetric(totals.caloriesKcal, 0)} <small>{totals.caloriesKcal == null ? '' : 'kcal'}</small></strong><span>{today.nutrition.summary.entryCount} {today.nutrition.summary.entryCount === 1 ? 'wpis' : 'wpisów'}</span></div>
    <div className="macros">{macro.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value == null ? '—' : `${formatMetric(value)} g`}</strong></div>)}</div>
    <div className="meals-head"><h3>Dzisiejsze wpisy</h3></div>
    <div className="meal-list">
      {today.nutrition.entries.length === 0 && <div className="empty">Nie zapisano jeszcze żadnego jedzenia.</div>}
      {today.nutrition.entries.map(entry => <div className="meal nutrition-entry" key={entry.id}>
        <div className="meal-copy"><strong>{entry.title}</strong>{entry.quantityText && <span>{entry.quantityText}</span>}</div>
        <div className="meal-macros"><strong>{entry.caloriesKcal == null ? '—' : `${formatMetric(entry.caloriesKcal, 0)} kcal`}</strong><span>B {formatMetric(entry.proteinGrams)} · W {formatMetric(entry.carbsGrams)} · T {formatMetric(entry.fatGrams)}</span></div>
        <div className="nutrition-entry-actions">
          <button className="icon-button" onClick={() => onEdit(entry)} aria-label={`Edytuj ${entry.title}`}><Pencil size={15} /></button>
          <button className="icon-button danger" onClick={() => onDelete(entry)} disabled={deletingId === entry.id} aria-label={`Usuń ${entry.title}`}><Trash2 size={15} /></button>
        </div>
      </div>)}
    </div>
  </section>;
}

function WeekProgress({ today }: { today: TodayResponse }) {
  const completion = weekCompletion(today);
  return <section className="panel compact widget-card"><header><h2><Gauge /> Postęp tygodnia</h2></header><div className="week-total"><strong>{completion}%</strong><div><ProgressBar value={completion} /><span>{today.weekToDate.completed} wykonane · {today.weekToDate.partial} w trakcie · {today.weekToDate.planned} zaplanowane</span></div></div></section>;
}

function RemainingWeek({ today }: { today: TodayResponse }) {
  const remainingByDate = Object.entries(today.remainingWeek.reduce<Record<string, typeof today.remainingWeek>>((acc, item) => { (acc[item.date] ??= []).push(item); return acc; }, {}));
  return <section className="panel compact widget-card"><header><h2><CalendarDays /> Pozostało w tym tygodniu</h2></header><div className="week-days">{remainingByDate.length === 0 ? <div className="empty">Na ten tydzień nie ma już więcej planów.</div> : remainingByDate.map(([date, items]) => <div className="day-card" key={date}><span>{shortDateLabel(date)}</span><Dumbbell size={19} /><strong>{items[0]?.title}</strong>{items.length > 1 && <em>+{items.length - 1} więcej</em>}</div>)}</div></section>;
}

function CoachPanel({ today }: { today: TodayResponse }) {
  const completion = weekCompletion(today);
  return <section className="panel coach-panel widget-card widget-wide"><header><div><h2><Brain /> AI Coach</h2><p>Miejsce przygotowane pod integrację DeepSeek.</p></div><Sparkles size={20} /></header><div className="coach-content"><div className="coach-brief"><TrendingUp /><div><strong>{completion >= 70 ? 'Dobry rytm tygodnia' : 'Buduj regularność krok po kroku'}</strong><p>Realizacja planu tygodnia: {completion}%. {today.health?.bodyBattery != null ? `Body Battery: ${today.health.bodyBattery}/100.` : 'Dane regeneracji pojawią się po synchronizacji z Garminem.'}</p></div></div><ul><li>Sprawdź dzisiejszy plan aktywności</li><li>Uzupełniaj posiłki możliwie kompletnie</li><li>Zmiany obciążenia oprzyj o dane regeneracji</li></ul></div></section>;
}

function HealthMetrics({ today }: { today: TodayResponse }) {
  const health = today.health;
  return <div className="metrics-grid widget-card widget-wide">
    <MetricCard icon={Weight} label="Masa ciała" value={today.latestMeasurement ? today.latestMeasurement.weightKg.toFixed(1) : '—'} unit={today.latestMeasurement ? 'kg' : ''} sub={sourceLabel(today.latestMeasurement?.source)} />
    <MetricCard icon={HeartPulse} label="Tętno spoczynkowe" value={health?.restingHr?.toString() ?? '—'} unit={health?.restingHr ? 'bpm' : ''} sub={sourceLabel(health?.source)} />
    <MetricCard icon={Activity} label="HRV" value={health?.hrv?.toString() ?? '—'} unit={health?.hrv ? 'ms' : ''} sub={sourceLabel(health?.source)} />
    <MetricCard icon={Moon} label="Sen" value={formatDuration(health?.sleepDurationSeconds)} sub={health ? 'Ostatnia noc' : 'Brak danych Garmin'} />
    <MetricCard icon={BatteryCharging} label="Body Battery" value={health?.bodyBattery?.toString() ?? '—'} unit={health?.bodyBattery != null ? '/100' : ''} sub={sourceLabel(health?.source)} />
  </div>;
}

function TokenGate({ onSave, error }: { onSave: (token: string) => void; error?: string | null }) {
  const [token, setToken] = useState('');
  return <div className="token-page"><div className="token-card"><div className="brand-mark">Q</div><h1>QND Health</h1><p>Twoja prywatna aplikacja zdrowotna działa. Wprowadź token web dla tej sesji przeglądarki.</p>{error && <div className="error-box">{error}</div>}<input autoFocus type="password" placeholder="qndh_…" value={token} onChange={e => setToken(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && token.trim()) onSave(token.trim()); }} /><button className="primary" disabled={!token.trim()} onClick={() => onSave(token.trim())}>Otwórz aplikację</button><small>Token jest przechowywany tylko w sessionStorage i znika po wylogowaniu.</small></div></div>;
}

function loadWidgetLayout(): TodayWidgetPreference[] {
  try { return normalizeTodayWidgetLayout(JSON.parse(localStorage.getItem(WIDGETS_KEY) ?? 'null')); }
  catch { return defaultTodayWidgetLayout.map(widget => ({ ...widget })); }
}

export default function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) ?? '');
  const [date, setDate] = useState(warsawToday);
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [section, setSection] = useState<Section>('today');
  const [widgetLayout, setWidgetLayout] = useState<TodayWidgetPreference[]>(loadWidgetLayout);
  const [showWidgetSettings, setShowWidgetSettings] = useState(false);
  const [showCustomActivity, setShowCustomActivity] = useState(false);
  const [editingNutrition, setEditingNutrition] = useState<NutritionEntry | null>(null);
  const [deletingNutritionId, setDeletingNutritionId] = useState<string | null>(null);
  const api = useMemo(() => token ? new QndHealthApi(token) : null, [token]);

  const load = useCallback(async () => {
    if (!api) return;
    setLoading(true); setError(null);
    try { setToday(await api.getToday(date)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Nie udało się wczytać danych'); if (e instanceof ApiError && e.status === 401) setToday(null); }
    finally { setLoading(false); }
  }, [api, date]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { localStorage.setItem(WIDGETS_KEY, JSON.stringify(widgetLayout)); }, [widgetLayout]);

  async function mutate(kind: 'progress' | 'attach' | 'detach', item: PlanItem, value?: number | string) {
    if (!api) return;
    setBusyId(item.id); setError(null);
    try {
      if (kind === 'progress') await api.updateProgress(item.id, Number(value));
      else if (kind === 'attach') await api.attachActivity(item.id, String(value));
      else await api.detachActivity(item.id);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Aktualizacja nie powiodła się'); }
    finally { setBusyId(null); }
  }

  async function deleteNutrition(entry: NutritionEntry) {
    if (!api || deletingNutritionId) return;
    if (!window.confirm(`Usunąć wpis „${entry.title}”?`)) return;
    setDeletingNutritionId(entry.id); setError(null);
    try {
      await api.deleteNutrition(entry.id);
      if (editingNutrition?.id === entry.id) setEditingNutrition(null);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Nie udało się usunąć wpisu.'); }
    finally { setDeletingNutritionId(null); }
  }

  function saveToken(value: string) { sessionStorage.setItem(TOKEN_KEY, value); setToken(value); }
  function signOut() { sessionStorage.removeItem(TOKEN_KEY); setToken(''); setToday(null); }
  function setWidgets(next: TodayWidgetPreference[]) { setWidgetLayout(normalizeTodayWidgetLayout(next)); }

  if (!token) return <TokenGate onSave={saveToken} />;
  if (!today && error) return <TokenGate onSave={saveToken} error={error} />;

  function renderWidget(id: TodayWidgetId) {
    if (!today) return null;
    if (id === 'health_metrics') return <HealthMetrics today={today} />;
    if (id === 'activity') return <ActivityPanel today={today} mutate={mutate} busyId={busyId} onAddActivity={() => setShowCustomActivity(true)} />;
    if (id === 'nutrition') return <NutritionPanel today={today} onEdit={setEditingNutrition} onDelete={(entry) => void deleteNutrition(entry)} deletingId={deletingNutritionId} />;
    if (id === 'week_progress') return <WeekProgress today={today} />;
    if (id === 'remaining_week') return <RemainingWeek today={today} />;
    return <CoachPanel today={today} />;
  }

  let content = null;
  if (section === 'planner' && api) content = <Planner api={api} selectedDate={date} onError={setError} />;
  else if (section === 'history' && api) content = <HistoryView api={api} selectedDate={date} onError={setError} />;
  else if (section === 'progress' && api) content = <ProgressView api={api} selectedDate={date} onError={setError} />;
  else if (section === 'settings') content = <SettingsView />;
  else if (section === 'coach') content = <section className="placeholder panel"><div><h2>Coach</h2><p>Ten obszar podłączymy do DeepSeek po zebraniu wystarczającej historii danych.</p></div></section>;
  else if (!today) content = <div className="loading-card">Wczytywanie QND Health…</div>;
  else content = <div className="today-widgets">{widgetLayout.filter(widget => widget.visible).map(widget => <div className={`widget-slot widget-${widget.id}`} key={widget.id}>{renderWidget(widget.id)}</div>)}</div>;

  return <div className="app-shell">
    <aside className="sidebar"><div className="logo"><div className="logo-symbol">Q</div><div><strong>QND Health</strong><span>Ruch · Odżywianie · Postęp</span></div></div><nav>{navItems.map(([id, label, Icon]) => <button key={id} className={section === id ? 'active' : ''} onClick={() => setSection(id)}><Icon size={19} /> {label}</button>)}</nav><div className="privacy"><Sparkles size={16} /><div><strong>Prywatne. Twoje.</strong><span>Self-hosted. Dane zostają u Ciebie.</span></div></div></aside>
    <main>
      {section === 'today' && <div className="topline"><div><span className="eyebrow">{greeting()}</span><div className="date-row"><h1>{dateLabel(date)}</h1><button className="icon-button" onClick={() => setDate(shiftDate(date, -1))} aria-label="Poprzedni dzień"><ChevronLeft /></button><button className="icon-button" onClick={() => setDate(shiftDate(date, 1))} aria-label="Następny dzień"><ChevronRight /></button></div></div><div className="top-actions"><button className="ghost" onClick={() => setShowWidgetSettings(true)}><SlidersHorizontal size={16} /> Dostosuj widok</button><button className="ghost" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? 'spin' : ''} size={16} /> Synchronizuj</button><span className={`connection ${today?.health ? 'connected' : ''}`}><i /> {today?.health ? 'Dane Garmin' : 'Brak danych Garmin'}</span><button className="icon-button" title="Wyloguj" onClick={signOut}><LogOut size={17} /></button></div></div>}
      {error && <div className="error-banner">{error}</div>}
      {content}
    </main>
    {showWidgetSettings && <WidgetSettings layout={widgetLayout} onChange={setWidgets} onClose={() => setShowWidgetSettings(false)} />}
    {showCustomActivity && api && <CustomActivityDialog api={api} date={date} onClose={() => setShowCustomActivity(false)} onCreated={load} />}
    {editingNutrition && api && <NutritionEntryDialog api={api} entry={editingNutrition} onClose={() => setEditingNutrition(null)} onSaved={load} />}
  </div>;
}
