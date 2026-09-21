import { describe, expect, it } from 'vitest';
import { formatMetric } from './format-number';

describe('formatMetric', () => {
  it('rounds floating point artifacts for Polish UI', () => {
    expect(formatMetric(120.600000000001)).toBe('120,6');
    expect(formatMetric(53)).toBe('53');
    expect(formatMetric(0)).toBe('0');
  });

  it('keeps missing values unknown and supports precision overrides', () => {
    expect(formatMetric(null)).toBe('—');
    expect(formatMetric(undefined)).toBe('—');
    expect(formatMetric(12.345, 2)).toBe('12,35');
  });
});
