import { describe, expect, it } from 'vitest';
import { buildProfilePatch, profileFormDefaults } from './profile-settings';

describe('health profile settings helpers', () => {
  it('uses phase-one defaults before a profile exists', () => {
    expect(profileFormDefaults(null)).toEqual({
      dateOfBirth: '', sexForBmr: '', heightCm: '', activityFactor: '1.2', defaultStepsGoal: '7500',
      dailyCaloriesGoalKcal: '', dailyProteinGoalGrams: '', dailyCarbsGoalGrams: '', dailyFatGoalGrams: '', dailyFiberGoalGrams: '',
    });
  });

  it('maps an existing profile and every nutrition goal into editable strings', () => {
    expect(profileFormDefaults({
      id: 'default', dateOfBirth: '1990-09-21', sexForBmr: 'male', heightCm: 180,
      activityFactor: 1.35, defaultStepsGoal: 8500, dailyCaloriesGoalKcal: 2200, dailyProteinGoalGrams: 160,
      dailyCarbsGoalGrams: 230, dailyFatGoalGrams: 70, dailyFiberGoalGrams: 30,
    })).toEqual({
      dateOfBirth: '1990-09-21', sexForBmr: 'male', heightCm: '180', activityFactor: '1.35', defaultStepsGoal: '8500',
      dailyCaloriesGoalKcal: '2200', dailyProteinGoalGrams: '160', dailyCarbsGoalGrams: '230', dailyFatGoalGrams: '70', dailyFiberGoalGrams: '30',
    });
  });

  it('builds nullable profile goal fields without inventing missing data', () => {
    expect(buildProfilePatch({
      dateOfBirth: '', sexForBmr: '', heightCm: '', activityFactor: '1.2', defaultStepsGoal: '7500',
      dailyCaloriesGoalKcal: '', dailyProteinGoalGrams: '', dailyCarbsGoalGrams: '', dailyFatGoalGrams: '', dailyFiberGoalGrams: '',
    })).toEqual({
      dateOfBirth: null, sexForBmr: null, heightCm: null, activityFactor: 1.2, defaultStepsGoal: 7500,
      dailyCaloriesGoalKcal: null, dailyProteinGoalGrams: null, dailyCarbsGoalGrams: null, dailyFatGoalGrams: null, dailyFiberGoalGrams: null,
    });
  });

  it('rejects invalid numeric form values before the API request', () => {
    const valid = {
      dateOfBirth: '1990-09-21', sexForBmr: 'male' as const, heightCm: '180', activityFactor: '1.2', defaultStepsGoal: '7500',
      dailyCaloriesGoalKcal: '2200', dailyProteinGoalGrams: '160', dailyCarbsGoalGrams: '230', dailyFatGoalGrams: '70', dailyFiberGoalGrams: '30',
    };
    expect(() => buildProfilePatch({ ...valid, heightCm: '0' })).toThrow('Wzrost musi być większy od zera');
    expect(() => buildProfilePatch({ ...valid, activityFactor: '0' })).toThrow('Współczynnik aktywności musi być większy od zera');
    expect(() => buildProfilePatch({ ...valid, dailyCaloriesGoalKcal: '0' })).toThrow('Cel kcal musi być dodatnią liczbą całkowitą');
    expect(() => buildProfilePatch({ ...valid, dailyProteinGoalGrams: '0' })).toThrow('Cel białka musi być dodatnią liczbą całkowitą');
    expect(() => buildProfilePatch({ ...valid, dailyCarbsGoalGrams: '0' })).toThrow('Cel węglowodanów musi być dodatnią liczbą całkowitą');
    expect(() => buildProfilePatch({ ...valid, dailyFatGoalGrams: '0' })).toThrow('Cel tłuszczu musi być dodatnią liczbą całkowitą');
    expect(() => buildProfilePatch({ ...valid, dailyFiberGoalGrams: '0' })).toThrow('Cel błonnika musi być dodatnią liczbą całkowitą');
  });
});
