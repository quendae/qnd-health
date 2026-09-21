import { useMemo, useState } from 'react';
import { buildChartSegments, chartExtent } from './insights';
import type { ProgressSeriesPoint } from './types';
import './progress-chart.css';

type ValueGetter = (point: ProgressSeriesPoint) => number | null;

function shortDate(date: string): string {
  return new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short' }).format(new Date(`${date}T12:00:00Z`));
}

export function ProgressChart({
  title,
  description,
  points,
  value,
  target,
  formatValue,
}: {
  title: string;
  description?: string;
  points: ProgressSeriesPoint[];
  value: ValueGetter;
  target?: ValueGetter;
  formatValue: (value: number) => string;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const values = useMemo(() => points.map(value), [points, value]);
  const targets = useMemo(() => points.map(point => target?.(point) ?? null), [points, target]);
  const extent = useMemo(() => chartExtent(values, targets), [values, targets]);

  const geometry = useMemo(() => {
    if (!extent || points.length === 0) return null;
    const width = 620;
    const height = 190;
    const left = 42;
    const right = 14;
    const top = 16;
    const bottom = 28;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const rawRange = extent.max - extent.min;
    const padding = rawRange === 0 ? Math.max(1, Math.abs(extent.max) * 0.08) : rawRange * 0.1;
    const min = extent.min - padding;
    const max = extent.max + padding;
    const range = Math.max(1e-9, max - min);
    const x = (index: number) => left + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
    const y = (numeric: number) => top + ((max - numeric) / range) * plotHeight;
    return { width, height, left, right, top, bottom, plotWidth, plotHeight, min, max, x, y };
  }, [extent, points.length]);

  if (!geometry) {
    return <article className="progress-chart-card">
      <div className="progress-chart-head"><div><strong>{title}</strong>{description && <span>{description}</span>}</div><span>Brak danych</span></div>
      <div className="progress-chart-empty">Brak pomiarów w wybranym okresie.</div>
    </article>;
  }

  const primaryPoints = points.map((point, index) => ({ date: point.date, value: values[index], index }));
  const targetPoints = points.map((point, index) => ({ date: point.date, value: targets[index], index }));
  const primarySegments = buildChartSegments(primaryPoints);
  const targetSegments = buildChartSegments(targetPoints);
  const activePoint = activeIndex == null ? null : points[activeIndex];
  const activeValue = activeIndex == null ? null : values[activeIndex];
  const activeTarget = activeIndex == null ? null : targets[activeIndex];
  const latest = [...values].reverse().find((item): item is number => typeof item === 'number' && Number.isFinite(item));
  const tickIndices = points.length <= 2 ? points.map((_, index) => index) : [0, Math.floor((points.length - 1) / 2), points.length - 1];
  const hitWidth = geometry.plotWidth / Math.max(1, points.length - 1);

  const pathPoints = (segment: Array<{ value: number | null; index: number }>) => segment
    .map(item => `${geometry.x(item.index)},${geometry.y(item.value as number)}`)
    .join(' ');

  return <article className="progress-chart-card">
    <div className="progress-chart-head">
      <div><strong>{title}</strong>{description && <span>{description}</span>}</div>
      <b>{latest == null ? '—' : formatValue(latest)}</b>
    </div>
    <div className="progress-chart-canvas" onMouseLeave={() => setActiveIndex(null)}>
      <svg viewBox={`0 0 ${geometry.width} ${geometry.height}`} role="img" aria-label={`Wykres: ${title}`}>
        <line className="chart-axis" x1={geometry.left} x2={geometry.width - geometry.right} y1={geometry.top} y2={geometry.top} />
        <line className="chart-axis" x1={geometry.left} x2={geometry.width - geometry.right} y1={geometry.top + geometry.plotHeight / 2} y2={geometry.top + geometry.plotHeight / 2} />
        <line className="chart-axis" x1={geometry.left} x2={geometry.width - geometry.right} y1={geometry.top + geometry.plotHeight} y2={geometry.top + geometry.plotHeight} />

        <text className="chart-y-label" x={geometry.left - 6} y={geometry.top + 4}>{formatValue(extent!.max)}</text>
        <text className="chart-y-label" x={geometry.left - 6} y={geometry.top + geometry.plotHeight}>{formatValue(extent!.min)}</text>

        {target && targetSegments.map((segment, index) => <polyline key={`target-${index}`} className="chart-line chart-target" points={pathPoints(segment)} />)}
        {primarySegments.map((segment, index) => <polyline key={`primary-${index}`} className="chart-line chart-primary" points={pathPoints(segment)} />)}

        {primaryPoints.map((item, index) => item.value == null ? null : <circle key={`dot-${item.date}`} className="chart-dot" cx={geometry.x(index)} cy={geometry.y(item.value)} r={activeIndex === index ? 4.5 : 3} />)}

        {activeIndex != null && <line className="chart-guide" x1={geometry.x(activeIndex)} x2={geometry.x(activeIndex)} y1={geometry.top} y2={geometry.top + geometry.plotHeight} />}

        {tickIndices.map(index => <text key={`tick-${index}`} className="chart-x-label" x={geometry.x(index)} y={geometry.height - 7}>{shortDate(points[index]!.date)}</text>)}

        {points.map((point, index) => <rect
          key={`hit-${point.date}`}
          className="chart-hit"
          x={Math.max(geometry.left, geometry.x(index) - hitWidth / 2)}
          y={geometry.top}
          width={Math.min(hitWidth, geometry.width - geometry.right - Math.max(geometry.left, geometry.x(index) - hitWidth / 2))}
          height={geometry.plotHeight}
          onMouseEnter={() => setActiveIndex(index)}
        />)}
      </svg>
      {activePoint && <div className="progress-chart-tooltip" style={{ left: `${Math.min(82, Math.max(8, (activeIndex! / Math.max(1, points.length - 1)) * 100))}%` }}>
        <strong>{shortDate(activePoint.date)}</strong>
        <span>{activeValue == null ? 'Brak pomiaru' : formatValue(activeValue)}</span>
        {target && activeTarget != null && <small>Cel: {formatValue(activeTarget)}</small>}
      </div>}
    </div>
    {target && <div className="progress-chart-legend"><span><i className="legend-current" /> Wynik</span><span><i className="legend-target" /> Cel</span></div>}
  </article>;
}
