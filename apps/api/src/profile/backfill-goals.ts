import type { ProfileGoalRevisionRepository } from './goal-repository.js';
import type { HealthProfileRepository } from './repository.js';

export async function backfillProfileGoals(
  revisions: ProfileGoalRevisionRepository,
  profiles: HealthProfileRepository,
): Promise<'created' | 'skipped'> {
  if (await revisions.count() > 0) return 'skipped';

  const profile = await profiles.get();
  await revisions.create({
    effectiveFrom: '1970-01-01',
    source: 'migration',
    sourceRef: null,
    reason: 'Initial versioned-goals migration',
    activityFactor: profile?.activityFactor ?? 1.2,
    defaultStepsGoal: profile?.defaultStepsGoal ?? 7500,
    dailyCaloriesGoalKcal: profile?.dailyCaloriesGoalKcal ?? null,
    dailyProteinGoalGrams: profile?.dailyProteinGoalGrams ?? null,
    dailyCarbsGoalGrams: null,
    dailyFatGoalGrams: null,
    dailyFiberGoalGrams: null,
  });
  return 'created';
}
