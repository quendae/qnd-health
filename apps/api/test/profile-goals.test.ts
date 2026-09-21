import { describe, expect, it } from 'vitest';
import { ProfileGoalService } from '../src/profile/goals.js';
import type {
  GoalRevisionSource,
  ProfileGoalRevisionRecord,
  ProfileGoalRevisionRepository,
  ProfileGoalValues,
} from '../src/profile/goal-repository.js';
import type { HealthProfileRecord, HealthProfileRepository } from '../src/profile/repository.js';

const base: ProfileGoalValues = {
  activityFactor: 1.2,
  defaultStepsGoal: 7500,
  dailyCaloriesGoalKcal: 1600,
  dailyProteinGoalGrams: 180,
  dailyCarbsGoalGrams: null,
  dailyFatGoalGrams: null,
  dailyFiberGoalGrams: null,
};

function revision(
  id: string,
  effectiveFrom: string,
  createdAt: string,
  values: ProfileGoalValues,
  source: GoalRevisionSource = 'manual',
): ProfileGoalRevisionRecord {
  return {
    id,
    effectiveFrom,
    createdAt,
    source,
    sourceRef: null,
    reason: null,
    ...values,
  };
}

function memoryGoalRepo(seed: ProfileGoalRevisionRecord[]): ProfileGoalRevisionRepository {
  const rows = [...seed];
  return {
    async findActiveOn(date) {
      return [...rows]
        .filter(row => row.effectiveFrom <= date)
        .sort((a, b) =>
          b.effectiveFrom.localeCompare(a.effectiveFrom)
          || b.createdAt.localeCompare(a.createdAt)
          || b.id.localeCompare(a.id),
        )[0] ?? null;
    },
    async list() {
      return [...rows].sort((a, b) =>
        b.effectiveFrom.localeCompare(a.effectiveFrom)
        || b.createdAt.localeCompare(a.createdAt)
        || b.id.localeCompare(a.id),
      );
    },
    async count() {
      return rows.length;
    },
    async create(input) {
      const row = revision(
        `created-${rows.length + 1}`,
        input.effectiveFrom,
        `2026-09-21T12:00:0${rows.length}.000Z`,
        input,
        input.source,
      );
      row.sourceRef = input.sourceRef;
      row.reason = input.reason;
      rows.push(row);
      return row;
    },
  };
}

function fallbackProfileRepo(values: ProfileGoalValues): HealthProfileRepository {
  const record: HealthProfileRecord = {
    id: 'default',
    dateOfBirth: null,
    sexForBmr: null,
    heightCm: null,
    ...values,
  };
  return {
    async get() {
      return record;
    },
    async upsert(patch) {
      Object.assign(record, patch);
      return record;
    },
  };
}

describe('ProfileGoalService', () => {
  it('keeps older days on the older revision and ignores future revisions', async () => {
    const repo = memoryGoalRepo([
      revision('a', '2026-09-01', '2026-09-01T08:00:00.000Z', base),
      revision('b', '2026-09-22', '2026-09-21T20:00:00.000Z', {
        ...base,
        dailyCaloriesGoalKcal: 1900,
      }),
    ]);
    const service = new ProfileGoalService(repo, fallbackProfileRepo(base));

    expect((await service.resolve('2026-09-21')).dailyCaloriesGoalKcal).toBe(1600);
    expect((await service.resolve('2026-09-22')).dailyCaloriesGoalKcal).toBe(1900);
  });

  it('uses createdAt and id to resolve multiple revisions on the same day deterministically', async () => {
    const repo = memoryGoalRepo([
      revision('a', '2026-09-22', '2026-09-22T08:00:00.000Z', base),
      revision('b', '2026-09-22', '2026-09-22T09:00:00.000Z', {
        ...base,
        dailyCaloriesGoalKcal: 1800,
      }),
      revision('c', '2026-09-22', '2026-09-22T09:00:00.000Z', {
        ...base,
        dailyCaloriesGoalKcal: 1850,
      }),
    ]);
    const service = new ProfileGoalService(repo, fallbackProfileRepo(base));

    expect((await service.resolve('2026-09-22')).dailyCaloriesGoalKcal).toBe(1850);
  });

  it('copies active values and changes only supplied keys including explicit null', async () => {
    const repo = memoryGoalRepo([
      revision('a', '1970-01-01', '2026-09-21T00:00:00.000Z', base),
    ]);
    const service = new ProfileGoalService(repo, fallbackProfileRepo(base));

    const created = await service.createRevision(
      { dailyCaloriesGoalKcal: 1900, dailyProteinGoalGrams: null },
      {
        effectiveFrom: '2026-09-22',
        source: 'manual',
        sourceRef: null,
        reason: 'Nowy plan',
      },
    );

    expect(created.dailyCaloriesGoalKcal).toBe(1900);
    expect(created.dailyProteinGoalGrams).toBeNull();
    expect(created.defaultStepsGoal).toBe(7500);
    expect(created.dailyCarbsGoalGrams).toBeNull();
    expect(created.reason).toBe('Nowy plan');
  });

  it('falls back to current profile values when no revision exists yet', async () => {
    const service = new ProfileGoalService(memoryGoalRepo([]), fallbackProfileRepo(base));

    const resolved = await service.resolve('2026-09-21');

    expect(resolved).toMatchObject({
      revisionId: null,
      effectiveFrom: null,
      source: null,
      dailyCaloriesGoalKcal: 1600,
      defaultStepsGoal: 7500,
    });
  });
});
