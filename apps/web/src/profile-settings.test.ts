import { describe, expect, it } from 'vitest';
import { buildProfilePatch, profileFormDefaults } from './profile-settings';

describe('health profile settings helpers', () => {
  it('uses phase-one defaults before a profile exists', () => {
    expect(profileFormDefaults(null)).toEqual({
      dateOfBirth: '', sexForBmr: '', heightCm: '', activityFactor: '1.2', defaultStepsGoal: '7500',
    });
  });

  it('maps an existing profile into editable strings', () => {
    expect(profileFormDefaults({
      id: 'default', dateOfBirth: '1990-09-21', sexForBmr: 'male', heightCm: 180,
      activityFactor: 1.35, defaultStepsGoal: 8500,
    })).toEqual({
      dateOfBirth: '1990-09-21', sexForBmr: 'male', heightCm: '180', activityFactor: '1.35', defaultStepsGoal: '8500',
    });
  });

  it('builds nullable profile fields without inventing missing data', () => {
    expect(buildProfilePatch({
      dateOfBirth: '', sexForBmr: '', heightCm: '', activityFactor: '1.2', defaultStepsGoal: '7500',
    })).toEqual({
      dateOfBirth: null, sexForBmr: null, heightCm: null, activityFactor: 1.2, defaultStepsGoal: 7500,
    });
  });

  it('rejects invalid numeric form values before the API request', () => {
    expect(() => buildProfilePatch({
      dateOfBirth: '1990-09-21', sexForBmr: 'male', heightCm: '0', activityFactor: '1.2', defaultStepsGoal: '7500',
    })).toThrow('Wzrost musi być większy od zera');
    expect(() => buildProfilePatch({
      dateOfBirth: '1990-09-21', sexForBmr: 'male', heightCm: '180', activityFactor: '0', defaultStepsGoal: '7500',
    })).toThrow('Współczynnik aktywności musi być większy od zera');
  });
});
