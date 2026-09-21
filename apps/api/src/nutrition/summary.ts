import type { NutritionRecord } from './repository.js';

const fields = ['caloriesKcal', 'proteinGrams', 'carbsGrams', 'fatGrams', 'fiberGrams'] as const;
type NumericField = (typeof fields)[number];

export function summarizeNutrition(date: string, entries: readonly NutritionRecord[]) {
  const totals = {} as Record<NumericField, number | null>;
  const completeness = {} as Record<NumericField, boolean>;

  for (const field of fields) {
    const known = entries
      .map((entry) => entry[field])
      .filter((value): value is number => value !== null);

    totals[field] = known.length === 0 ? null : known.reduce((sum, value) => sum + value, 0);
    completeness[field] = entries.length > 0 && known.length === entries.length;
  }

  return {
    date,
    entryCount: entries.length,
    totals,
    completeness,
  };
}
