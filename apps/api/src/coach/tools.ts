import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ActivityMatchRepository } from '../activities/matches.js';
import type { CompletedActivityRepository } from '../activities/repository.js';
import type { AuditRepository } from '../audit/repository.js';
import type { DailyHealthRepository } from '../health/repository.js';
import type { MeasurementRepository } from '../measurements/repository.js';
import type { NutritionRepository } from '../nutrition/repository.js';
import type { PlanRepository, PlanStatus, StoredPlanItem } from '../plans/repository.js';
import type { ProfileGoalService } from '../profile/goals.js';
import type { HealthProfileRepository } from '../profile/repository.js';
import type { DeepSeekToolDefinition } from './deepseek.js';

export interface CoachToolDependencies {
  planRepository?: PlanRepository;
  nutritionRepository?: NutritionRepository;
  measurementRepository?: MeasurementRepository;
  profileRepository?: HealthProfileRepository;
  profileGoalService?: ProfileGoalService;
  dailyHealthRepository?: DailyHealthRepository;
  completedActivityRepository?: CompletedActivityRepository;
  activityMatchRepository?: ActivityMatchRepository;
  auditRepository?: AuditRepository;
}

export interface CoachToolContext {
  conversationId: string;
  requestId: string;
  timeZone: string;
  now?: string;
}

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timestampSchema = z.string().datetime({ offset: true });
const nonNegativeNullable = z.number().nonnegative().nullable().optional();
const positiveNullable = z.number().positive().nullable().optional();

function jsonObject(properties: Record<string, unknown>, required: string[] = []) {
  return { type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {}) };
}

function tool(name: string, description: string, parameters: Record<string, unknown>): DeepSeekToolDefinition {
  return { type: 'function', function: { name, description, parameters } };
}

const goalToolProperties = {
  activityFactor: { type: 'number', minimum: 1, maximum: 3 },
  defaultStepsGoal: { type: 'integer', minimum: 1, maximum: 100000 },
  dailyCaloriesGoalKcal: { type: ['integer', 'null'], minimum: 1, maximum: 20000 },
  dailyProteinGoalGrams: { type: ['integer', 'null'], minimum: 1, maximum: 1000 },
  dailyCarbsGoalGrams: { type: ['integer', 'null'], minimum: 1, maximum: 2000 },
  dailyFatGoalGrams: { type: ['integer', 'null'], minimum: 1, maximum: 1000 },
  dailyFiberGoalGrams: { type: ['integer', 'null'], minimum: 1, maximum: 500 },
  reason: { type: ['string', 'null'], description: 'Krótkie uzasadnienie zmiany celów.' },
};

export const coachTools: DeepSeekToolDefinition[] = [
  tool('get_today', 'Pobierz znormalizowane dane zdrowotne, plan, aktywności i żywienie dla dnia.', jsonObject({ date: { type: 'string', description: 'YYYY-MM-DD' } }, ['date'])),
  tool('get_progress', 'Pobierz podsumowanie postępu dla zakresu dat.', jsonObject({ from: { type: 'string' }, to: { type: 'string' } }, ['from', 'to'])),
  tool('get_history', 'Pobierz historię danych dla zakresu dat.', jsonObject({ from: { type: 'string' }, to: { type: 'string' } }, ['from', 'to'])),
  tool('list_plans', 'Pobierz zaplanowane cele i aktywności.', jsonObject({ from: { type: 'string' }, to: { type: 'string' } })),
  tool('list_activities', 'Pobierz wykonane aktywności.', jsonObject({ from: { type: 'string' }, to: { type: 'string' } })),
  tool('list_nutrition', 'Pobierz wpisy żywieniowe.', jsonObject({ from: { type: 'string' }, to: { type: 'string' } })),
  tool('get_profile', 'Pobierz profil i cele użytkownika obowiązujące dzisiaj.', jsonObject({})),
  tool('create_plan', 'Dodaj plan, cel lub aktywność do kalendarza.', jsonObject({
    date: { type: 'string' }, kind: { type: 'string', enum: ['workout', 'metric_goal', 'count_goal', 'manual'] }, title: { type: 'string' },
    completionStrategy: { type: 'string', enum: ['metric_auto', 'count_manual', 'activity_link', 'manual'] }, metricKey: { type: ['string', 'null'] },
    targetValue: { type: ['number', 'null'] }, unit: { type: ['string', 'null'] }, activityType: { type: ['string', 'null'] },
    plannedDurationSeconds: { type: ['integer', 'null'] }, plannedDistanceMeters: { type: ['number', 'null'] },
    workoutStructure: { type: ['object', 'null'], properties: { sets: { type: ['integer', 'null'] }, repsPerSet: { type: ['integer', 'null'] }, secondsPerSet: { type: ['integer', 'null'] }, restSeconds: { type: ['integer', 'null'] } } },
  }, ['date', 'kind', 'title', 'completionStrategy'])),
  tool('update_plan', 'Zmień istniejący plan lub aktywność.', jsonObject({ planId: { type: 'string' }, patch: { type: 'object' } }, ['planId', 'patch'])),
  tool('delete_plan', 'Usuń wskazany plan na wyraźne polecenie użytkownika.', jsonObject({ planId: { type: 'string' } }, ['planId'])),
  tool('set_plan_progress', 'Ustaw ręczny postęp planu.', jsonObject({ planId: { type: 'string' }, value: { type: 'number', minimum: 0 } }, ['planId', 'value'])),
  tool('attach_activity', 'Podepnij zaimportowaną aktywność do planu.', jsonObject({ planId: { type: 'string' }, activityId: { type: 'string' } }, ['planId', 'activityId'])),
  tool('create_custom_activity', 'Zapisz wykonaną ręcznie aktywność.', jsonObject({ title: { type: 'string' }, activityType: { type: 'string' }, startedAt: { type: 'string' }, durationMinutes: { type: ['number', 'null'] }, distanceKm: { type: ['number', 'null'] }, calories: { type: ['number', 'null'] } }, ['title', 'activityType'])),
  tool('create_nutrition', 'Dodaj wpis żywieniowy.', jsonObject({ title: { type: 'string' }, caloriesKcal: { type: ['number', 'null'] }, proteinGrams: { type: ['number', 'null'] }, carbsGrams: { type: ['number', 'null'] }, fatGrams: { type: ['number', 'null'] }, fiberGrams: { type: ['number', 'null'] }, quantityText: { type: ['string', 'null'] }, notes: { type: ['string', 'null'] }, consumedAt: { type: 'string' } }, ['title'])),
  tool('update_nutrition', 'Popraw wskazany wpis żywieniowy.', jsonObject({ entryId: { type: 'string' }, patch: { type: 'object' } }, ['entryId', 'patch'])),
  tool('delete_nutrition', 'Usuń wskazany wpis żywieniowy na wyraźne polecenie użytkownika.', jsonObject({ entryId: { type: 'string' } }, ['entryId'])),
  tool('create_measurement', 'Dodaj ręczny pomiar ciała.', jsonObject({ measuredAt: { type: 'string' }, weightKg: { type: 'number' }, bodyFatPercent: { type: ['number', 'null'] }, bmi: { type: ['number', 'null'] }, muscleMassKg: { type: ['number', 'null'] } }, ['weightKg'])),
  tool('update_profile', 'Zmień dane profilu. Pola celów są automatycznie zapisywane jako nowa rewizja obowiązująca od dzisiaj.', jsonObject({ patch: { type: 'object' } }, ['patch'])),
  tool('set_profile_goals', 'Ustaw cele kcal, makro, kroków lub współczynnik aktywności od dzisiaj. Nie zmienia historycznych dni.', jsonObject(goalToolProperties)),
  tool('set_default_step_goal', 'Ustaw domyślny dzienny cel kroków od dzisiaj.', jsonObject({ steps: { type: 'integer', minimum: 1 } }, ['steps'])),
];

function requireDependency<T>(value: T | undefined, name: string): T {
  if (!value) throw new Error(`Coach tool dependency unavailable: ${name}`);
  return value;
}

function rangeSchema() {
  return z.object({ from: dateSchema.optional(), to: dateSchema.optional() }).refine(value => !value.from || !value.to || value.from <= value.to, 'Invalid date range');
}

function utcDayRange(date: string): { from: string; to: string } {
  return { from: `${date}T00:00:00.000Z`, to: `${date}T23:59:59.999Z` };
}

function localDate(context: CoachToolContext): string {
  const now = new Date(context.now ?? new Date().toISOString());
  if (Number.isNaN(now.getTime())) throw new Error('Invalid Coach context timestamp');
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: context.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

async function auditMutation(
  deps: CoachToolDependencies,
  context: CoachToolContext,
  action: string,
  entityType: string,
  entityId: string | null,
  summary: unknown,
) {
  if (!deps.auditRepository) return;
  await deps.auditRepository.record({
    actorType: 'coach',
    apiTokenId: null,
    action,
    entityType,
    entityId,
    requestId: context.requestId,
    summaryJson: { conversationId: context.conversationId, ...((summary && typeof summary === 'object') ? summary as Record<string, unknown> : { value: summary }) },
  });
}

function progressStatus(plan: StoredPlanItem, value: number): PlanStatus {
  if (plan.completionStrategy === 'metric_auto') throw new Error('Metric-auto plan progress cannot be changed manually');
  if (plan.completionStrategy === 'count_manual' && plan.targetValue != null && plan.targetValue > 0) {
    if (value <= 0) return 'planned';
    if (value >= plan.targetValue) return 'completed';
    return 'partial';
  }
  return value >= 1 ? 'completed' : 'planned';
}

const workoutStructureSchema = z.object({
  sets: z.number().int().positive().nullable().optional(),
  repsPerSet: z.number().int().positive().nullable().optional(),
  secondsPerSet: z.number().int().positive().nullable().optional(),
  restSeconds: z.number().int().nonnegative().nullable().optional(),
}).nullable().optional();

const planCreateSchema = z.object({
  date: dateSchema,
  kind: z.enum(['workout', 'metric_goal', 'count_goal', 'manual']),
  title: z.string().trim().min(1).max(200),
  completionStrategy: z.enum(['metric_auto', 'count_manual', 'activity_link', 'manual']),
  metricKey: z.string().trim().min(1).nullable().optional(),
  targetValue: positiveNullable,
  unit: z.string().trim().max(40).nullable().optional(),
  activityType: z.string().trim().max(80).nullable().optional(),
  plannedDurationSeconds: z.number().int().positive().nullable().optional(),
  plannedDistanceMeters: z.number().positive().nullable().optional(),
  workoutStructure: workoutStructureSchema,
});

const planPatchSchema = planCreateSchema.partial().omit({ date: true }).extend({ date: dateSchema.optional() });

const nutritionPatchSchema = z.object({
  consumedAt: timestampSchema.optional(),
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'other']).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  caloriesKcal: nonNegativeNullable,
  proteinGrams: nonNegativeNullable,
  carbsGrams: nonNegativeNullable,
  fatGrams: nonNegativeNullable,
  fiberGrams: nonNegativeNullable,
  quantityText: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

const goalPatchSchema = z.object({
  activityFactor: z.number().min(1).max(3).optional(),
  defaultStepsGoal: z.number().int().min(1).max(100000).optional(),
  dailyCaloriesGoalKcal: z.number().int().min(1).max(20000).nullable().optional(),
  dailyProteinGoalGrams: z.number().int().min(1).max(1000).nullable().optional(),
  dailyCarbsGoalGrams: z.number().int().min(1).max(2000).nullable().optional(),
  dailyFatGoalGrams: z.number().int().min(1).max(1000).nullable().optional(),
  dailyFiberGoalGrams: z.number().int().min(1).max(500).nullable().optional(),
});

const profilePatchSchema = goalPatchSchema.extend({
  dateOfBirth: dateSchema.nullable().optional(),
  sexForBmr: z.enum(['male', 'female']).nullable().optional(),
  heightCm: z.number().positive().max(260).nullable().optional(),
});

const setGoalsSchema = goalPatchSchema.extend({
  reason: z.string().trim().min(1).max(500).nullable().optional(),
}).refine(value => Object.keys(value).some(key => key !== 'reason'), 'At least one goal field is required');

export async function executeCoachTool(
  name: string,
  rawArguments: unknown,
  deps: CoachToolDependencies,
  context: CoachToolContext,
): Promise<unknown> {
  if (!coachTools.some(item => item.function.name === name)) throw new Error(`Unknown Coach tool: ${name}`);

  if (name === 'get_today') {
    const { date } = z.object({ date: dateSchema }).parse(rawArguments);
    const day = utcDayRange(date);
    const [health, plans, activities, nutrition, measurements, profile, goals] = await Promise.all([
      deps.dailyHealthRepository?.findByDate(date) ?? null,
      deps.planRepository?.list(date, date) ?? [],
      deps.completedActivityRepository?.list(day.from, day.to) ?? [],
      deps.nutritionRepository?.list(day.from, day.to) ?? [],
      deps.measurementRepository?.list(day.from, day.to) ?? [],
      deps.profileRepository?.get() ?? null,
      deps.profileGoalService?.resolve(date) ?? null,
    ]);
    return { date, health, plans, activities, nutrition, latestMeasurement: measurements[0] ?? null, profile: profile ? { ...profile, ...goals } : profile, goals };
  }

  if (name === 'get_progress' || name === 'get_history') {
    const { from, to } = z.object({ from: dateSchema, to: dateSchema }).refine(value => value.from <= value.to, 'Invalid date range').parse(rawArguments);
    const fromTs = `${from}T00:00:00.000Z`;
    const toTs = `${to}T23:59:59.999Z`;
    const [plans, health, activities, nutrition, measurements] = await Promise.all([
      deps.planRepository?.list(from, to) ?? [],
      deps.dailyHealthRepository?.list(from, to) ?? [],
      deps.completedActivityRepository?.list(fromTs, toTs) ?? [],
      deps.nutritionRepository?.list(fromTs, toTs) ?? [],
      deps.measurementRepository?.list(fromTs, toTs) ?? [],
    ]);
    if (name === 'get_history') return { from, to, plans, health, activities, nutrition, measurements };
    const completed = plans.filter(item => item.status === 'completed').length;
    const partial = plans.filter(item => item.status === 'partial').length;
    const planCompletionPercent = plans.length ? Math.round(((completed + partial * 0.5) / plans.length) * 100) : null;
    const stepValues = health.map(item => item.steps).filter((value): value is number => typeof value === 'number');
    const averageSteps = stepValues.length ? Math.round(stepValues.reduce((sum, value) => sum + value, 0) / stepValues.length) : null;
    return { from, to, plan: { total: plans.length, completed, partial, completionPercent: planCompletionPercent }, averageSteps, activityCount: activities.length, nutritionEntryCount: nutrition.length, measurements };
  }

  if (name === 'list_plans') {
    const range = rangeSchema().parse(rawArguments);
    return requireDependency(deps.planRepository, 'planRepository').list(range.from, range.to);
  }
  if (name === 'list_activities') {
    const range = rangeSchema().parse(rawArguments);
    return requireDependency(deps.completedActivityRepository, 'completedActivityRepository').list(
      range.from ? `${range.from}T00:00:00.000Z` : undefined,
      range.to ? `${range.to}T23:59:59.999Z` : undefined,
    );
  }
  if (name === 'list_nutrition') {
    const range = rangeSchema().parse(rawArguments);
    return requireDependency(deps.nutritionRepository, 'nutritionRepository').list(
      range.from ? `${range.from}T00:00:00.000Z` : undefined,
      range.to ? `${range.to}T23:59:59.999Z` : undefined,
    );
  }
  if (name === 'get_profile') {
    z.object({}).parse(rawArguments);
    const date = localDate(context);
    const [profile, goals] = await Promise.all([
      requireDependency(deps.profileRepository, 'profileRepository').get(),
      deps.profileGoalService?.resolve(date) ?? null,
    ]);
    return profile ? { ...profile, ...goals } : profile;
  }

  if (name === 'create_plan') {
    const input = planCreateSchema.parse(rawArguments);
    const record = await requireDependency(deps.planRepository, 'planRepository').create({
      ...input,
      metricKey: input.metricKey ?? null,
      targetValue: input.targetValue ?? null,
      currentManualValue: null,
      unit: input.unit ?? null,
      activityType: input.activityType ?? null,
      plannedDurationSeconds: input.plannedDurationSeconds ?? null,
      plannedDistanceMeters: input.plannedDistanceMeters ?? null,
      workoutStructure: input.workoutStructure ?? null,
      status: 'planned',
    });
    await auditMutation(deps, context, 'plan.create', 'plan_item', record.id, { after: record });
    return record;
  }

  if (name === 'update_plan') {
    const { planId, patch } = z.object({ planId: z.string().min(1), patch: planPatchSchema }).parse(rawArguments);
    const repo = requireDependency(deps.planRepository, 'planRepository');
    const before = await repo.findById(planId);
    if (!before) throw new Error('Plan item not found');
    const after = await repo.update(planId, patch);
    if (!after) throw new Error('Plan item not found');
    await auditMutation(deps, context, 'plan.update', 'plan_item', planId, { before, after });
    return after;
  }

  if (name === 'delete_plan') {
    const { planId } = z.object({ planId: z.string().min(1) }).parse(rawArguments);
    const repo = requireDependency(deps.planRepository, 'planRepository');
    const before = await repo.findById(planId);
    if (!before) throw new Error('Plan item not found');
    if (!await repo.delete(planId)) throw new Error('Plan item not found');
    await auditMutation(deps, context, 'plan.delete', 'plan_item', planId, { before });
    return { deleted: true, id: planId };
  }

  if (name === 'set_plan_progress') {
    const { planId, value } = z.object({ planId: z.string().min(1), value: z.number().nonnegative() }).parse(rawArguments);
    const repo = requireDependency(deps.planRepository, 'planRepository');
    const before = await repo.findById(planId);
    if (!before) throw new Error('Plan item not found');
    const after = await repo.update(planId, { currentManualValue: value, status: progressStatus(before, value) });
    if (!after) throw new Error('Plan item not found');
    await auditMutation(deps, context, 'plan.progress', 'plan_item', planId, { before, after });
    return after;
  }

  if (name === 'attach_activity') {
    const { planId, activityId } = z.object({ planId: z.string().min(1), activityId: z.string().min(1) }).parse(rawArguments);
    const planRepo = requireDependency(deps.planRepository, 'planRepository');
    const matchRepo = requireDependency(deps.activityMatchRepository, 'activityMatchRepository');
    const plan = await planRepo.findById(planId);
    if (!plan) throw new Error('Plan item not found');
    if (deps.completedActivityRepository?.findById && !await deps.completedActivityRepository.findById(activityId)) throw new Error('Activity not found');
    await matchRepo.attach(planId, activityId);
    const after = await planRepo.update(planId, { status: 'completed' });
    await auditMutation(deps, context, 'activity.attach', 'plan_item', planId, { activityId });
    return after ?? { id: planId, linkedActivityId: activityId, status: 'completed' };
  }

  if (name === 'create_custom_activity') {
    const input = z.object({
      title: z.string().trim().min(1).max(200),
      activityType: z.string().trim().min(1).max(80),
      startedAt: timestampSchema.optional(),
      durationMinutes: z.number().positive().nullable().optional(),
      distanceKm: z.number().nonnegative().nullable().optional(),
      calories: z.number().nonnegative().nullable().optional(),
    }).parse(rawArguments);
    const repo = requireDependency(deps.completedActivityRepository, 'completedActivityRepository');
    if (!repo.upsertProviderActivity) throw new Error('Manual activity write is unavailable');
    const stablePayload = JSON.stringify({ requestId: context.requestId, ...input });
    const providerActivityId = `coach-${createHash('sha256').update(stablePayload).digest('hex').slice(0, 24)}`;
    const record = await repo.upsertProviderActivity({
      provider: 'manual', providerActivityId, transport: 'coach', activityType: input.activityType,
      startedAt: input.startedAt ?? new Date().toISOString(), durationSeconds: input.durationMinutes == null ? null : Math.round(input.durationMinutes * 60),
      distanceMeters: input.distanceKm == null ? null : input.distanceKm * 1000, calories: input.calories ?? null,
    });
    await auditMutation(deps, context, 'activity.create_custom', 'completed_activity', record.id, { title: input.title, after: record });
    return record;
  }

  if (name === 'create_nutrition') {
    const input = nutritionPatchSchema.extend({ title: z.string().trim().min(1).max(200) }).parse(rawArguments);
    const record = await requireDependency(deps.nutritionRepository, 'nutritionRepository').create({
      consumedAt: input.consumedAt ?? new Date().toISOString(), mealType: input.mealType ?? 'other', title: input.title,
      caloriesKcal: input.caloriesKcal ?? null, proteinGrams: input.proteinGrams ?? null, carbsGrams: input.carbsGrams ?? null,
      fatGrams: input.fatGrams ?? null, fiberGrams: input.fiberGrams ?? null, quantityText: input.quantityText ?? null, notes: input.notes ?? null, source: 'manual',
    });
    await auditMutation(deps, context, 'nutrition.create', 'nutrition_entry', record.id, { after: record });
    return record;
  }

  if (name === 'update_nutrition') {
    const { entryId, patch } = z.object({ entryId: z.string().min(1), patch: nutritionPatchSchema }).parse(rawArguments);
    const repo = requireDependency(deps.nutritionRepository, 'nutritionRepository');
    const before = await repo.findById(entryId);
    if (!before) throw new Error('Nutrition entry not found');
    const after = await repo.update(entryId, patch);
    if (!after) throw new Error('Nutrition entry not found');
    await auditMutation(deps, context, 'nutrition.update', 'nutrition_entry', entryId, { before, after });
    return after;
  }

  if (name === 'delete_nutrition') {
    const { entryId } = z.object({ entryId: z.string().min(1) }).parse(rawArguments);
    const repo = requireDependency(deps.nutritionRepository, 'nutritionRepository');
    const before = await repo.findById(entryId);
    if (!before) throw new Error('Nutrition entry not found');
    if (!await repo.delete(entryId)) throw new Error('Nutrition entry not found');
    await auditMutation(deps, context, 'nutrition.delete', 'nutrition_entry', entryId, { before });
    return { deleted: true, id: entryId };
  }

  if (name === 'create_measurement') {
    const input = z.object({
      measuredAt: timestampSchema.optional(), weightKg: z.number().positive(), bodyFatPercent: nonNegativeNullable,
      bmi: nonNegativeNullable, muscleMassKg: nonNegativeNullable,
    }).parse(rawArguments);
    const record = await requireDependency(deps.measurementRepository, 'measurementRepository').create({
      measuredAt: input.measuredAt ?? new Date().toISOString(), weightKg: input.weightKg,
      bodyFatPercent: input.bodyFatPercent ?? null, bmi: input.bmi ?? null, muscleMassKg: input.muscleMassKg ?? null,
      bodyWaterPercent: null, boneMassKg: null, visceralFat: null, metabolicAge: null, physiqueRating: null,
      transport: 'coach', source: 'manual',
    });
    await auditMutation(deps, context, 'measurement.create', 'body_measurement', record.id, { after: record });
    return record;
  }

  if (name === 'update_profile') {
    const { patch } = z.object({ patch: profilePatchSchema }).parse(rawArguments);
    const {
      activityFactor, defaultStepsGoal, dailyCaloriesGoalKcal, dailyProteinGoalGrams,
      dailyCarbsGoalGrams, dailyFatGoalGrams, dailyFiberGoalGrams,
      ...demographicPatch
    } = patch;
    const goalPatch = {
      ...(activityFactor !== undefined ? { activityFactor } : {}),
      ...(defaultStepsGoal !== undefined ? { defaultStepsGoal } : {}),
      ...(dailyCaloriesGoalKcal !== undefined ? { dailyCaloriesGoalKcal } : {}),
      ...(dailyProteinGoalGrams !== undefined ? { dailyProteinGoalGrams } : {}),
      ...(dailyCarbsGoalGrams !== undefined ? { dailyCarbsGoalGrams } : {}),
      ...(dailyFatGoalGrams !== undefined ? { dailyFatGoalGrams } : {}),
      ...(dailyFiberGoalGrams !== undefined ? { dailyFiberGoalGrams } : {}),
    };

    const repo = requireDependency(deps.profileRepository, 'profileRepository');
    const before = await repo.get();
    let after = before;
    if (Object.keys(demographicPatch).length > 0) {
      after = await repo.upsert(demographicPatch);
      await auditMutation(deps, context, 'profile.update', 'health_profile', 'default', { before, after });
    }
    let goals = null;
    if (Object.keys(goalPatch).length > 0) {
      const goalService = requireDependency(deps.profileGoalService, 'profileGoalService');
      goals = await goalService.createRevision(goalPatch, {
        effectiveFrom: localDate(context),
        source: 'coach',
        sourceRef: context.conversationId,
        reason: 'Zmiana celów przez Coacha',
      });
      await auditMutation(deps, context, 'profile.goals.revise', 'profile_goal_revision', goals.id, { after: goals });
    }
    return after ? { ...after, ...goals } : goals;
  }

  if (name === 'set_profile_goals') {
    const parsed = setGoalsSchema.parse(rawArguments);
    const { reason = null, ...patch } = parsed;
    const goalService = requireDependency(deps.profileGoalService, 'profileGoalService');
    const revision = await goalService.createRevision(patch, {
      effectiveFrom: localDate(context),
      source: 'coach',
      sourceRef: context.conversationId,
      reason,
    });
    await auditMutation(deps, context, 'profile.goals.revise', 'profile_goal_revision', revision.id, { after: revision });
    return revision;
  }

  if (name === 'set_default_step_goal') {
    const { steps } = z.object({ steps: z.number().int().positive() }).parse(rawArguments);
    const goalService = requireDependency(deps.profileGoalService, 'profileGoalService');
    const revision = await goalService.createRevision({ defaultStepsGoal: steps }, {
      effectiveFrom: localDate(context),
      source: 'coach',
      sourceRef: context.conversationId,
      reason: 'Zmiana celu kroków przez Coacha',
    });
    await auditMutation(deps, context, 'profile.goals.revise', 'profile_goal_revision', revision.id, { after: revision });
    return revision;
  }

  throw new Error(`Unknown Coach tool: ${name}`);
}
