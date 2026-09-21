export function localIsoDate(timestamp: string, timeZone: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) throw new Error('timestamp must be valid');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftIsoDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year!, month! - 1, day! + days));
  return value.toISOString().slice(0, 10);
}

export function weekBounds(date: string): { start: string; end: string } {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year!, month! - 1, day!));
  const weekday = value.getUTCDay();
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
  return {
    start: shiftIsoDate(date, -daysSinceMonday),
    end: shiftIsoDate(date, 6 - daysSinceMonday),
  };
}
