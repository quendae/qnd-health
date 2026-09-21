export function rangeForDays(to: string, days: number): { from: string; to: string } {
  const [year, month, day] = to.split('-').map(Number);
  const value = new Date(Date.UTC(year!, month! - 1, day! - Math.max(1, days) + 1));
  return { from: value.toISOString().slice(0, 10), to };
}

export function presentSeriesValues<T extends { value?: number | null }>(items: T[]): number[] {
  return items.flatMap(item => typeof item.value === 'number' && Number.isFinite(item.value) ? [item.value] : []);
}
