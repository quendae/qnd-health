import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { RequestAuthorizer } from '../auth/service.js';
import type { AuditRepository } from '../audit/repository.js';
import type { IdempotencyRepository } from '../idempotency/repository.js';
import { errorBody, sendValidationError } from '../http/errors.js';
import { executeSafeWrite } from '../writes/safe-write.js';
import type { DailyHealthRepository } from './repository.js';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must use YYYY-MM-DD');
const nullableNonnegative = z.number().nonnegative().nullable().optional();
const payloadSchema = z.object({
  source: z.literal('garmin').default('garmin'),
  transport: z.enum(['home_assistant', 'garmin_api']).optional(),
  steps: z.number().int().nonnegative().nullable().optional(),
  stepsGoal: z.number().nonnegative().nullable().optional(),
  floorsAscended: nullableNonnegative,
  intensityMinutes: z.number().int().nonnegative().nullable().optional(),
  restingHr: z.number().int().nonnegative().nullable().optional(),
  hrv: nullableNonnegative,
  stress: nullableNonnegative,
  bodyBattery: nullableNonnegative,
  sleepDurationSeconds: z.number().int().nonnegative().nullable().optional(),
  sleepStages: z.record(z.string(), z.unknown()).nullable().optional(),
  respiration: nullableNonnegative,
  spo2: nullableNonnegative,
  calories: nullableNonnegative,
  activeCalories: nullableNonnegative,
  hydrationMl: nullableNonnegative,
  readiness: z.record(z.string(), z.unknown()).nullable().optional(),
});

async function requireWrite(request: FastifyRequest, authorizer: RequestAuthorizer) {
  return authorizer.authorize(request.headers.authorization, ['health:write']);
}

export function registerHealthRoutes(app: FastifyInstance, deps: {
  authorizer: RequestAuthorizer;
  dailyHealthRepository: DailyHealthRepository;
  auditRepository: AuditRepository;
  idempotencyRepository: IdempotencyRepository;
}): void {
  app.put('/api/v1/health/daily/:date', async (request, reply) => {
    const actor = await requireWrite(request, deps.authorizer);
    const dateParsed = dateSchema.safeParse((request.params as { date?: string }).date);
    if (!dateParsed.success) return sendValidationError(reply, request, 'Invalid health date', dateParsed.error.flatten());
    const parsed = payloadSchema.safeParse(request.body);
    if (!parsed.success) return sendValidationError(reply, request, 'Invalid daily health snapshot', parsed.error.flatten());
    if (!deps.dailyHealthRepository.upsert) {
      return reply.status(501).send(errorBody(request, 'not_implemented', 'Daily health repository does not support ingestion'));
    }

    const input = { date: dateParsed.data, ...parsed.data };
    return executeSafeWrite({
      request,
      reply,
      tokenId: actor.tokenId,
      route: `PUT /api/v1/health/daily/${dateParsed.data}`,
      requestBody: input,
      auditRepository: deps.auditRepository,
      idempotencyRepository: deps.idempotencyRepository,
      action: 'health.daily.upsert',
      entityType: 'DailyHealth',
      perform: async () => {
        const saved = await deps.dailyHealthRepository.upsert!(input);
        return {
          statusCode: 200,
          body: saved,
          entityId: `${saved.date}:${saved.source}`,
          auditSummary: { date: saved.date, source: saved.source, transport: saved.transport ?? null },
        };
      },
    });
  });
}
