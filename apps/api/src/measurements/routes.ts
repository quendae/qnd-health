import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { RequestAuthorizer } from '../auth/service.js';
import { sendValidationError } from '../http/errors.js';
import type { MeasurementRepository } from './repository.js';
import type { AuditRepository } from '../audit/repository.js';
import type { IdempotencyRepository } from '../idempotency/repository.js';
import { executeSafeWrite } from '../writes/safe-write.js';

const timestampSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'invalid timestamp');
const optionalMetric = z.number().nonnegative().nullable().optional();
const createSchema = z.object({
  measuredAt: timestampSchema,
  source: z.enum(['garmin', 'hermes', 'manual']).optional(),
  transport: z.enum(['home_assistant', 'garmin_api', 'scale_screenshot', 'manual_input']).nullable().optional(),
  weightKg: z.number().positive(),
  bodyFatPercent: optionalMetric,
  bmi: optionalMetric,
  muscleMassKg: optionalMetric,
  fatFreeMassKg: optionalMetric,
  subcutaneousFatPercent: optionalMetric,
  bodyWaterPercent: optionalMetric,
  skeletalMusclePercent: optionalMetric,
  boneMassKg: optionalMetric,
  visceralFat: optionalMetric,
  proteinPercent: optionalMetric,
  scaleBmrKcal: optionalMetric,
  metabolicAge: optionalMetric,
  physiqueRating: optionalMetric,
  bicepsCircumferenceCm: optionalMetric,
  chestCircumferenceCm: optionalMetric,
  waistCircumferenceCm: optionalMetric,
  hipsCircumferenceCm: optionalMetric,
  thighCircumferenceCm: optionalMetric,
});
const listSchema = z.object({ from: timestampSchema.optional(), to: timestampSchema.optional() });

async function authorize(request: FastifyRequest, authorizer: RequestAuthorizer, scope: 'measurements:read' | 'measurements:write') {
  return authorizer.authorize(request.headers.authorization, [scope]);
}

export function registerMeasurementRoutes(
  app: FastifyInstance,
  deps: {
    authorizer: RequestAuthorizer;
    measurementRepository: MeasurementRepository;
    auditRepository: AuditRepository;
    idempotencyRepository: IdempotencyRepository;
  },
): void {
  app.post('/api/v1/measurements', async (request, reply) => {
    const actor = await authorize(request, deps.authorizer, 'measurements:write');
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) return sendValidationError(reply, request, 'Invalid body measurement', parsed.error.flatten());

    return executeSafeWrite({
      request,
      reply,
      tokenId: actor.tokenId,
      route: 'POST /api/v1/measurements',
      requestBody: parsed.data,
      auditRepository: deps.auditRepository,
      idempotencyRepository: deps.idempotencyRepository,
      action: 'measurement.create',
      entityType: 'BodyMeasurement',
      perform: async () => {
        const created = await deps.measurementRepository.create({
          measuredAt: parsed.data.measuredAt,
          weightKg: parsed.data.weightKg,
          bodyFatPercent: parsed.data.bodyFatPercent ?? null,
          bmi: parsed.data.bmi ?? null,
          muscleMassKg: parsed.data.muscleMassKg ?? null,
          fatFreeMassKg: parsed.data.fatFreeMassKg ?? null,
          subcutaneousFatPercent: parsed.data.subcutaneousFatPercent ?? null,
          bodyWaterPercent: parsed.data.bodyWaterPercent ?? null,
          skeletalMusclePercent: parsed.data.skeletalMusclePercent ?? null,
          boneMassKg: parsed.data.boneMassKg ?? null,
          visceralFat: parsed.data.visceralFat ?? null,
          proteinPercent: parsed.data.proteinPercent ?? null,
          scaleBmrKcal: parsed.data.scaleBmrKcal ?? null,
          metabolicAge: parsed.data.metabolicAge ?? null,
          physiqueRating: parsed.data.physiqueRating ?? null,
          bicepsCircumferenceCm: parsed.data.bicepsCircumferenceCm ?? null,
          chestCircumferenceCm: parsed.data.chestCircumferenceCm ?? null,
          waistCircumferenceCm: parsed.data.waistCircumferenceCm ?? null,
          hipsCircumferenceCm: parsed.data.hipsCircumferenceCm ?? null,
          thighCircumferenceCm: parsed.data.thighCircumferenceCm ?? null,
          transport: parsed.data.transport ?? null,
          source: parsed.data.source ?? 'hermes',
        });
        return {
          statusCode: 201,
          body: created,
          entityId: created.id,
          auditSummary: { measuredAt: created.measuredAt, source: created.source, transport: created.transport ?? null },
        };
      },
    });
  });

  app.get('/api/v1/measurements', async (request, reply) => {
    await authorize(request, deps.authorizer, 'measurements:read');
    const parsed = listSchema.safeParse(request.query);
    if (!parsed.success) return sendValidationError(reply, request, 'Invalid measurement range', parsed.error.flatten());
    return { items: await deps.measurementRepository.list(parsed.data.from, parsed.data.to) };
  });
}
