import type { PlanWriteInput } from './api';

export type ActivityPresetId = 'pushups' | 'hang' | 'stationary_bike';

export const activityPresets = [
  { id: 'pushups', label: 'Pompki', inputUnit: 'powt.', tracking: 'count' },
  { id: 'hang', label: 'Wiszenie na drążku', inputUnit: 's', tracking: 'count' },
  { id: 'stationary_bike', label: 'Rower stacjonarny', inputUnit: 'min', tracking: 'duration', activityType: 'indoor_cycling' },
] as const;

export interface BuiltPresetPlan {
  plan: PlanWriteInput;
  progressValue: number;
}

export function buildPresetPlan(id: ActivityPresetId, date: string, value: number): PlanWriteInput {
  if (!Number.isFinite(value) || value <= 0) throw new Error('Wartość aktywności musi być większa od zera.');

  if (id === 'pushups') {
    return {
      date,
      kind: 'count_goal',
      title: 'Pompki',
      completionStrategy: 'count_manual',
      targetValue: value,
      unit: 'powt.',
    };
  }
  if (id === 'hang') {
    return {
      date,
      kind: 'count_goal',
      title: 'Wiszenie na drążku',
      completionStrategy: 'count_manual',
      targetValue: value,
      unit: 's',
    };
  }
  return {
    date,
    kind: 'workout',
    title: 'Rower stacjonarny',
    completionStrategy: 'activity_link',
    activityType: 'indoor_cycling',
    plannedDurationSeconds: Math.round(value * 60),
  };
}

export function presetProgressValue(id: ActivityPresetId, value: number): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error('Wartość aktywności musi być większa od zera.');
  return id === 'stationary_bike' ? 1 : value;
}
