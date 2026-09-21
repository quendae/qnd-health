import { describe, expect, it } from 'vitest';
import { backfillProfileGoals } from '../src/profile/backfill-goals.js';
import type {
  ProfileGoalRevisionRecord,
  ProfileGoalRevisionRepository,
} from '../src/profile/goal-repository.js';
import type { HealthProfileRepository } from '../src/profile/repository.js';

function memoryGoalRepo(): ProfileGoalRevisionRepository {
  const rows: ProfileGoalRevisionRecord[] = [];
  return {
    async findActiveOn() { return null; },
    async list() { return [...rows]; },
    async count() { return rows.length; },
    async create(input) {
      const row: ProfileGoalRevisionRecord = {
        id: `revision-${rows.length + 1}`,
        createdAt: '2026-09-21T12:00:00.000Z',
        ...input,
      };
      rows.push(row);
      return row;
    },
  };
}

function profileRepo(): HealthProfileRepository {
  return {
    async get() {
      return {
        id: 'default',
        dateOfBirth: '1986-05-04',
        sexForBmr: 'male',
        heightCm: 184,
        activityFactor: 1.35,
        defaultStepsGoal: 8000,
        dailyCaloriesGoalKcal: 1850,
        dailyProteinGoalGrams: 170,
      };
    },
    async upsert() {
      throw new Error('not used');
    },
  };
}

describe('backfillProfileGoals', () => {
  it('creates exactly one migration baseline and preserves current profile targets', async () => {
    const revisions = memoryGoalRepo();
    const profiles = profileRepo();

    expect(await backfillProfileGoals(revisions, profiles)).toBe('created');
    expect(await backfillProfileGoals(revisions, profiles)).toBe('skipped');

    const items = await revisions.list();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      effectiveFrom: '1970-01-01',
      source: 'migration',
      activityFactor: 1.35,
      defaultStepsGoal: 8000,
      dailyCaloriesGoalKcal: 1850,
      dailyProteinGoalGrams: 170,
      dailyCarbsGoalGrams: null,
      dailyFatGoalGrams: null,
      dailyFiberGoalGrams: null,
    });
  });

  it('uses safe defaults when the profile has never been created', async () => {
    const revisions = memoryGoalRepo();
    const profiles: HealthProfileRepository = {
      async get() { return null; },
      async upsert() { throw new Error('not used'); },
    };

    expect(await backfillProfileGoals(revisions, profiles)).toBe('created');
    expect((await revisions.list())[0]).toMatchObject({
      activityFactor: 1.2,
      defaultStepsGoal: 7500,
      dailyCaloriesGoalKcal: null,
      dailyProteinGoalGrams: null,
    });
  });
});
