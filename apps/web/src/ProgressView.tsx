import { useEffect, useMemo, useState } from 'react';
import { Activity, CheckCircle2, Footprints, Gauge, HeartPulse, Moon, Scale } from 'lucide-react';
import type { QndHealthApi } from './api';
import type { ProgressResponse, ProgressSeriesPoint } from './types';
import { formatDistance, formatDuration } from './view-model';
import { rangeForDays } from './insights';

const periods = [7, 30, 90] as const;

type MetricKey = 'steps' | 'sleepDurationSeconds' | 'weightKg';

function formatMetric(value: number | null, kind: 'number' | 'duration' | 'weight') {
  if (value == null) return '—';
  if (kind === 'duration') return formatDuration(value);
  if (kind === 'weight') return `${value.toFixed(1)} kg`;
  return Math.round(value).toLocaleString('pl-PL');
}

function Trend({ points, metric, label }: { points: ProgressSeriesPoint[]; metric: MetricKey; label: string }) {
  const values = points.flatMap(point => typeof point[metric] === 'number' ? [point[metric] as number] : []);
  const max = values.length ? Math.max(...values) : 0;
  return <div className="trend-card">
    <div className="trend-head"><strong>{label}</strong><span>{values.length ? `${values.length} dni z danymi` : 'Brak danych'}</span></div>
    <div className="trend-bars">{points.map(point => {
      const value = point[metric];
      const height = typeof value === 'number' && max > 0 ? Math.max(5, Math.round((value / max) * 100)) : 0;
      return <span key={point.date} title={`${point.date}: ${value ?? 'brak'}`} className={value == null ? 'missing' : ''}><i style={{ height: `${height}%` }} /></span>;
    })}</div>
  </div>;
}

export function ProgressView({ api, selectedDate, onError }: { api: QndHealthApi; selectedDate: string; onError: (message: string | null) => void }) {
  const [period, setPeriod] = useState<(typeof periods)[number]>(30);
  const [data, setData] = useState<ProgressResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    const range = rangeForDays(selectedDate, period);
    setLoading(true);
    onError(null);
    void api.getProgress(range.from, range.to)
      .then(result => { if (alive) setData(result); })
      .catch(error => { if (alive) onError(error instanceof Error ? error.message : 'Nie udało się wczytać postępów'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [api, selectedDate, period, onError]);

  const delta = useMemo(() => data?.weight.deltaKg ?? null, [data]);

  return <section className="insight-view">
    <div className="insight-toolbar">
      <div><span className="eyebrow">Trend, nie pojedynczy dzień</span><h1>Postępy</h1></div>
      <div className="period-switch">{periods.map(value => <button key={value} className={period === value ? 'active' : ''} onClick={() => setPeriod(value)}>{value} dni</button>)}</div>
    </div>

    {loading && !data ? <div className="loading-card">Liczenie postępów…</div> : data && <>
      <div className="progress-summary-grid">
        <div className="progress-stat"><CheckCircle2 /><span>Realizacja planu</span><strong>{data.plan.completionPercent == null ? '—' : `${data.plan.completionPercent}%`}</strong><small>{data.plan.completed}/{data.plan.total} wykonane</small></div>
        <div className="progress-stat"><Activity /><span>Aktywności</span><strong>{data.activity.count}</strong><small>{formatDuration(data.activity.durationSeconds)} · {formatDistance(data.activity.distanceMeters)}</small></div>
        <div className="progress-stat"><Footprints /><span>Śr. kroki</span><strong>{formatMetric(data.averages.steps, 'number')}</strong><small>dni z danymi Garmin</small></div>
        <div className="progress-stat"><Moon /><span>Śr. sen</span><strong>{formatMetric(data.averages.sleepDurationSeconds, 'duration')}</strong><small>{period} dni</small></div>
        <div className="progress-stat"><HeartPulse /><span>Śr. RHR / HRV</span><strong>{data.averages.restingHr == null ? '—' : `${data.averages.restingHr} bpm`}</strong><small>HRV {data.averages.hrv == null ? '—' : `${data.averages.hrv} ms`}</small></div>
        <div className="progress-stat"><Scale /><span>Masa ciała</span><strong>{formatMetric(data.weight.latestKg, 'weight')}</strong><small>{delta == null ? 'Brak trendu' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)} kg w okresie`}</small></div>
      </div>
      <div className="trend-grid">
        <Trend points={data.series} metric="steps" label="Kroki" />
        <Trend points={data.series} metric="sleepDurationSeconds" label="Sen" />
        <Trend points={data.series} metric="weightKg" label="Masa ciała" />
      </div>
      <div className="panel progress-notes"><Gauge size={18} /><div><strong>Jak czytać ten widok</strong><p>Średnie liczone są tylko z dni, dla których istnieje pomiar. Brak danych nie jest traktowany jako zero. Po podłączeniu Garmina serie uzupełnią się automatycznie.</p></div></div>
    </>}
  </section>;
}
