import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { calculatePlanProgress } from '@qnd-health/activity-model';
import type { RequestAuthorizer } from '../auth/service.js';
import type { PlanRepository, StoredPlanItem } from '../plans/repository.js';
import type { DailyHealthRecord, DailyHealthRepository } from '../health/repository.js';
import type { MeasurementRepository } from '../measurements/repository.js';
import type { CompletedActivityRepository } from '../activities/repository.js';
import type { NutritionRepository } from '../nutrition/repository.js';
import type { HealthProfileRepository } from '../profile/repository.js';
import type { ProfileGoalService } from '../profile/goals.js';
import { summarizeNutrition } from '../nutrition/summary.js';
import { localIsoDate } from '../today/date-utils.js';
import { resolveStepGoal } from '../today/step-goal.js';
import { sendValidationError } from '../http/errors.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const rangeSchema = z.object({ from: isoDate, to: isoDate }).refine(value => value.from <= value.to, { message: 'from must not be after to' });

function shiftIsoDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + days)).toISOString().slice(0, 10);
}

function calendarDays(from: string, to: string): string[] {
  const result: string[] = [];
  for (let date = from; date <= to; date = shiftIsoDate(date, 1)) {
    result.push(date);
    if (result.length > 366) throw new Error('date range exceeds 366 days');
  }
  return result;
}

function numericAverage(values: Array<number | null | undefined>): number | null {
  const present = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (present.length === 0) return null;
  return Math.round((present.reduce((sum, value) => sum + value, 0) / present.length) * 10) / 10;
}

function rounded(value: number): number {
  return Math.round(value * 10) / 10;
}

function derivedPlanStatus(plan: StoredPlanItem, health: DailyHealthRecord | null) {
  if (plan.status === 'skipped' || plan.status === 'moved' || plan.status === 'replaced') return plan.status;
  const metric = plan.metricKey && health ? health[plan.metricKey] : null;
  const currentValue = plan.completionStrategy === 'metric_auto'
    ? (typeof metric === 'number' ? metric : 0)
    : plan.currentManualValue;
  return calculatePlanProgress({
    strategy: plan.completionStrategy,
    targetValue: plan.targetValue,
    currentValue,
    linkedActivityId: plan.linkedActivityId ?? null,
    manualCompleted: plan.completionStrategy === 'manual' && plan.status === 'completed',
  }).status;
}

export function registerInsightRoutes(app: FastifyInstance, deps: {
  authorizer: RequestAuthorizer;
  planRepository: PlanRepository;
  dailyHealthRepository: DailyHealthRepository;
  measurementRepository: MeasurementRepository;
  completedActivityRepository: CompletedActivityRepository;
  nutritionRepository?: NutritionRepository;
  profileRepository?: HealthProfileRepository;
  profileGoalService?: ProfileGoalService;
  timeZone: string;
}): void {
  async function loadRange(from: string, to: string) {
    const [plans, health, measurements, activities, nutrition, profile, goalRevisions] = await Promise.all([
      deps.planRepository.list(from, to),
      deps.dailyHealthRepository.list(from, to),
      deps.measurementRepository.list(),
      deps.completedActivityRepository.list(),
      deps.nutritionRepository?.list() ?? Promise.resolve([]),
      deps.profileRepository?.get() ?? Promise.resolve(null),
      deps.profileGoalService?.listRevisions() ?? Promise.resolve([]),
    ]);
    const inRangeMeasurements = measurements.filter(item => {
      const date = localIsoDate(item.measuredAt, deps.timeZone);
      return date >= from && date <= to;
    });
    const inRangeActivities = activities.filter(item => {
      const date = localIsoDate(item.startedAt, deps.timeZone);
      return date >= from && date <= to;
    });
    const inRangeNutrition = nutrition.filter(item => {
      const date = localIsoDate(item.consumedAt, deps.timeZone);
      return date >= from && date <= to;
    });
    return { plans, health, measurements: inRangeMeasurements, activities: inRangeActivities, nutrition: inRangeNutrition, profile, goalRevisions };
  }

  function goalsForDate(date: string, data: Awaited<ReturnType<typeof loadRange>>) {
    const revision = [...data.goalRevisions]
      .filter(item => item.effectiveFrom <= date)
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.createdAt.localeCompare(a.createdAt))[0] ?? null;
    if (revision) return revision;
    return {
      activityFactor: data.profile?.activityFactor ?? 1.2,
      defaultStepsGoal: data.profile?.defaultStepsGoal ?? 7500,
      dailyCaloriesGoalKcal: data.profile?.dailyCaloriesGoalKcal ?? null,
      dailyProteinGoalGrams: data.profile?.dailyProteinGoalGrams ?? null,
      dailyCarbsGoalGrams: null,
      dailyFatGoalGrams: null,
      dailyFiberGoalGrams: null,
    };
  }

  app.get('/api/v1/history', async (request, reply) => {
    await deps.authorizer.authorize(request.headers.authorization, ['today:read']);
    const parsed = rangeSchema.safeParse(request.query);
    if (!parsed.success) return sendValidationError(reply, request, 'Invalid history range', parsed.error.flatten());
    const { from, to } = parsed.data;
    const data = await loadRange(from, to);
    const healthByDate = new Map(data.health.map(item => [item.date, item]));
    const days = calendarDays(from, to).reverse().map(date => {
      const plans = data.plans.filter(item => item.date === date).map(item => ({ ...item, status: derivedPlanStatus(item, healthByDate.get(date) ?? null) }));
      const measurements = data.measurements.filter(item => localIsoDate(item.measuredAt, deps.timeZone) === date).sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
      return {
        date,
        health: healthByDate.get(date) ?? null,
        weightKg: measurements[0]?.weightKg ?? null,
        plans,
        activities: data.activities.filter(item => localIsoDate(item.startedAt, deps.timeZone) === date),
      };
    });
    return { from, to, days };
  });

  app.get('/api/v1/progress', async (request, reply) => {
    await deps.authorizer.authorize(request.headers.authorization, ['progress:read']);
    const parsed = rangeSchema.safeParse(request.query);
    if (!parsed.success) return sendValidationError(reply, request, 'Invalid progress range', parsed.error.flatten());
    const { from, to } = parsed.data;
    const dates = calendarDays(from, to);
    const data = await loadRange(from, to);
    const healthByDate = new Map(data.health.map(item => [item.date, item]));
    const statuses = data.plans.map(plan => derivedPlanStatus(plan, healthByDate.get(plan.date) ?? null));
    const completed = statuses.filter(status => status === 'completed').length;
    const partial = statuses.filter(status => status === 'partial').length;
    const planned = statuses.filter(status => status === 'planned').length;
    const actionable = completed + partial + planned;
    const orderedMeasurements = [...data.measurements].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
    const firstWeight = orderedMeasurements[0]?.weightKg ?? null;
    const latestWeight = orderedMeasurements.at(-1)?.weightKg ?? null;

    const series = dates.map(date => {
      const health = healthByDate.get(date) ?? null;
      const activities = data.activities.filter(item => localIsoDate(item.startedAt, deps.timeZone) === date);
      const measurements = data.measurements.filter(item => localIsoDate(item.measuredAt, deps.timeZone) === date).sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
      const measurement = measurements[0] ?? null;
      const nutrition = data.nutrition.filter(item => localIsoDate(item.consumedAt, deps.timeZone) === date);
      const nutritionSummary = summarizeNutrition(date, nutrition);
      const goals = goalsForDate(date, data);
      const dayPlans = data.plans.filter(item => item.date === date);
      const dayStatuses = dayPlans.map(plan => derivedPlanStatus(plan, health));
      const dayActionable = dayStatuses.filter(status => status === 'completed' || status === 'partial' || status === 'planned').length;
      return {
        date,
        steps: health?.steps ?? null,
        stepsGoal: resolveStepGoal(health?.stepsGoal, goals.defaultStepsGoal).target,
        restingHr: health?.restingHr ?? null,
        hrv: health?.hrv ?? null,
        bodyBattery: health?.bodyBattery ?? null,
        stress: health?.stress ?? null,
        sleepDurationSeconds: health?.sleepDurationSeconds ?? null,
        respiration: health?.respiration ?? null,
        spo2: health?.spo2 ?? null,
        vo2Max: health?.vo2Max ?? null,
        floorsAscended: health?.floorsAscended ?? null,
        floorsDescended: health?.floorsDescended ?? null,
        intensityMinutes: health?.intensityMinutes ?? null,
        activeCalories: health?.activeCalories ?? null,
        hydrationMl: health?.hydrationMl ?? null,
        caloriesKcal: nutritionSummary.totals.caloriesKcal,
        caloriesGoalKcal: goals.dailyCaloriesGoalKcal,
        proteinGrams: nutritionSummary.totals.proteinGrams,
        proteinGoalGrams: goals.dailyProteinGoalGrams,
        carbsGrams: nutritionSummary.totals.carbsGrams,
        carbsGoalGrams: goals.dailyCarbsGoalGrams,
        fatGrams: nutritionSummary.totals.fatGrams,
        fatGoalGrams: goals.dailyFatGoalGrams,
        fiberGrams: nutritionSummary.totals.fiberGrams,
        fiberGoalGrams: goals.dailyFiberGoalGrams,
        weightKg: measurement?.weightKg ?? null,
        bodyFatPercent: measurement?.bodyFatPercent ?? null,
        bmi: measurement?.bmi ?? null,
        muscleMassKg: measurement?.muscleMassKg ?? null,
        fatFreeMassKg: measurement?.fatFreeMassKg ?? null,
        subcutaneousFatPercent: measurement?.subcutaneousFatPercent ?? null,
        bodyWaterPercent: measurement?.bodyWaterPercent ?? null,
        skeletalMusclePercent: measurement?.skeletalMusclePercent ?? null,
        boneMassKg: measurement?.boneMassKg ?? null,
        visceralFat: measurement?.visceralFat ?? null,
        proteinPercent: measurement?.proteinPercent ?? null,
        scaleBmrKcal: measurement?.scaleBmrKcal ?? null,
        metabolicAge: measurement?.metabolicAge ?? null,
        bicepsCircumferenceCm: measurement?.bicepsCircumferenceCm ?? null,
        chestCircumferenceCm: measurement?.chestCircumferenceCm ?? null,
        waistCircumferenceCm: measurement?.waistCircumferenceCm ?? null,
        hipsCircumferenceCm: measurement?.hipsCircumferenceCm ?? null,
        thighCircumferenceCm: measurement?.thighCircumferenceCm ?? null,
        activitiesCount: activities.length,
        activityDurationSeconds: activities.reduce((sum, item) => sum + (item.durationSeconds ?? 0), 0),
        activityDistanceMeters: activities.reduce((sum, item) => sum + (item.distanceMeters ?? 0), 0),
        planCompletionPercent: dayActionable === 0 ? null : Math.round((dayStatuses.filter(status => status === 'completed').length / dayActionable) * 100),
      };
    });

    return {
      period: { from, to, days: dates.length },
      plan: {
        total: data.plans.length,
        completed,
        partial,
        planned,
        other: statuses.length - actionable,
        completionPercent: actionable === 0 ? null : Math.round((completed / actionable) * 100),
      },
      activity: {
        count: data.activities.length,
        durationSeconds: data.activities.reduce((sum, item) => sum + (item.durationSeconds ?? 0), 0),
        distanceMeters: data.activities.reduce((sum, item) => sum + (item.distanceMeters ?? 0), 0),
      },
      averages: {
        steps: numericAverage(data.health.map(item => item.steps)),
        restingHr: numericAverage(data.health.map(item => item.restingHr)),
        hrv: numericAverage(data.health.map(item => item.hrv)),
        bodyBattery: numericAverage(data.health.map(item => item.bodyBattery)),
        stress: numericAverage(data.health.map(item => item.stress)),
        sleepDurationSeconds: numericAverage(data.health.map(item => item.sleepDurationSeconds)),
        respiration: numericAverage(data.health.map(item => item.respiration)),
        spo2: numericAverage(data.health.map(item => item.spo2)),
        vo2Max: numericAverage(data.health.map(item => item.vo2Max)),
        floorsAscended: numericAverage(data.health.map(item => item.floorsAscended)),
        floorsDescended: numericAverage(data.health.map(item => item.floorsDescended)),
        intensityMinutes: numericAverage(data.health.map(item => item.intensityMinutes)),
        activeCalories: numericAverage(data.health.map(item => item.activeCalories)),
        hydrationMl: numericAverage(data.health.map(item => item.hydrationMl)),
      },
      weight: {
        firstKg: firstWeight,
        latestKg: latestWeight,
        deltaKg: firstWeight == null || latestWeight == null ? null : rounded(latestWeight - firstWeight),
      },
      series,
    };
  });
}
