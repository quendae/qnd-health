import type { CompletedActivityRecord } from '../activities/repository.js';
import type { DailyHealthRecord } from '../health/repository.js';
import type { MeasurementRecord } from '../measurements/repository.js';
import type { NutritionRecord } from '../nutrition/repository.js';
import type { StoredPlanItem } from '../plans/repository.js';
import type { HealthProfileRecord } from '../profile/repository.js';

interface CoachProgressInput {
  period?: { from?: string; to?: string; days?: number };
  plan?: { completionPercent?: number | null };
  averages?: { steps?: number | null; restingHr?: number | null; hrv?: number | null; sleepDurationSeconds?: number | null };
  weight?: { firstKg?: number | null; latestKg?: number | null; deltaKg?: number | null };
  series?: Array<Record<string, unknown>>;
}

interface CoachTodayInput {
  health: DailyHealthRecord | null;
  latestMeasurement: MeasurementRecord | null;
  energy: { bmrKcal: number; tdeeKcal: number; source: string; activityFactor: number } | null;
  activity: { steps: { current: number; target: number; goalSource: string } };
  nutrition: {
    goalKcal: number | null;
    summary: {
      totals: {
        caloriesKcal: number | null;
        proteinGrams: number | null;
        carbsGrams: number | null;
        fatGrams: number | null;
        fiberGrams: number | null;
      };
    };
  };
}

export interface CoachContextInput {
  date: string;
  profile: HealthProfileRecord | null;
  today: CoachTodayInput;
  plans: StoredPlanItem[];
  activities: CompletedActivityRecord[];
  nutrition: NutritionRecord[];
  measurements: MeasurementRecord[];
  progress7: CoachProgressInput | null;
  progress30: CoachProgressInput | null;
  [key: string]: unknown;
}

function safeHealth(health: DailyHealthRecord | null) {
  if (!health) return null;
  return {
    source: health.source,
    transport: health.transport ?? null,
    restingHr: health.restingHr ?? null,
    hrv: health.hrv ?? null,
    sleepDurationSeconds: health.sleepDurationSeconds ?? null,
    vo2Max: health.vo2Max ?? null,
    stress: health.stress ?? null,
    bodyBattery: health.bodyBattery ?? null,
    spo2: health.spo2 ?? null,
    respiration: health.respiration ?? null,
    floorsAscended: health.floorsAscended ?? null,
    floorsDescended: health.floorsDescended ?? null,
    intensityMinutes: health.intensityMinutes ?? null,
    activeCalories: health.activeCalories ?? null,
    hydrationMl: health.hydrationMl ?? null,
  };
}

function safePlan(plan: StoredPlanItem) {
  return {
    id: plan.id,
    date: plan.date,
    kind: plan.kind,
    title: plan.title,
    status: plan.status,
    completionStrategy: plan.completionStrategy,
    activityType: plan.activityType ?? null,
    metricKey: plan.metricKey ?? null,
    targetValue: plan.targetValue ?? null,
    currentManualValue: plan.currentManualValue ?? null,
    unit: plan.unit ?? null,
    plannedDurationSeconds: plan.plannedDurationSeconds ?? null,
    plannedDistanceMeters: plan.plannedDistanceMeters ?? null,
    linkedActivityId: plan.linkedActivityId ?? null,
  };
}

function safeActivity(activity: CompletedActivityRecord) {
  return {
    id: activity.id,
    provider: activity.provider,
    providerActivityId: activity.providerActivityId ?? null,
    activityType: activity.activityType,
    startedAt: activity.startedAt,
    durationSeconds: activity.durationSeconds ?? null,
    distanceMeters: activity.distanceMeters ?? null,
    avgHr: activity.avgHr ?? null,
    maxHr: activity.maxHr ?? null,
    avgPaceSecondsPerKm: activity.avgPaceSecondsPerKm ?? null,
    cadence: activity.cadence ?? null,
    elevationGainMeters: activity.elevationGainMeters ?? null,
    calories: activity.calories ?? null,
  };
}

function safeNutrition(entry: NutritionRecord) {
  return {
    id: entry.id,
    consumedAt: entry.consumedAt,
    title: entry.title,
    caloriesKcal: entry.caloriesKcal ?? null,
    proteinGrams: entry.proteinGrams ?? null,
    carbsGrams: entry.carbsGrams ?? null,
    fatGrams: entry.fatGrams ?? null,
    fiberGrams: entry.fiberGrams ?? null,
    quantityText: entry.quantityText ?? null,
    source: entry.source,
  };
}

function safeMeasurement(measurement: MeasurementRecord) {
  return {
    measuredAt: measurement.measuredAt,
    weightKg: measurement.weightKg,
    bodyFatPercent: measurement.bodyFatPercent ?? null,
    bmi: measurement.bmi ?? null,
    muscleMassKg: measurement.muscleMassKg ?? null,
    source: measurement.source,
  };
}

function safeProgress(input: CoachProgressInput | null) {
  if (!input) return null;
  return {
    period: input.period ? { from: input.period.from ?? null, to: input.period.to ?? null, days: input.period.days ?? null } : null,
    planCompletionPercent: input.plan?.completionPercent ?? null,
    averageSteps: input.averages?.steps ?? null,
    averageRestingHr: input.averages?.restingHr ?? null,
    averageHrv: input.averages?.hrv ?? null,
    averageSleepDurationSeconds: input.averages?.sleepDurationSeconds ?? null,
    firstWeightKg: input.weight?.firstKg ?? null,
    latestWeightKg: input.weight?.latestKg ?? null,
    weightDeltaKg: input.weight?.deltaKg ?? null,
    series: (input.series ?? []).map(point => ({
      date: typeof point.date === 'string' ? point.date : null,
      steps: typeof point.steps === 'number' ? point.steps : null,
      stepsGoal: typeof point.stepsGoal === 'number' ? point.stepsGoal : null,
      caloriesKcal: typeof point.caloriesKcal === 'number' ? point.caloriesKcal : null,
      caloriesGoalKcal: typeof point.caloriesGoalKcal === 'number' ? point.caloriesGoalKcal : null,
      proteinGrams: typeof point.proteinGrams === 'number' ? point.proteinGrams : null,
      proteinGoalGrams: typeof point.proteinGoalGrams === 'number' ? point.proteinGoalGrams : null,
      restingHr: typeof point.restingHr === 'number' ? point.restingHr : null,
      hrv: typeof point.hrv === 'number' ? point.hrv : null,
      sleepDurationSeconds: typeof point.sleepDurationSeconds === 'number' ? point.sleepDurationSeconds : null,
      vo2Max: typeof point.vo2Max === 'number' ? point.vo2Max : null,
      weightKg: typeof point.weightKg === 'number' ? point.weightKg : null,
      planCompletionPercent: typeof point.planCompletionPercent === 'number' ? point.planCompletionPercent : null,
    })),
  };
}

export function buildCoachContext(input: CoachContextInput) {
  const profile = input.profile;
  const today = input.today;
  return {
    date: input.date,
    goals: {
      steps: today.activity.steps.target,
      caloriesKcal: today.nutrition.goalKcal ?? profile?.dailyCaloriesGoalKcal ?? null,
      proteinGrams: profile?.dailyProteinGoalGrams ?? null,
    },
    profile: profile ? {
      heightCm: profile.heightCm,
      sexForBmr: profile.sexForBmr,
      activityFactor: profile.activityFactor,
      defaultStepsGoal: profile.defaultStepsGoal,
      dailyCaloriesGoalKcal: profile.dailyCaloriesGoalKcal,
      dailyProteinGoalGrams: profile.dailyProteinGoalGrams,
    } : null,
    today: {
      steps: { ...today.activity.steps },
      weightKg: today.latestMeasurement?.weightKg ?? null,
      health: safeHealth(today.health),
      energy: today.energy ? {
        bmrKcal: today.energy.bmrKcal,
        tdeeKcal: today.energy.tdeeKcal,
        source: today.energy.source,
        activityFactor: today.energy.activityFactor,
      } : null,
      nutrition: {
        caloriesKcal: today.nutrition.summary.totals.caloriesKcal,
        proteinGrams: today.nutrition.summary.totals.proteinGrams,
        carbsGrams: today.nutrition.summary.totals.carbsGrams,
        fatGrams: today.nutrition.summary.totals.fatGrams,
        fiberGrams: today.nutrition.summary.totals.fiberGrams,
        goalKcal: today.nutrition.goalKcal,
        goalProteinGrams: profile?.dailyProteinGoalGrams ?? null,
      },
    },
    plans: input.plans.map(safePlan),
    recent: {
      activities: input.activities.map(safeActivity),
      nutrition: input.nutrition.map(safeNutrition),
      measurements: input.measurements.map(safeMeasurement),
    },
    progress: {
      days7: safeProgress(input.progress7),
      days30: safeProgress(input.progress30),
    },
  };
}
