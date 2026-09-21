import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { hashApiToken } from '../src/auth/token.js';
import type { CompletedActivityRepository, CompletedActivityRecord } from '../src/activities/repository.js';

const pepper = 'test-pepper';
const rawToken = 'qndh_activity_reader';
const tokenHash = hashApiToken(rawToken, pepper);
const auth = { authorization: `Bearer ${rawToken}` };

const tokenRepository = {
  async findByHash(hash: string) {
    return hash === tokenHash
      ? { id: 'activity-reader', tokenHash, scopes: ['activities:read'], revokedAt: null }
      : null;
  },
};

class Activities implements CompletedActivityRepository {
  constructor(private readonly items: CompletedActivityRecord[]) {}
  async list() { return this.items; }
  async findById(id: string) { return this.items.find(item => item.id === id) ?? null; }
}

describe('Completed activities API', () => {
  it('lists only activities belonging to the requested Europe/Warsaw calendar day', async () => {
    const activities = new Activities([
      { id: 'a1', provider: 'garmin', activityType: 'walking', startedAt: '2026-09-20T22:30:00.000Z', durationSeconds: 1800, distanceMeters: 2100 },
      { id: 'a2', provider: 'garmin', activityType: 'cycling', startedAt: '2026-09-21T17:00:00.000Z', durationSeconds: 3600, distanceMeters: 22000 },
      { id: 'a3', provider: 'garmin', activityType: 'running', startedAt: '2026-09-21T22:30:00.000Z', durationSeconds: 2400, distanceMeters: 5200 },
    ]);
    const app = buildApp({ tokenPepper: pepper, tokenRepository, completedActivityRepository: activities, timeZone: 'Europe/Warsaw' });

    const response = await app.inject({ method: 'GET', url: '/api/v1/activities?date=2026-09-21', headers: auth });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ items: [{ id: 'a1' }, { id: 'a2' }] });
    expect(response.json().items).toHaveLength(2);
    await app.close();
  });

  it('requires activities:read scope', async () => {
    const deniedToken = 'qndh_no_activity_scope';
    const deniedHash = hashApiToken(deniedToken, pepper);
    const app = buildApp({
      tokenPepper: pepper,
      tokenRepository: { async findByHash(hash: string) { return hash === deniedHash ? { id: 'reader', tokenHash: deniedHash, scopes: ['plans:read'], revokedAt: null } : null; } },
      completedActivityRepository: new Activities([]),
    });

    const response = await app.inject({ method: 'GET', url: '/api/v1/activities?date=2026-09-21', headers: { authorization: `Bearer ${deniedToken}` } });
    expect(response.statusCode).toBe(403);
    await app.close();
  });
});
