import { describe, expect, it } from 'vitest';
import { activityPresets, buildPresetPlan } from './activity-presets';

describe('activity presets', () => {
  it('exposes the three approved quick activities', () => {
    expect(activityPresets.map(item => item.id)).toEqual(['pushups', 'hang', 'stationary_bike']);
  });

  it('builds push-ups as a repetition counter', () => {
    expect(buildPresetPlan('pushups', '2026-09-21', 20)).toMatchObject({
      title: 'Pompki', kind: 'count_goal', completionStrategy: 'count_manual', targetValue: 20, unit: 'powt.',
    });
  });

  it('builds pull-up-bar hang as seconds', () => {
    expect(buildPresetPlan('hang', '2026-09-21', 45)).toMatchObject({
      title: 'Wiszenie na drążku', kind: 'count_goal', completionStrategy: 'count_manual', targetValue: 45, unit: 's',
    });
  });

  it('builds stationary bike as an activity-link workout in minutes', () => {
    expect(buildPresetPlan('stationary_bike', '2026-09-21', 30)).toMatchObject({
      title: 'Rower stacjonarny', kind: 'workout', completionStrategy: 'activity_link',
      activityType: 'indoor_cycling', plannedDurationSeconds: 1800,
    });
  });

  it('rejects empty or non-positive values', () => {
    expect(() => buildPresetPlan('pushups', '2026-09-21', 0)).toThrow();
    expect(() => buildPresetPlan('hang', '2026-09-21', Number.NaN)).toThrow();
  });
});
