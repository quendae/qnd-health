export type CompletionStrategy =
  | 'metric_auto'
  | 'count_manual'
  | 'activity_link'
  | 'manual';

export type DerivedPlanStatus = 'planned' | 'partial' | 'completed';

export interface PlanProgressInput {
  strategy: CompletionStrategy;
  targetValue?: number | null;
  currentValue?: number | null;
  linkedActivityId?: string | null;
  manualCompleted?: boolean;
}

export interface PlanProgress {
  status: DerivedPlanStatus;
  currentValue: number | null;
  targetValue: number | null;
  ratio: number | null;
}

function requirePositiveTarget(targetValue: number | null | undefined): number {
  if (targetValue == null || !Number.isFinite(targetValue) || targetValue <= 0) {
    throw new Error('targetValue must be greater than zero');
  }
  return targetValue;
}

function normalizeCurrentValue(currentValue: number | null | undefined): number {
  if (currentValue == null) return 0;
  if (!Number.isFinite(currentValue) || currentValue < 0) {
    throw new Error('currentValue must be a non-negative number');
  }
  return currentValue;
}

function calculateTargetProgress(
  targetValue: number | null | undefined,
  currentValue: number | null | undefined,
): PlanProgress {
  const target = requirePositiveTarget(targetValue);
  const current = normalizeCurrentValue(currentValue);
  const rawRatio = current / target;
  const ratio = Math.min(rawRatio, 1);

  return {
    status: current === 0 ? 'planned' : current >= target ? 'completed' : 'partial',
    currentValue: current,
    targetValue: target,
    ratio,
  };
}

export function calculatePlanProgress(input: PlanProgressInput): PlanProgress {
  switch (input.strategy) {
    case 'metric_auto':
    case 'count_manual':
      return calculateTargetProgress(input.targetValue, input.currentValue);

    case 'activity_link': {
      const completed = Boolean(input.linkedActivityId) || input.manualCompleted === true;
      return {
        status: completed ? 'completed' : 'planned',
        currentValue: null,
        targetValue: null,
        ratio: completed ? 1 : 0,
      };
    }

    case 'manual': {
      const completed = input.manualCompleted === true;
      return {
        status: completed ? 'completed' : 'planned',
        currentValue: completed ? 1 : 0,
        targetValue: 1,
        ratio: completed ? 1 : 0,
      };
    }
  }
}

export function assertManualProgressWritable(strategy: CompletionStrategy): void {
  if (strategy === 'metric_auto') {
    throw new Error('metric_auto progress is provider-derived');
  }
}
