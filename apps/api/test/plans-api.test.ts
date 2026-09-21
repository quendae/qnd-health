import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { hashApiToken } from '../src/auth/token.js';
import type { NewStoredPlanItem, PlanRepository, StoredPlanItem } from '../src/plans/repository.js';

class MemoryPlanRepository implements PlanRepository {
  private plans = new Map<string, StoredPlanItem>();
  private nextId = 1;

  async create(input: NewStoredPlanItem): Promise<StoredPlanItem> {
    const plan: StoredPlanItem = { ...input, id: `plan-${this.nextId++}` };
    this.plans.set(plan.id, plan);
    return plan;
  }

  async list(from?: string, to?: string): Promise<StoredPlanItem[]> {
    return [...this.plans.values()].filter((plan) => (
      (!from || plan.date >= from) && (!to || plan.date <= to)
    ));
  }

  async findById(id: string): Promise<StoredPlanItem | null> {
    return this.plans.get(id) ?? null;
  }

  async update(id: string, patch: Partial<StoredPlanItem>): Promise<StoredPlanItem | null> {
    const existing = this.plans.get(id);
    if (!existing) return null;
    const updated: StoredPlanItem = { ...existing, ...patch, id };
    this.plans.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.plans.delete(id);
  }
}

const pepper = 'test-pepper';
const writerToken = 'qndh_writer';
const readerToken = 'qndh_reader';

function tokenRepository() {
  const records = new Map([
    [hashApiToken(writerToken, pepper), {
      id: 'writer', tokenHash: hashApiToken(writerToken, pepper),
      scopes: ['plans:read', 'plans:write'], revokedAt: null,
    }],
    [hashApiToken(readerToken, pepper), {
      id: 'reader', tokenHash: hashApiToken(readerToken, pepper),
      scopes: ['plans:read'], revokedAt: null,
    }],
  ]);

  return {
    async findByHash(hash: string) {
      return records.get(hash) ?? null;
    },
  };
}

function auth(token = writerToken) {
  return { authorization: `Bearer ${token}` };
}

describe('Hermes PlanItem API', () => {
  let plans: MemoryPlanRepository;

  beforeEach(() => {
    plans = new MemoryPlanRepository();
  });

  it('requires a Bearer token', async () => {
    const app = buildApp({ tokenPepper: pepper, tokenRepository: tokenRepository(), planRepository: plans });
    const response = await app.inject({ method: 'GET', url: '/api/v1/plans' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'unauthorized' } });
    await app.close();
  });

  it('forbids a read-only token from creating a plan item', async () => {
    const app = buildApp({ tokenPepper: pepper, tokenRepository: tokenRepository(), planRepository: plans });
    const response = await app.inject({
      method: 'POST', url: '/api/v1/plans', headers: auth(readerToken),
      payload: {
        date: '2026-09-21', kind: 'count_goal', title: 'Stair loops',
        completionStrategy: 'count_manual', targetValue: 8, unit: 'loops',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: 'forbidden' } });
    await app.close();
  });

  it('creates a count goal and derives progress from 0/8 to 5/8 to completed', async () => {
    const app = buildApp({ tokenPepper: pepper, tokenRepository: tokenRepository(), planRepository: plans });
    const created = await app.inject({
      method: 'POST', url: '/api/v1/plans', headers: auth(),
      payload: {
        date: '2026-09-21', kind: 'count_goal', title: 'Stair loops',
        completionStrategy: 'count_manual', targetValue: 8, unit: 'loops',
      },
    });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      id: 'plan-1', title: 'Stair loops', status: 'planned',
      progress: { currentValue: 0, targetValue: 8, ratio: 0 },
    });

    const partial = await app.inject({
      method: 'POST', url: '/api/v1/plans/plan-1/progress', headers: auth(),
      payload: { value: 5 },
    });
    expect(partial.statusCode).toBe(200);
    expect(partial.json()).toMatchObject({ status: 'partial', progress: { currentValue: 5, targetValue: 8, ratio: 0.625 } });

    const completed = await app.inject({
      method: 'POST', url: '/api/v1/plans/plan-1/progress', headers: auth(),
      payload: { value: 8 },
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.json()).toMatchObject({ status: 'completed', progress: { currentValue: 8, targetValue: 8, ratio: 1 } });

    await app.close();
  });

  it('keeps an activity-link workout completed after explicit manual completion', async () => {
    const app = buildApp({ tokenPepper: pepper, tokenRepository: tokenRepository(), planRepository: plans });
    const created = await app.inject({
      method: 'POST', url: '/api/v1/plans', headers: auth(),
      payload: {
        date: '2026-09-21', kind: 'workout', title: 'Rower stacjonarny',
        completionStrategy: 'activity_link', activityType: 'indoor_cycling', plannedDurationSeconds: 1800,
      },
    });
    expect(created.statusCode).toBe(201);

    const completed = await app.inject({
      method: 'POST', url: '/api/v1/plans/plan-1/progress', headers: auth(), payload: { value: 1 },
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.json()).toMatchObject({ status: 'completed', progress: { ratio: 1 } });

    const listed = await app.inject({ method: 'GET', url: '/api/v1/plans', headers: auth() });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().items[0]).toMatchObject({ status: 'completed', progress: { ratio: 1 } });
    await app.close();
  });

  it('blocks manual progress for provider-derived step goals', async () => {
    const app = buildApp({ tokenPepper: pepper, tokenRepository: tokenRepository(), planRepository: plans });
    const created = await app.inject({
      method: 'POST', url: '/api/v1/plans', headers: auth(),
      payload: {
        date: '2026-09-21', kind: 'metric_goal', title: 'Steps',
        completionStrategy: 'metric_auto', metricKey: 'steps', targetValue: 7500, unit: 'steps',
      },
    });
    expect(created.statusCode).toBe(201);

    const response = await app.inject({
      method: 'POST', url: '/api/v1/plans/plan-1/progress', headers: auth(),
      payload: { value: 7500 },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ error: { code: 'validation_error' } });
    await app.close();
  });

  it('lists plans by date range for a read-scoped token', async () => {
    const app = buildApp({ tokenPepper: pepper, tokenRepository: tokenRepository(), planRepository: plans });
    await app.inject({
      method: 'POST', url: '/api/v1/plans', headers: auth(),
      payload: {
        date: '2026-09-21', kind: 'count_goal', title: 'Stair loops',
        completionStrategy: 'count_manual', targetValue: 8, unit: 'loops',
      },
    });

    const response = await app.inject({
      method: 'GET', url: '/api/v1/plans?from=2026-09-21&to=2026-09-27', headers: auth(readerToken),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ items: [{ id: 'plan-1', title: 'Stair loops' }] });
    await app.close();
  });
});
