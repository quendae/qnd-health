import { useEffect, useState } from 'react';
import { Activity, CalendarDays, CheckCircle2, Footprints, HeartPulse, Moon, Scale } from 'lucide-react';
import type { QndHealthApi } from './api';
import type { HistoryResponse } from './types';
import { dateLabel, formatDistance, formatDuration } from './view-model';
import { rangeForDays } from './insights';

const periods = [7, 30, 90] as const;

function activityLabel(value: string) {
  return ({ walking: 'Spacer', running: 'Bieg', cycling: 'Rower', strength_training: 'Trening siłowy' } as Record<string, string>)[value] ?? value;
}

function statusLabel(value: string) {
  return ({ completed: 'Wykonane', partial: 'Częściowo', planned: 'Zaplanowane', skipped: 'Pominięte', moved: 'Przeniesione', replaced: 'Zastąpione' } as Record<string, string>)[value] ?? value;
}

export function HistoryView({ api, selectedDate, onError }: { api: QndHealthApi; selectedDate: string; onError: (message: string | null) => void }) {
  const [period, setPeriod] = useState<(typeof periods)[number]>(30);
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    const range = rangeForDays(selectedDate, period);
    setLoading(true);
    onError(null);
    void api.getHistory(range.from, range.to)
      .then(result => { if (alive) setData(result); })
      .catch(error => { if (alive) onError(error instanceof Error ? error.message : 'Nie udało się wczytać historii'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [api, selectedDate, period, onError]);

  return <section className="insight-view">
    <div className="insight-toolbar">
      <div><span className="eyebrow">Dziennik zdrowia i ruchu</span><h1>Historia</h1></div>
      <div className="period-switch">{periods.map(value => <button key={value} className={period === value ? 'active' : ''} onClick={() => setPeriod(value)}>{value} dni</button>)}</div>
    </div>

    {loading && !data ? <div className="loading-card">Wczytywanie historii…</div> : data?.days.length === 0 ? <div className="panel empty-state">Brak zapisanych danych w tym okresie.</div> : <div className="history-list">
      {data?.days.map(day => <article className="history-day panel" key={day.date}>
        <header><div><CalendarDays size={17} /><div><strong>{dateLabel(day.date)}</strong><span>{day.health?.source === 'garmin' ? 'Garmin' : day.health ? day.health.source : 'Dane lokalne'}</span></div></div>{day.weightKg != null && <span className="history-weight"><Scale size={15} /> {day.weightKg.toFixed(1)} kg</span>}</header>
        <div className="history-metrics">
          <div><Footprints /><span>Kroki</span><strong>{day.health?.steps?.toLocaleString('pl-PL') ?? '—'}</strong></div>
          <div><Moon /><span>Sen</span><strong>{formatDuration(day.health?.sleepDurationSeconds)}</strong></div>
          <div><HeartPulse /><span>RHR</span><strong>{day.health?.restingHr != null ? `${day.health.restingHr} bpm` : '—'}</strong></div>
        </div>
        {(day.activities.length > 0 || day.plans.length > 0) && <div className="history-details">
          {day.activities.length > 0 && <div><h3><Activity size={15} /> Aktywności</h3>{day.activities.map(item => <div className="history-line" key={item.id}><strong>{activityLabel(item.activityType)}</strong><span>{formatDuration(item.durationSeconds)}{item.distanceMeters ? ` · ${formatDistance(item.distanceMeters)}` : ''}</span><em>{item.provider === 'garmin' ? 'Garmin' : 'Ręcznie'}</em></div>)}</div>}
          {day.plans.length > 0 && <div><h3><CheckCircle2 size={15} /> Plan</h3>{day.plans.map(item => <div className="history-line" key={item.id}><strong>{item.title}</strong><span>{statusLabel(item.status)}</span></div>)}</div>}
        </div>}
      </article>)}
    </div>}
  </section>;
}
