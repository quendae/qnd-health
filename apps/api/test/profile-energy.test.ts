import { describe, expect, it } from 'vitest';
import { calculateAge, calculateBmr, calculateTdee } from '../src/profile/energy.js';

describe('health profile energy calculations', () => {
  it('calculates age against the requested local calendar date', () => {
    expect(calculateAge('1990-09-21', '2026-09-21')).toBe(36);
    expect(calculateAge('1990-09-22', '2026-09-21')).toBe(35);
    expect(calculateAge('2000-02-29', '2026-02-28')).toBe(25);
    expect(calculateAge('2000-02-29', '2026-03-01')).toBe(26);
  });

  it('rejects future dates of birth', () => {
    expect(() => calculateAge('2030-01-01', '2026-09-21')).toThrow('dateOfBirth cannot be in the future');
  });

  it('uses Mifflin-St Jeor for male and female BMR estimates', () => {
    expect(calculateBmr({ dateOfBirth: '1990-09-21', sexForBmr: 'male', heightCm: 180 }, 100, '2026-09-21')).toBeCloseTo(1950, 5);
    expect(calculateBmr({ dateOfBirth: '1990-09-21', sexForBmr: 'female', heightCm: 180 }, 100, '2026-09-21')).toBeCloseTo(1784, 5);
  });

  it('returns null when BMR inputs are incomplete and validates physical inputs', () => {
    expect(calculateBmr({ dateOfBirth: null, sexForBmr: 'male', heightCm: 180 }, 100, '2026-09-21')).toBeNull();
    expect(calculateBmr({ dateOfBirth: '1990-09-21', sexForBmr: null, heightCm: 180 }, 100, '2026-09-21')).toBeNull();
    expect(() => calculateBmr({ dateOfBirth: '1990-09-21', sexForBmr: 'male', heightCm: 0 }, 100, '2026-09-21')).toThrow();
    expect(() => calculateBmr({ dateOfBirth: '1990-09-21', sexForBmr: 'male', heightCm: 180 }, 0, '2026-09-21')).toThrow();
  });

  it('calculates deterministic phase-one TDEE', () => {
    expect(calculateTdee(2000, 1.2)).toBe(2400);
    expect(() => calculateTdee(2000, 0)).toThrow();
  });
});
