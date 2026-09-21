import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { hashApiToken } from '../src/auth/token.js';

const pepper = 'today-pepper';
const token = 'qndh_today-reader';

function tokenRepository() {
  const tokenHash = hashApiToken(token, pepper);
  return {
    async findByHash(hash: string) {
      return hash === tokenHash
        ? { id: 'today-reader', tokenHash, scopes: ['today:read'], revokedAt: null }
        : null;
    },
  };
}

const plans = [
  {
    id: 'steps', date: '2026-09-21', kind: 'metric_goal', title: 'Steps',
    completionStrategy: 'metric_auto', metricKey: 'steps', targetValue: 7500,
    currentManualValue: null, unit: 'steps', status: 'planned',
    activityType: null, plannedDurationSeconds: null, plannedDistanceMeters: null,
  },
  {
    id: 'stairs', date: '2026-09-21', kind: 'count_goal', title: 'Stair loops',
    completionStrategy: 'count_manual', metricKey: null, targetValue: 8,
    currentManualValue: 5, unit: 'loops', status: 'partial',
    activityType: null, plannedDurationSeconds: null, plannedDistanceMeters: null,
  },
  {
    id: 'run', date: '2026-09-21', kind: 'workout', title: 'Easy run',
    completionStrategy: 'activity_link', metricKey: null, targetValue: null,
    currentManualValue: null, unit: null, status: 'planned',
    activityType: 'running', plannedDurationSeconds: 1800, plannedDistanceMeters: 5000,
  },
  {
    id: 'tuesday', date: '2026-09-22', kind: 'manual', title: 'Mobility',
    completionStrategy: 'manual', metricKey: null, targetValue: null,
    currentManualValue: null, unit: null, status: 'planned',
    activityType: null, plannedDurationSeconds: null, plannedDistanceMeters: null,
  },
];

const planRepository = {
  async create() { throw new Error('not used'); },
  async list(from?: string, to?: string) {
    return plans.filter((plan) => (!from || plan.date >= from) && (!to || plan.date <= to));
  },
  async findById(id: string) { return plans.find((plan) => plan.id === id) ?? null; },
  async update() { throw new Error('not used'); },
  async delete() { return false; },
};

const nutritionEntries = [
  {
    id: 'breakfast', consumedAt: '2026-09-21T08:00:00+02:00', mealType: 'breakfast',
    title: 'Breakfast', caloriesKcal: 500, proteinGrams: 30, carbsGrams: 50,
    fatGrams: 20, fiberGrams: null, quantityText: null, notes: null, source: 'hermes',
  },
  {
    id: 'old-meal', consumedAt: '2026-09-20T19:00:00+02:00', mealType: 'dinner',
    title: 'Yesterday dinner', caloriesKcal: 600, proteinGrams: 35, carbsGrams: 55,
    fatGrams: 25, fiberGrams: 8, quantityText: null, notes: null, source: 'hermes',
  },
];

const nutritionRepository = {
  async create() { throw new Error('not used'); },
  async list() { return [...nutritionEntries]; },
  async findById() { return null; },
  async update() { return null; },
  async delete() { return false; },
};

const measurementRepository = {
  async create() { throw new Error('not used'); },
  async list() {
    return [
      { id: 'weight-new', measuredAt: '2026-09-21T07:00:00+02:00', weightKg: 122.8, bodyFatPercent: null, bmi: null, muscleMassKg: null, source: 'hermes' },
      { id: 'weight-old', measuredAt: '2026-09-20T07:00:00+02:00', weightKg: 123.4, bodyFatPercent: null, bmi: null, muscleMassKg: null, source: 'hermes' },
    ];
  },
};

const dailyHealthRepository = {
  async findByDate(date: string) {
    return date === '2026-09-21'
      ? {
          date, source: 'garmin', steps: 6120, floorsAscended: 9,
          restingHr: 64, hrv: 47, bodyBattery: 76,
          sleepDurationSeconds: 27180,
        }
      : null;
  },
  async list() { return []; },
};

const completedActivityRepository = {
  async list() {
    return [
      {
        id: 'garmin-run', provider: 'garmin', activityType: 'running',
        startedAt: '2026-09-21T07:30:00+02:00', durationSeconds: 1860,
        distanceMeters: 5200,
      },
      {
        id: 'garmin-walk', provider: 'garmin', activityType: 'walking',
        startedAt: '2026-09-21T11:00:00+02:00', durationSeconds: 1800,
        distanceMeters: 2500,
      },
    ];
  },
};

describe('GET /api/v1/today', () => {
  it('composes activity, nutrition, health, weight and remaining week into one daily read model', async () => {
    const app = buildApp({
      tokenPepper: pepper,
      tokenRepository: tokenRepository(),
      planRepository,
      nutritionRepository,
      measurementRepository,
      dailyHealthRepository,
      completedActivityRepository,
      timeZone: 'Europe/Warsaw',
    } as any);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/today?date=2026-09-21',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();

    expect(body).toMatchObject({
      date: '2026-09-21',
      health: {
        source: 'garmin', steps: 6120, restingHr: 64, bodyBattery: 76,
      },
      latestMeasurement: { weightKg: 122.8 },
      nutrition: {
        summary: {
          entryCount: 1,
          totals: { caloriesKcal: 500, proteinGrams: 30, carbsGrams: 50, fatGrams: 20 },
        },
      },
    });

    expect(body.activity.items.find((item: any) => item.id === 'steps')).toMatchObject({
      status: 'partial', progress: { currentValue: 6120, targetValue: 7500 },
    });
    expect(body.activity.items.find((item: any) => item.id === 'stairs')).toMatchObject({
      status: 'partial', progress: { currentValue: 5, targetValue: 8, ratio: 0.625 },
    });
    expect(body.activity.items.find((item: any) => item.id === 'run').candidates[0]).toMatchObject({
      id: 'garmin-run', provider: 'garmin', score: 98,
    });
    expect(body.nutrition.entries.map((entry: any) => entry.id)).toEqual(['breakfast']);
    expect(body.remainingWeek.map((item: any) => item.id)).toEqual(['tuesday']);
    expect(body.weekToDate).toMatchObject({ totalPlanItems: 3, completed: 0, partial: 2 });

    await app.close();
  });

  it('remains useful when Garmin health data is absent', async () => {
    const app = buildApp({
      tokenPepper: pepper,
      tokenRepository: tokenRepository(),
      planRepository,
      nutritionRepository,
      measurementRepository,
      dailyHealthRepository: { async findByDate() { return null; }, async list() { return []; } },
      completedActivityRepository,
      timeZone: 'Europe/Warsaw',
    } as any);

    const response = await app.inject({
      method: 'GET', url: '/api/v1/today?date=2026-09-21',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ date: '2026-09-21', health: null });
    expect(response.json().activity.items.find((item: any) => item.id === 'steps')).toMatchObject({
      status: 'planned', progress: { currentValue: 0, targetValue: 7500 },
    });

    await app.close();
  });
});
