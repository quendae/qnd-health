import type { HealthProfile } from './types';

export interface ProfileFormState {
  dateOfBirth: string;
  sexForBmr: '' | 'male' | 'female';
  heightCm: string;
  activityFactor: string;
  defaultStepsGoal: string;
  dailyCaloriesGoalKcal: string;
  dailyProteinGoalGrams: string;
  dailyCarbsGoalGrams: string;
  dailyFatGoalGrams: string;
  dailyFiberGoalGrams: string;
}

export function profileFormDefaults(profile: HealthProfile | null): ProfileFormState {
  return {
    dateOfBirth: profile?.dateOfBirth ?? '',
    sexForBmr: profile?.sexForBmr ?? '',
    heightCm: profile?.heightCm == null ? '' : String(profile.heightCm),
    activityFactor: String(profile?.activityFactor ?? 1.2),
    defaultStepsGoal: String(profile?.defaultStepsGoal ?? 7500),
    dailyCaloriesGoalKcal: profile?.dailyCaloriesGoalKcal == null ? '' : String(profile.dailyCaloriesGoalKcal),
    dailyProteinGoalGrams: profile?.dailyProteinGoalGrams == null ? '' : String(profile.dailyProteinGoalGrams),
    dailyCarbsGoalGrams: profile?.dailyCarbsGoalGrams == null ? '' : String(profile.dailyCarbsGoalGrams),
    dailyFatGoalGrams: profile?.dailyFatGoalGrams == null ? '' : String(profile.dailyFatGoalGrams),
    dailyFiberGoalGrams: profile?.dailyFiberGoalGrams == null ? '' : String(profile.dailyFiberGoalGrams),
  };
}

function nullablePositiveInteger(value: string, label: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} musi być dodatnią liczbą całkowitą`);
  return parsed;
}

export function buildProfilePatch(form: ProfileFormState): Omit<HealthProfile, 'id'> {
  const heightCm = form.heightCm.trim() === '' ? null : Number(form.heightCm);
  const activityFactor = Number(form.activityFactor);
  const defaultStepsGoal = Number(form.defaultStepsGoal);
  const dailyCaloriesGoalKcal = nullablePositiveInteger(form.dailyCaloriesGoalKcal, 'Cel kcal');
  const dailyProteinGoalGrams = nullablePositiveInteger(form.dailyProteinGoalGrams, 'Cel białka');
  const dailyCarbsGoalGrams = nullablePositiveInteger(form.dailyCarbsGoalGrams, 'Cel węglowodanów');
  const dailyFatGoalGrams = nullablePositiveInteger(form.dailyFatGoalGrams, 'Cel tłuszczu');
  const dailyFiberGoalGrams = nullablePositiveInteger(form.dailyFiberGoalGrams, 'Cel błonnika');

  if (heightCm != null && (!Number.isFinite(heightCm) || heightCm <= 0)) {
    throw new Error('Wzrost musi być większy od zera');
  }
  if (!Number.isFinite(activityFactor) || activityFactor <= 0) {
    throw new Error('Współczynnik aktywności musi być większy od zera');
  }
  if (!Number.isInteger(defaultStepsGoal) || defaultStepsGoal <= 0) {
    throw new Error('Cel kroków musi być dodatnią liczbą całkowitą');
  }

  return {
    dateOfBirth: form.dateOfBirth || null,
    sexForBmr: form.sexForBmr || null,
    heightCm,
    activityFactor,
    defaultStepsGoal,
    dailyCaloriesGoalKcal,
    dailyProteinGoalGrams,
    dailyCarbsGoalGrams,
    dailyFatGoalGrams,
    dailyFiberGoalGrams,
  };
}
