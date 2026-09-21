import type { PlanWriteInput } from './api';
import type { CompletedActivity } from './types';

function positiveNumber(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value > 0 ? value : null;
}

export function buildCustomActivityPlan(input: {
  date: string;
  title: string;
  activityType: string;
  durationMinutes: number | null;
  distanceKm: number | null;
  garminActivity: CompletedActivity | null;
}): {
  plan: PlanWriteInput;
  completedActivityId: string | null;
  manualProgressValue: number | null;
} {
  const fallbackDuration = positiveNumber(input.durationMinutes);
  const fallbackDistance = positiveNumber(input.distanceKm);
  const garmin = input.garminActivity;
  const garminDuration = positiveNumber(garmin?.durationSeconds);
  const garminDistance = positiveNumber(garmin?.distanceMeters);

  return {
    plan: {
      date: input.date,
      kind: 'workout',
      title: input.title.trim(),
      completionStrategy: garmin ? 'activity_link' : 'manual',
      activityType: garmin?.activityType ?? input.activityType,
      plannedDurationSeconds: garmin ? garminDuration : (fallbackDuration == null ? null : Math.round(fallbackDuration * 60)),
      plannedDistanceMeters: garmin ? garminDistance : (fallbackDistance == null ? null : Math.round(fallbackDistance * 1000)),
    },
    completedActivityId: garmin?.id ?? null,
    manualProgressValue: garmin ? null : 1,
  };
}
