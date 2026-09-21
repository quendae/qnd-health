import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { hashApiToken } from '../src/auth/token.js';

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
  { date: '2026-09-20', source: 'garmin', steps: 7000, restingHr: 66, hrv: 42, bodyBattery: 61, sleepDurationSeconds: 25200 },
  { date: '2026-09-21', source: 'garmin', steps: 9000, restingHr: 62, hrv: 48, bodyBattery: 74, sleepDurationSeconds: 27000 },
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
  { id: 'm1', measuredAt: '2026-09-20T07:00:00+02:00', weightKg: 123.4, bodyFatPercent: null, bmi: null, muscleMassKg: null, source: 'manual' },
  { id: 'm2', measuredAt: '2026-09-21T07:00:00+02:00', weightKg: 122.8, bodyFatPercent: null, bmi: null, muscleMassKg: null, source: 'manual' },
];
const measurementRepository = {
  async create() { throw new Error('not used'); },
  async list() { return measurements; },
};

function app() {
  return buildApp({ tokenPepper: pepper, tokenRepository, planRepository, dailyHealthRepository, completedActivityRepository, measurementRepository, timeZone: 'Europe/Warsaw' } as any);
}

describe('history and progress API', () => {
  it('builds daily history with plans, health, activities and weight', async () => {
    const server = app();
    const response = await server.inject({ method: 'GET', url: '/api/v1/history?from=2026-09-20&to=2026-09-21', headers: auth });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      from: '2026-09-20', to: '2026-09-21',
      days: [
        { date: '2026-09-21', health: { steps: 9000 }, weightKg: 122.8, activities: [{ id: 'a2' }] },
        { date: '2026-09-20', health: { steps: 7000 }, weightKg: 123.4, activities: [{ id: 'a1' }] },
      ],
    });
    expect(response.json().days[0].plans).toHaveLength(2);
    await server.close();
  });

  it('aggregates progress without inventing missing data', async () => {
    const server = app();
    const response = await server.inject({ method: 'GET', url: '/api/v1/progress?from=2026-09-20&to=2026-09-21', headers: auth });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      period: { from: '2026-09-20', to: '2026-09-21', days: 2 },
      plan: { total: 3, completed: 3, partial: 0, planned: 0, completionPercent: 100 },
      activity: { count: 2, durationSeconds: 5400, distanceMeters: 7300 },
      averages: { steps: 8000, restingHr: 64, hrv: 45, bodyBattery: 67.5, sleepDurationSeconds: 26100 },
      weight: { firstKg: 123.4, latestKg: 122.8, deltaKg: -0.6 },
    });
    expect(response.json().series).toHaveLength(2);
    await server.close();
  });
});
