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

export interface NutritionMacroCard {
  label: 'Białko' | 'Węglowodany' | 'Tłuszcz' | 'Błonnik';
  value: number | null;
  goal: number | null;
  percent: number | null;
}

export interface NutritionMacroGoals {
  proteinGrams: number | null;
  carbsGrams: number | null;
  fatGrams: number | null;
  fiberGrams: number | null;
}

function macroPercent(value: number | null, goal: number | null): number | null {
  return value != null && goal != null && goal > 0 ? Math.round((value / goal) * 100) : null;
}

export function nutritionMacroCards(
  totals: { proteinGrams: number | null; carbsGrams: number | null; fatGrams: number | null; fiberGrams: number | null },
  goals: NutritionMacroGoals,
): NutritionMacroCard[] {
  return [
    { label: 'Białko', value: totals.proteinGrams, goal: goals.proteinGrams, percent: macroPercent(totals.proteinGrams, goals.proteinGrams) },
    { label: 'Węglowodany', value: totals.carbsGrams, goal: goals.carbsGrams, percent: macroPercent(totals.carbsGrams, goals.carbsGrams) },
    { label: 'Tłuszcz', value: totals.fatGrams, goal: goals.fatGrams, percent: macroPercent(totals.fatGrams, goals.fatGrams) },
    { label: 'Błonnik', value: totals.fiberGrams, goal: goals.fiberGrams, percent: macroPercent(totals.fiberGrams, goals.fiberGrams) },
  ];
}

export function nutritionMealListClass(entryCount: number): string {
  return entryCount > 7 ? 'meal-list scrollable' : 'meal-list';
}

export function greeting(now = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', hour12: false }).format(now));
  if (hour < 12) return 'Dzień dobry';
  if (hour < 18) return 'Miłego popołudnia';
  return 'Dobry wieczór';
}
