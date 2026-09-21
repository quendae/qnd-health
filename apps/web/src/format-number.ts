export function formatMetric(value: number | null | undefined, maximumFractionDigits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('pl-PL', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value);
}
