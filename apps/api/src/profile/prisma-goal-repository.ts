import type {
  GoalRevisionSource,
  ProfileGoalRevisionRecord,
  ProfileGoalRevisionRepository,
} from './goal-repository.js';

export type ProfileGoalPrismaClient = any;

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function mapRevision(row: any): ProfileGoalRevisionRecord {
  return {
    id: row.id,
    effectiveFrom: formatDateOnly(row.effectiveFrom),
    source: row.source as GoalRevisionSource,
    sourceRef: row.sourceRef ?? null,
    reason: row.reason ?? null,
    activityFactor: row.activityFactor,
    defaultStepsGoal: row.defaultStepsGoal,
    dailyCaloriesGoalKcal: row.dailyCaloriesGoalKcal ?? null,
    dailyProteinGoalGrams: row.dailyProteinGoalGrams ?? null,
    dailyCarbsGoalGrams: row.dailyCarbsGoalGrams ?? null,
    dailyFatGoalGrams: row.dailyFatGoalGrams ?? null,
    dailyFiberGoalGrams: row.dailyFiberGoalGrams ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createPrismaGoalRevisionRepository(
  prisma: ProfileGoalPrismaClient,
): ProfileGoalRevisionRepository {
  return {
    async findActiveOn(date) {
      const row = await prisma.profileGoalRevision.findFirst({
        where: { effectiveFrom: { lte: dateOnly(date) } },
        orderBy: [
          { effectiveFrom: 'desc' },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
      });
      return row ? mapRevision(row) : null;
    },

    async list() {
      const rows = await prisma.profileGoalRevision.findMany({
        orderBy: [
          { effectiveFrom: 'desc' },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
      });
      return rows.map(mapRevision);
    },

    async count() {
      return prisma.profileGoalRevision.count();
    },

    async create(input) {
      const row = await prisma.profileGoalRevision.create({
        data: {
          effectiveFrom: dateOnly(input.effectiveFrom),
          source: input.source,
          sourceRef: input.sourceRef,
          reason: input.reason,
          activityFactor: input.activityFactor,
          defaultStepsGoal: input.defaultStepsGoal,
          dailyCaloriesGoalKcal: input.dailyCaloriesGoalKcal,
          dailyProteinGoalGrams: input.dailyProteinGoalGrams,
          dailyCarbsGoalGrams: input.dailyCarbsGoalGrams,
          dailyFatGoalGrams: input.dailyFatGoalGrams,
          dailyFiberGoalGrams: input.dailyFiberGoalGrams,
        },
      });
      return mapRevision(row);
    },
  };
}
