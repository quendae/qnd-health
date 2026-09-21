import type { TodayResponse } from './types';

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || seconds < 0) return '—';
  const roundedMinutes = Math.round(seconds / 60);
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;
  if (!hours) return `${minutes} min`;
  return `${hours} h ${minutes.toString().padStart(2, '0')} min`;
}

export function formatDistance(meters: number | null | undefined): string {
  if (meters == null) return '—';
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

export function progressPercent(ratio: number | null | undefined): number {
  if (ratio == null || !Number.isFinite(ratio)) return 0;
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
}

export function dateLabel(date: string): string {
  return new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })
    .format(new Date(`${date}T12:00:00`));
}

export function shortDateLabel(date: string): string {
  return new Intl.DateTimeFormat('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' })
    .format(new Date(`${date}T12:00:00`));
}

export function weekCompletion(today: TodayResponse): number {
  if (!today.weekToDate.totalPlanItems) return 0;
  return Math.round(((today.weekToDate.completed + today.weekToDate.partial * 0.5) / today.weekToDate.totalPlanItems) * 100);
}

export function greeting(now = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', hour12: false }).format(now));
  if (hour < 12) return 'Dzień dobry';
  if (hour < 18) return 'Miłego popołudnia';
  return 'Dobry wieczór';
}
