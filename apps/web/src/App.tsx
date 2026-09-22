import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, Brain, Building2, CalendarDays, ChevronLeft, ChevronRight, Flame,
  Dumbbell, Gauge, HeartPulse, History, LayoutDashboard, Link2, LogOut,
  Moon, Pencil, Plus, RefreshCw, Settings, SlidersHorizontal, Sparkles, Timer, Trash2, TrendingUp, Utensils, Weight,
} from 'lucide-react';
import { ApiError, QndHealthApi } from './api';
import { CustomActivityDialog } from './CustomActivityDialog';
import { NutritionEntryDialog } from './NutritionEntryDialog';
import { CoachView } from './CoachView';
import { HistoryView } from './HistoryView';
import { Planner } from './Planner';
import { ProgressView } from './ProgressView';
import { SettingsView } from './SettingsView';
import { WidgetSettings } from './WidgetSettings';
import type { ActivityCandidate, NutritionEntry, PlanItem, TodayResponse, WorkoutStructure } from './types';
import { activityLabel } from './activity-catalog';
import { formatMetric } from './format-number';
import { dateLabel, formatDistance, formatDuration, greeting, nutritionMacroCards, nutritionMealListClass, progressPercent, shortDateLabel, weekCompletion } from './view-model';
import { defaultTodayWidgetLayout, normalizeTodayWidgetLayout, type TodayWidgetId, type TodayWidgetPreference } from './widget-layout';

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

function stepGoalLabel(source: TodayResponse['activity']['steps']['goalSource']) {
  if (source === 'garmin') return 'Cel Garmin';
  if (source === 'profile') return 'Cel użytkownika';
  return 'Cel domyślny';
}

function workoutStructureText(structure: WorkoutStructure | null | undefined): string | null {
  if (!structure) return null;
  const bits: string[] = [];
  if (structure.sets) bits.push(`${structure.sets} serie`);
  if (structure.repsPerSet) bits.push(`${structure.repsPerSet} powt./serię`);
  if (structure.secondsPerSet) bits.push(`${structure.secondsPerSet} s/serię`);
  if (structure.restSeconds != null) bits.push(`przerwa ${structure.restSeconds} s`);
  return bits.length ? bits.join(' · ') : null;
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
    <div className="candidate-copy"><span>Pasująca aktywność</span><strong>{activityLabel(candidate.activityType)} · {formatDistance(candidate.distanceMeters)} · {formatDuration(candidate.durationSeconds)}</strong><small>{new Date(candidate.startedAt).toLocaleString('pl-PL', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}</small></div>
    <button className="primary small" onClick={onAttach} disabled={busy}><Link2 size={15} /> Połącz</button>
  </div>;
}

function ActivityPanel({ today, mutate, busyId, onAddActivity, onDelete }: {
  today: TodayResponse;
  mutate: (kind: 'progress' | 'attach' | 'detach', item: PlanItem, value?: number | string) => void;
  busyId: string | null;
  onAddActivity: () => void;
  onDelete: (item: PlanItem) => void;
}) {
  const steps = today.activity.steps;
  const stepPercent = steps.target > 0 ? Math.min(100, Math.round((steps.current / steps.target) * 100)) : 0;
  const visibleItems = today.activity.items.filter(item => item.metricKey !== 'steps');
  return <section className="panel activity-panel widget-card">
    <header><div><h2><Activity /> Aktywność</h2><p>Codzienny ruch, aktywności i plan.</p></div><div className="panel-header-actions"><span className="section-link">Dzisiaj</span><button className="ghost compact-action" onClick={onAddActivity}><Plus size={15} /> Dodaj aktywność</button></div></header>
    <div className="steps-row">
      <div className="status-dot metric_auto"><span /></div>
      <div className="steps-main">
        <div className="activity-title"><strong>Kroki</strong><span>{stepGoalLabel(steps.goalSource)}</span></div>
        <div className="activity-progress"><div className="activity-value">{formatMetric(steps.current, 0)} / {formatMetric(steps.target, 0)} kroków</div><ProgressBar value={stepPercent} /><span className="percent">{stepPercent}%</span></div>
      </div>
    </div>
    <div className="activity-list">
      {visibleItems.length === 0 && <div className="empty">Brak dodanych lub zaplanowanych aktywności na ten dzień.</div>}
      {visibleItems.map((item) => {
        const percent = progressPercent(item.progress.ratio);
        const candidate = item.candidates?.[0];
        const structure = workoutStructureText(item.workoutStructure);
        return <article className="activity-row" key={item.id}>
          <div className={`status-dot ${item.status}`}><span /></div>
          <div className="activity-main">
            <div className="activity-title"><strong>{item.title}</strong><span>{item.kind === 'workout' ? `${activityLabel(item.activityType ?? 'other')}${structure ? ` · ${structure}` : ''}` : 'Cel dzienny'}</span></div>
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
            {(item.completionStrategy === 'manual' || item.completionStrategy === 'activity_link') && !item.linkedActivityId && <button className="ghost tiny" onClick={() => mutate('progress', item, item.status === 'completed' ? 0 : 1)} disabled={busyId === item.id}>{item.status === 'completed' ? 'Cofnij' : 'Wykonane'}</button>}
            {item.linkedActivityId && <button className="ghost tiny" onClick={() => mutate('detach', item)} disabled={busyId === item.id}>Odłącz</button>}
            <button className="icon-button danger" onClick={() => onDelete(item)} disabled={busyId === item.id} aria-label={`Usuń ${item.title}`} title="Usuń aktywność"><Trash2 size={14} /></button>
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
  const goalKcal = today.nutrition.goalKcal;
  const caloriePercent = totals.caloriesKcal != null && goalKcal != null && goalKcal > 0
    ? Math.round((totals.caloriesKcal / goalKcal) * 100)
    : null;
  const calorieDelta = totals.caloriesKcal != null && goalKcal != null ? goalKcal - totals.caloriesKcal : null;
  const macro = nutritionMacroCards(totals, {
    proteinGrams: today.nutrition.goalProteinGrams,
    carbsGrams: today.nutrition.goalCarbsGrams,
    fatGrams: today.nutrition.goalFatGrams,
    fiberGrams: today.nutrition.goalFiberGrams,
  });
  return <section className="panel nutrition-panel widget-card">
    <header><div><h2><Utensils /> Odżywianie</h2><p>Podsumowanie tego, co zostało zapisane.</p></div><span className="section-link orange">Dzienny bilans</span></header>
    <div className="calorie-head calorie-goal-head">
      <div className="calorie-goal-copy">
        <strong>{formatMetric(totals.caloriesKcal, 0)}{goalKcal != null ? ` / ${formatMetric(goalKcal, 0)}` : ''} <small>{totals.caloriesKcal == null && goalKcal == null ? '' : 'kcal'}</small></strong>
        {caloriePercent != null && <div className="calorie-goal-progress"><ProgressBar tone="orange" value={caloriePercent} /><span>{caloriePercent}% celu · {calorieDelta! >= 0 ? `${formatMetric(calorieDelta, 0)} kcal zostało` : `${formatMetric(Math.abs(calorieDelta!), 0)} kcal ponad cel`}</span></div>}
        {goalKcal == null && <small className="calorie-goal-empty">Cel kcal możesz ustawić w Ustawieniach lub przez Coacha.</small>}
      </div>
      <span>{today.nutrition.summary.entryCount} {today.nutrition.summary.entryCount === 1 ? 'wpis' : 'wpisów'}</span>
    </div>
    <div className="macros">{macro.map(item => <div className={`macro-card ${item.goal != null ? 'with-goal' : ''}`} key={item.label}>
      <span>{item.label}</span>
      <strong>{item.value == null ? '—' : item.goal != null ? `${formatMetric(item.value)} / ${formatMetric(item.goal, 0)} g` : `${formatMetric(item.value)} g`}</strong>
      {item.goal != null && (item.percent == null ? <small>Brak danych o makro</small> : <><ProgressBar value={item.percent} /><small>{item.percent}% celu</small></>)}
    </div>)}</div>
    <div className="meals-head"><h3>Dzisiejsze wpisy</h3></div>
    <div className={nutritionMealListClass(today.nutrition.entries.length)}>
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
  const tomorrow = shiftDate(today.date, 1);
  const tomorrowItems = today.remainingWeek.filter(item => item.date === tomorrow);
  return <section className="panel compact widget-card"><header><h2><CalendarDays /> Aktywności jutro</h2></header><div className="week-days">{tomorrowItems.length === 0 ? <div className="empty">Brak zaplanowanych aktywności na jutro.</div> : tomorrowItems.map(item => <div className="day-card" key={item.id}><span>{shortDateLabel(tomorrow)}</span><Dumbbell size={19} /><strong>{item.title}</strong>{item.workoutStructure && <em>{workoutStructureText(item.workoutStructure)}</em>}</div>)}</div></section>;
}

function CoachPanel({ today }: { today: TodayResponse }) {
  const completion = weekCompletion(today);
  return <section className="panel coach-panel widget-card widget-wide"><header><div><h2><Brain /> AI Coach</h2><p>Coach ma dostęp do bieżących danych i wersjonowanych celów.</p></div><Sparkles size={20} /></header><div className="coach-content"><div className="coach-brief"><TrendingUp /><div><strong>{completion >= 70 ? 'Dobry rytm tygodnia' : 'Buduj regularność krok po kroku'}</strong><p>Realizacja planu tygodnia: {completion}%. {today.health?.bodyBattery != null ? `Body Battery: ${today.health.bodyBattery}/100.` : 'Dane regeneracji pojawią się po synchronizacji z Garminem.'}</p></div></div><ul><li>Sprawdź dzisiejszy plan aktywności</li><li>Uzupełniaj posiłki możliwie kompletnie</li><li>Zmiany obciążenia oprzyj o dane regeneracji</li></ul></div></section>;
}

function HealthMetrics({ today }: { today: TodayResponse }) {
  const health = today.health;
  const energy = today.energy;
  return <div className="metrics-grid widget-card widget-wide">
    <MetricCard icon={Weight} label="Masa ciała" value={today.latestMeasurement ? today.latestMeasurement.weightKg.toFixed(1) : '—'} unit={today.latestMeasurement ? 'kg' : ''} sub={sourceLabel(today.latestMeasurement?.source)} />
    <MetricCard icon={HeartPulse} label="Tętno spoczynkowe" value={health?.restingHr?.toString() ?? '—'} unit={health?.restingHr ? 'bpm' : ''} sub={health ? 'Garmin · wartość dzienna' : 'Brak danych Garmin'} />
    <MetricCard icon={Activity} label="HRV" value={health?.hrv?.toString() ?? '—'} unit={health?.hrv ? 'ms' : ''} sub={sourceLabel(health?.source)} />
    <MetricCard icon={Building2} label="Piętra" value={health?.floorsAscended == null ? '—' : formatMetric(health.floorsAscended, 0)} sub={health ? 'Garmin · wejścia' : 'Brak danych Garmin'} />
    <MetricCard icon={Timer} label="Aktywne minuty" value={health?.intensityMinutes == null ? '—' : formatMetric(health.intensityMinutes, 0)} unit={health?.intensityMinutes != null ? 'min' : ''} sub={health ? 'Garmin · dzisiaj' : 'Brak danych Garmin'} />
    <MetricCard icon={Moon} label="Sen" value={formatDuration(health?.sleepDurationSeconds)} sub={health ? 'Ostatnia noc' : 'Brak danych Garmin'} />
    <MetricCard icon={Flame} label="TDEE" value={energy ? formatMetric(energy.tdeeKcal, 0) : '—'} unit={energy ? 'kcal' : ''} sub={energy ? `Szacowane · aktywność ×${formatMetric(energy.activityFactor, 2)}` : 'Uzupełnij profil w Ustawieniach'} />
  </div>;
}

function LoginGate({ onLogin, error, busy }: { onLogin: (username: string, password: string) => void; error?: string | null; busy: boolean }) {
  const [username, setUsername] = useState('quendae');
  const [password, setPassword] = useState('');
  function submit() {
    if (!username.trim() || !password || busy) return;
    onLogin(username.trim(), password);
  }
  return <div className="token-page"><div className="token-card login-card"><div className="brand-mark">Q</div><h1>QND Health</h1><p>Zaloguj się do prywatnej aplikacji zdrowotnej.</p>{error && <div className="error-box">{error}</div>}<label><span>Użytkownik</span><input autoFocus autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit(); }} /></label><label><span>Hasło</span><input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit(); }} /></label><button className="primary" disabled={!username.trim() || !password || busy} onClick={submit}>{busy ? 'Logowanie…' : 'Zaloguj się'}</button><small>Sesja jest przechowywana w bezpiecznym cookie HttpOnly. Tokeny API pozostają wyłącznie dla integracji.</small></div></div>;
}

function loadWidgetLayout(): TodayWidgetPreference[] {
  try { return normalizeTodayWidgetLayout(JSON.parse(localStorage.getItem(WIDGETS_KEY) ?? 'null')); }
  catch { return defaultTodayWidgetLayout.map(widget => ({ ...widget })); }
}

export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
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
  const api = useMemo(() => new QndHealthApi(), []);

  useEffect(() => {
    let active = true;
    void api.getSession()
      .then(() => { if (active) { setAuthenticated(true); setAuthError(null); } })
      .catch(error => { if (active) { setAuthenticated(false); if (error instanceof ApiError && error.status !== 401) setAuthError(error.message); } });
    return () => { active = false; };
  }, [api]);

  const load = useCallback(async () => {
    if (!authenticated) return;
    setLoading(true); setError(null);
    try { setToday(await api.getToday(date)); }
    catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się wczytać danych');
      if (e instanceof ApiError && e.status === 401) { setAuthenticated(false); setToday(null); }
    }
    finally { setLoading(false); }
  }, [api, authenticated, date]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { localStorage.setItem(WIDGETS_KEY, JSON.stringify(widgetLayout)); }, [widgetLayout]);

  async function login(username: string, password: string) {
    if (authBusy) return;
    setAuthBusy(true); setAuthError(null);
    try { await api.login(username, password); setAuthenticated(true); }
    catch (e) { setAuthError(e instanceof Error ? e.message : 'Logowanie nie powiodło się.'); }
    finally { setAuthBusy(false); }
  }

  async function signOut() {
    try { await api.logout(); } catch { /* local state still signs out */ }
    setAuthenticated(false); setToday(null); setError(null);
  }

  async function mutate(kind: 'progress' | 'attach' | 'detach', item: PlanItem, value?: number | string) {
    setBusyId(item.id); setError(null);
    try {
      if (kind === 'progress') await api.updateProgress(item.id, Number(value));
      else if (kind === 'attach') await api.attachActivity(item.id, String(value));
      else await api.detachActivity(item.id);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Aktualizacja nie powiodła się'); }
    finally { setBusyId(null); }
  }

  async function deleteActivityPlan(item: PlanItem) {
    if (busyId) return;
    if (!window.confirm(`Usunąć aktywność „${item.title}”?`)) return;
    setBusyId(item.id); setError(null);
    try { await api.deletePlan(item.id); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Nie udało się usunąć aktywności.'); }
    finally { setBusyId(null); }
  }

  async function deleteNutrition(entry: NutritionEntry) {
    if (deletingNutritionId) return;
    if (!window.confirm(`Usunąć wpis „${entry.title}”?`)) return;
    setDeletingNutritionId(entry.id); setError(null);
    try {
      await api.deleteNutrition(entry.id);
      if (editingNutrition?.id === entry.id) setEditingNutrition(null);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Nie udało się usunąć wpisu.'); }
    finally { setDeletingNutritionId(null); }
  }

  function setWidgets(next: TodayWidgetPreference[]) { setWidgetLayout(normalizeTodayWidgetLayout(next)); }

  if (authenticated === null) return <div className="loading-card auth-loading">Sprawdzanie sesji…</div>;
  if (!authenticated) return <LoginGate onLogin={(username, password) => void login(username, password)} error={authError} busy={authBusy} />;

  function renderWidget(id: TodayWidgetId) {
    if (!today) return null;
    if (id === 'health_metrics') return <HealthMetrics today={today} />;
    if (id === 'activity') return <ActivityPanel today={today} mutate={mutate} busyId={busyId} onAddActivity={() => setShowCustomActivity(true)} onDelete={(item) => void deleteActivityPlan(item)} />;
    if (id === 'nutrition') return <NutritionPanel today={today} onEdit={setEditingNutrition} onDelete={(entry) => void deleteNutrition(entry)} deletingId={deletingNutritionId} />;
    if (id === 'week_progress') return <WeekProgress today={today} />;
    if (id === 'remaining_week') return <RemainingWeek today={today} />;
    return <CoachPanel today={today} />;
  }

  let content = null;
  if (section === 'planner') content = <Planner api={api} selectedDate={date} onError={setError} />;
  else if (section === 'history') content = <HistoryView api={api} selectedDate={date} onError={setError} />;
  else if (section === 'progress') content = <ProgressView api={api} selectedDate={date} onError={setError} />;
  else if (section === 'settings') content = <SettingsView api={api} energy={today?.energy ?? null} onSaved={load} onError={setError} />;
  else if (section === 'coach') content = <CoachView api={api} onError={setError} />;
  else if (!today) content = <div className="loading-card">Wczytywanie QND Health…</div>;
  else content = <div className="today-widgets">{widgetLayout.filter(widget => widget.visible).map(widget => <div className={`widget-slot widget-${widget.id}`} key={widget.id}>{renderWidget(widget.id)}</div>)}</div>;

  return <div className="app-shell">
    <aside className="sidebar"><div className="logo"><div className="logo-symbol">Q</div><div><strong>QND Health</strong><span>Ruch · Odżywianie · Postęp</span></div></div><nav>{navItems.map(([id, label, Icon]) => <button key={id} className={section === id ? 'active' : ''} onClick={() => setSection(id)}><Icon size={19} /> {label}</button>)}</nav><div className="privacy"><Sparkles size={16} /><div><strong>Prywatne. Twoje.</strong><span>Self-hosted. Dane zostają u Ciebie.</span></div></div></aside>
    <main>
      {section === 'today' && <div className="topline"><div><span className="eyebrow">{greeting()}</span><div className="date-row"><h1>{dateLabel(date)}</h1><button className="icon-button" onClick={() => setDate(shiftDate(date, -1))} aria-label="Poprzedni dzień"><ChevronLeft /></button><button className="icon-button" onClick={() => setDate(shiftDate(date, 1))} aria-label="Następny dzień"><ChevronRight /></button></div></div><div className="top-actions"><button className="ghost" onClick={() => setShowWidgetSettings(true)}><SlidersHorizontal size={16} /> Dostosuj widok</button><button className="ghost" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? 'spin' : ''} size={16} /> Synchronizuj</button><span className={`connection ${today?.health ? 'connected' : ''}`}><i /> {today?.health ? 'Dane Garmin' : 'Brak danych Garmin'}</span><button className="icon-button" title="Wyloguj" onClick={() => void signOut()}><LogOut size={17} /></button></div></div>}
      {error && <div className="error-banner">{error}</div>}
      {content}
    </main>
    {showWidgetSettings && <WidgetSettings layout={widgetLayout} onChange={setWidgets} onClose={() => setShowWidgetSettings(false)} />}
    {showCustomActivity && <CustomActivityDialog api={api} date={date} onClose={() => setShowCustomActivity(false)} onCreated={load} />}
    {editingNutrition && <NutritionEntryDialog api={api} entry={editingNutrition} onClose={() => setEditingNutrition(null)} onSaved={load} />}
  </div>;
}
