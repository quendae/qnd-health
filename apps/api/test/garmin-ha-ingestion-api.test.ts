import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { hashApiToken } from '../src/auth/token.js';

const pepper = 'test-pepper';
const rawToken = 'qndh_garmin_ha_ingest';
const tokenHash = hashApiToken(rawToken, pepper);
const auth = { authorization: `Bearer ${rawToken}`, 'idempotency-key': '9c225dfa-0773-4940-a2d8-9d0a2c5b1ae4' };

const tokenRepository = {
  async findByHash(hash: string) {
    return hash === tokenHash
      ? { id: 'garmin-ha', tokenHash, scopes: ['health:write', 'activities:write', 'measurements:write'], revokedAt: null }
      : null;
  },
};

describe('Garmin via Home Assistant ingestion API', () => {
  it('upserts rich Garmin daily-health metrics with Home Assistant provenance', async () => {
    let saved: any = null;
    const dailyHealthRepository = {
      async findByDate() { return saved; },
      async list() { return saved ? [saved] : []; },
      async upsert(input: any) { saved = input; return input; },
    };
    const app = buildApp({ tokenPepper: pepper, tokenRepository, dailyHealthRepository: dailyHealthRepository as any });

    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/health/daily/2026-09-21',
      headers: auth,
      payload: {
        source: 'garmin', transport: 'home_assistant', steps: 6842, stepsGoal: 9000,
        floorsAscended: 12, floorsDescended: 3.58, vo2Max: 38, providerBmrKcal: 1390,
        restingHr: 61, hrv: 43, stress: 28, bodyBattery: 67, sleepDurationSeconds: 26760,
        spo2: 96, respiration: 14.2, calories: 2140, activeCalories: 487, hydrationMl: 1800,
        sleepStages: { deepSeconds: 5100, remSeconds: 4800 },
        readiness: { score: 72, status: 'GOOD', trainingStatus: 'maintaining', recoveryHours: 18 },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      date: '2026-09-21', source: 'garmin', steps: 6842, stepsGoal: 9000,
      floorsDescended: 3.58, vo2Max: 38, providerBmrKcal: 1390, bodyBattery: 67,
    });
    expect(saved).toMatchObject({
      transport: 'home_assistant', stepsGoal: 9000, floorsDescended: 3.58, vo2Max: 38, providerBmrKcal: 1390,
      sleepStages: { deepSeconds: 5100 }, readiness: { score: 72, trainingStatus: 'maintaining', recoveryHours: 18 },
    });
    await app.close();
  });

  it('upserts an imported Garmin activity by provider activity id', async () => {
    let saved: any = null;
    const completedActivityRepository = {
      async list() { return saved ? [saved] : []; },
      async findById() { return null; },
      async upsertProviderActivity(input: any) { saved = { id: 'activity-1', ...input }; return saved; },
    };
    const app = buildApp({ tokenPepper: pepper, tokenRepository, completedActivityRepository: completedActivityRepository as any });

    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/activities/garmin/123456789',
      headers: auth,
      payload: {
        transport: 'home_assistant', activityType: 'walking', startedAt: '2026-09-21T09:34:00+02:00',
        durationSeconds: 3250, distanceMeters: 4710, avgHr: 113, maxHr: 139,
        calories: 382, elevationGainMeters: 42, cadence: 108,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ provider: 'garmin', providerActivityId: '123456789', activityType: 'walking' });
    expect(saved).toMatchObject({ provider: 'garmin', providerActivityId: '123456789', transport: 'home_assistant', avgHr: 113 });
    await app.close();
  });

  it('accepts extended Garmin body composition while preserving Garmin provenance', async () => {
    let created: any = null;
    const measurementRepository = {
      async create(input: any) { created = { id: 'measurement-1', ...input }; return created; },
      async list() { return created ? [created] : []; },
    };
    const app = buildApp({ tokenPepper: pepper, tokenRepository, measurementRepository: measurementRepository as any });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/measurements',
      headers: auth,
      payload: {
        measuredAt: '2026-09-21T08:12:00+02:00', source: 'garmin', transport: 'home_assistant',
        weightKg: 121.8, bmi: 34.2, bodyFatPercent: 31.4, muscleMassKg: 79.1,
        bodyWaterPercent: 51.2, boneMassKg: 3.9, visceralFat: 14, metabolicAge: 48, physiqueRating: 3,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ source: 'garmin', weightKg: 121.8, bodyWaterPercent: 51.2, visceralFat: 14 });
    expect(created).toMatchObject({ source: 'garmin', transport: 'home_assistant', boneMassKg: 3.9, metabolicAge: 48 });
    await app.close();
  });
});
