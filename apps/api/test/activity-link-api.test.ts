import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { hashApiToken } from '../src/auth/token.js';
import type { PlanRepository, StoredPlanItem, NewStoredPlanItem } from '../src/plans/repository.js';
import type { CompletedActivityRepository, CompletedActivityRecord } from '../src/activities/repository.js';
import type { ActivityMatchRepository } from '../src/activities/matches.js';

const pepper = 'activity-link-pepper';
const token = 'qndh_activity-link-writer';

function tokenRepository() {
  const tokenHash = hashApiToken(token, pepper);
  return {
    async findByHash(hash: string) {
      return hash === tokenHash
        ? { id: 'writer', tokenHash, scopes: ['plans:read', 'plans:write', 'activities:read'], revokedAt: null }
        : null;
    },
  };
}

class Plans implements PlanRepository {
  private items = new Map<string, StoredPlanItem>();
  async create(input: NewStoredPlanItem) { const item = { ...input, id: `plan-${this.items.size + 1}` }; this.items.set(item.id, item); return item; }
  async list() { return [...this.items.values()]; }
  async findById(id: string) { return this.items.get(id) ?? null; }
  async update(id: string, patch: Partial<StoredPlanItem>) {
    const existing = this.items.get(id); if (!existing) return null;
    const updated = { ...existing, ...patch, id }; this.items.set(id, updated); return updated;
  }
  async delete(id: string) { return this.items.delete(id); }
  setLinkedActivity(id: string, activityId: string | null) {
    const existing = this.items.get(id); if (!existing) return;
    this.items.set(id, { ...existing, linkedActivityId: activityId });
  }
}

class Activities implements CompletedActivityRepository {
  constructor(private readonly items: CompletedActivityRecord[]) {}
  async list() { return this.items; }
  async findById(id: string) { return this.items.find((item) => item.id === id) ?? null; }
}

class Matches implements ActivityMatchRepository {
  constructor(private readonly plans: Plans) {}
  async attach(planItemId: string, completedActivityId: string) { this.plans.setLinkedActivity(planItemId, completedActivityId); }
  async detach(planItemId: string) { this.plans.setLinkedActivity(planItemId, null); }
}

function auth() { return { authorization: `Bearer ${token}`, 'idempotency-key': 'attach-1' }; }

async function setup(strategy: StoredPlanItem['completionStrategy'] = 'activity_link') {
  const plans = new Plans();
  const activities = new Activities([
    { id: 'run-1', provider: 'garmin', activityType: 'running', startedAt: '2026-09-21T06:00:00.000Z', durationSeconds: 1900, distanceMeters: 5100 },
  ]);
  const matches = new Matches(plans);
  const plan = await plans.create({
    date: '2026-09-21', kind: strategy === 'activity_link' ? 'workout' : 'count_goal', title: 'Easy run',
    completionStrategy: strategy, metricKey: null, targetValue: strategy === 'count_manual' ? 8 : null,
    currentManualValue: strategy === 'count_manual' ? 0 : null, unit: null, status: 'planned',
    activityType: 'running', plannedDurationSeconds: 1800, plannedDistanceMeters: 5000, linkedActivityId: null,
  });
  const app = buildApp({
    tokenPepper: pepper, tokenRepository: tokenRepository(), planRepository: plans,
    completedActivityRepository: activities, activityMatchRepository: matches,
  });
  return { app, plan, plans };
}

describe('Plan activity attachment API', () => {
  it('attaches a saved Garmin activity and derives the plan as completed', async () => {
    const { app, plan } = await setup();
    const response = await app.inject({
      method: 'POST', url: `/api/v1/plans/${plan.id}/activity`, headers: auth(), payload: { completedActivityId: 'run-1' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: plan.id, linkedActivityId: 'run-1', status: 'completed', progress: { status: 'completed' },
    });
    await app.close();
  });

  it('rejects activity attachment for a non activity_link plan', async () => {
    const { app, plan } = await setup('count_manual');
    const response = await app.inject({
      method: 'POST', url: `/api/v1/plans/${plan.id}/activity`, headers: auth(), payload: { completedActivityId: 'run-1' },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ error: { code: 'validation_error' } });
    await app.close();
  });

  it('returns 404 for an unknown completed activity', async () => {
    const { app, plan } = await setup();
    const response = await app.inject({
      method: 'POST', url: `/api/v1/plans/${plan.id}/activity`, headers: auth(), payload: { completedActivityId: 'missing' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'not_found' } });
    await app.close();
  });

  it('detaches an activity and returns the plan to planned state', async () => {
    const { app, plan } = await setup();
    await app.inject({ method: 'POST', url: `/api/v1/plans/${plan.id}/activity`, headers: auth(), payload: { completedActivityId: 'run-1' } });

    const response = await app.inject({
      method: 'DELETE', url: `/api/v1/plans/${plan.id}/activity`, headers: { authorization: `Bearer ${token}`, 'idempotency-key': 'detach-1' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ linkedActivityId: null, status: 'planned', progress: { status: 'planned' } });
    await app.close();
  });
});
