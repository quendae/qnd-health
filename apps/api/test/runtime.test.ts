import { describe, expect, it, vi } from 'vitest';
import { hashApiToken } from '../src/auth/token.js';
import { buildRuntimeApp } from '../src/runtime.js';

const rawToken = 'qndh_runtime_test_token';
const pepper = 'runtime-test-pepper';

function fakePrisma() {
  return {
    planItem: {
      findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn(),
    },
    nutritionEntry: {
      findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn(),
    },
    bodyMeasurement: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
    healthProfile: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
    dailyHealth: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
    completedActivity: { findMany: vi.fn().mockResolvedValue([]) },
    coachConversation: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn(), create: vi.fn() },
    coachMessage: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
    apiToken: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'web-token', tokenHash: hashApiToken(rawToken, pepper), scopesJson: JSON.stringify(['today:read', 'coach:read', 'coach:write']), revokedAt: null,
      }),
    },
    auditEvent: { create: vi.fn() },
    idempotencyRecord: { findUnique: vi.fn(), upsert: vi.fn() },
  };
}

describe('buildRuntimeApp', () => {
  it('wires persistent repositories into the authenticated Today aggregate', async () => {
    const prisma = fakePrisma();
    const app = buildRuntimeApp({
      prisma: prisma as any,
      tokenPepper: pepper,
      timeZone: 'Europe/Warsaw',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/today?date=2026-09-21',
      headers: { authorization: `Bearer ${rawToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ date: '2026-09-21', health: null, energy: null });
    expect(prisma.planItem.findMany).toHaveBeenCalled();
    expect(prisma.nutritionEntry.findMany).toHaveBeenCalled();
    expect(prisma.bodyMeasurement.findMany).toHaveBeenCalled();
    expect(prisma.healthProfile.findUnique).toHaveBeenCalled();
    expect(prisma.dailyHealth.findFirst).toHaveBeenCalled();
    expect(prisma.completedActivity.findMany).toHaveBeenCalled();
    expect(prisma.apiToken.findUnique).toHaveBeenCalled();

    await app.close();
  });

  it('registers persisted Coach conversations even when DeepSeek is not configured yet', async () => {
    const prisma = fakePrisma();
    const app = buildRuntimeApp({
      prisma: prisma as any,
      tokenPepper: pepper,
      timeZone: 'Europe/Warsaw',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/coach/conversations',
      headers: { authorization: `Bearer ${rawToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ conversations: [] });
    expect(prisma.coachConversation.findMany).toHaveBeenCalled();
    await app.close();
  });
});
