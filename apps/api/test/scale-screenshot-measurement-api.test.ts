import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { hashApiToken } from '../src/auth/token.js';

const pepper = 'scale-pepper';
const rawToken = 'qndh_scale_hermes';
const tokenHash = hashApiToken(rawToken, pepper);
const auth = {
  authorization: `Bearer ${rawToken}`,
  'idempotency-key': '7dc1a94c-2eb4-4a83-b2c9-bf4df4113d22',
};

const tokenRepository = {
  async findByHash(hash: string) {
    return hash === tokenHash
      ? { id: 'hermes-scale', tokenHash, scopes: ['measurements:write', 'measurements:read'], revokedAt: null }
      : null;
  },
};

describe('Scale screenshot measurement ingestion', () => {
  it('stores the full body-composition snapshot extracted by Hermes', async () => {
    let created: any = null;
    const measurementRepository = {
      async create(input: any) {
        created = { id: 'measurement-scale-1', ...input };
        return created;
      },
      async list() {
        return created ? [created] : [];
      },
    };
    const app = buildApp({
      tokenPepper: pepper,
      tokenRepository,
      measurementRepository: measurementRepository as any,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/measurements',
      headers: auth,
      payload: {
        measuredAt: '2026-09-21T07:35:00+02:00',
        source: 'hermes',
        transport: 'scale_screenshot',
        weightKg: 121.8,
        bmi: 34.2,
        bodyFatPercent: 31.4,
        fatFreeMassKg: 83.6,
        subcutaneousFatPercent: 27.4,
        visceralFat: 14,
        bodyWaterPercent: 51.2,
        skeletalMusclePercent: 42.1,
        muscleMassKg: 79.1,
        boneMassKg: 3.9,
        proteinPercent: 16.1,
        scaleBmrKcal: 1968,
        metabolicAge: 48,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      source: 'hermes',
      transport: 'scale_screenshot',
      weightKg: 121.8,
      fatFreeMassKg: 83.6,
      subcutaneousFatPercent: 27.4,
      skeletalMusclePercent: 42.1,
      proteinPercent: 16.1,
      scaleBmrKcal: 1968,
    });
    expect(created).toMatchObject({
      source: 'hermes',
      transport: 'scale_screenshot',
      bodyWaterPercent: 51.2,
      boneMassKg: 3.9,
      visceralFat: 14,
      metabolicAge: 48,
    });
    await app.close();
  });
});
