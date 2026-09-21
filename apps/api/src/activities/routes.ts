import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { RequestAuthorizer } from '../auth/service.js';
import type { AuditRepository } from '../audit/repository.js';
import type { IdempotencyRepository } from '../idempotency/repository.js';
import { errorBody, sendValidationError } from '../http/errors.js';
import { executeSafeWrite } from '../writes/safe-write.js';
import type { CompletedActivityRepository } from './repository.js';

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must use YYYY-MM-DD'),
});
const paramsSchema = z.object({
  provider: z.enum(['garmin', 'fit']),
  providerActivityId: z.string().trim().min(1).max(200),
});
const timestampSchema = z.string().refine(value => !Number.isNaN(Date.parse(value)), 'invalid timestamp');
const nullableNonnegative = z.number().nonnegative().nullable().optional();
const importSchema = z.object({
  transport: z.enum(['home_assistant', 'garmin_api', 'file_import']).optional(),
  activityType: z.string().trim().min(1).max(80),
  startedAt: timestampSchema,
  durationSeconds: z.number().int().nonnegative().nullable().optional(),
  distanceMeters: nullableNonnegative,
  avgHr: z.number().int().nonnegative().nullable().optional(),
  maxHr: z.number().int().nonnegative().nullable().optional(),
  avgPaceSecondsPerKm: z.number().int().nonnegative().nullable().optional(),
  cadence: nullableNonnegative,
  elevationGainMeters: nullableNonnegative,
  calories: nullableNonnegative,
});

function localDate(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));
  const year = parts.find(part => part.type === 'year')?.value;
  const month = parts.find(part => part.type === 'month')?.value;
  const day = parts.find(part => part.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

async function requireRead(request: FastifyRequest, authorizer: RequestAuthorizer) {
  return authorizer.authorize(request.headers.authorization, ['activities:read']);
}

export function registerActivityRoutes(
  app: FastifyInstance,
  deps: {
    authorizer: RequestAuthorizer;
    completedActivityRepository: CompletedActivityRepository;
    timeZone: string;
    auditRepository: AuditRepository;
    idempotencyRepository: IdempotencyRepository;
  },
): void {
  app.get('/api/v1/activities', async (request, reply) => {
    await requireRead(request, deps.authorizer);
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return sendValidationError(reply, request, 'Invalid activity date', parsed.error.flatten());
    }

    const items = await deps.completedActivityRepository.list();
    return {
      items: items.filter(item => localDate(item.startedAt, deps.timeZone) === parsed.data.date),
    };
  });

  app.put('/api/v1/activities/:provider/:providerActivityId', async (request, reply) => {
    const actor = await deps.authorizer.authorize(request.headers.authorization, ['activities:write']);
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, request, 'Invalid provider activity id', params.error.flatten());
    const parsed = importSchema.safeParse(request.body);
    if (!parsed.success) return sendValidationError(reply, request, 'Invalid completed activity', parsed.error.flatten());
    if (!deps.completedActivityRepository.upsertProviderActivity) {
      return reply.status(501).send(errorBody(request, 'not_implemented', 'Activity repository does not support provider ingestion'));
    }

    const input = { provider: params.data.provider, providerActivityId: params.data.providerActivityId, ...parsed.data };
    return executeSafeWrite({
      request,
      reply,
      tokenId: actor.tokenId,
      route: `PUT /api/v1/activities/${params.data.provider}/${params.data.providerActivityId}`,
      requestBody: input,
      auditRepository: deps.auditRepository,
      idempotencyRepository: deps.idempotencyRepository,
      action: 'activity.provider.upsert',
      entityType: 'CompletedActivity',
      perform: async () => {
        const saved = await deps.completedActivityRepository.upsertProviderActivity!(input);
        return {
          statusCode: 200,
          body: saved,
          entityId: saved.id,
          auditSummary: { provider: saved.provider, providerActivityId: saved.providerActivityId ?? null, transport: saved.transport ?? null },
        };
      },
    });
  });
}
