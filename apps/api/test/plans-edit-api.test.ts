import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { hashApiToken } from '../src/auth/token.js';
import type { NewStoredPlanItem, PlanRepository, StoredPlanItem } from '../src/plans/repository.js';

class Plans implements PlanRepository {
  item: StoredPlanItem | null = null;
  async create(input: NewStoredPlanItem) { this.item = { ...input, id: 'plan-1' }; return this.item; }
  async list() { return this.item ? [this.item] : []; }
  async findById() { return this.item; }
  async update(id: string, patch: Partial<StoredPlanItem>) { if (!this.item) return null; this.item = { ...this.item, ...patch, id }; return this.item; }
  async delete() { this.item = null; return true; }
}

const pepper = 'pepper';
const raw = 'qndh_test_writer';
const hash = hashApiToken(raw, pepper);
const auth = { authorization: `Bearer ${raw}` };
const tokens = { async findByHash(value: string) { return value === hash ? { id: 'writer', tokenHash: hash, scopes: ['plans:read', 'plans:write'], revokedAt: null } : null; } };

async function seededApp() {
  const plans = new Plans();
  const app = buildApp({ tokenPepper: pepper, tokenRepository: tokens, planRepository: plans });
  const seeded = await app.inject({ method: 'POST', url: '/api/v1/plans', headers: auth, payload: { date: '2026-09-21', kind: 'workout', title: 'Marsz', completionStrategy: 'activity_link', activityType: 'walking', plannedDurationSeconds: 1800 } });
  expect(seeded.statusCode).toBe(201);
  return { app, plans };
}

describe('Planner edit API', () => {
  it('edits and moves an existing plan item', async () => {
    const { app } = await seededApp();
    const response = await app.inject({ method: 'PATCH', url: '/api/v1/plans/plan-1', headers: auth, payload: { date: '2026-09-23', title: 'Dłuższy marsz' } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ date: '2026-09-23', title: 'Dłuższy marsz' });
    await app.close();
  });

  it('deletes an existing plan item', async () => {
    const { app, plans } = await seededApp();
    const response = await app.inject({ method: 'DELETE', url: '/api/v1/plans/plan-1', headers: auth });
    expect(response.statusCode).toBe(204);
    expect(plans.item).toBeNull();
    await app.close();
  });
});
