import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { hashApiToken } from '../src/auth/token.js';

const pepper = 'profile-pepper';
const writerToken = 'qndh_profile_writer';
const readerToken = 'qndh_profile_reader';

function tokenRepository() {
  const records = new Map([
    [hashApiToken(writerToken, pepper), {
      id: 'profile-writer', tokenHash: hashApiToken(writerToken, pepper),
      scopes: ['measurements:read', 'measurements:write'], revokedAt: null,
    }],
    [hashApiToken(readerToken, pepper), {
      id: 'profile-reader', tokenHash: hashApiToken(readerToken, pepper),
      scopes: ['measurements:read'], revokedAt: null,
    }],
  ]);
  return { async findByHash(hash: string) { return records.get(hash) ?? null; } };
}

function auth(token = writerToken) {
  return { authorization: `Bearer ${token}` };
}

function profileRepository() {
  let stored: any = null;
  return {
    async get() { return stored; },
    async upsert(patch: any) {
      stored = {
        id: 'default',
        dateOfBirth: null,
        sexForBmr: null,
        heightCm: null,
        activityFactor: 1.2,
        defaultStepsGoal: 7500,
        ...(stored ?? {}),
        ...patch,
      };
      return stored;
    },
  };
}

describe('Health Profile API', () => {
  it('returns null until the single-user profile is first saved', async () => {
    const app = buildApp({
      tokenPepper: pepper,
      tokenRepository: tokenRepository(),
      profileRepository: profileRepository(),
    } as any);

    const response = await app.inject({ method: 'GET', url: '/api/v1/profile', headers: auth(readerToken) });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toBeNull();
    await app.close();
  });

  it('upserts validated profile fields and preserves phase-one defaults', async () => {
    const profiles = profileRepository();
    const app = buildApp({ tokenPepper: pepper, tokenRepository: tokenRepository(), profileRepository: profiles } as any);

    const patched = await app.inject({
      method: 'PATCH', url: '/api/v1/profile', headers: auth(),
      payload: { dateOfBirth: '1990-09-21', sexForBmr: 'male', heightCm: 180 },
    });

    expect(patched.statusCode).toBe(200);
    expect(patched.json()).toMatchObject({
      id: 'default', dateOfBirth: '1990-09-21', sexForBmr: 'male', heightCm: 180,
      activityFactor: 1.2, defaultStepsGoal: 7500,
    });

    const read = await app.inject({ method: 'GET', url: '/api/v1/profile', headers: auth(readerToken) });
    expect(read.statusCode).toBe(200);
    expect(read.json()).toEqual(patched.json());
    await app.close();
  });

  it('rejects a future date of birth and invalid physical/settings values', async () => {
    const app = buildApp({ tokenPepper: pepper, tokenRepository: tokenRepository(), profileRepository: profileRepository() } as any);

    for (const payload of [
      { dateOfBirth: '2999-01-01' },
      { heightCm: 0 },
      { activityFactor: 0.9 },
      { defaultStepsGoal: 0 },
    ]) {
      const response = await app.inject({ method: 'PATCH', url: '/api/v1/profile', headers: auth(), payload });
      expect(response.statusCode).toBe(422);
    }
    await app.close();
  });

  it('requires write scope for profile mutation', async () => {
    const app = buildApp({ tokenPepper: pepper, tokenRepository: tokenRepository(), profileRepository: profileRepository() } as any);
    const response = await app.inject({
      method: 'PATCH', url: '/api/v1/profile', headers: auth(readerToken), payload: { defaultStepsGoal: 9000 },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });
});
