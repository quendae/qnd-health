import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { hashApiToken } from '../src/auth/token.js';

const pepper = 'circumference-pepper';
const rawToken = 'qndh_hermes_measurements';
const tokenHash = hashApiToken(rawToken, pepper);
const auth = {
  authorization: `Bearer ${rawToken}`,
  'idempotency-key': '6a06d2de-a46b-4df1-a765-0f775a2d91fb',
};

const tokenRepository = {
  async findByHash(hash: string) {
    return hash === tokenHash
      ? { id: 'hermes-measurements', tokenHash, scopes: ['measurements:write', 'measurements:read'], revokedAt: null }
      : null;
  },
};

describe('Hermes manual circumference ingestion', () => {
  it('stores body circumferences alongside the current body measurement snapshot', async () => {
    let created: any = null;
    const measurementRepository = {
      async create(input: any) {
        created = { id: 'measurement-circumference-1', ...input };
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
        measuredAt: '2026-09-21T21:45:00+02:00',
        source: 'hermes',
        transport: 'manual_input',
        weightKg: 82.4,
        bicepsCircumferenceCm: 36.2,
        chestCircumferenceCm: 101.5,
        waistCircumferenceCm: 88.4,
        hipsCircumferenceCm: 98.8,
        thighCircumferenceCm: 57.5,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      source: 'hermes',
      transport: 'manual_input',
      bicepsCircumferenceCm: 36.2,
      chestCircumferenceCm: 101.5,
      waistCircumferenceCm: 88.4,
      hipsCircumferenceCm: 98.8,
      thighCircumferenceCm: 57.5,
    });
    expect(created).toMatchObject({
      weightKg: 82.4,
      waistCircumferenceCm: 88.4,
      hipsCircumferenceCm: 98.8,
    });
    await app.close();
  });
});
