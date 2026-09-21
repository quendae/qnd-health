import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { RequestAuthorizer } from '../auth/service.js';
import { sendValidationError } from '../http/errors.js';
import type { MeasurementRepository } from './repository.js';

const timestampSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'invalid timestamp');
const optionalMetric = z.number().nonnegative().nullable().optional();
const createSchema = z.object({
  measuredAt: timestampSchema,
  weightKg: z.number().positive(),
  bodyFatPercent: optionalMetric,
  bmi: optionalMetric,
  muscleMassKg: optionalMetric,
});
const listSchema = z.object({ from: timestampSchema.optional(), to: timestampSchema.optional() });

async function authorize(request: FastifyRequest, authorizer: RequestAuthorizer, scope: 'measurements:read' | 'measurements:write') {
  return authorizer.authorize(request.headers.authorization, [scope]);
}

export function registerMeasurementRoutes(
  app: FastifyInstance,
  deps: { authorizer: RequestAuthorizer; measurementRepository: MeasurementRepository },
): void {
  app.post('/api/v1/measurements', async (request, reply) => {
    await authorize(request, deps.authorizer, 'measurements:write');
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) return sendValidationError(reply, request, 'Invalid body measurement', parsed.error.flatten());

    const created = await deps.measurementRepository.create({
      measuredAt: parsed.data.measuredAt,
      weightKg: parsed.data.weightKg,
      bodyFatPercent: parsed.data.bodyFatPercent ?? null,
      bmi: parsed.data.bmi ?? null,
      muscleMassKg: parsed.data.muscleMassKg ?? null,
      source: 'hermes',
    });
    return reply.status(201).send(created);
  });

  app.get('/api/v1/measurements', async (request, reply) => {
    await authorize(request, deps.authorizer, 'measurements:read');
    const parsed = listSchema.safeParse(request.query);
    if (!parsed.success) return sendValidationError(reply, request, 'Invalid measurement range', parsed.error.flatten());
    return { items: await deps.measurementRepository.list(parsed.data.from, parsed.data.to) };
  });
}
