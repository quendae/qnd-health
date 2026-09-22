import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { hashApiToken } from '../src/auth/token.js';
import { ProfileGoalService } from '../src/profile/goals.js';
import type { ProfileGoalRevisionRecord, ProfileGoalRevisionRepository } from '../src/profile/goal-repository.js';

const pepper = 'goal-history-pepper';
const token = 'qndh_goal_history';

function tokenRepository() {
  const tokenHash = hashApiToken(token, pepper);
  return {
    async findByHash(hash: string) {
      return hash === tokenHash
        ? { id: 'goal-history-reader', tokenHash, scopes: ['today:read'], revokedAt: null }
        : null;
    },
  };
}

const profileRepository = {
  async get() {
    return {
      id: 'default' as const,
      dateOfBirth: '1990-09-21',
      sexForBmr: 'male' as const,
      heightCm: 180,
      activityFactor: 1.2,
      defaultStepsGoal: 7500,
      dailyCaloriesGoalKcal: 2300,
      dailyProteinGoalGrams: 150,
    };
  },
  async upsert() { return this.get(); },
};

function goalService() {
  const rows: ProfileGoalRevisionRecord[] = [
    {
      id: 'old-goals', effectiveFrom: '2026-09-20', source: 'manual', sourceRef: null, reason: 'Początkowe cele',
      activityFactor: 1.2, defaultStepsGoal: 8000, dailyCaloriesGoalKcal: 2200, dailyProteinGoalGrams: 160,
      dailyCarbsGoalGrams: 240, dailyFatGoalGrams: 70, dailyFiberGoalGrams: 30, createdAt: '2026-09-20T07:00:00.000Z',
    },
    {
      id: 'coach-goals', effectiveFrom: '2026-09-22', source: 'coach', sourceRef: 'conv-1', reason: 'Korekta Coacha',
      activityFactor: 1.35, defaultStepsGoal: 9000, dailyCaloriesGoalKcal: 2000, dailyProteinGoalGrams: 170,
      dailyCarbsGoalGrams: 180, dailyFatGoalGrams: 65, dailyFiberGoalGrams: 32, createdAt: '2026-09-22T07:00:00.000Z',
    },
  ];
  const repository: ProfileGoalRevisionRepository = {
    async findActiveOn(date) {
      return [...rows]
        .filter(row => row.effectiveFrom <= date)
        .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.createdAt.localeCompare(a.createdAt))[0] ?? null;
    },
    async list() { return [...rows]; },
    async count() { return rows.length; },
    async create(input) {
      const row: ProfileGoalRevisionRecord = { id: `g${rows.length + 1}`, createdAt: new Date().toISOString(), ...input };
      rows.push(row);
      return row;
    },
  };
  return new ProfileGoalService(repository, profileRepository);
}

const emptyPlanRepository = {
  async create() { throw new Error('not used'); },
  async list() { return []; },
  async findById() { return null; },
  async update() { return null; },
  async delete() { return false; },
};

const emptyNutritionRepository = {
  async create() { throw new Error('not used'); },
  async list() { return []; },
  async findById() { return null; },
  async update() { return null; },
  async delete() { return false; },
};

const measurementRepository = {
  async create() { throw new Error('not used'); },
  async list() {
    return [{ id: 'weight', measuredAt: '2026-09-20T07:00:00+02:00', weightKg: 100, bodyFatPercent: null, bmi: null, muscleMassKg: null, source: 'manual' }];
  },
};

const dailyHealthRepository = {
  async findByDate() { return null; },
  async list() { return []; },
};

const completedActivityRepository = { async list() { return []; } };

function appWithGoals() {
  return buildApp({
    tokenPepper: pepper,
    tokenRepository: tokenRepository(),
    planRepository: emptyPlanRepository,
    nutritionRepository: emptyNutritionRepository,
    measurementRepository,
    dailyHealthRepository,
    completedActivityRepository,
    profileRepository,
    profileGoalService: goalService(),
    timeZone: 'Europe/Warsaw',
  } as any);
}

describe('Today goal history', () => {
  it('keeps the old goals before a Coach revision and applies the new goals from its effective date', async () => {
    const app = appWithGoals();

    const before = await app.inject({
      method: 'GET', url: '/api/v1/today?date=2026-09-21', headers: { authorization: `Bearer ${token}` },
    });
    const after = await app.inject({
      method: 'GET', url: '/api/v1/today?date=2026-09-22', headers: { authorization: `Bearer ${token}` },
    });

    expect(before.statusCode).toBe(200);
    expect(before.json()).toMatchObject({
      activity: { steps: { target: 8000, goalSource: 'profile' } },
      energy: { activityFactor: 1.2 },
      nutrition: {
        goalKcal: 2200, goalProteinGrams: 160, goalCarbsGrams: 240, goalFatGrams: 70, goalFiberGrams: 30,
      },
      goalRevision: { id: 'old-goals', effectiveFrom: '2026-09-20', source: 'manual' },
    });

    expect(after.statusCode).toBe(200);
    expect(after.json()).toMatchObject({
      activity: { steps: { target: 9000, goalSource: 'profile' } },
      energy: { activityFactor: 1.35 },
      nutrition: {
        goalKcal: 2000, goalProteinGrams: 170, goalCarbsGrams: 180, goalFatGrams: 65, goalFiberGrams: 32,
      },
      goalRevision: { id: 'coach-goals', effectiveFrom: '2026-09-22', source: 'coach', reason: 'Korekta Coacha' },
    });

    await app.close();
  });
});
