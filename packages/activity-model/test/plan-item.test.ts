import { describe, expect, it } from 'vitest';
import {
  calculatePlanProgress,
  assertManualProgressWritable,
} from '../src/plan-item.js';

describe('calculatePlanProgress', () => {
  it('tracks a count goal such as eight stair loops', () => {
    expect(calculatePlanProgress({
      strategy: 'count_manual', targetValue: 8, currentValue: 0,
    })).toMatchObject({ status: 'planned', currentValue: 0, targetValue: 8, ratio: 0 });

    expect(calculatePlanProgress({
      strategy: 'count_manual', targetValue: 8, currentValue: 5,
    })).toMatchObject({ status: 'partial', currentValue: 5, targetValue: 8, ratio: 0.625 });

    expect(calculatePlanProgress({
      strategy: 'count_manual', targetValue: 8, currentValue: 8,
    })).toMatchObject({ status: 'completed', currentValue: 8, targetValue: 8, ratio: 1 });
  });

  it('derives a metric goal such as 7500 steps from provider progress', () => {
    expect(calculatePlanProgress({
      strategy: 'metric_auto', targetValue: 7500, currentValue: 6120,
    })).toMatchObject({ status: 'partial', currentValue: 6120, targetValue: 7500 });

    expect(calculatePlanProgress({
      strategy: 'metric_auto', targetValue: 7500, currentValue: 7500,
    })).toMatchObject({ status: 'completed', ratio: 1 });
  });

  it('caps display ratio at 1 when the target is exceeded', () => {
    expect(calculatePlanProgress({
      strategy: 'metric_auto', targetValue: 7500, currentValue: 9000,
    }).ratio).toBe(1);
  });

  it('completes an activity-link item only when an activity is linked', () => {
    expect(calculatePlanProgress({
      strategy: 'activity_link', linkedActivityId: null,
    }).status).toBe('planned');

    expect(calculatePlanProgress({
      strategy: 'activity_link', linkedActivityId: 'activity-1',
    }).status).toBe('completed');
  });

  it('supports explicit manual completion', () => {
    expect(calculatePlanProgress({ strategy: 'manual', manualCompleted: false }).status).toBe('planned');
    expect(calculatePlanProgress({ strategy: 'manual', manualCompleted: true }).status).toBe('completed');
  });

  it('rejects missing or non-positive targets for metric/count goals', () => {
    expect(() => calculatePlanProgress({ strategy: 'count_manual', targetValue: 0, currentValue: 0 }))
      .toThrow('targetValue must be greater than zero');
    expect(() => calculatePlanProgress({ strategy: 'metric_auto', currentValue: 100 }))
      .toThrow('targetValue must be greater than zero');
  });
});

describe('assertManualProgressWritable', () => {
  it('blocks manual progress writes for provider-derived metric goals', () => {
    expect(() => assertManualProgressWritable('metric_auto'))
      .toThrow('metric_auto progress is provider-derived');
  });

  it('allows manual counter and explicit manual strategies', () => {
    expect(() => assertManualProgressWritable('count_manual')).not.toThrow();
    expect(() => assertManualProgressWritable('manual')).not.toThrow();
  });
});
