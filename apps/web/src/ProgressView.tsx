import { useEffect, useMemo, useState } from 'react';
import { Activity, BatteryCharging, CheckCircle2, Droplets, Footprints, Gauge, HeartPulse, Moon, Scale, Sparkles, Stairs, Timer, Wind } from 'lucide-react';
import type { QndHealthApi } from './api';
import type { ProgressResponse, ProgressSeriesPoint } from './types';
import { formatDistance, formatDuration } from './view-model';
import { rangeForDays } from './insights';
import { ProgressChart } from './ProgressChart';

const periods = [7, 30, 90] as const;
type MetricGetter = (point: ProgressSeriesPoint) => number | null;
interface ChartSpec { title: string; description: string; value: MetricGetter; target?: MetricGetter; format: (value: number) => string }

function formatSummaryMetric(value: number | null, kind: 'number' | 'duration' | 'weight') {
  if (value == null) return '—';
  if (kind === 'duration') return formatDuration(value);
  if (kind === 'weight') return `${value.toFixed(1)} kg`;
  return Math.round(value).toLocaleString('pl-PL');
}
function decimal(value: number, suffix = '') { return `${(Math.round(value * 10) / 10).toLocaleString('pl-PL')}${suffix}`; }
function present(points: ProgressSeriesPoint[], getter: MetricGetter) { return points.some(point => getter(point) != null); }

function ChartSection({ title, description, points, charts }: { title: string; description: string; points: ProgressSeriesPoint[]; charts: ChartSpec[] }) {
  const visible = charts.filter(chart => present(points, chart.value));
  if (!visible.length) return null;
  return <section className="progress-metric-section">
    <div className="progress-section-head"><div><h2>{title}</h2><p>{description}</p></div><span>{visible.length} {visible.length === 1 ? 'wskaźnik' : 'wskaźników'}</span></div>
    <div className="progress-chart-grid">{visible.map(chart => <ProgressChart key={chart.title} title={chart.title} description={chart.description} points={points} value={chart.value} target={chart.target} formatValue={chart.format} />)}</div>
  </section>;
}

export function ProgressView({ api, selectedDate, onError }: { api: QndHealthApi; selectedDate: string; onError: (message: string | null) => void }) {
  const [period, setPeriod] = useState<(typeof periods)[number]>(30);
  const [data, setData] = useState<ProgressResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    const range = rangeForDays(selectedDate, period);
    setLoading(true); onError(null);
    void api.getProgress(range.from, range.to)
      .then(result => { if (alive) setData(result); })
      .catch(error => { if (alive) onError(error instanceof Error ? error.message : 'Nie udało się wczytać postępów'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [api, selectedDate, period, onError]);

  const delta = useMemo(() => data?.weight.deltaKg ?? null, [data]);

  const dailyCharts: ChartSpec[] = [
    { title: 'Kroki', description: 'Wynik względem celu obowiązującego danego dnia', value: p => p.steps, target: p => p.stepsGoal, format: v => Math.round(v).toLocaleString('pl-PL') },
    { title: 'Realizacja planu', description: 'Odsetek wykonanych zaplanowanych pozycji', value: p => p.planCompletionPercent, format: v => `${Math.round(v)}%` },
    { title: 'Czas aktywności', description: 'Łączny czas zapisanych aktywności', value: p => p.activitiesCount ? p.activityDurationSeconds : null, format: v => formatDuration(v) },
    { title: 'Dystans aktywności', description: 'Łączny dzienny dystans', value: p => p.activitiesCount ? p.activityDistanceMeters : null, format: v => formatDistance(v) },
    { title: 'Sen', description: 'Łączny czas snu', value: p => p.sleepDurationSeconds, format: v => formatDuration(v) },
    { title: 'Tętno spoczynkowe', description: 'RHR raportowane przez Garmin', value: p => p.restingHr, format: v => `${decimal(v)} bpm` },
    { title: 'HRV', description: 'Zmienność rytmu serca', value: p => p.hrv, format: v => `${decimal(v)} ms` },
    { title: 'Body Battery', description: 'Dzienny poziom energii Garmin', value: p => p.bodyBattery, format: v => `${Math.round(v)}/100` },
    { title: 'Stres', description: 'Dzienna wartość stresu Garmin', value: p => p.stress, format: v => decimal(v) },
    { title: 'SpO₂', description: 'Saturacja krwi tlenem', value: p => p.spo2, format: v => `${decimal(v)}%` },
    { title: 'Oddech', description: 'Częstość oddechu', value: p => p.respiration, format: v => `${decimal(v)} /min` },
    { title: 'VO₂max', description: 'Wydolność raportowana przez Garmin', value: p => p.vo2Max, format: v => decimal(v) },
    { title: 'Piętra w górę', description: 'Liczba pokonanych pięter', value: p => p.floorsAscended, format: v => decimal(v) },
    { title: 'Piętra w dół', description: 'Liczba zejść', value: p => p.floorsDescended, format: v => decimal(v) },
    { title: 'Minuty intensywne', description: 'Dzienne intensity minutes', value: p => p.intensityMinutes, format: v => `${decimal(v)} min` },
    { title: 'Aktywne kalorie', description: 'Energia przypisana do ruchu', value: p => p.activeCalories, format: v => `${decimal(v)} kcal` },
    { title: 'Nawodnienie', description: 'Zapisana ilość płynów', value: p => p.hydrationMl, format: v => `${decimal(v)} ml` },
  ];
  const nutritionCharts: ChartSpec[] = [
    { title: 'Kalorie', description: 'Spożycie względem historycznego celu', value: p => p.caloriesKcal, target: p => p.caloriesGoalKcal, format: v => `${Math.round(v).toLocaleString('pl-PL')} kcal` },
    { title: 'Białko', description: 'Gramy względem historycznego celu', value: p => p.proteinGrams, target: p => p.proteinGoalGrams, format: v => `${decimal(v)} g` },
    { title: 'Węglowodany', description: 'Gramy względem historycznego celu', value: p => p.carbsGrams, target: p => p.carbsGoalGrams, format: v => `${decimal(v)} g` },
    { title: 'Tłuszcz', description: 'Gramy względem historycznego celu', value: p => p.fatGrams, target: p => p.fatGoalGrams, format: v => `${decimal(v)} g` },
    { title: 'Błonnik', description: 'Gramy względem historycznego celu', value: p => p.fiberGrams, target: p => p.fiberGoalGrams, format: v => `${decimal(v)} g` },
  ];
  const bodyCharts: ChartSpec[] = [
    { title: 'Masa ciała', description: 'Trend pomiarów masy', value: p => p.weightKg, format: v => `${decimal(v)} kg` },
    { title: 'Tkanka tłuszczowa', description: 'Procent tkanki tłuszczowej', value: p => p.bodyFatPercent, format: v => `${decimal(v)}%` },
    { title: 'BMI', description: 'BMI z pomiaru', value: p => p.bmi, format: v => decimal(v) },
    { title: 'Masa mięśniowa', description: 'Masa mięśni', value: p => p.muscleMassKg, format: v => `${decimal(v)} kg` },
    { title: 'Masa beztłuszczowa', description: 'Fat-free mass', value: p => p.fatFreeMassKg, format: v => `${decimal(v)} kg` },
    { title: 'Tłuszcz podskórny', description: 'Subcutaneous fat', value: p => p.subcutaneousFatPercent, format: v => `${decimal(v)}%` },
    { title: 'Woda w organizmie', description: 'Body water', value: p => p.bodyWaterPercent, format: v => `${decimal(v)}%` },
    { title: 'Mięśnie szkieletowe', description: 'Skeletal muscle', value: p => p.skeletalMusclePercent, format: v => `${decimal(v)}%` },
    { title: 'Masa kostna', description: 'Bone mass', value: p => p.boneMassKg, format: v => `${decimal(v)} kg` },
    { title: 'Tłuszcz trzewny', description: 'Visceral fat', value: p => p.visceralFat, format: v => decimal(v) },
    { title: 'Białko w organizmie', description: 'Protein percentage z wagi', value: p => p.proteinPercent, format: v => `${decimal(v)}%` },
    { title: 'BMR z wagi', description: 'Szacunek urządzenia pomiarowego', value: p => p.scaleBmrKcal, format: v => `${Math.round(v)} kcal` },
    { title: 'Wiek metaboliczny', description: 'Wartość z urządzenia pomiarowego', value: p => p.metabolicAge, format: v => `${Math.round(v)} lat` },
  ];
  const circumferenceCharts: ChartSpec[] = [
    { title: 'Biceps', description: 'Obwód ramienia', value: p => p.bicepsCircumferenceCm, format: v => `${decimal(v)} cm` },
    { title: 'Klatka piersiowa', description: 'Obwód klatki', value: p => p.chestCircumferenceCm, format: v => `${decimal(v)} cm` },
    { title: 'Talia', description: 'Obwód talii', value: p => p.waistCircumferenceCm, format: v => `${decimal(v)} cm` },
    { title: 'Biodra', description: 'Obwód bioder', value: p => p.hipsCircumferenceCm, format: v => `${decimal(v)} cm` },
    { title: 'Udo', description: 'Obwód uda', value: p => p.thighCircumferenceCm, format: v => `${decimal(v)} cm` },
  ];

  return <section className="insight-view">
    <div className="insight-toolbar"><div><span className="eyebrow">Trend, nie pojedynczy dzień</span><h1>Postępy</h1></div><div className="period-switch">{periods.map(value => <button key={value} className={period === value ? 'active' : ''} onClick={() => setPeriod(value)}>{value} dni</button>)}</div></div>

    {loading && !data ? <div className="loading-card">Liczenie postępów…</div> : data && <>
      <div className="progress-summary-grid rich">
        <div className="progress-stat"><CheckCircle2 /><span>Realizacja planu</span><strong>{data.plan.completionPercent == null ? '—' : `${data.plan.completionPercent}%`}</strong><small>{data.plan.completed}/{data.plan.total} wykonane</small></div>
        <div className="progress-stat"><Activity /><span>Aktywności</span><strong>{data.activity.count}</strong><small>{formatDuration(data.activity.durationSeconds)} · {formatDistance(data.activity.distanceMeters)}</small></div>
        <div className="progress-stat"><Footprints /><span>Śr. kroki</span><strong>{formatSummaryMetric(data.averages.steps, 'number')}</strong><small>dni z pomiarem</small></div>
        <div className="progress-stat"><Moon /><span>Śr. sen</span><strong>{formatSummaryMetric(data.averages.sleepDurationSeconds, 'duration')}</strong><small>dni z pomiarem</small></div>
        <div className="progress-stat"><HeartPulse /><span>RHR / HRV</span><strong>{data.averages.restingHr == null ? '—' : `${decimal(data.averages.restingHr)} bpm`}</strong><small>HRV {data.averages.hrv == null ? '—' : `${decimal(data.averages.hrv)} ms`}</small></div>
        <div className="progress-stat"><BatteryCharging /><span>Body Battery / stres</span><strong>{data.averages.bodyBattery == null ? '—' : decimal(data.averages.bodyBattery)}</strong><small>stres {data.averages.stress == null ? '—' : decimal(data.averages.stress)}</small></div>
        <div className="progress-stat"><Sparkles /><span>VO₂max / SpO₂</span><strong>{data.averages.vo2Max == null ? '—' : decimal(data.averages.vo2Max)}</strong><small>SpO₂ {data.averages.spo2 == null ? '—' : `${decimal(data.averages.spo2)}%`}</small></div>
        <div className="progress-stat"><Timer /><span>Intensywność</span><strong>{data.averages.intensityMinutes == null ? '—' : `${decimal(data.averages.intensityMinutes)} min`}</strong><small>aktywne kcal {data.averages.activeCalories == null ? '—' : decimal(data.averages.activeCalories)}</small></div>
        <div className="progress-stat"><Droplets /><span>Nawodnienie</span><strong>{data.averages.hydrationMl == null ? '—' : `${decimal(data.averages.hydrationMl)} ml`}</strong><small>średnio na dzień z pomiarem</small></div>
        <div className="progress-stat"><Stairs /><span>Piętra</span><strong>{data.averages.floorsAscended == null ? '—' : decimal(data.averages.floorsAscended)}</strong><small>w dół {data.averages.floorsDescended == null ? '—' : decimal(data.averages.floorsDescended)}</small></div>
        <div className="progress-stat"><Wind /><span>Oddech</span><strong>{data.averages.respiration == null ? '—' : `${decimal(data.averages.respiration)} /min`}</strong><small>średnia z dostępnych dni</small></div>
        <div className="progress-stat"><Scale /><span>Masa ciała</span><strong>{formatSummaryMetric(data.weight.latestKg, 'weight')}</strong><small>{delta == null ? 'Brak trendu' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)} kg w okresie`}</small></div>
      </div>

      <ChartSection title="Aktywność i regeneracja" description="Codzienny ruch, sen, wydolność oraz wskaźniki Garmin." points={data.series} charts={dailyCharts} />
      <ChartSection title="Odżywianie" description="Kalorie i wszystkie makroskładniki względem celu, który obowiązywał danego dnia." points={data.series} charts={nutritionCharts} />
      <ChartSection title="Skład ciała" description="Pomiary z wagi i ręcznych wpisów. Pokazujemy tylko wskaźniki, które faktycznie występują w danych." points={data.series} charts={bodyCharts} />
      <ChartSection title="Obwody" description="Zmiany obwodów ciała w czasie." points={data.series} charts={circumferenceCharts} />

      <div className="panel progress-notes"><Gauge size={18} /><div><strong>Jak czytać ten widok</strong><p>Brak pomiaru nigdy nie jest zamieniany na zero. Wykres pojawia się tylko wtedy, gdy w wybranym okresie istnieje przynajmniej jeden pomiar. Linie celu kroków i żywienia są rozwiązywane osobno dla każdego dnia, więc późniejsza zmiana celu nie przepisuje historii.</p></div></div>
    </>}
  </section>;
}
