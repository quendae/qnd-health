import { describe, expect, it } from 'vitest';
import { resolveStepGoal } from '../src/today/step-goal.js';

describe('resolveStepGoal', () => {
  it('prefers a valid Garmin goal over the profile goal', () => {
    expect(resolveStepGoal(9000, 8000)).toEqual({ target: 9000, source: 'garmin' });
  });

  it('falls back to the profile goal when provider goal is missing or invalid', () => {
    expect(resolveStepGoal(null, 8000)).toEqual({ target: 8000, source: 'profile' });
    expect(resolveStepGoal(0, 8000)).toEqual({ target: 8000, source: 'profile' });
  });

  it('uses exactly 7500 when no valid provider or profile goal exists', () => {
    expect(resolveStepGoal(undefined, undefined)).toEqual({ target: 7500, source: 'fallback' });
    expect(resolveStepGoal(-1, 0)).toEqual({ target: 7500, source: 'fallback' });
  });
});
