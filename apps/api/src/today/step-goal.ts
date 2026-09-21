export type StepGoalSource = 'garmin' | 'profile' | 'fallback';

export interface StepGoalResolution {
  target: number;
  source: StepGoalSource;
}

function validGoal(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
}

export function resolveStepGoal(
  providerGoal?: number | null,
  profileGoal?: number | null,
): StepGoalResolution {
  const provider = validGoal(providerGoal);
  if (provider != null) return { target: provider, source: 'garmin' };

  const profile = validGoal(profileGoal);
  if (profile != null) return { target: profile, source: 'profile' };

  return { target: 7500, source: 'fallback' };
}
