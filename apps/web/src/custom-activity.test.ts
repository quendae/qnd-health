import { describe, expect, it } from 'vitest';
import { buildCustomActivityPlan } from './custom-activity';
import type { CompletedActivity } from './types';

describe('custom activity plan builder', () => {
  it('builds a manual completed activity when no Garmin item is selected', () => {
    const result = buildCustomActivityPlan({
      date: '2026-09-21',
      title: 'Spacer z psem',
      activityType: 'walking',
      durationMinutes: 45,
      distanceKm: 3.8,
      garminActivity: null,
    });

    expect(result.plan).toMatchObject({
      date: '2026-09-21', kind: 'workout', title: 'Spacer z psem',
      completionStrategy: 'manual', activityType: 'walking',
      plannedDurationSeconds: 2700, plannedDistanceMeters: 3800,
    });
    expect(result.completedActivityId).toBeNull();
    expect(result.manualProgressValue).toBe(1);
  });

  it('uses Garmin metrics and returns the selected activity id for linking', () => {
    const garmin: CompletedActivity = {
      id: 'garmin-1', provider: 'garmin', activityType: 'running',
      startedAt: '2026-09-21T07:00:00.000Z', durationSeconds: 1840, distanceMeters: 5010,
    };
    const result = buildCustomActivityPlan({
      date: '2026-09-21', title: 'Poranny bieg', activityType: 'running',
      durationMinutes: null, distanceKm: null, garminActivity: garmin,
    });

    expect(result.plan).toMatchObject({
      completionStrategy: 'activity_link', activityType: 'running',
      plannedDurationSeconds: 1840, plannedDistanceMeters: 5010,
    });
    expect(result.completedActivityId).toBe('garmin-1');
    expect(result.manualProgressValue).toBeNull();
  });

  it('does not send zero Garmin distance or duration as positive-only plan fields', () => {
    const garmin: CompletedActivity = {
      id: 'garmin-stairs', provider: 'garmin', activityType: 'other',
      startedAt: '2026-09-21T15:09:00.000Z', durationSeconds: 660, distanceMeters: 0,
    };
    const result = buildCustomActivityPlan({
      date: '2026-09-21', title: 'Schody', activityType: 'other',
      durationMinutes: null, distanceKm: null, garminActivity: garmin,
    });

    expect(result.plan.plannedDurationSeconds).toBe(660);
    expect(result.plan.plannedDistanceMeters).toBeNull();
    expect(result.completedActivityId).toBe('garmin-stairs');
  });
});
