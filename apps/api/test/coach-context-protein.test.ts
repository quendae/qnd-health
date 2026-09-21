import { describe, expect, it } from 'vitest';
import { buildCoachContext } from '../src/coach/context.js';

describe('Coach context nutrition goals', () => {
  it('includes the protein goal next to calorie and step goals', () => {
    const context = buildCoachContext({
      date: '2026-09-21',
      profile: {
        id: 'default', dateOfBirth: null, sexForBmr: null, heightCm: null, activityFactor: 1.2,
        defaultStepsGoal: 7500, dailyCaloriesGoalKcal: 1600, dailyProteinGoalGrams: 160,
      },
      today: {
        health: null,
        latestMeasurement: null,
        energy: null,
        activity: { steps: { current: 6000, target: 7500, goalSource: 'profile' } },
        nutrition: {
          goalKcal: 1600,
          summary: { totals: { caloriesKcal: 1200, proteinGrams: 100, carbsGrams: 80, fatGrams: 40, fiberGrams: 20 } },
        },
      },
      plans: [], activities: [], nutrition: [], measurements: [], progress7: null, progress30: null,
    });
    expect(context.goals).toMatchObject({ steps: 7500, caloriesKcal: 1600, proteinGrams: 160 });
  });
});
