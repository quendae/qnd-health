import type { HealthProfile } from './types';

export interface ProfileFormState {
  dateOfBirth: string;
  sexForBmr: '' | 'male' | 'female';
  heightCm: string;
  activityFactor: string;
  defaultStepsGoal: string;
}

export function profileFormDefaults(profile: HealthProfile | null): ProfileFormState {
  return {
    dateOfBirth: profile?.dateOfBirth ?? '',
    sexForBmr: profile?.sexForBmr ?? '',
    heightCm: profile?.heightCm == null ? '' : String(profile.heightCm),
    activityFactor: String(profile?.activityFactor ?? 1.2),
    defaultStepsGoal: String(profile?.defaultStepsGoal ?? 7500),
  };
}

export function buildProfilePatch(form: ProfileFormState): Omit<HealthProfile, 'id'> {
  const heightCm = form.heightCm.trim() === '' ? null : Number(form.heightCm);
  const activityFactor = Number(form.activityFactor);
  const defaultStepsGoal = Number(form.defaultStepsGoal);

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
  };
}
