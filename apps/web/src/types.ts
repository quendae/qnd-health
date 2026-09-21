export type PlanStatus = 'planned' | 'partial' | 'completed' | 'skipped' | 'moved' | 'replaced';

export interface PlanProgress {
  currentValue: number | null;
  targetValue: number | null;
  ratio: number | null;
  status: PlanStatus;
}

export interface CompletedActivity {
  id: string;
  provider: string;
  activityType: string;
  startedAt: string;
  durationSeconds?: number | null;
  distanceMeters?: number | null;
  avgHr?: number | null;
  maxHr?: number | null;
  calories?: number | null;
}

export interface ActivityCandidate extends CompletedActivity {
  score: number;
}

export interface PlanItem {
  id: string;
  date: string;
  kind: 'workout' | 'metric_goal' | 'count_goal' | 'manual';
  title: string;
  completionStrategy: 'metric_auto' | 'count_manual' | 'activity_link' | 'manual';
  metricKey: string | null;
  targetValue: number | null;
  currentManualValue: number | null;
  unit: string | null;
  status: PlanStatus;
  activityType?: string | null;
  plannedDurationSeconds?: number | null;
  plannedDistanceMeters?: number | null;
  linkedActivityId?: string | null;
  progress: PlanProgress;
  candidates?: ActivityCandidate[];
}

export interface DailyHealth {
  date: string;
  source: string;
  steps?: number | null;
  floorsAscended?: number | null;
  intensityMinutes?: number | null;
  restingHr?: number | null;
  hrv?: number | null;
  stress?: number | null;
  bodyBattery?: number | null;
  sleepDurationSeconds?: number | null;
  respiration?: number | null;
  spo2?: number | null;
  calories?: number | null;
  activeCalories?: number | null;
  hydrationMl?: number | null;
}

export interface Measurement {
  id: string;
  measuredAt: string;
  weightKg: number;
  bodyFatPercent: number | null;
  bmi: number | null;
  muscleMassKg: number | null;
  source: 'garmin' | 'hermes' | 'manual';
}

export interface NutritionEntry {
  id: string;
  consumedAt: string;
  mealType: string;
  title: string;
  caloriesKcal: number | null;
  proteinGrams: number | null;
  carbsGrams: number | null;
  fatGrams: number | null;
  fiberGrams: number | null;
  quantityText: string | null;
  notes: string | null;
  source: string;
}

export interface NutritionSummary {
  date: string;
  entryCount: number;
  totals: Record<'caloriesKcal' | 'proteinGrams' | 'carbsGrams' | 'fatGrams' | 'fiberGrams', number | null>;
  completeness: Record<'caloriesKcal' | 'proteinGrams' | 'carbsGrams' | 'fatGrams' | 'fiberGrams', boolean>;
}

export interface TodayResponse {
  date: string;
  health: DailyHealth | null;
  latestMeasurement: Measurement | null;
  activity: { items: PlanItem[] };
  nutrition: { entries: NutritionEntry[]; summary: NutritionSummary };
  weekToDate: { totalPlanItems: number; completed: number; partial: number; planned: number };
  remainingWeek: Omit<PlanItem, 'progress' | 'candidates'>[];
}
