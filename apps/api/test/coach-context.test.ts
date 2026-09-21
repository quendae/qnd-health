import { describe, expect, it } from 'vitest';
import { buildCoachContext } from '../src/coach/context.js';

describe('Coach normalized context', () => {
  it('keeps useful health, nutrition and goal data while excluding provider dumps and secrets', () => {
    const context = buildCoachContext({
      date: '2026-09-21',
      profile: {
        id: 'default', dateOfBirth: '1990-09-21', sexForBmr: 'male', heightCm: 180,
        activityFactor: 1.2, defaultStepsGoal: 8000, dailyCaloriesGoalKcal: 2200,
      },
      today: {
        health: {
          date: '2026-09-21', source: 'garmin', transport: 'home_assistant',
          steps: 6100, stepsGoal: 8000, restingHr: 64, hrv: 47, sleepDurationSeconds: 27000,
          vo2Max: 38, stress: 31, bodyBattery: 65,
          rawProviderDataJson: { latitude: 52.2297, longitude: 21.0122, accessToken: 'secret-token' },
        },
        latestMeasurement: {
          id: 'm1', measuredAt: '2026-09-21T07:00:00+02:00', weightKg: 122.8,
          bodyFatPercent: 31.2, bmi: 34.1, muscleMassKg: 79, source: 'garmin',
          rawProviderDataJson: { password: 'super-secret' },
        },
        energy: { bmrKcal: 2178, tdeeKcal: 2613.6, source: 'mifflin_st_jeor', activityFactor: 1.2 },
        activity: { steps: { current: 6100, target: 8000, goalSource: 'garmin' } },
        nutrition: {
          goalKcal: 2200,
          summary: { totals: { caloriesKcal: 1800, proteinGrams: 140, carbsGrams: 170, fatGrams: 58, fiberGrams: 24 } },
        },
      },
      plans: [
        { id: 'p1', date: '2026-09-21', kind: 'workout', title: 'Rower stacjonarny', completionStrategy: 'activity_link', status: 'planned', plannedDurationSeconds: 1800, notes: 'lekko' },
      ],
      activities: [
        {
          id: 'a1', provider: 'garmin', providerActivityId: '123', activityType: 'walking', startedAt: '2026-09-20T10:00:00+02:00',
          durationSeconds: 3600, distanceMeters: 5200, avgHr: 112, calories: 410,
          rawProviderDataJson: { gpsTrack: [[52.2, 21.0]], authorization: 'Bearer private-token' },
          sourceFilePath: '/secret/garmin.fit',
        },
      ],
      nutrition: [
        { id: 'n1', consumedAt: '2026-09-21T12:00:00+02:00', mealType: 'other', title: 'Kurczak z ryżem', caloriesKcal: 650, proteinGrams: 55, carbsGrams: 70, fatGrams: 15, fiberGrams: 5, quantityText: '1 porcja', notes: null, source: 'hermes' },
      ],
      measurements: [
        { id: 'm1', measuredAt: '2026-09-21T07:00:00+02:00', weightKg: 122.8, bodyFatPercent: 31.2, bmi: 34.1, muscleMassKg: 79, source: 'garmin', rawProviderDataJson: { token: 'measurement-secret' } },
      ],
      progress7: {
        period: { from: '2026-09-15', to: '2026-09-21', days: 7 },
        plan: { completionPercent: 71 }, averages: { steps: 7200, restingHr: 65, hrv: 44, sleepDurationSeconds: 25800 },
        weight: { firstKg: 123.4, latestKg: 122.8, deltaKg: -0.6 },
        series: [{ date: '2026-09-21', caloriesKcal: 1800, caloriesGoalKcal: 2200, steps: 6100, stepsGoal: 8000, rawProviderDataJson: { token: 'series-secret' } }],
      },
      progress30: {
        period: { from: '2026-08-23', to: '2026-09-21', days: 30 },
        plan: { completionPercent: 63 }, averages: { steps: 6800, restingHr: 67, hrv: 41, sleepDurationSeconds: 25000 },
        weight: { firstKg: 125, latestKg: 122.8, deltaKg: -2.2 },
        series: [],
      },
      requestHeaders: { authorization: 'Bearer should-never-leak' },
    } as any);

    expect(context).toMatchObject({
      date: '2026-09-21',
      goals: { steps: 8000, caloriesKcal: 2200 },
      today: {
        steps: { current: 6100, target: 8000, goalSource: 'garmin' },
        weightKg: 122.8,
        health: { restingHr: 64, hrv: 47, sleepDurationSeconds: 27000, vo2Max: 38 },
        energy: { bmrKcal: 2178, tdeeKcal: 2613.6 },
        nutrition: { caloriesKcal: 1800, proteinGrams: 140, carbsGrams: 170, fatGrams: 58, fiberGrams: 24, goalKcal: 2200 },
      },
      recent: {
        activities: [{ id: 'a1', activityType: 'walking', durationSeconds: 3600, distanceMeters: 5200, avgHr: 112, calories: 410 }],
        nutrition: [{ id: 'n1', title: 'Kurczak z ryżem', caloriesKcal: 650 }],
        measurements: [{ measuredAt: '2026-09-21T07:00:00+02:00', weightKg: 122.8 }],
      },
      progress: {
        days7: { planCompletionPercent: 71, averageSteps: 7200, weightDeltaKg: -0.6 },
        days30: { planCompletionPercent: 63, averageSteps: 6800, weightDeltaKg: -2.2 },
      },
    });

    const serialized = JSON.stringify(context);
    for (const forbidden of ['latitude', 'longitude', 'secret-token', 'super-secret', 'private-token', 'measurement-secret', 'series-secret', 'authorization', 'rawProviderDataJson', 'sourceFilePath', '/secret/garmin.fit']) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
