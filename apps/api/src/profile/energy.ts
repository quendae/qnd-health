export type SexForBmr = 'male' | 'female';

export interface EnergyProfileInput {
  dateOfBirth?: string | null;
  sexForBmr?: SexForBmr | null;
  heightCm?: number | null;
}

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function assertIsoDate(value: string, fieldName: string): void {
  if (!isoDatePattern.test(value)) throw new Error(`${fieldName} must use YYYY-MM-DD`);
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month! - 1
    || date.getUTCDate() !== day
  ) {
    throw new Error(`${fieldName} must be a valid calendar date`);
  }
}

export function calculateAge(dateOfBirth: string, localDate: string): number {
  assertIsoDate(dateOfBirth, 'dateOfBirth');
  assertIsoDate(localDate, 'localDate');
  if (dateOfBirth > localDate) throw new Error('dateOfBirth cannot be in the future');

  const birthYear = Number(dateOfBirth.slice(0, 4));
  const currentYear = Number(localDate.slice(0, 4));
  const birthMonthDay = dateOfBirth.slice(5);
  const currentMonthDay = localDate.slice(5);

  return currentYear - birthYear - (currentMonthDay < birthMonthDay ? 1 : 0);
}

function assertPositiveFinite(value: number, fieldName: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${fieldName} must be greater than zero`);
}

export function calculateBmr(
  profile: EnergyProfileInput,
  weightKg: number | null | undefined,
  localDate: string,
): number | null {
  if (profile.dateOfBirth == null || profile.sexForBmr == null || profile.heightCm == null || weightKg == null) {
    return null;
  }

  assertPositiveFinite(profile.heightCm, 'heightCm');
  assertPositiveFinite(weightKg, 'weightKg');
  const ageYears = calculateAge(profile.dateOfBirth, localDate);
  const base = 10 * weightKg + 6.25 * profile.heightCm - 5 * ageYears;
  return base + (profile.sexForBmr === 'male' ? 5 : -161);
}

export function calculateTdee(bmrKcal: number, activityFactor: number): number {
  assertPositiveFinite(bmrKcal, 'bmrKcal');
  assertPositiveFinite(activityFactor, 'activityFactor');
  return bmrKcal * activityFactor;
}
