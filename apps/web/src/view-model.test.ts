import { describe, expect, it } from 'vitest';
import { dateLabel, formatDistance, formatDuration, progressPercent, weekCompletion } from './view-model';
import type { TodayResponse } from './types';

describe('Today view model', () => {
  it('formats Garmin-style durations and distances', () => {
    expect(formatDuration(4460)).toBe('1 h 14 min');
    expect(formatDistance(5120)).toBe('5.1 km');
  });

  it('rolls rounded minutes into the next hour instead of showing 60 minutes', () => {
    expect(formatDuration(3599)).toBe('1 h 00 min');
  });

  it('formats dates in Polish', () => {
    expect(dateLabel('2026-09-21')).toBe('poniedziałek, 21 września');
  });

  it('clamps progress to a display-safe percent', () => {
    expect(progressPercent(0.625)).toBe(63);
    expect(progressPercent(1.4)).toBe(100);
  });

  it('counts partial plan items as half-complete in the week summary', () => {
    const today = { weekToDate: { totalPlanItems: 4, completed: 2, partial: 1, planned: 1 } } as TodayResponse;
    expect(weekCompletion(today)).toBe(63);
  });
});
