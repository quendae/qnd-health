import { describe, expect, it } from 'vitest';
import * as viewModel from './view-model';
import { dateLabel, formatDistance, formatDuration, progressPercent, weekCompletion } from './view-model';
import type { TodayResponse } from './types';

describe('Today view model', () => {
  it('formats Garmin-style durations and distances', () => {
    expect(formatDuration(4460)).toBe('1 h 14 min');
    expect(formatDistance(5120)).toBe('5.1 km');
  });

  it('rolls rounded minutes into the next hour instead of showing 60 minutes', () => {
    expect(formatDuration(3599)).toBe('1 h 00 min');
  });

  it('formats dates in Polish', () => {
    expect(dateLabel('2026-09-21')).toBe('poniedziałek, 21 września');
  });

  it('clamps progress to a display-safe percent', () => {
    expect(progressPercent(0.625)).toBe(63);
    expect(progressPercent(1.4)).toBe(100);
  });

  it('counts partial plan items as half-complete in the week summary', () => {
    const today = { weekToDate: { totalPlanItems: 4, completed: 2, partial: 1, planned: 1 } } as TodayResponse;
    expect(weekCompletion(today)).toBe(63);
  });

  it('keeps all nutrition targets in macro cards and only enables meal scrolling after seven rows', () => {
    const nutritionMacroCards = (viewModel as Record<string, unknown>).nutritionMacroCards as undefined | ((
      totals: Record<string, number | null>,
      goals: { proteinGrams: number | null; carbsGrams: number | null; fatGrams: number | null; fiberGrams: number | null },
    ) => unknown[]);
    const nutritionMealListClass = (viewModel as Record<string, unknown>).nutritionMealListClass as undefined | ((count: number) => string);

    expect(typeof nutritionMacroCards).toBe('function');
    expect(typeof nutritionMealListClass).toBe('function');
    expect(nutritionMacroCards!({ proteinGrams: 90, carbsGrams: 120, fatGrams: 45, fiberGrams: 20 }, {
      proteinGrams: 150,
      carbsGrams: 180,
      fatGrams: 60,
      fiberGrams: 30,
    })).toEqual([
      { label: 'Białko', value: 90, goal: 150, percent: 60 },
      { label: 'Węglowodany', value: 120, goal: 180, percent: 67 },
      { label: 'Tłuszcz', value: 45, goal: 60, percent: 75 },
      { label: 'Błonnik', value: 20, goal: 30, percent: 67 },
    ]);
    expect(nutritionMealListClass!(7)).toBe('meal-list');
    expect(nutritionMealListClass!(8)).toBe('meal-list scrollable');
  });
});
