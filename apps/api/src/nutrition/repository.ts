export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'other';

export interface NutritionRecord {
  id: string;
  consumedAt: string;
  mealType: MealType;
  title: string;
  caloriesKcal: number | null;
  proteinGrams: number | null;
  carbsGrams: number | null;
  fatGrams: number | null;
  fiberGrams: number | null;
  quantityText: string | null;
  notes: string | null;
  source: 'hermes' | 'manual';
}

export type NewNutritionRecord = Omit<NutritionRecord, 'id'>;

export interface NutritionRepository {
  create(input: NewNutritionRecord): Promise<NutritionRecord>;
  list(from?: string, to?: string): Promise<NutritionRecord[]>;
  findById(id: string): Promise<NutritionRecord | null>;
  update(id: string, patch: Partial<NutritionRecord>): Promise<NutritionRecord | null>;
  delete(id: string): Promise<boolean>;
}
