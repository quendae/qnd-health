import { describe, expect, it } from 'vitest';
import * as viewModel from './view-model';
import { dateLabel, formatDistance, formatDuration, progressPercent, todayCoachInsights, weekCompletion } from './view-model';
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

  it('builds concrete Today coach observations from activity, nutrition and recovery data', () => {
    const today = {
      date: '2026-09-22',
      health: {
        date: '2026-09-22', source: 'garmin', steps: 6200, restingHr: 64, hrv: 46, stress: 31, bodyBattery: 72,
        sleepDurationSeconds: 26700, intensityMinutes: 22, hydrationMl: 1800,
      },
      latestMeasurement: { id: 'm1', measuredAt: '2026-09-22T07:00:00+02:00', weightKg: 122.4, bodyFatPercent: 30.5, bmi: 37.8, muscleMassKg: 80.5, source: 'manual' },
      energy: { bmrKcal: 2100, tdeeKcal: 2730, source: 'mifflin_st_jeor', activityFactor: 1.3 },
      activity: { steps: { current: 6200, target: 8000, goalSource: 'profile' }, items: [] },
      nutrition: {
        entries: [],
        summary: {
          date: '2026-09-22', entryCount: 3,
          totals: { caloriesKcal: 1500, proteinGrams: 105, carbsGrams: 150, fatGrams: 50, fiberGrams: 19 },
          completeness: { caloriesKcal: true, proteinGrams: true, carbsGrams: true, fatGrams: true, fiberGrams: true },
        },
        goalKcal: 2000, goalProteinGrams: 170, goalCarbsGrams: 180, goalFatGrams: 65, goalFiberGrams: 32,
      },
      weekToDate: { totalPlanItems: 5, completed: 3, partial: 1, planned: 1 },
      remainingWeek: [],
    } as TodayResponse;

    const insight = todayCoachInsights(today);
    expect(insight.headline).toContain('70%');
    expect(insight.summary).toContain('6 200 / 8 000');
    expect(insight.items.join(' ')).toContain('500 kcal');
    expect(insight.items.join(' ')).toContain('105 / 170 g');
    expect(insight.items.join(' ')).toContain('7 h 25 min');
    expect(insight.items.join(' ')).toContain('Body Battery 72/100');
    expect(insight.items.length).toBeGreaterThanOrEqual(5);
  });
});
