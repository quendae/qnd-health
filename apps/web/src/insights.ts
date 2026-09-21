export function rangeForDays(to: string, days: number): { from: string; to: string } {
  const [year, month, day] = to.split('-').map(Number);
  const value = new Date(Date.UTC(year!, month! - 1, day! - Math.max(1, days) + 1));
  return { from: value.toISOString().slice(0, 10), to };
}

export function presentSeriesValues<T extends { value?: number | null }>(items: T[]): number[] {
  return items.flatMap(item => typeof item.value === 'number' && Number.isFinite(item.value) ? [item.value] : []);
}

export interface ChartValuePoint {
  date: string;
  value: number | null;
}

export function buildChartSegments<T extends ChartValuePoint>(items: T[]): T[][] {
  const segments: T[][] = [];
  let current: T[] = [];

  for (const item of items) {
    if (typeof item.value === 'number' && Number.isFinite(item.value)) {
      current.push(item);
      continue;
    }
    if (current.length > 0) segments.push(current);
    current = [];
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

export function chartExtent(...series: Array<Array<number | null | undefined>>): { min: number; max: number } | null {
  const values = series.flatMap(values => values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)));
  if (values.length === 0) return null;
  return { min: Math.min(...values), max: Math.max(...values) };
}
