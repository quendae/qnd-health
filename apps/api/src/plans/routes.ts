import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  assertManualProgressWritable,
  calculatePlanProgress,
  type CompletionStrategy,
} from '@qnd-health/activity-model';
import type { RequestAuthorizer } from '../auth/service.js';
import { errorBody, sendValidationError } from '../http/errors.js';
import type { PlanRepository, StoredPlanItem } from './repository.js';
import type { AuditRepository } from '../audit/repository.js';
import type { IdempotencyRepository } from '../idempotency/repository.js';
import { executeSafeWrite } from '../writes/safe-write.js';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must use YYYY-MM-DD');
const createPlanSchema = z.object({
  date: dateSchema,
  kind: z.enum(['workout', 'metric_goal', 'count_goal', 'manual']),
  title: z.string().trim().min(1).max(200),
  completionStrategy: z.enum(['metric_auto', 'count_manual', 'activity_link', 'manual']),
  metricKey: z.string().trim().min(1).max(100).optional(),
  targetValue: z.number().positive().optional(),
  unit: z.string().trim().min(1).max(40).optional(),
  activityType: z.string().trim().min(1).max(80).nullable().optional(),
  plannedDurationSeconds: z.number().positive().nullable().optional(),
  plannedDistanceMeters: z.number().positive().nullable().optional(),
}).superRefine((value, ctx) => {
  if ((value.completionStrategy === 'metric_auto' || value.completionStrategy === 'count_manual') && value.targetValue == null) {
    ctx.addIssue({ code: 'custom', path: ['targetValue'], message: 'targetValue is required for metric/count goals' });
  }
  if (value.completionStrategy === 'metric_auto' && !value.metricKey) {
    ctx.addIssue({ code: 'custom', path: ['metricKey'], message: 'metricKey is required for metric_auto goals' });
  }
});

const progressSchema = z.object({ value: z.number().nonnegative() });
const listQuerySchema = z.object({ from: dateSchema.optional(), to: dateSchema.optional() });

function progressFor(plan: StoredPlanItem) {
  return calculatePlanProgress({
    strategy: plan.completionStrategy,
    targetValue: plan.targetValue,
    currentValue: plan.currentManualValue,
    manualCompleted: plan.completionStrategy === 'manual' && plan.status === 'completed',
    linkedActivityId: plan.linkedActivityId ?? null,
  });
}

function serializePlan(plan: StoredPlanItem) {
  const progress = progressFor(plan);
  return { ...plan, status: progress.status, progress };
}

async function requireScopes(
  request: FastifyRequest,
  authorizer: RequestAuthorizer,
  scopes: Parameters<RequestAuthorizer['authorize']>[1],
) {
  return authorizer.authorize(request.headers.authorization, scopes);
}

export function registerPlanRoutes(
  app: FastifyInstance,
  deps: {
    authorizer: RequestAuthorizer;
    planRepository: PlanRepository;
    auditRepository: AuditRepository;
    idempotencyRepository: IdempotencyRepository;
  },
): void {
  const { authorizer, planRepository } = deps;

  app.get('/api/v1/plans', async (request, reply) => {
    await requireScopes(request, authorizer, ['plans:read']);
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) return sendValidationError(reply, request, 'Invalid plan date range', parsed.error.flatten());
    const items = await planRepository.list(parsed.data.from, parsed.data.to);
    return { items: items.map(serializePlan) };
  });

  app.post('/api/v1/plans', async (request, reply) => {
    const actor = await requireScopes(request, authorizer, ['plans:write']);
    const parsed = createPlanSchema.safeParse(request.body);
    if (!parsed.success) return sendValidationError(reply, request, 'Invalid plan item', parsed.error.flatten());

    return executeSafeWrite({
      request,
      reply,
      tokenId: actor.tokenId,
      route: 'POST /api/v1/plans',
      requestBody: parsed.data,
      auditRepository: deps.auditRepository,
      idempotencyRepository: deps.idempotencyRepository,
      action: 'plan.create',
      entityType: 'PlanItem',
      perform: async () => {
        const input = parsed.data;
        const initialProgress = calculatePlanProgress({
          strategy: input.completionStrategy as CompletionStrategy,
          targetValue: input.targetValue ?? null,
          currentValue: input.completionStrategy === 'count_manual' || input.completionStrategy === 'metric_auto' ? 0 : null,
          manualCompleted: false,
          linkedActivityId: null,
        });
        const created = await planRepository.create({
          date: input.date,
          kind: input.kind,
          title: input.title,
          completionStrategy: input.completionStrategy,
          metricKey: input.metricKey ?? null,
          targetValue: input.targetValue ?? null,
          currentManualValue: input.completionStrategy === 'count_manual' ? 0 : null,
          unit: input.unit ?? null,
          status: initialProgress.status,
          activityType: input.activityType ?? null,
          plannedDurationSeconds: input.plannedDurationSeconds ?? null,
          plannedDistanceMeters: input.plannedDistanceMeters ?? null,
          linkedActivityId: null,
        });
        const body = serializePlan(created);
        return {
          statusCode: 201,
          body,
          entityId: created.id,
          auditSummary: { date: created.date, kind: created.kind, title: created.title },
        };
      },
    });
  });

  app.post('/api/v1/plans/:id/progress', async (request, reply) => {
    const actor = await requireScopes(request, authorizer, ['plans:write']);
    const id = (request.params as { id?: string }).id;
    if (!id) return sendValidationError(reply, request, 'Plan id is required');
    const parsed = progressSchema.safeParse(request.body);
    if (!parsed.success) return sendValidationError(reply, request, 'Invalid progress value', parsed.error.flatten());

    const plan = await planRepository.findById(id);
    if (!plan) return reply.status(404).send(errorBody(request, 'not_found', 'Plan item not found'));
    try {
      assertManualProgressWritable(plan.completionStrategy);
    } catch (error) {
      return sendValidationError(reply, request, error instanceof Error ? error.message : 'Progress cannot be edited');
    }

    return executeSafeWrite({
      request,
      reply,
      tokenId: actor.tokenId,
      route: `POST /api/v1/plans/${id}/progress`,
      requestBody: parsed.data,
      auditRepository: deps.auditRepository,
      idempotencyRepository: deps.idempotencyRepository,
      action: 'plan.progress',
      entityType: 'PlanItem',
      perform: async () => {
        const progress = calculatePlanProgress({
          strategy: plan.completionStrategy,
          targetValue: plan.targetValue,
          currentValue: parsed.data.value,
          manualCompleted: parsed.data.value > 0,
        });
        const updated = await planRepository.update(id, {
          currentManualValue: plan.completionStrategy === 'count_manual' ? parsed.data.value : plan.currentManualValue,
          status: progress.status,
        });
        if (!updated) throw new Error('Plan item disappeared during progress update');
        const body = serializePlan(updated);
        return {
          statusCode: 200,
          body,
          entityId: id,
          auditSummary: { status: body.status, currentValue: body.progress.currentValue, targetValue: body.progress.targetValue },
        };
      },
    });
  });
}
