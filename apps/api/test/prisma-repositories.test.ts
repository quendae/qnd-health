import { describe, expect, it, vi } from 'vitest';
import { createPrismaRepositories } from '../src/persistence/prisma-repositories.js';

function fakeClient() {
  return {
    planItem: {
      create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), deleteMany: vi.fn(),
    },
    nutritionEntry: {
      create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), deleteMany: vi.fn(),
    },
    bodyMeasurement: { create: vi.fn(), findMany: vi.fn() },
    dailyHealth: { findFirst: vi.fn(), findMany: vi.fn() },
    completedActivity: { findMany: vi.fn() },
    apiToken: { findUnique: vi.fn() },
    auditEvent: { create: vi.fn() },
    idempotencyRecord: { findUnique: vi.fn(), upsert: vi.fn() },
  };
}

describe('Prisma repository adapters', () => {
  it('maps PlanItem database dates and linked activity to the domain record', async () => {
    const prisma = fakeClient();
    prisma.planItem.findMany.mockResolvedValue([
      {
        id: 'plan-1', date: new Date('2026-09-21T00:00:00.000Z'), kind: 'workout', title: 'Easy run',
        completionStrategy: 'activity_link', metricKey: null, targetValue: null, currentManualValue: null,
        unit: null, status: 'completed', activityType: 'running', plannedDurationSeconds: 1800,
        plannedDistanceMeters: 5000, activityMatch: { completedActivityId: 'activity-1' },
      },
    ]);

    const repositories = createPrismaRepositories(prisma as any);
    const items = await repositories.planRepository.list('2026-09-21', '2026-09-21');

    expect(items).toEqual([
      expect.objectContaining({
        id: 'plan-1', date: '2026-09-21', completionStrategy: 'activity_link', linkedActivityId: 'activity-1',
      }),
    ]);
    expect(prisma.planItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { date: { gte: new Date('2026-09-21T00:00:00.000Z'), lte: new Date('2026-09-21T00:00:00.000Z') } },
    }));
  });

  it('preserves unknown nutrition macros as null and chronological ISO timestamps', async () => {
    const prisma = fakeClient();
    prisma.nutritionEntry.findMany.mockResolvedValue([
      {
        id: 'meal-1', consumedAt: new Date('2026-09-21T06:00:00.000Z'), mealType: 'breakfast', title: 'Breakfast',
        caloriesKcal: 520, proteinGrams: 31, carbsGrams: null, fatGrams: 18, fiberGrams: null,
        quantityText: null, notes: null, source: 'hermes',
      },
    ]);

    const repositories = createPrismaRepositories(prisma as any);
    const items = await repositories.nutritionRepository.list('2026-09-21T00:00:00.000Z', '2026-09-21T23:59:59.999Z');

    expect(items[0]).toMatchObject({
      consumedAt: '2026-09-21T06:00:00.000Z', carbsGrams: null, fiberGrams: null, source: 'hermes',
    });
  });

  it('loads API tokens by hash without exposing any raw token material', async () => {
    const prisma = fakeClient();
    prisma.apiToken.findUnique.mockResolvedValue({
      id: 'token-1', tokenHash: 'abc', scopes: ['today:read'], revokedAt: null,
    });

    const repositories = createPrismaRepositories(prisma as any);
    await expect(repositories.tokenRepository.findByHash('abc')).resolves.toEqual({
      id: 'token-1', tokenHash: 'abc', scopes: ['today:read'], revokedAt: null,
    });
    expect(prisma.apiToken.findUnique).toHaveBeenCalledWith({ where: { tokenHash: 'abc' } });
  });

  it('persists and replays idempotency records using the route-scoped composite key', async () => {
    const prisma = fakeClient();
    prisma.idempotencyRecord.findUnique.mockResolvedValue({
      tokenId: 'token-1', route: 'POST /api/v1/nutrition', idempotencyKey: 'meal-42', requestHash: 'hash',
      responseStatus: 201, responseJson: { id: 'meal-1' }, expiresAt: new Date(Date.now() + 60_000),
    });

    const repositories = createPrismaRepositories(prisma as any);
    const found = await repositories.idempotencyRepository.find('token-1', 'POST /api/v1/nutrition', 'meal-42');
    expect(found).toMatchObject({ responseStatus: 201, responseJson: { id: 'meal-1' } });

    await repositories.idempotencyRepository.save({
      tokenId: 'token-1', route: 'POST /api/v1/nutrition', idempotencyKey: 'meal-42', requestHash: 'hash',
      responseStatus: 201, responseJson: { id: 'meal-1' },
    });
    expect(prisma.idempotencyRecord.upsert).toHaveBeenCalledOnce();
  });
});
