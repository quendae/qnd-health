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

function plNumber(value: number, maximumFractionDigits = 0): string {
  return value.toLocaleString('pl-PL', { maximumFractionDigits });
}

function percentOf(value: number | null | undefined, goal: number | null | undefined): number | null {
  if (value == null || goal == null || goal <= 0) return null;
  return Math.round((value / goal) * 100);
}

export interface TodayCoachInsight {
  headline: string;
  summary: string;
  items: string[];
}

export function todayCoachInsights(today: TodayResponse): TodayCoachInsight {
  const completion = weekCompletion(today);
  const steps = today.activity.steps;
  const stepPercent = steps.target > 0 ? Math.round((steps.current / steps.target) * 100) : null;
  const headline = completion >= 80
    ? `Mocny tydzień — plan zrealizowany w ${completion}%`
    : completion >= 60
      ? `Solidna baza — plan zrealizowany w ${completion}%`
      : `Plan wymaga nadrobienia — realizacja ${completion}%`;

  const summary = `Kroki ${plNumber(steps.current)} / ${plNumber(steps.target)}${stepPercent == null ? '' : ` (${stepPercent}%)`} · plan tygodnia ${completion}%.`;
  const items: string[] = [];
  const totals = today.nutrition.summary.totals;

  if (totals.caloriesKcal != null && today.nutrition.goalKcal != null) {
    const delta = today.nutrition.goalKcal - totals.caloriesKcal;
    items.push(`Kalorie: ${plNumber(totals.caloriesKcal)} / ${plNumber(today.nutrition.goalKcal)} kcal, ${delta >= 0 ? `zostało ${plNumber(delta)} kcal` : `${plNumber(Math.abs(delta))} kcal ponad cel`}.`);
  } else if (today.nutrition.summary.entryCount === 0) {
    items.push('Odżywianie: brak wpisów na dzisiaj — bez nich ocena bilansu i makro jest ograniczona.');
  }

  const macroRows = [
    ['Białko', totals.proteinGrams, today.nutrition.goalProteinGrams],
    ['Węglowodany', totals.carbsGrams, today.nutrition.goalCarbsGrams],
    ['Tłuszcz', totals.fatGrams, today.nutrition.goalFatGrams],
    ['Błonnik', totals.fiberGrams, today.nutrition.goalFiberGrams],
  ] as const;
  const macroText = macroRows
    .filter(([, value, goal]) => value != null && goal != null)
    .map(([label, value, goal]) => `${label} ${plNumber(value!)} / ${plNumber(goal!)} g${percentOf(value, goal) == null ? '' : ` (${percentOf(value, goal)}%)`}`);
  if (macroText.length) items.push(`Makro: ${macroText.join(' · ')}.`);

  const health = today.health;
  if (health?.sleepDurationSeconds != null) {
    items.push(`Sen: ${formatDuration(health.sleepDurationSeconds)}${health.sleepDurationSeconds < 7 * 3600 ? ' — poniżej 7 godzin.' : '.'}`);
  }

  const recovery: string[] = [];
  if (health?.bodyBattery != null) recovery.push(`Body Battery ${plNumber(health.bodyBattery)}/100`);
  if (health?.stress != null) recovery.push(`stres ${plNumber(health.stress)}`);
  if (health?.hrv != null) recovery.push(`HRV ${plNumber(health.hrv, 1)} ms`);
  if (health?.restingHr != null) recovery.push(`RHR ${plNumber(health.restingHr, 1)} bpm`);
  if (recovery.length) items.push(`Regeneracja: ${recovery.join(' · ')}.`);

  const movement: string[] = [];
  if (health?.intensityMinutes != null) movement.push(`${plNumber(health.intensityMinutes)} aktywnych min`);
  if (health?.floorsAscended != null) movement.push(`${plNumber(health.floorsAscended)} pięter w górę`);
  if (health?.activeCalories != null) movement.push(`${plNumber(health.activeCalories)} kcal aktywnych`);
  if (movement.length) items.push(`Ruch: ${movement.join(' · ')}.`);

  if (health?.hydrationMl != null) items.push(`Nawodnienie: ${plNumber(health.hydrationMl)} ml zapisane dzisiaj.`);
  if (today.latestMeasurement) {
    const body = [`masa ${plNumber(today.latestMeasurement.weightKg, 1)} kg`];
    if (today.latestMeasurement.bodyFatPercent != null) body.push(`tłuszcz ${plNumber(today.latestMeasurement.bodyFatPercent, 1)}%`);
    if (today.latestMeasurement.muscleMassKg != null) body.push(`mięśnie ${plNumber(today.latestMeasurement.muscleMassKg, 1)} kg`);
    items.push(`Ostatni pomiar: ${body.join(' · ')}.`);
  }

  if (items.length < 5) items.push(`Plan: ${today.weekToDate.completed} wykonane · ${today.weekToDate.partial} w trakcie · ${today.weekToDate.planned} zaplanowane w tym tygodniu.`);
  return { headline, summary, items: items.slice(0, 7) };
}

export function greeting(now = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', hour12: false }).format(now));
  if (hour < 12) return 'Dzień dobry';
  if (hour < 18) return 'Miłego popołudnia';
  return 'Dobry wieczór';
}
