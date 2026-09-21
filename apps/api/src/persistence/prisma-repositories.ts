import type { PlanRepository, StoredPlanItem, NewStoredPlanItem } from '../plans/repository.js';
import type { NutritionRepository, NutritionRecord, NewNutritionRecord } from '../nutrition/repository.js';
import type { MeasurementRepository, MeasurementRecord, NewMeasurementRecord } from '../measurements/repository.js';
import type { DailyHealthRepository, DailyHealthRecord, DailyHealthUpsert } from '../health/repository.js';
import type { CompletedActivityRepository, CompletedActivityRecord, ProviderActivityUpsert } from '../activities/repository.js';
import type { ActivityMatchRepository } from '../activities/matches.js';
import type { HealthProfileRepository, HealthProfileRecord, HealthProfilePatch } from '../profile/repository.js';
import type { CoachRepository, CoachConversationRecord, CoachMessageRecord } from '../coach/repository.js';
import type { ApiTokenRepository } from '../auth/service.js';
import type { AuditRepository } from '../audit/repository.js';
import type { IdempotencyRepository, IdempotencyRecord } from '../idempotency/repository.js';

export type PrismaClientPort = any;

function dateOnly(value: string): Date { return new Date(`${value}T00:00:00.000Z`); }
function formatDateOnly(value: Date): string { return value.toISOString().slice(0, 10); }

function parseScopes(scopesJson: unknown): string[] {
  if (typeof scopesJson !== 'string') return [];
  try {
    const parsed = JSON.parse(scopesJson);
    return Array.isArray(parsed) ? parsed.filter((scope): scope is string => typeof scope === 'string') : [];
  } catch {
    return [];
  }
}

function mapPlan(row: any): StoredPlanItem {
  return {
    id: row.id, date: formatDateOnly(row.date), kind: row.kind, title: row.title,
    completionStrategy: row.completionStrategy, metricKey: row.metricKey ?? null,
    targetValue: row.targetValue ?? null, currentManualValue: row.currentManualValue ?? null,
    unit: row.unit ?? null, status: row.status, activityType: row.activityType ?? null,
    plannedDurationSeconds: row.plannedDurationSeconds ?? null,
    plannedDistanceMeters: row.plannedDistanceMeters ?? null,
    workoutStructure: row.workoutStructureJson ?? null,
    linkedActivityId: row.activityMatch?.completedActivityId ?? null,
  };
}

function planData(input: NewStoredPlanItem | Partial<StoredPlanItem>) {
  const { id: _id, linkedActivityId: _linkedActivityId, date, workoutStructure, ...rest } = input as Partial<StoredPlanItem>;
  return {
    ...rest,
    ...(date !== undefined ? { date: dateOnly(date) } : {}),
    ...(workoutStructure !== undefined ? { workoutStructureJson: workoutStructure } : {}),
  };
}

function mapNutrition(row: any): NutritionRecord {
  return {
    id: row.id, consumedAt: row.consumedAt.toISOString(), mealType: row.mealType, title: row.title,
    caloriesKcal: row.caloriesKcal ?? null, proteinGrams: row.proteinGrams ?? null,
    carbsGrams: row.carbsGrams ?? null, fatGrams: row.fatGrams ?? null,
    fiberGrams: row.fiberGrams ?? null, quantityText: row.quantityText ?? null,
    notes: row.notes ?? null, source: row.source,
  };
}

function nutritionData(input: NewNutritionRecord | Partial<NutritionRecord>) {
  const { id: _id, consumedAt, ...rest } = input as Partial<NutritionRecord>;
  return { ...rest, ...(consumedAt !== undefined ? { consumedAt: new Date(consumedAt) } : {}) };
}

function mapMeasurement(row: any): MeasurementRecord {
  return {
    id: row.id, measuredAt: row.measuredAt.toISOString(), weightKg: row.weightKg,
    bodyFatPercent: row.bodyFatPercent ?? null, bmi: row.bmi ?? null,
    muscleMassKg: row.muscleMassKg ?? null, bodyWaterPercent: row.bodyWaterPercent ?? null,
    boneMassKg: row.boneMassKg ?? null, visceralFat: row.visceralFat ?? null,
    metabolicAge: row.metabolicAge ?? null, physiqueRating: row.physiqueRating ?? null,
    transport: row.transport ?? null, source: row.source,
  };
}

function mapProfile(row: any): HealthProfileRecord {
  return {
    id: 'default',
    dateOfBirth: row.dateOfBirth ? formatDateOnly(row.dateOfBirth) : null,
    sexForBmr: row.sexForBmr ?? null,
    heightCm: row.heightCm ?? null,
    activityFactor: row.activityFactor,
    defaultStepsGoal: row.defaultStepsGoal,
    dailyCaloriesGoalKcal: row.dailyCaloriesGoalKcal ?? null,
    dailyProteinGoalGrams: row.dailyProteinGoalGrams ?? null,
  };
}

function profileData(patch: HealthProfilePatch) {
  const { dateOfBirth, ...rest } = patch;
  return {
    ...rest,
    ...(dateOfBirth !== undefined ? { dateOfBirth: dateOfBirth === null ? null : dateOnly(dateOfBirth) } : {}),
  };
}

function mapDailyHealth(row: any): DailyHealthRecord {
  return {
    date: formatDateOnly(row.date), source: row.source, transport: row.transport ?? null,
    steps: row.steps ?? null, stepsGoal: row.stepsGoal ?? null,
    floorsAscended: row.floorsAscended ?? null, floorsDescended: row.floorsDescended ?? null,
    vo2Max: row.vo2Max ?? null, providerBmrKcal: row.providerBmrKcal ?? null,
    intensityMinutes: row.intensityMinutes ?? null, restingHr: row.restingHr ?? null,
    hrv: row.hrv ?? null, stress: row.stress ?? null, bodyBattery: row.bodyBattery ?? null,
    sleepDurationSeconds: row.sleepDurationSeconds ?? null, sleepStages: row.sleepStagesJson ?? null,
    respiration: row.respiration ?? null, spo2: row.spo2 ?? null, calories: row.calories ?? null,
    activeCalories: row.activeCalories ?? null, hydrationMl: row.hydrationMl ?? null,
    readiness: row.readinessMetricsJson ?? null,
  };
}

function dailyHealthData(input: DailyHealthUpsert) {
  return {
    date: dateOnly(input.date), source: input.source, transport: input.transport ?? null,
    steps: input.steps ?? null, stepsGoal: input.stepsGoal ?? null,
    floorsAscended: input.floorsAscended ?? null, floorsDescended: input.floorsDescended ?? null,
    vo2Max: input.vo2Max ?? null, providerBmrKcal: input.providerBmrKcal ?? null,
    intensityMinutes: input.intensityMinutes ?? null, restingHr: input.restingHr ?? null,
    hrv: input.hrv ?? null, stress: input.stress ?? null, bodyBattery: input.bodyBattery ?? null,
    sleepDurationSeconds: input.sleepDurationSeconds ?? null, sleepStagesJson: input.sleepStages ?? null,
    respiration: input.respiration ?? null, spo2: input.spo2 ?? null, calories: input.calories ?? null,
    activeCalories: input.activeCalories ?? null, hydrationMl: input.hydrationMl ?? null,
    readinessMetricsJson: input.readiness ?? null,
  };
}

function mapActivity(row: any): CompletedActivityRecord {
  return {
    id: row.id, provider: row.provider, providerActivityId: row.providerActivityId ?? null,
    transport: row.transport ?? null, activityType: row.activityType,
    startedAt: row.startedAt.toISOString(), durationSeconds: row.durationSeconds ?? null,
    distanceMeters: row.distanceMeters ?? null, avgHr: row.avgHr ?? null,
    maxHr: row.maxHr ?? null, avgPaceSecondsPerKm: row.avgPaceSecondsPerKm ?? null,
    cadence: row.cadence ?? null, elevationGainMeters: row.elevationGainMeters ?? null,
    calories: row.calories ?? null,
  };
}

function activityData(input: ProviderActivityUpsert) {
  return {
    provider: input.provider,
    providerActivityId: input.providerActivityId,
    transport: input.transport ?? null,
    activityType: input.activityType,
    startedAt: new Date(input.startedAt),
    durationSeconds: input.durationSeconds ?? null,
    distanceMeters: input.distanceMeters ?? null,
    avgHr: input.avgHr ?? null,
    maxHr: input.maxHr ?? null,
    avgPaceSecondsPerKm: input.avgPaceSecondsPerKm ?? null,
    cadence: input.cadence ?? null,
    elevationGainMeters: input.elevationGainMeters ?? null,
    calories: input.calories ?? null,
  };
}

function mapCoachConversation(row: any): CoachConversationRecord {
  return {
    id: row.id,
    title: row.title ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapCoachMessage(row: any): CoachMessageRecord {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    content: row.content,
    model: row.model ?? null,
    toolMetadata: row.toolMetadata ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function rangeWhere(field: string, from?: string, to?: string) {
  if (!from && !to) return undefined;
  return {
    [field]: {
      ...(from ? { gte: field === 'date' ? dateOnly(from) : new Date(from) } : {}),
      ...(to ? { lte: field === 'date' ? dateOnly(to) : new Date(to) } : {}),
    },
  };
}

export function createPrismaRepositories(prisma: PrismaClientPort) {
  const planRepository: PlanRepository = {
    async create(input) {
      const row = await prisma.planItem.create({ data: planData(input), include: { activityMatch: { select: { completedActivityId: true } } } });
      return mapPlan(row);
    },
    async list(from, to) {
      const rows = await prisma.planItem.findMany({ where: rangeWhere('date', from, to), orderBy: [{ date: 'asc' }, { createdAt: 'asc' }], include: { activityMatch: { select: { completedActivityId: true } } } });
      return rows.map(mapPlan);
    },
    async findById(id) {
      const row = await prisma.planItem.findUnique({ where: { id }, include: { activityMatch: { select: { completedActivityId: true } } } });
      return row ? mapPlan(row) : null;
    },
    async update(id, patch) {
      const existing = await prisma.planItem.findUnique({ where: { id } });
      if (!existing) return null;
      const row = await prisma.planItem.update({ where: { id }, data: planData(patch), include: { activityMatch: { select: { completedActivityId: true } } } });
      return mapPlan(row);
    },
    async delete(id) { const result = await prisma.planItem.deleteMany({ where: { id } }); return result.count > 0; },
  };

  const nutritionRepository: NutritionRepository = {
    async create(input) { return mapNutrition(await prisma.nutritionEntry.create({ data: nutritionData(input) })); },
    async list(from, to) { return (await prisma.nutritionEntry.findMany({ where: rangeWhere('consumedAt', from, to), orderBy: { consumedAt: 'asc' } })).map(mapNutrition); },
    async findById(id) { const row = await prisma.nutritionEntry.findUnique({ where: { id } }); return row ? mapNutrition(row) : null; },
    async update(id, patch) {
      const existing = await prisma.nutritionEntry.findUnique({ where: { id } }); if (!existing) return null;
      return mapNutrition(await prisma.nutritionEntry.update({ where: { id }, data: nutritionData(patch) }));
    },
    async delete(id) { const result = await prisma.nutritionEntry.deleteMany({ where: { id } }); return result.count > 0; },
  };

  const measurementRepository: MeasurementRepository = {
    async create(input: NewMeasurementRecord) { return mapMeasurement(await prisma.bodyMeasurement.create({ data: { ...input, measuredAt: new Date(input.measuredAt) } })); },
    async list(from, to) { return (await prisma.bodyMeasurement.findMany({ where: rangeWhere('measuredAt', from, to), orderBy: { measuredAt: 'desc' } })).map(mapMeasurement); },
  };

  const profileRepository: HealthProfileRepository = {
    async get() {
      const row = await prisma.healthProfile.findUnique({ where: { id: 'default' } });
      return row ? mapProfile(row) : null;
    },
    async upsert(patch) {
      const data = profileData(patch);
      const row = await prisma.healthProfile.upsert({
        where: { id: 'default' },
        create: { id: 'default', ...data },
        update: data,
      });
      return mapProfile(row);
    },
  };

  const dailyHealthRepository: DailyHealthRepository = {
    async findByDate(date) {
      const row = await prisma.dailyHealth.findFirst({ where: { date: dateOnly(date) }, orderBy: [{ source: 'asc' }, { updatedAt: 'desc' }] });
      return row ? mapDailyHealth(row) : null;
    },
    async list(from, to) { return (await prisma.dailyHealth.findMany({ where: rangeWhere('date', from, to), orderBy: { date: 'asc' } })).map(mapDailyHealth); },
    async upsert(input) {
      const data = dailyHealthData(input);
      const row = await prisma.dailyHealth.upsert({
        where: { date_source: { date: data.date, source: data.source } },
        create: data,
        update: data,
      });
      return mapDailyHealth(row);
    },
  };

  const completedActivityRepository: CompletedActivityRepository = {
    async list(from, to) { return (await prisma.completedActivity.findMany({ where: rangeWhere('startedAt', from, to), orderBy: { startedAt: 'desc' } })).map(mapActivity); },
    async findById(id) { const row = await prisma.completedActivity.findUnique({ where: { id } }); return row ? mapActivity(row) : null; },
    async upsertProviderActivity(input) {
      const data = activityData(input);
      const row = await prisma.completedActivity.upsert({
        where: { provider_providerActivityId: { provider: data.provider, providerActivityId: data.providerActivityId } },
        create: data,
        update: data,
      });
      return mapActivity(row);
    },
  };

  const activityMatchRepository: ActivityMatchRepository = {
    async attach(planItemId, completedActivityId) {
      await prisma.activityMatch.deleteMany({ where: { completedActivityId, NOT: { planItemId } } });
      await prisma.activityMatch.upsert({
        where: { planItemId },
        create: { planItemId, completedActivityId, matchSource: 'manual' },
        update: { completedActivityId, matchSource: 'manual' },
      });
    },
    async detach(planItemId) { await prisma.activityMatch.deleteMany({ where: { planItemId } }); },
  };

  const coachRepository: CoachRepository = {
    async createConversation(title = null) {
      return mapCoachConversation(await prisma.coachConversation.create({ data: { title } }));
    },
    async listConversations() {
      return (await prisma.coachConversation.findMany({ orderBy: { updatedAt: 'desc' } })).map(mapCoachConversation);
    },
    async findConversation(id) {
      const row = await prisma.coachConversation.findUnique({ where: { id } });
      return row ? mapCoachConversation(row) : null;
    },
    async listMessages(conversationId) {
      return (await prisma.coachMessage.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' } })).map(mapCoachMessage);
    },
    async addMessage(input) {
      const row = await prisma.coachMessage.create({
        data: {
          conversationId: input.conversationId,
          role: input.role,
          content: input.content,
          model: input.model ?? null,
          toolMetadata: input.toolMetadata ?? null,
        },
      });
      await prisma.coachConversation.update({ where: { id: input.conversationId }, data: { updatedAt: new Date() } });
      return mapCoachMessage(row);
    },
  };

  const tokenRepository: ApiTokenRepository = {
    async findByHash(tokenHash) {
      const row = await prisma.apiToken.findUnique({ where: { tokenHash } });
      if (!row) return null;
      return { id: row.id, tokenHash: row.tokenHash, scopes: parseScopes(row.scopesJson), revokedAt: row.revokedAt ?? null };
    },
  };
  const auditRepository: AuditRepository = { async record(event) { await prisma.auditEvent.create({ data: event }); } };
  const idempotencyRepository: IdempotencyRepository = {
    async find(tokenId, route, idempotencyKey) {
      const row = await prisma.idempotencyRecord.findUnique({ where: { tokenId_route_idempotencyKey: { tokenId, route, idempotencyKey } } });
      if (!row || row.expiresAt.getTime() <= Date.now()) return null;
      return { tokenId: row.tokenId, route: row.route, idempotencyKey: row.idempotencyKey, requestHash: row.requestHash, responseStatus: row.responseStatus, responseJson: row.responseJson };
    },
    async save(record: IdempotencyRecord) {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await prisma.idempotencyRecord.upsert({
        where: { tokenId_route_idempotencyKey: { tokenId: record.tokenId, route: record.route, idempotencyKey: record.idempotencyKey } },
        create: { ...record, expiresAt },
        update: { requestHash: record.requestHash, responseStatus: record.responseStatus, responseJson: record.responseJson, expiresAt },
      });
    },
  };

  return { planRepository, nutritionRepository, measurementRepository, profileRepository, dailyHealthRepository, completedActivityRepository, activityMatchRepository, coachRepository, tokenRepository, auditRepository, idempotencyRepository };
}