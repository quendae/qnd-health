import type {
  MeasurementRecord,
  MeasurementRepository,
  NewMeasurementRecord,
} from './repository.js';

export type MeasurementPrismaClient = any;

function mapMeasurement(row: any): MeasurementRecord {
  return {
    id: row.id,
    measuredAt: row.measuredAt.toISOString(),
    weightKg: row.weightKg,
    bodyFatPercent: row.bodyFatPercent ?? null,
    bmi: row.bmi ?? null,
    muscleMassKg: row.muscleMassKg ?? null,
    fatFreeMassKg: row.fatFreeMassKg ?? null,
    subcutaneousFatPercent: row.subcutaneousFatPercent ?? null,
    bodyWaterPercent: row.bodyWaterPercent ?? null,
    skeletalMusclePercent: row.skeletalMusclePercent ?? null,
    boneMassKg: row.boneMassKg ?? null,
    visceralFat: row.visceralFat ?? null,
    proteinPercent: row.proteinPercent ?? null,
    scaleBmrKcal: row.scaleBmrKcal ?? null,
    metabolicAge: row.metabolicAge ?? null,
    physiqueRating: row.physiqueRating ?? null,
    transport: row.transport ?? null,
    source: row.source,
  };
}

function rangeWhere(from?: string, to?: string) {
  if (!from && !to) return undefined;
  return {
    measuredAt: {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    },
  };
}

export function createPrismaMeasurementRepository(
  prisma: MeasurementPrismaClient,
): MeasurementRepository {
  return {
    async create(input: NewMeasurementRecord) {
      const row = await prisma.bodyMeasurement.create({
        data: {
          ...input,
          measuredAt: new Date(input.measuredAt),
        },
      });
      return mapMeasurement(row);
    },

    async list(from, to) {
      const rows = await prisma.bodyMeasurement.findMany({
        where: rangeWhere(from, to),
        orderBy: { measuredAt: 'desc' },
      });
      return rows.map(mapMeasurement);
    },
  };
}
