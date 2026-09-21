import { useEffect, useMemo, useState } from 'react';
import { Activity, CheckCircle2, Footprints, Gauge, HeartPulse, Moon, Scale } from 'lucide-react';
import type { QndHealthApi } from './api';
import type { ProgressResponse } from './types';
import { formatDistance, formatDuration } from './view-model';
import { rangeForDays } from './insights';
import { ProgressChart } from './ProgressChart';

const periods = [7, 30, 90] as const;

function formatSummaryMetric(value: number | null, kind: 'number' | 'duration' | 'weight') {
  if (value == null) return '—';
  if (kind === 'duration') return formatDuration(value);
  if (kind === 'weight') return `${value.toFixed(1)} kg`;
  return Math.round(value).toLocaleString('pl-PL');
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
        <div className="progress-stat"><Footprints /><span>Śr. kroki</span><strong>{formatSummaryMetric(data.averages.steps, 'number')}</strong><small>tylko dni z pomiarem</small></div>
        <div className="progress-stat"><Moon /><span>Śr. sen</span><strong>{formatSummaryMetric(data.averages.sleepDurationSeconds, 'duration')}</strong><small>tylko dni z pomiarem</small></div>
        <div className="progress-stat"><HeartPulse /><span>Śr. RHR / HRV</span><strong>{data.averages.restingHr == null ? '—' : `${data.averages.restingHr} bpm`}</strong><small>HRV {data.averages.hrv == null ? '—' : `${data.averages.hrv} ms`}</small></div>
        <div className="progress-stat"><Scale /><span>Masa ciała</span><strong>{formatSummaryMetric(data.weight.latestKg, 'weight')}</strong><small>{delta == null ? 'Brak trendu' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)} kg w okresie`}</small></div>
      </div>

      <div className="progress-chart-grid">
        <ProgressChart
          title="Masa ciała"
          description="Trend pomiarów masy"
          points={data.series}
          value={point => point.weightKg}
          formatValue={value => `${value.toFixed(1)} kg`}
        />
        <ProgressChart
          title="Kroki"
          description="Rzeczywisty wynik względem celu na dany dzień"
          points={data.series}
          value={point => point.steps}
          target={point => point.stepsGoal}
          formatValue={value => `${Math.round(value).toLocaleString('pl-PL')}`}
        />
        <ProgressChart
          title="Kalorie"
          description="Zjedzone kcal względem ręcznie ustawionego celu"
          points={data.series}
          value={point => point.caloriesKcal}
          target={point => point.caloriesGoalKcal}
          formatValue={value => `${Math.round(value).toLocaleString('pl-PL')} kcal`}
        />
        <ProgressChart
          title="Białko"
          description="Zapisane gramy białka względem dziennego celu"
          points={data.series}
          value={point => point.proteinGrams}
          target={point => point.proteinGoalGrams}
          formatValue={value => `${Math.round(value * 10) / 10} g`}
        />
        <ProgressChart
          title="Sen"
          description="Łączny czas snu"
          points={data.series}
          value={point => point.sleepDurationSeconds}
          formatValue={value => formatDuration(value)}
        />
        <ProgressChart
          title="Tętno spoczynkowe"
          description="Dzienna wartość RHR z danych Garmin"
          points={data.series}
          value={point => point.restingHr}
          formatValue={value => `${Math.round(value)} bpm`}
        />
        <ProgressChart
          title="HRV"
          description="Zmienność rytmu serca"
          points={data.series}
          value={point => point.hrv}
          formatValue={value => `${Math.round(value * 10) / 10} ms`}
        />
        <ProgressChart
          title="VO₂max"
          description="Wartość raportowana przez Garmin"
          points={data.series}
          value={point => point.vo2Max}
          formatValue={value => `${(Math.round(value * 10) / 10).toLocaleString('pl-PL')}`}
        />
      </div>

      <div className="panel progress-notes"><Gauge size={18} /><div><strong>Jak czytać ten widok</strong><p>Wykresy nie zamieniają brakujących pomiarów na zero. Przerwa w linii oznacza brak danych. Linie celu dla kroków, kalorii i białka pochodzą z ustawień QND Health lub — dla kroków — z celu dostarczonego przez Garmin.</p></div></div>
    </>}
  </section>;
}
