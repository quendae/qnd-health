import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { hashApiToken } from '../src/auth/token.js';
import { ProfileGoalService } from '../src/profile/goals.js';
import type { ProfileGoalRevisionRecord, ProfileGoalRevisionRepository } from '../src/profile/goal-repository.js';

const pepper = 'insights-pepper';
const token = 'qndh_insights_reader';
const tokenHash = hashApiToken(token, pepper);
const auth = { authorization: `Bearer ${token}` };

const tokenRepository = {
  async findByHash(hash: string) {
    return hash === tokenHash
      ? { id: 'insights-reader', tokenHash, scopes: ['today:read', 'progress:read'], revokedAt: null }
      : null;
  },
};

const plans = [
  { id: 'p1', date: '2026-09-20', kind: 'manual', title: 'Mobilność', completionStrategy: 'manual', metricKey: null, targetValue: null, currentManualValue: null, unit: null, status: 'completed', linkedActivityId: null },
  { id: 'p2', date: '2026-09-21', kind: 'metric_goal', title: 'Kroki', completionStrategy: 'metric_auto', metricKey: 'steps', targetValue: 8000, currentManualValue: null, unit: 'kroki', status: 'planned', linkedActivityId: null },
  { id: 'p3', date: '2026-09-21', kind: 'workout', title: 'Spacer', completionStrategy: 'activity_link', metricKey: null, targetValue: null, currentManualValue: null, unit: null, status: 'completed', linkedActivityId: 'a2' },
];

const planRepository = {
  async create() { throw new Error('not used'); },
  async list(from?: string, to?: string) { return plans.filter(item => (!from || item.date >= from) && (!to || item.date <= to)); },
  async findById(id: string) { return plans.find(item => item.id === id) ?? null; },
  async update() { return null; },
  async delete() { return false; },
};

const health = [
  {
    date: '2026-09-20', source: 'garmin', steps: 7000, stepsGoal: 7500, restingHr: 66, hrv: 42, bodyBattery: 61,
    sleepDurationSeconds: 25200, vo2Max: 37.5, stress: 32, respiration: 14.2, spo2: 97,
    floorsAscended: 4, floorsDescended: 3, intensityMinutes: 15, activeCalories: 350, hydrationMl: 1800,
  },
  {
    date: '2026-09-21', source: 'garmin', steps: 9000, stepsGoal: null, restingHr: 62, hrv: 48, bodyBattery: 74,
    sleepDurationSeconds: 27000, vo2Max: 38, stress: 28, respiration: 14, spo2: 98,
    floorsAscended: 6, floorsDescended: 5, intensityMinutes: 25, activeCalories: 500, hydrationMl: 2200,
  },
];
const dailyHealthRepository = {
  async findByDate(date: string) { return health.find(item => item.date === date) ?? null; },
  async list(from?: string, to?: string) { return health.filter(item => (!from || item.date >= from) && (!to || item.date <= to)); },
};

const activities = [
  { id: 'a1', provider: 'garmin', activityType: 'walking', startedAt: '2026-09-20T08:00:00+02:00', durationSeconds: 1800, distanceMeters: 2200 },
  { id: 'a2', provider: 'manual', activityType: 'walking', startedAt: '2026-09-21T10:00:00+02:00', durationSeconds: 3600, distanceMeters: 5100 },
];
const completedActivityRepository = {
  async list() { return activities; },
  async findById(id: string) { return activities.find(item => item.id === id) ?? null; },
};

const measurements = [
  {
    id: 'm1', measuredAt: '2026-09-20T07:00:00+02:00', weightKg: 123.4, bodyFatPercent: 31.2, bmi: 38.1, muscleMassKg: 80.2,
    fatFreeMassKg: 84.9, subcutaneousFatPercent: 25.5, bodyWaterPercent: 50.1, skeletalMusclePercent: 40.2, boneMassKg: 3.8,
    visceralFat: 16, proteinPercent: 15.8, scaleBmrKcal: 2140, metabolicAge: 49, bicepsCircumferenceCm: 39,
    chestCircumferenceCm: 115, waistCircumferenceCm: 121, hipsCircumferenceCm: 116, thighCircumferenceCm: 67, source: 'manual',
  },
  {
    id: 'm2', measuredAt: '2026-09-21T07:00:00+02:00', weightKg: 122.8, bodyFatPercent: 30.8, bmi: 37.9, muscleMassKg: 80.4,
    fatFreeMassKg: 85, subcutaneousFatPercent: 25.2, bodyWaterPercent: 50.4, skeletalMusclePercent: 40.5, boneMassKg: 3.8,
    visceralFat: 15, proteinPercent: 16, scaleBmrKcal: 2135, metabolicAge: 48, bicepsCircumferenceCm: 39.2,
    chestCircumferenceCm: 114.5, waistCircumferenceCm: 120, hipsCircumferenceCm: 115.5, thighCircumferenceCm: 66.5, source: 'manual',
  },
];
const measurementRepository = {
  async create() { throw new Error('not used'); },
  async list() { return measurements; },
};

const nutrition = [
  { id: 'n1', consumedAt: '2026-09-20T08:00:00+02:00', mealType: 'other', title: 'Śniadanie', caloriesKcal: 700, proteinGrams: 30, carbsGrams: 80, fatGrams: 20, fiberGrams: 10, quantityText: null, notes: null, source: 'hermes' },
  { id: 'n2', consumedAt: '2026-09-20T18:00:00+02:00', mealType: 'other', title: 'Kolacja', caloriesKcal: 900, proteinGrams: 45, carbsGrams: 90, fatGrams: 30, fiberGrams: 8, quantityText: null, notes: null, source: 'hermes' },
  { id: 'n3', consumedAt: '2026-09-21T13:00:00+02:00', mealType: 'other', title: 'Obiad', caloriesKcal: 1100, proteinGrams: 60, carbsGrams: 100, fatGrams: 35, fiberGrams: 12, quantityText: null, notes: null, source: 'hermes' },
];
const nutritionRepository = {
  async create() { throw new Error('not used'); },
  async list() { return nutrition; },
};

const profileRepository = {
  async get() {
    return { id: 'default' as const, dateOfBirth: null, sexForBmr: null, heightCm: null, activityFactor: 1.2, defaultStepsGoal: 7500, dailyCaloriesGoalKcal: 2200, dailyProteinGoalGrams: 160 };
  },
  async upsert() { throw new Error('not used'); },
};

function goalService() {
  const rows: ProfileGoalRevisionRecord[] = [
    {
      id: 'goals-old', effectiveFrom: '2026-09-20', source: 'manual', sourceRef: null, reason: null,
      activityFactor: 1.2, defaultStepsGoal: 7500, dailyCaloriesGoalKcal: 2200, dailyProteinGoalGrams: 160,
      dailyCarbsGoalGrams: 240, dailyFatGoalGrams: 70, dailyFiberGoalGrams: 30, createdAt: '2026-09-20T06:00:00.000Z',
    },
    {
      id: 'goals-new', effectiveFrom: '2026-09-21', source: 'coach', sourceRef: 'conv-1', reason: 'Korekta',
      activityFactor: 1.3, defaultStepsGoal: 8000, dailyCaloriesGoalKcal: 2000, dailyProteinGoalGrams: 170,
      dailyCarbsGoalGrams: 180, dailyFatGoalGrams: 65, dailyFiberGoalGrams: 32, createdAt: '2026-09-21T06:00:00.000Z',
    },
  ];
  const repository: ProfileGoalRevisionRepository = {
    async findActiveOn(date) {
      return [...rows].filter(row => row.effectiveFrom <= date).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.createdAt.localeCompare(a.createdAt))[0] ?? null;
    },
    async list() { return [...rows]; },
    async count() { return rows.length; },
    async create(input) { const row: ProfileGoalRevisionRecord = { id: `g${rows.length + 1}`, createdAt: new Date().toISOString(), ...input }; rows.push(row); return row; },
  };
  return new ProfileGoalService(repository, profileRepository);
}

function app() {
  return buildApp({
    tokenPepper: pepper, tokenRepository, planRepository, dailyHealthRepository, completedActivityRepository,
    measurementRepository, nutritionRepository, profileRepository, profileGoalService: goalService(), timeZone: 'Europe/Warsaw',
  } as any);
}

describe('history and progress API', () => {
  it('returns every calendar day in the requested history range, including empty days', async () => {
    const server = app();
    const response = await server.inject({ method: 'GET', url: '/api/v1/history?from=2026-09-19&to=2026-09-21', headers: auth });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      from: '2026-09-19', to: '2026-09-21',
      days: [
        { date: '2026-09-21', health: { steps: 9000 }, weightKg: 122.8, activities: [{ id: 'a2' }] },
        { date: '2026-09-20', health: { steps: 7000 }, weightKg: 123.4, activities: [{ id: 'a1' }] },
        { date: '2026-09-19', health: null, weightKg: null, plans: [], activities: [] },
      ],
    });
    expect(response.json().days[0].plans).toHaveLength(2);
    await server.close();
  });

  it('returns rich progress metrics and resolves nutrition goals for each historical day', async () => {
    const server = app();
    const response = await server.inject({ method: 'GET', url: '/api/v1/progress?from=2026-09-20&to=2026-09-21', headers: auth });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      period: { from: '2026-09-20', to: '2026-09-21', days: 2 },
      plan: { total: 3, completed: 3, partial: 0, planned: 0, completionPercent: 100 },
      activity: { count: 2, durationSeconds: 5400, distanceMeters: 7300 },
      averages: {
        steps: 8000, restingHr: 64, hrv: 45, bodyBattery: 67.5, sleepDurationSeconds: 26100,
        stress: 30, respiration: 14.1, spo2: 97.5, vo2Max: 37.8, floorsAscended: 5, floorsDescended: 4,
        intensityMinutes: 20, activeCalories: 425, hydrationMl: 2000,
      },
      weight: { firstKg: 123.4, latestKg: 122.8, deltaKg: -0.6 },
    });
    expect(response.json().series).toEqual([
      expect.objectContaining({
        date: '2026-09-20', steps: 7000, stepsGoal: 7500, caloriesKcal: 1600, caloriesGoalKcal: 2200,
        proteinGrams: 75, proteinGoalGrams: 160, carbsGrams: 170, carbsGoalGrams: 240, fatGrams: 50, fatGoalGrams: 70,
        fiberGrams: 18, fiberGoalGrams: 30, stress: 32, respiration: 14.2, spo2: 97, floorsAscended: 4, floorsDescended: 3,
        intensityMinutes: 15, activeCalories: 350, hydrationMl: 1800, bodyFatPercent: 31.2, bmi: 38.1,
        muscleMassKg: 80.2, bodyWaterPercent: 50.1, visceralFat: 16, waistCircumferenceCm: 121, vo2Max: 37.5,
      }),
      expect.objectContaining({
        date: '2026-09-21', steps: 9000, stepsGoal: 8000, caloriesKcal: 1100, caloriesGoalKcal: 2000,
        proteinGrams: 60, proteinGoalGrams: 170, carbsGrams: 100, carbsGoalGrams: 180, fatGrams: 35, fatGoalGrams: 65,
        fiberGrams: 12, fiberGoalGrams: 32, stress: 28, respiration: 14, spo2: 98, floorsAscended: 6, floorsDescended: 5,
        intensityMinutes: 25, activeCalories: 500, hydrationMl: 2200, bodyFatPercent: 30.8, bmi: 37.9,
        muscleMassKg: 80.4, bodyWaterPercent: 50.4, visceralFat: 15, waistCircumferenceCm: 120, vo2Max: 38,
      }),
    ]);
    await server.close();
  });
});
