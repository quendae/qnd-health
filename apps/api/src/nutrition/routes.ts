import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { RequestAuthorizer } from '../auth/service.js';
import { sendValidationError } from '../http/errors.js';
import type { NutritionRepository } from './repository.js';
import { summarizeNutrition } from './summary.js';

const timestampSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'invalid timestamp');
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const nullableMetric = z.number().nonnegative().nullable().optional();
const createSchema = z.object({
  consumedAt: timestampSchema,
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'other']),
  title: z.string().trim().min(1).max(200),
  caloriesKcal: nullableMetric,
  proteinGrams: nullableMetric,
  carbsGrams: nullableMetric,
  fatGrams: nullableMetric,
  fiberGrams: nullableMetric,
  quantityText: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});
const listSchema = z.object({ from: timestampSchema.optional(), to: timestampSchema.optional() });
const summarySchema = z.object({ date: dateSchema });

async function authorize(request: FastifyRequest, authorizer: RequestAuthorizer, scope: 'nutrition:read' | 'nutrition:write') {
  return authorizer.authorize(request.headers.authorization, [scope]);
}

export function registerNutritionRoutes(
  app: FastifyInstance,
  deps: { authorizer: RequestAuthorizer; nutritionRepository: NutritionRepository },
): void {
  app.post('/api/v1/nutrition', async (request, reply) => {
    await authorize(request, deps.authorizer, 'nutrition:write');
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) return sendValidationError(reply, request, 'Invalid nutrition entry', parsed.error.flatten());

    const created = await deps.nutritionRepository.create({
      consumedAt: parsed.data.consumedAt,
      mealType: parsed.data.mealType,
      title: parsed.data.title,
      caloriesKcal: parsed.data.caloriesKcal ?? null,
      proteinGrams: parsed.data.proteinGrams ?? null,
      carbsGrams: parsed.data.carbsGrams ?? null,
      fatGrams: parsed.data.fatGrams ?? null,
      fiberGrams: parsed.data.fiberGrams ?? null,
      quantityText: parsed.data.quantityText ?? null,
      notes: parsed.data.notes ?? null,
      source: 'hermes',
    });
    return reply.status(201).send(created);
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
