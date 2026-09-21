import type { HealthProfileRepository } from './repository.js';
import type {
  GoalRevisionSource,
  ProfileGoalRevisionRecord,
  ProfileGoalRevisionRepository,
  ProfileGoalValues,
} from './goal-repository.js';

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export interface ResolvedProfileGoals extends ProfileGoalValues {
  revisionId: string | null;
  effectiveFrom: string | null;
  source: GoalRevisionSource | null;
  sourceRef: string | null;
  reason: string | null;
}

export interface GoalRevisionMetadata {
  effectiveFrom: string;
  source: GoalRevisionSource;
  sourceRef: string | null;
  reason: string | null;
}

function assertIsoDate(value: string): void {
  if (!isoDatePattern.test(value)) throw new Error('effectiveFrom must be YYYY-MM-DD');
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error('effectiveFrom must be a valid calendar date');
  }
}

function validateGoals(values: ProfileGoalValues): void {
  if (!Number.isFinite(values.activityFactor) || values.activityFactor <= 0) {
    throw new Error('activityFactor must be greater than 0');
  }
  if (!Number.isInteger(values.defaultStepsGoal) || values.defaultStepsGoal <= 0) {
    throw new Error('defaultStepsGoal must be a positive integer');
  }

  for (const key of [
    'dailyCaloriesGoalKcal',
    'dailyProteinGoalGrams',
    'dailyCarbsGoalGrams',
    'dailyFatGoalGrams',
    'dailyFiberGoalGrams',
  ] as const) {
    const value = values[key];
    if (value !== null && (!Number.isInteger(value) || value <= 0)) {
      throw new Error(`${key} must be a positive integer or null`);
    }
  }
}

function fallbackGoals(profile: Awaited<ReturnType<HealthProfileRepository['get']>>): ProfileGoalValues {
  return {
    activityFactor: profile?.activityFactor ?? 1.2,
    defaultStepsGoal: profile?.defaultStepsGoal ?? 7500,
    dailyCaloriesGoalKcal: profile?.dailyCaloriesGoalKcal ?? null,
    dailyProteinGoalGrams: profile?.dailyProteinGoalGrams ?? null,
    dailyCarbsGoalGrams: null,
    dailyFatGoalGrams: null,
    dailyFiberGoalGrams: null,
  };
}

export class ProfileGoalService {
  constructor(
    private readonly revisions: ProfileGoalRevisionRepository,
    private readonly profile: HealthProfileRepository,
  ) {}

  async resolve(date: string): Promise<ResolvedProfileGoals> {
    assertIsoDate(date);
    const revision = await this.revisions.findActiveOn(date);
    if (revision) {
      return {
        activityFactor: revision.activityFactor,
        defaultStepsGoal: revision.defaultStepsGoal,
        dailyCaloriesGoalKcal: revision.dailyCaloriesGoalKcal,
        dailyProteinGoalGrams: revision.dailyProteinGoalGrams,
        dailyCarbsGoalGrams: revision.dailyCarbsGoalGrams,
        dailyFatGoalGrams: revision.dailyFatGoalGrams,
        dailyFiberGoalGrams: revision.dailyFiberGoalGrams,
        revisionId: revision.id,
        effectiveFrom: revision.effectiveFrom,
        source: revision.source,
        sourceRef: revision.sourceRef,
        reason: revision.reason,
      };
    }

    const profile = await this.profile.get();
    return {
      ...fallbackGoals(profile),
      revisionId: null,
      effectiveFrom: null,
      source: null,
      sourceRef: null,
      reason: null,
    };
  }

  async createRevision(
    patch: Partial<ProfileGoalValues>,
    meta: GoalRevisionMetadata,
  ): Promise<ProfileGoalRevisionRecord> {
    assertIsoDate(meta.effectiveFrom);
    const current = await this.resolve(meta.effectiveFrom);
    const next: ProfileGoalValues = {
      activityFactor: patch.activityFactor !== undefined ? patch.activityFactor : current.activityFactor,
      defaultStepsGoal: patch.defaultStepsGoal !== undefined ? patch.defaultStepsGoal : current.defaultStepsGoal,
      dailyCaloriesGoalKcal: patch.dailyCaloriesGoalKcal !== undefined
        ? patch.dailyCaloriesGoalKcal
        : current.dailyCaloriesGoalKcal,
      dailyProteinGoalGrams: patch.dailyProteinGoalGrams !== undefined
        ? patch.dailyProteinGoalGrams
        : current.dailyProteinGoalGrams,
      dailyCarbsGoalGrams: patch.dailyCarbsGoalGrams !== undefined
        ? patch.dailyCarbsGoalGrams
        : current.dailyCarbsGoalGrams,
      dailyFatGoalGrams: patch.dailyFatGoalGrams !== undefined
        ? patch.dailyFatGoalGrams
        : current.dailyFatGoalGrams,
      dailyFiberGoalGrams: patch.dailyFiberGoalGrams !== undefined
        ? patch.dailyFiberGoalGrams
        : current.dailyFiberGoalGrams,
    };

    validateGoals(next);
    return this.revisions.create({
      ...next,
      effectiveFrom: meta.effectiveFrom,
      source: meta.source,
      sourceRef: meta.sourceRef,
      reason: meta.reason,
    });
  }

  async listRevisions(): Promise<ProfileGoalRevisionRecord[]> {
    return this.revisions.list();
  }
}
