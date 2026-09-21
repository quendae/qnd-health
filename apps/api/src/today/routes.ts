import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { calculatePlanProgress, rankActivityCandidates } from '@qnd-health/activity-model';
import type { RequestAuthorizer } from '../auth/service.js';
import type { PlanRepository, StoredPlanItem } from '../plans/repository.js';
import type { NutritionRepository } from '../nutrition/repository.js';
import { summarizeNutrition } from '../nutrition/summary.js';
import type { MeasurementRepository } from '../measurements/repository.js';
import type { DailyHealthRecord, DailyHealthRepository } from '../health/repository.js';
import type { CompletedActivityRepository } from '../activities/repository.js';
import { localIsoDate, weekBounds } from './date-utils.js';
import { sendValidationError } from '../http/errors.js';
import { resolveStepGoal } from './step-goal.js';

const querySchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

function metricValue(health: DailyHealthRecord | null, metricKey: string | null): number {
  if (!health || !metricKey) return 0;
  const value = health[metricKey];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function planProgress(plan: StoredPlanItem, health: DailyHealthRecord | null) {
  const currentValue = plan.completionStrategy === 'metric_auto'
    ? metricValue(health, plan.metricKey)
    : plan.currentManualValue;

  return calculatePlanProgress({
    strategy: plan.completionStrategy,
    targetValue: plan.targetValue,
    currentValue,
    linkedActivityId: plan.linkedActivityId ?? null,
    manualCompleted: (plan.completionStrategy === 'manual' || plan.completionStrategy === 'activity_link') && plan.status === 'completed',
  });
}

async function authorize(request: FastifyRequest, authorizer: RequestAuthorizer) {
  return authorizer.authorize(request.headers.authorization, ['today:read']);
}

export function registerTodayRoutes(app: FastifyInstance, deps: {
  authorizer: RequestAuthorizer;
  planRepository: PlanRepository;
  nutritionRepository: NutritionRepository;
  measurementRepository: MeasurementRepository;
  dailyHealthRepository: DailyHealthRepository;
  completedActivityRepository: CompletedActivityRepository;
  timeZone: string;
}): void {
  app.get('/api/v1/today', async (request, reply) => {
    await authorize(request, deps.authorizer);
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) return sendValidationError(reply, request, 'Invalid Today date', parsed.error.flatten());

    const date = parsed.data.date;
    const week = weekBounds(date);
    const [weekPlans, health, nutritionEntries, measurements, completedActivities] = await Promise.all([
      deps.planRepository.list(week.start, week.end),
      deps.dailyHealthRepository.findByDate(date),
      deps.nutritionRepository.list(),
      deps.measurementRepository.list(),
      deps.completedActivityRepository.list(),
    ]);

    const todaysPlans = weekPlans.filter((plan) => plan.date === date);
    const todaysNutrition = nutritionEntries
      .filter((entry) => localIsoDate(entry.consumedAt, deps.timeZone) === date)
      .sort((a, b) => a.consumedAt.localeCompare(b.consumedAt));

    const activityItems = todaysPlans.map((plan) => {
      const progress = planProgress(plan, health);
      const candidates = plan.completionStrategy === 'activity_link' && !plan.linkedActivityId
        ? rankActivityCandidates({
            plan: {
              date: plan.date,
              activityType: plan.activityType,
              plannedDurationSeconds: plan.plannedDurationSeconds,
              plannedDistanceMeters: plan.plannedDistanceMeters,
            },
            activities: completedActivities,
            timeZone: deps.timeZone,
          }).slice(0, 5)
        : [];
      return { ...plan, status: progress.status, progress, candidates };
    });

    const stepGoal = resolveStepGoal(health?.stepsGoal, null);
    const steps = typeof health?.steps === 'number' && Number.isFinite(health.steps) && health.steps >= 0 ? health.steps : 0;

    const toDatePlans = weekPlans.filter((plan) => plan.date <= date);
    const toDateProgress = toDatePlans.map((plan) => planProgress(plan, plan.date === date ? health : null));

    return {
      date,
      health,
      latestMeasurement: [...measurements].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0] ?? null,
      activity: {
        steps: { current: steps, target: stepGoal.target, goalSource: stepGoal.source },
        items: activityItems,
      },
      nutrition: {
        entries: todaysNutrition,
        summary: summarizeNutrition(date, todaysNutrition),
      },
      weekToDate: {
        totalPlanItems: toDatePlans.length,
        completed: toDateProgress.filter((progress) => progress.status === 'completed').length,
        partial: toDateProgress.filter((progress) => progress.status === 'partial').length,
        planned: toDateProgress.filter((progress) => progress.status === 'planned').length,
      },
      remainingWeek: weekPlans.filter((plan) => plan.date > date),
    };
  });
}
