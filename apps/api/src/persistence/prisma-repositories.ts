import type { PlanRepository, StoredPlanItem, NewStoredPlanItem } from '../plans/repository.js';
import type { NutritionRepository, NutritionRecord, NewNutritionRecord } from '../nutrition/repository.js';
import type { MeasurementRepository, MeasurementRecord, NewMeasurementRecord } from '../measurements/repository.js';
import type { DailyHealthRepository, DailyHealthRecord } from '../health/repository.js';
import type { CompletedActivityRepository, CompletedActivityRecord } from '../activities/repository.js';
import type { ApiTokenRepository } from '../auth/service.js';
import type { AuditRepository } from '../audit/repository.js';
import type { IdempotencyRepository, IdempotencyRecord } from '../idempotency/repository.js';

// Structural port keeps domain tests independent from generated Prisma types.
export type PrismaClientPort = any;

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function mapPlan(row: any): StoredPlanItem {
  return {
    id: row.id,
    date: formatDateOnly(row.date),
    kind: row.kind,
    title: row.title,
    completionStrategy: row.completionStrategy,
    metricKey: row.metricKey ?? null,
    targetValue: row.targetValue ?? null,
    currentManualValue: row.currentManualValue ?? null,
    unit: row.unit ?? null,
    status: row.status,
    activityType: row.activityType ?? null,
    plannedDurationSeconds: row.plannedDurationSeconds ?? null,
    plannedDistanceMeters: row.plannedDistanceMeters ?? null,
    linkedActivityId: row.activityMatch?.completedActivityId ?? null,
  };
}

function planData(input: NewStoredPlanItem | Partial<StoredPlanItem>) {
  const {
    id: _id,
    linkedActivityId: _linkedActivityId,
    date,
    ...rest
  } = input as Partial<StoredPlanItem>;
  return {
    ...rest,
    ...(date !== undefined ? { date: dateOnly(date) } : {}),
  };
}

function mapNutrition(row: any): NutritionRecord {
  return {
    id: row.id,
    consumedAt: row.consumedAt.toISOString(),
    mealType: row.mealType,
    title: row.title,
    caloriesKcal: row.caloriesKcal ?? null,
    proteinGrams: row.proteinGrams ?? null,
    carbsGrams: row.carbsGrams ?? null,
    fatGrams: row.fatGrams ?? null,
    fiberGrams: row.fiberGrams ?? null,
    quantityText: row.quantityText ?? null,
    notes: row.notes ?? null,
    source: row.source,
  };
}

function nutritionData(input: NewNutritionRecord | Partial<NutritionRecord>) {
  const { id: _id, consumedAt, ...rest } = input as Partial<NutritionRecord>;
  return {
    ...rest,
    ...(consumedAt !== undefined ? { consumedAt: new Date(consumedAt) } : {}),
  };
}

function mapMeasurement(row: any): MeasurementRecord {
  return {
    id: row.id,
    measuredAt: row.measuredAt.toISOString(),
    weightKg: row.weightKg,
    bodyFatPercent: row.bodyFatPercent ?? null,
    bmi: row.bmi ?? null,
    muscleMassKg: row.muscleMassKg ?? null,
    source: row.source,
  };
}

function mapDailyHealth(row: any): DailyHealthRecord {
  return {
    date: formatDateOnly(row.date),
    source: row.source,
    steps: row.steps ?? null,
    floorsAscended: row.floorsAscended ?? null,
    intensityMinutes: row.intensityMinutes ?? null,
    restingHr: row.restingHr ?? null,
    hrv: row.hrv ?? null,
    stress: row.stress ?? null,
    bodyBattery: row.bodyBattery ?? null,
    sleepDurationSeconds: row.sleepDurationSeconds ?? null,
    respiration: row.respiration ?? null,
    spo2: row.spo2 ?? null,
    calories: row.calories ?? null,
    activeCalories: row.activeCalories ?? null,
    hydrationMl: row.hydrationMl ?? null,
  };
}

function mapActivity(row: any): CompletedActivityRecord {
  return {
    id: row.id,
    provider: row.provider,
    activityType: row.activityType,
    startedAt: row.startedAt.toISOString(),
    durationSeconds: row.durationSeconds ?? null,
    distanceMeters: row.distanceMeters ?? null,
    avgHr: row.avgHr ?? null,
    maxHr: row.maxHr ?? null,
    calories: row.calories ?? null,
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

export function createPrismaRepositories(prisma: PrismaClientPort): {
  planRepository: PlanRepository;
  nutritionRepository: NutritionRepository;
  measurementRepository: MeasurementRepository;
  dailyHealthRepository: DailyHealthRepository;
  completedActivityRepository: CompletedActivityRepository;
  tokenRepository: ApiTokenRepository;
  auditRepository: AuditRepository;
  idempotencyRepository: IdempotencyRepository;
} {
  const planRepository: PlanRepository = {
    async create(input) {
      const row = await prisma.planItem.create({
        data: planData(input),
        include: { activityMatch: { select: { completedActivityId: true } } },
      });
      return mapPlan(row);
    },
    async list(from, to) {
      const rows = await prisma.planItem.findMany({
        where: rangeWhere('date', from, to),
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
        include: { activityMatch: { select: { completedActivityId: true } } },
      });
      return rows.map(mapPlan);
    },
    async findById(id) {
      const row = await prisma.planItem.findUnique({
        where: { id },
        include: { activityMatch: { select: { completedActivityId: true } } },
      });
      return row ? mapPlan(row) : null;
    },
    async update(id, patch) {
      const existing = await prisma.planItem.findUnique({ where: { id } });
      if (!existing) return null;
      const row = await prisma.planItem.update({
        where: { id },
        data: planData(patch),
        include: { activityMatch: { select: { completedActivityId: true } } },
      });
      return mapPlan(row);
    },
    async delete(id) {
      const result = await prisma.planItem.deleteMany({ where: { id } });
      return result.count > 0;
    },
  };

  const nutritionRepository: NutritionRepository = {
    async create(input) {
      return mapNutrition(await prisma.nutritionEntry.create({ data: nutritionData(input) }));
    },
    async list(from, to) {
      const rows = await prisma.nutritionEntry.findMany({
        where: rangeWhere('consumedAt', from, to),
        orderBy: { consumedAt: 'asc' },
      });
      return rows.map(mapNutrition);
    },
    async findById(id) {
      const row = await prisma.nutritionEntry.findUnique({ where: { id } });
      return row ? mapNutrition(row) : null;
    },
    async update(id, patch) {
      const existing = await prisma.nutritionEntry.findUnique({ where: { id } });
      if (!existing) return null;
      return mapNutrition(await prisma.nutritionEntry.update({ where: { id }, data: nutritionData(patch) }));
    },
    async delete(id) {
      const result = await prisma.nutritionEntry.deleteMany({ where: { id } });
      return result.count > 0;
    },
  };

  const measurementRepository: MeasurementRepository = {
    async create(input: NewMeasurementRecord) {
      return mapMeasurement(await prisma.bodyMeasurement.create({
        data: { ...input, measuredAt: new Date(input.measuredAt) },
      }));
    },
    async list(from, to) {
      const rows = await prisma.bodyMeasurement.findMany({
        where: rangeWhere('measuredAt', from, to),
        orderBy: { measuredAt: 'desc' },
      });
      return rows.map(mapMeasurement);
    },
  };

  const dailyHealthRepository: DailyHealthRepository = {
    async findByDate(date) {
      const row = await prisma.dailyHealth.findFirst({
        where: { date: dateOnly(date) },
        orderBy: [{ source: 'asc' }, { updatedAt: 'desc' }],
      });
      return row ? mapDailyHealth(row) : null;
    },
    async list(from, to) {
      const rows = await prisma.dailyHealth.findMany({
        where: rangeWhere('date', from, to),
        orderBy: { date: 'asc' },
      });
      return rows.map(mapDailyHealth);
    },
  };

  const completedActivityRepository: CompletedActivityRepository = {
    async list(from, to) {
      const rows = await prisma.completedActivity.findMany({
        where: rangeWhere('startedAt', from, to),
        orderBy: { startedAt: 'desc' },
      });
      return rows.map(mapActivity);
    },
  };

  const tokenRepository: ApiTokenRepository = {
    async findByHash(tokenHash) {
      const row = await prisma.apiToken.findUnique({ where: { tokenHash } });
      if (!row) return null;
      return { id: row.id, tokenHash: row.tokenHash, scopes: row.scopes, revokedAt: row.revokedAt ?? null };
    },
  };

  const auditRepository: AuditRepository = {
    async record(event) {
      await prisma.auditEvent.create({ data: event });
    },
  };

  const idempotencyRepository: IdempotencyRepository = {
    async find(tokenId, route, idempotencyKey) {
      const row = await prisma.idempotencyRecord.findUnique({
        where: { tokenId_route_idempotencyKey: { tokenId, route, idempotencyKey } },
      });
      if (!row || row.expiresAt.getTime() <= Date.now()) return null;
      return {
        tokenId: row.tokenId,
        route: row.route,
        idempotencyKey: row.idempotencyKey,
        requestHash: row.requestHash,
        responseStatus: row.responseStatus,
        responseJson: row.responseJson,
      };
    },
    async save(record: IdempotencyRecord) {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await prisma.idempotencyRecord.upsert({
        where: {
          tokenId_route_idempotencyKey: {
            tokenId: record.tokenId,
            route: record.route,
            idempotencyKey: record.idempotencyKey,
          },
        },
        create: { ...record, expiresAt },
        update: {
          requestHash: record.requestHash,
          responseStatus: record.responseStatus,
          responseJson: record.responseJson,
          expiresAt,
        },
      });
    },
  };

  return {
    planRepository,
    nutritionRepository,
    measurementRepository,
    dailyHealthRepository,
    completedActivityRepository,
    tokenRepository,
    auditRepository,
    idempotencyRepository,
  };
}
