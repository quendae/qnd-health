import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { RequestAuthorizer } from '../auth/service.js';
import { errorBody, sendValidationError } from '../http/errors.js';
import type { NutritionRepository } from './repository.js';
import { summarizeNutrition } from './summary.js';
import type { AuditRepository } from '../audit/repository.js';
import type { IdempotencyRepository } from '../idempotency/repository.js';
import { executeSafeWrite } from '../writes/safe-write.js';

const timestampSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'invalid timestamp');
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const nullableMetric = z.number().nonnegative().nullable().optional();
const createSchema = z.object({
  consumedAt: timestampSchema.optional(),
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'other']).optional(),
  title: z.string().trim().min(1).max(200),
  caloriesKcal: nullableMetric,
  proteinGrams: nullableMetric,
  carbsGrams: nullableMetric,
  fatGrams: nullableMetric,
  fiberGrams: nullableMetric,
  quantityText: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});
const patchSchema = createSchema.partial().refine((value) => Object.keys(value).length > 0, 'at least one field is required');
const paramsSchema = z.object({ id: z.string().trim().min(1) });
const listSchema = z.object({ from: timestampSchema.optional(), to: timestampSchema.optional() });
const summarySchema = z.object({ date: dateSchema });

async function authorize(request: FastifyRequest, authorizer: RequestAuthorizer, scope: 'nutrition:read' | 'nutrition:write') {
  return authorizer.authorize(request.headers.authorization, [scope]);
}

export function registerNutritionRoutes(
  app: FastifyInstance,
  deps: {
    authorizer: RequestAuthorizer;
    nutritionRepository: NutritionRepository;
    auditRepository: AuditRepository;
    idempotencyRepository: IdempotencyRepository;
  },
): void {
  app.post('/api/v1/nutrition', async (request, reply) => {
    const actor = await authorize(request, deps.authorizer, 'nutrition:write');
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) return sendValidationError(reply, request, 'Invalid nutrition entry', parsed.error.flatten());

    const input = {
      ...parsed.data,
      consumedAt: parsed.data.consumedAt ?? new Date().toISOString(),
      mealType: parsed.data.mealType ?? 'other' as const,
    };

    return executeSafeWrite({
      request,
      reply,
      tokenId: actor.tokenId,
      route: 'POST /api/v1/nutrition',
      requestBody: input,
      auditRepository: deps.auditRepository,
      idempotencyRepository: deps.idempotencyRepository,
      action: 'nutrition.create',
      entityType: 'NutritionEntry',
      perform: async () => {
        const created = await deps.nutritionRepository.create({
          consumedAt: input.consumedAt,
          mealType: input.mealType,
          title: input.title,
          caloriesKcal: input.caloriesKcal ?? null,
          proteinGrams: input.proteinGrams ?? null,
          carbsGrams: input.carbsGrams ?? null,
          fatGrams: input.fatGrams ?? null,
          fiberGrams: input.fiberGrams ?? null,
          quantityText: input.quantityText ?? null,
          notes: input.notes ?? null,
          source: 'hermes',
        });
        return {
          statusCode: 201,
          body: created,
          entityId: created.id,
          auditSummary: { title: created.title, mealType: created.mealType, consumedAt: created.consumedAt },
        };
      },
    });
  });

  app.patch('/api/v1/nutrition/:id', async (request, reply) => {
    const actor = await authorize(request, deps.authorizer, 'nutrition:write');
    const params = paramsSchema.safeParse(request.params);
    const parsed = patchSchema.safeParse(request.body);
    if (!params.success || !parsed.success) {
      return sendValidationError(reply, request, 'Invalid nutrition correction', {
        params: params.success ? undefined : params.error.flatten(),
        body: parsed.success ? undefined : parsed.error.flatten(),
      });
    }

    const existing = await deps.nutritionRepository.findById(params.data.id);
    if (!existing) return reply.status(404).send(errorBody(request, 'not_found', 'Nutrition entry not found'));

    return executeSafeWrite({
      request,
      reply,
      tokenId: actor.tokenId,
      route: 'PATCH /api/v1/nutrition/:id',
      requestBody: { id: params.data.id, ...parsed.data },
      auditRepository: deps.auditRepository,
      idempotencyRepository: deps.idempotencyRepository,
      action: 'nutrition.update',
      entityType: 'NutritionEntry',
      perform: async () => {
        const updated = await deps.nutritionRepository.update(params.data.id, parsed.data);
        if (!updated) throw new Error('Nutrition entry disappeared during update');
        return {
          statusCode: 200,
          body: updated,
          entityId: updated.id,
          auditSummary: { before: existing, after: updated },
        };
      },
    });
  });

  app.delete('/api/v1/nutrition/:id', async (request, reply) => {
    const actor = await authorize(request, deps.authorizer, 'nutrition:write');
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, request, 'Invalid nutrition entry id', params.error.flatten());

    const existing = await deps.nutritionRepository.findById(params.data.id);
    if (!existing) return reply.status(404).send(errorBody(request, 'not_found', 'Nutrition entry not found'));

    return executeSafeWrite({
      request,
      reply,
      tokenId: actor.tokenId,
      route: 'DELETE /api/v1/nutrition/:id',
      requestBody: { id: params.data.id },
      auditRepository: deps.auditRepository,
      idempotencyRepository: deps.idempotencyRepository,
      action: 'nutrition.delete',
      entityType: 'NutritionEntry',
      perform: async () => {
        const deleted = await deps.nutritionRepository.delete(params.data.id);
        if (!deleted) throw new Error('Nutrition entry disappeared during delete');
        return {
          statusCode: 204,
          body: null,
          entityId: params.data.id,
          auditSummary: { deleted: existing },
        };
      },
    });
  });

  app.get('/api/v1/nutrition/summary', async (request, reply) => {
    await authorize(request, deps.authorizer, 'nutrition:read');
    const parsed = summarySchema.safeParse(request.query);
    if (!parsed.success) return sendValidationError(reply, request, 'Invalid summary date', parsed.error.flatten());

    const all = await deps.nutritionRepository.list();
    const entries = all.filter((entry) => entry.consumedAt.slice(0, 10) === parsed.data.date);
    return summarizeNutrition(parsed.data.date, entries);
  });

  app.get('/api/v1/nutrition', async (request, reply) => {
    await authorize(request, deps.authorizer, 'nutrition:read');
    const parsed = listSchema.safeParse(request.query);
    if (!parsed.success) return sendValidationError(reply, request, 'Invalid nutrition range', parsed.error.flatten());
    return { items: await deps.nutritionRepository.list(parsed.data.from, parsed.data.to) };
  });
}
