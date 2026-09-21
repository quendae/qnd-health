export type PlanStatus = 'planned' | 'partial' | 'completed' | 'skipped' | 'moved' | 'replaced';

export interface PlanProgress {
  currentValue: number | null;
  targetValue: number | null;
  ratio: number | null;
  status: PlanStatus;
}

export interface WorkoutStructure {
  sets?: number | null;
  repsPerSet?: number | null;
  secondsPerSet?: number | null;
  restSeconds?: number | null;
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
  workoutStructure?: WorkoutStructure | null;
  linkedActivityId?: string | null;
  progress: PlanProgress;
  candidates?: ActivityCandidate[];
}

export interface DailyHealth {
  date: string;
  source: string;
  steps?: number | null;
  stepsGoal?: number | null;
  floorsAscended?: number | null;
  floorsDescended?: number | null;
  vo2Max?: number | null;
  providerBmrKcal?: number | null;
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

export interface HealthProfile {
  id: 'default';
  dateOfBirth: string | null;
  sexForBmr: 'male' | 'female' | null;
  heightCm: number | null;
  activityFactor: number;
  defaultStepsGoal: number;
  dailyCaloriesGoalKcal: number | null;
  dailyProteinGoalGrams: number | null;
}

export interface EnergyEstimate {
  bmrKcal: number;
  tdeeKcal: number;
  source: 'mifflin_st_jeor';
  activityFactor: number;
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
  energy: EnergyEstimate | null;
  activity: {
    steps: { current: number; target: number; goalSource: 'garmin' | 'profile' | 'fallback' };
    items: PlanItem[];
  };
  nutrition: { entries: NutritionEntry[]; summary: NutritionSummary; goalKcal: number | null; goalProteinGrams: number | null };
  weekToDate: { totalPlanItems: number; completed: number; partial: number; planned: number };
  remainingWeek: Omit<PlanItem, 'progress' | 'candidates'>[];
}

export interface HistoryDay {
  date: string;
  health: DailyHealth | null;
  weightKg: number | null;
  plans: Array<Omit<PlanItem, 'progress' | 'candidates'>>;
  activities: CompletedActivity[];
}

export interface HistoryResponse {
  from: string;
  to: string;
  days: HistoryDay[];
}

export interface ProgressSeriesPoint {
  date: string;
  steps: number | null;
  stepsGoal: number | null;
  restingHr: number | null;
  hrv: number | null;
  bodyBattery: number | null;
  sleepDurationSeconds: number | null;
  vo2Max: number | null;
  caloriesKcal: number | null;
  caloriesGoalKcal: number | null;
  proteinGrams: number | null;
  proteinGoalGrams: number | null;
  weightKg: number | null;
  activitiesCount: number;
  activityDurationSeconds: number;
  activityDistanceMeters: number;
  planCompletionPercent: number | null;
}

export interface ProgressResponse {
  period: { from: string; to: string; days: number };
  plan: { total: number; completed: number; partial: number; planned: number; other: number; completionPercent: number | null };
  activity: { count: number; durationSeconds: number; distanceMeters: number };
  averages: {
    steps: number | null;
    restingHr: number | null;
    hrv: number | null;
    bodyBattery: number | null;
    sleepDurationSeconds: number | null;
  };
  weight: { firstKg: number | null; latestKg: number | null; deltaKg: number | null };
  series: ProgressSeriesPoint[];
}

export interface CoachConversation {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CoachMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  model: string | null;
  toolMetadata: unknown | null;
  createdAt: string;
}

export interface CoachAction {
  toolCallId: string;
  name: string;
  status: 'completed';
  result: unknown;
}

export interface CoachTurnResponse {
  message: CoachMessage;
  actions: CoachAction[];
}

export interface CoachProviderErrorPayload {
  error?: { code?: string; message?: string };
  completedActions?: CoachAction[];
}
