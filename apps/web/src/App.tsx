import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, BatteryCharging, Brain, CalendarDays, ChevronLeft, ChevronRight, Clock3,
  Dumbbell, Footprints, Gauge, HeartPulse, History, LayoutDashboard, Link2, LogOut,
  Moon, Plus, RefreshCw, Salad, Settings, Sparkles, TrendingUp, Utensils, Weight,
} from 'lucide-react';
import { ApiError, QndHealthApi } from './api';
import type { ActivityCandidate, PlanItem, TodayResponse } from './types';
import { dateLabel, formatDistance, formatDuration, progressPercent, weekCompletion } from './view-model';

const TOKEN_KEY = 'qnd-health.web-token';
const navItems = [
  ['today', 'Today', LayoutDashboard], ['planner', 'Planner', CalendarDays], ['history', 'History', History],
  ['progress', 'Progress', TrendingUp], ['coach', 'Coach', Brain], ['settings', 'Settings', Settings],
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
  if (item.status === 'completed') return 'Completed';
  if (item.status === 'partial') return 'In progress';
  return item.kind === 'workout' ? 'Planned' : 'On track';
}

function MetricCard({ icon: Icon, label, value, unit, sub }: { icon: typeof Weight; label: string; value: string; unit?: string; sub?: string }) {
  return <div className="metric-card">
    <span className="metric-icon"><Icon size={18} /></span>
    <div><span className="metric-label">{label}</span><strong>{value} {unit && <small>{unit}</small>}</strong><span className="metric-sub">{sub ?? 'Latest available'}</span></div>
  </div>;
}

function ProgressBar({ value, tone = 'green' }: { value: number; tone?: 'green' | 'orange' }) {
  return <div className={`progress-track ${tone}`}><span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

function Candidate({ candidate, onAttach, busy }: { candidate: ActivityCandidate; onAttach: () => void; busy: boolean }) {
  return <div className="candidate">
    <div className="garmin-mark">GARMIN</div>
    <div className="candidate-copy"><span>Suggested activity</span><strong>{candidate.activityType} · {formatDistance(candidate.distanceMeters)} · {formatDuration(candidate.durationSeconds)}</strong><small>{new Date(candidate.startedAt).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}</small></div>
    <button className="primary small" onClick={onAttach} disabled={busy}><Link2 size={15} /> Attach</button>
  </div>;
}

function ActivityPanel({ today, mutate, busyId }: { today: TodayResponse; mutate: (kind: 'progress' | 'attach' | 'detach', item: PlanItem, value?: number | string) => void; busyId: string | null }) {
  return <section className="panel activity-panel">
    <header><div><h2><Activity /> Activity</h2><p>Move today. A healthier tomorrow.</p></div><span className="section-link">Today plan</span></header>
    <div className="activity-list">
      {today.activity.items.length === 0 && <div className="empty">No activity planned for this day.</div>}
      {today.activity.items.map((item) => {
        const percent = progressPercent(item.progress.ratio);
        const candidate = item.candidates?.[0];
        return <article className="activity-row" key={item.id}>
          <div className={`status-dot ${item.status}`}><span /></div>
          <div className="activity-main">
            <div className="activity-title"><strong>{item.title}</strong><span>{item.kind === 'metric_goal' ? 'Daily goal' : item.kind === 'count_goal' ? 'Daily goal' : 'Planned workout'}</span></div>
            <div className="activity-progress">
              <div className="activity-value">
                {item.completionStrategy === 'activity_link'
                  ? <>{formatDuration(item.plannedDurationSeconds)}{item.plannedDistanceMeters ? ` / ${formatDistance(item.plannedDistanceMeters)}` : ''}</>
                  : <>{item.progress.currentValue ?? 0}{item.targetValue != null ? ` / ${item.targetValue}` : ''} {item.unit ?? ''}</>}
              </div>
              {item.targetValue != null && <><ProgressBar value={percent} /><span className="percent">{percent}%</span></>}
            </div>
            {candidate && !item.linkedActivityId && <Candidate candidate={candidate} busy={busyId === item.id} onAttach={() => mutate('attach', item, candidate.id)} />}
          </div>
          <div className="activity-actions">
            <span className={`pill ${item.status}`}>{statusLabel(item)}</span>
            {item.completionStrategy === 'count_manual' && <div className="stepper">
              <button onClick={() => mutate('progress', item, Math.max(0, (item.progress.currentValue ?? 0) - 1))} disabled={busyId === item.id}>−</button>
              <span>{item.progress.currentValue ?? 0}</span>
              <button onClick={() => mutate('progress', item, (item.progress.currentValue ?? 0) + 1)} disabled={busyId === item.id}>+</button>
            </div>}
            {item.linkedActivityId && <button className="ghost tiny" onClick={() => mutate('detach', item)} disabled={busyId === item.id}>Detach</button>}
          </div>
        </article>;
      })}
    </div>
  </section>;
}

function NutritionPanel({ today }: { today: TodayResponse }) {
  const { totals, completeness } = today.nutrition.summary;
  const macro = [
    ['Protein', totals.proteinGrams, 140, completeness.proteinGrams], ['Carbs', totals.carbsGrams, 250, completeness.carbsGrams],
    ['Fat', totals.fatGrams, 70, completeness.fatGrams], ['Fiber', totals.fiberGrams, 30, completeness.fiberGrams],
  ] as const;
  return <section className="panel nutrition-panel">
    <header><div><h2><Utensils /> Nutrition</h2><p>Fuel your day. Support your goals.</p></div><span className="section-link orange">Daily intake</span></header>
    <div className="calorie-head"><strong>{totals.caloriesKcal ?? 0} <small>kcal</small></strong><span>{today.nutrition.summary.entryCount} meals logged</span></div>
    <ProgressBar value={Math.min(100, ((totals.caloriesKcal ?? 0) / 2200) * 100)} tone="orange" />
    <div className="macros">{macro.map(([label, value, target, complete]) => <div key={label}><span>{label}</span><strong>{value == null ? '—' : `${value} g`}</strong><ProgressBar value={value == null ? 0 : Math.min(100, value / target * 100)} tone="orange" /><small>{complete ? `~ ${target} g` : 'Incomplete data'}</small></div>)}</div>
    <div className="meals-head"><h3>Today's meals</h3><button className="ghost"><Plus size={15} /> Add meal</button></div>
    <div className="meal-list">{today.nutrition.entries.length === 0 && <div className="empty">No meals logged yet.</div>}{today.nutrition.entries.map(entry => <div className="meal" key={entry.id}><time>{new Date(entry.consumedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</time><div><strong>{entry.title}</strong><span>{entry.mealType}</span></div><div className="meal-macros"><strong>{entry.caloriesKcal == null ? '—' : `${entry.caloriesKcal} kcal`}</strong><span>P {entry.proteinGrams ?? '—'} · C {entry.carbsGrams ?? '—'} · F {entry.fatGrams ?? '—'}</span></div></div>)}</div>
  </section>;
}

function BottomPanels({ today }: { today: TodayResponse }) {
  const completion = weekCompletion(today);
  const remainingByDate = Object.entries(today.remainingWeek.reduce<Record<string, typeof today.remainingWeek>>((acc, item) => { (acc[item.date] ??= []).push(item); return acc; }, {}));
  return <>
    <div className="lower-grid">
      <section className="panel compact"><header><h2><Gauge /> Week to date</h2></header><div className="week-total"><strong>{completion}%</strong><div><ProgressBar value={completion} /><span>{today.weekToDate.completed} completed · {today.weekToDate.partial} partial · {today.weekToDate.planned} planned</span></div></div></section>
      <section className="panel compact"><header><h2><CalendarDays /> Remaining this week</h2></header><div className="week-days">{remainingByDate.length === 0 ? <div className="empty">Nothing else planned this week.</div> : remainingByDate.map(([date, items]) => <div className="day-card" key={date}><span>{new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(new Date(`${date}T12:00:00`))}</span><small>{date.slice(8, 10)} Sep</small><Dumbbell size={19} /><strong>{items[0]?.title}</strong>{items.length > 1 && <em>+{items.length - 1} more</em>}</div>)}</div></section>
    </div>
    <section className="panel coach-panel"><header><div><h2><Brain /> AI Coach</h2><p>Analysis area prepared for DeepSeek integration.</p></div><Sparkles size={20} /></header><div className="coach-content"><div className="coach-brief"><TrendingUp /><div><strong>{completion >= 70 ? 'Strong start to the week' : 'Build momentum steadily'}</strong><p>You are {completion}% through the planned week so far. {today.health?.bodyBattery != null ? `Body Battery is ${today.health.bodyBattery}/100.` : 'Recovery data will appear here when Garmin daily metrics are available.'} Keep recommendations explainable and based on your own data.</p></div></div><ul><li>Review today's planned activity</li><li>Keep nutrition logging complete</li><li>Use Garmin recovery metrics before changing training load</li></ul></div></section>
  </>;
}

function TokenGate({ onSave, error }: { onSave: (token: string) => void; error?: string | null }) {
  const [token, setToken] = useState('');
  return <div className="token-page"><div className="token-card"><div className="brand-mark">Q</div><h1>QND Health</h1><p>Your private health dashboard is running. Enter a scoped web token for this browser session.</p>{error && <div className="error-box">{error}</div>}<input autoFocus type="password" placeholder="qndh_…" value={token} onChange={e => setToken(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && token.trim()) onSave(token.trim()); }} /><button className="primary" disabled={!token.trim()} onClick={() => onSave(token.trim())}>Open dashboard</button><small>The token stays in sessionStorage and is cleared when you sign out.</small></div></div>;
}

export default function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) ?? '');
  const [date, setDate] = useState(warsawToday);
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [section, setSection] = useState<Section>('today');
  const api = useMemo(() => token ? new QndHealthApi(token) : null, [token]);

  const load = useCallback(async () => {
    if (!api) return;
    setLoading(true); setError(null);
    try { setToday(await api.getToday(date)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load dashboard'); if (e instanceof ApiError && e.status === 401) setToday(null); }
    finally { setLoading(false); }
  }, [api, date]);

  useEffect(() => { void load(); }, [load]);

  async function mutate(kind: 'progress' | 'attach' | 'detach', item: PlanItem, value?: number | string) {
    if (!api) return;
    setBusyId(item.id); setError(null);
    try {
      if (kind === 'progress') await api.updateProgress(item.id, Number(value));
      else if (kind === 'attach') await api.attachActivity(item.id, String(value));
      else await api.detachActivity(item.id);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Update failed'); }
    finally { setBusyId(null); }
  }

  function saveToken(value: string) { sessionStorage.setItem(TOKEN_KEY, value); setToken(value); }
  function signOut() { sessionStorage.removeItem(TOKEN_KEY); setToken(''); setToday(null); }

  if (!token) return <TokenGate onSave={saveToken} />;
  if (!today && error) return <TokenGate onSave={saveToken} error={error} />;

  const health = today?.health;
  return <div className="app-shell">
    <aside className="sidebar"><div className="logo"><div className="logo-symbol">Q</div><div><strong>QND Health</strong><span>Move · Fuel · Progress</span></div></div><nav>{navItems.map(([id, label, Icon]) => <button key={id} className={section === id ? 'active' : ''} onClick={() => setSection(id)}><Icon size={19} /> {label}</button>)}</nav><div className="privacy"><Sparkles size={16} /><div><strong>Private. Yours.</strong><span>Self-hosted. Your data stays with you.</span></div></div></aside>
    <main>
      <div className="topline"><div><span className="eyebrow">Good morning!</span><div className="date-row"><h1>{dateLabel(date)}</h1><button className="icon-button" onClick={() => setDate(shiftDate(date, -1))}><ChevronLeft /></button><button className="icon-button" onClick={() => setDate(shiftDate(date, 1))}><ChevronRight /></button></div></div><div className="top-actions"><button className="ghost" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? 'spin' : ''} size={16} /> Sync</button><span className="connection"><i /> Garmin data</span><button className="icon-button" title="Sign out" onClick={signOut}><LogOut size={17} /></button></div></div>
      {error && <div className="error-banner">{error}</div>}
      {section !== 'today' ? <section className="placeholder panel"><div><h2>{navItems.find(([id]) => id === section)?.[1]}</h2><p>This area is scaffolded; Today Hub is the active MVP slice.</p></div></section> : !today ? <div className="loading-card">Loading QND Health…</div> : <>
        <div className="metrics-grid">
          <MetricCard icon={Weight} label="Weight" value={today.latestMeasurement ? today.latestMeasurement.weightKg.toFixed(1) : '—'} unit={today.latestMeasurement ? 'kg' : ''} sub={today.latestMeasurement?.source ?? 'No measurement'} />
          <MetricCard icon={HeartPulse} label="Resting HR" value={health?.restingHr?.toString() ?? '—'} unit={health?.restingHr ? 'bpm' : ''} sub={health?.source ?? 'No Garmin data'} />
          <MetricCard icon={Activity} label="HRV" value={health?.hrv?.toString() ?? '—'} unit={health?.hrv ? 'ms' : ''} sub={health?.source ?? 'No Garmin data'} />
          <MetricCard icon={Moon} label="Sleep (last night)" value={formatDuration(health?.sleepDurationSeconds)} sub={health?.source ?? 'No Garmin data'} />
          <MetricCard icon={BatteryCharging} label="Body Battery" value={health?.bodyBattery == null ? '—' : `${health.bodyBattery} / 100`} sub={health?.source ?? 'No Garmin data'} />
        </div>
        <div className="main-grid"><ActivityPanel today={today} mutate={mutate} busyId={busyId} /><NutritionPanel today={today} /></div>
        <BottomPanels today={today} />
      </>}
    </main>
  </div>;
}
