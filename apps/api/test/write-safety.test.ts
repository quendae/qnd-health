import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { hashApiToken } from '../src/auth/token.js';

const pepper = 'write-safety-pepper';
const rawToken = 'qndh_write-safety-secret';

function tokenRepository() {
  const tokenHash = hashApiToken(rawToken, pepper);
  return {
    async findByHash(hash: string) {
      return hash === tokenHash
        ? { id: 'hermes-token', tokenHash, scopes: ['nutrition:read', 'nutrition:write'], revokedAt: null }
        : null;
    },
  };
}

class MemoryNutritionRepository {
  createCount = 0;
  items: any[] = [];
  async create(input: any) {
    this.createCount += 1;
    const item = { ...input, id: `nutrition-${this.createCount}` };
    this.items.push(item);
    return item;
  }
  async list() { return [...this.items]; }
  async findById(id: string) { return this.items.find((item) => item.id === id) ?? null; }
  async update() { return null; }
  async delete() { return false; }
}

class MemoryAuditRepository {
  events: any[] = [];
  async record(event: any) {
    this.events.push(event);
  }
}

class MemoryIdempotencyRepository {
  records = new Map<string, any>();
  private key(tokenId: string, route: string, idempotencyKey: string) {
    return `${tokenId}:${route}:${idempotencyKey}`;
  }
  async find(tokenId: string, route: string, idempotencyKey: string) {
    return this.records.get(this.key(tokenId, route, idempotencyKey)) ?? null;
  }
  async save(record: any) {
    this.records.set(this.key(record.tokenId, record.route, record.idempotencyKey), record);
  }
}

function payload(caloriesKcal = 500) {
  return {
    consumedAt: '2026-09-21T08:00:00+02:00',
    mealType: 'breakfast',
    title: 'Breakfast',
    caloriesKcal,
    proteinGrams: 30,
    carbsGrams: 50,
    fatGrams: 20,
  };
}

describe('Hermes write safety', () => {
  it('replays the original response for the same Idempotency-Key without duplicating a meal or audit event', async () => {
    const nutrition = new MemoryNutritionRepository();
    const audit = new MemoryAuditRepository();
    const idempotency = new MemoryIdempotencyRepository();
    const app = buildApp({
      tokenPepper: pepper,
      tokenRepository: tokenRepository(),
      nutritionRepository: nutrition,
      auditRepository: audit,
      idempotencyRepository: idempotency,
    } as any);

    const request = {
      method: 'POST' as const,
      url: '/api/v1/nutrition',
      headers: {
        authorization: `Bearer ${rawToken}`,
        'idempotency-key': 'meal-2026-09-21-breakfast',
      },
      payload: payload(),
    };

    const first = await app.inject(request);
    const retry = await app.inject(request);

    expect(first.statusCode).toBe(201);
    expect(retry.statusCode).toBe(201);
    expect(retry.json()).toEqual(first.json());
    expect(nutrition.createCount).toBe(1);
    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]).toMatchObject({
      apiTokenId: 'hermes-token',
      action: 'nutrition.create',
      entityType: 'NutritionEntry',
      entityId: 'nutrition-1',
    });
    expect(JSON.stringify(audit.events[0])).not.toContain(rawToken);

    await app.close();
  });

  it('returns 409 when the same idempotency key is reused for a different request body', async () => {
    const nutrition = new MemoryNutritionRepository();
    const audit = new MemoryAuditRepository();
    const idempotency = new MemoryIdempotencyRepository();
    const app = buildApp({
      tokenPepper: pepper,
      tokenRepository: tokenRepository(),
      nutritionRepository: nutrition,
      auditRepository: audit,
      idempotencyRepository: idempotency,
    } as any);

    const headers = {
      authorization: `Bearer ${rawToken}`,
      'idempotency-key': 'same-key',
    };
    await app.inject({ method: 'POST', url: '/api/v1/nutrition', headers, payload: payload(500) });
    const conflict = await app.inject({ method: 'POST', url: '/api/v1/nutrition', headers, payload: payload(700) });

    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({ error: { code: 'idempotency_conflict' } });
    expect(nutrition.createCount).toBe(1);
    expect(audit.events).toHaveLength(1);

    await app.close();
  });
});
