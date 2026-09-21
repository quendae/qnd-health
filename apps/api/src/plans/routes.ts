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
import type { CompletedActivityRepository } from '../activities/repository.js';
import type { ActivityMatchRepository } from '../activities/matches.js';
import { executeSafeWrite } from '../writes/safe-write.js';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must use YYYY-MM-DD');
const createPlanSchema = z.object({
  date: dateSchema,
  kind: z.enum(['workout', 'metric_goal', 'count_goal', 'manual']),
  title: z.string().trim().min(1).max(200),
  completionStrategy: z.enum(['metric_auto', 'count_manual', 'activity_link', 'manual']),
  metricKey: z.string().trim().min(1).max(100).optional().nullable(),
  targetValue: z.number().positive().optional().nullable(),
  unit: z.string().trim().min(1).max(40).optional().nullable(),
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

const updatePlanSchema = z.object({
  date: dateSchema.optional(),
  kind: z.enum(['workout', 'metric_goal', 'count_goal', 'manual']).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  completionStrategy: z.enum(['metric_auto', 'count_manual', 'activity_link', 'manual']).optional(),
  metricKey: z.string().trim().min(1).max(100).nullable().optional(),
  targetValue: z.number().positive().nullable().optional(),
  unit: z.string().trim().min(1).max(40).nullable().optional(),
  activityType: z.string().trim().min(1).max(80).nullable().optional(),
  plannedDurationSeconds: z.number().positive().nullable().optional(),
  plannedDistanceMeters: z.number().positive().nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });

const progressSchema = z.object({ value: z.number().nonnegative() });
const activityLinkSchema = z.object({ completedActivityId: z.string().trim().min(1).max(200) });
const listQuerySchema = z.object({ from: dateSchema.optional(), to: dateSchema.optional() });

function progressFor(plan: StoredPlanItem) {
  return calculatePlanProgress({
    strategy: plan.completionStrategy,
    targetValue: plan.targetValue,
    currentValue: plan.currentManualValue,
    manualCompleted: (plan.completionStrategy === 'manual' || plan.completionStrategy === 'activity_link') && plan.status === 'completed',
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

async function findCompletedActivity(repository: CompletedActivityRepository, id: string) {
  if (repository.findById) return repository.findById(id);
  const items = await repository.list();
  return items.find((item) => item.id === id) ?? null;
}

export function registerPlanRoutes(
  app: FastifyInstance,
  deps: {
    authorizer: RequestAuthorizer;
    planRepository: PlanRepository;
    completedActivityRepository?: CompletedActivityRepository;
    activityMatchRepository?: ActivityMatchRepository;
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

  app.patch('/api/v1/plans/:id', async (request, reply) => {
    const actor = await requireScopes(request, authorizer, ['plans:write']);
    const id = (request.params as { id?: string }).id;
    if (!id) return sendValidationError(reply, request, 'Plan id is required');
    const parsed = updatePlanSchema.safeParse(request.body);
    if (!parsed.success) return sendValidationError(reply, request, 'Invalid plan update', parsed.error.flatten());
    const existing = await planRepository.findById(id);
    if (!existing) return reply.status(404).send(errorBody(request, 'not_found', 'Plan item not found'));

    const merged = createPlanSchema.safeParse({ ...existing, ...parsed.data });
    if (!merged.success) return sendValidationError(reply, request, 'Invalid plan update', merged.error.flatten());

    return executeSafeWrite({
      request,
      reply,
      tokenId: actor.tokenId,
      route: `PATCH /api/v1/plans/${id}`,
      requestBody: parsed.data,
      auditRepository: deps.auditRepository,
      idempotencyRepository: deps.idempotencyRepository,
      action: 'plan.update',
      entityType: 'PlanItem',
      perform: async () => {
        const updated = await planRepository.update(id, parsed.data);
        if (!updated) throw new Error('Plan item disappeared during update');
        const body = serializePlan(updated);
        return {
          statusCode: 200,
          body,
          entityId: id,
          auditSummary: { date: body.date, kind: body.kind, title: body.title },
        };
      },
    });
  });

  app.delete('/api/v1/plans/:id', async (request, reply) => {
    const actor = await requireScopes(request, authorizer, ['plans:write']);
    const id = (request.params as { id?: string }).id;
    if (!id) return sendValidationError(reply, request, 'Plan id is required');
    const existing = await planRepository.findById(id);
    if (!existing) return reply.status(404).send(errorBody(request, 'not_found', 'Plan item not found'));

    return executeSafeWrite({
      request,
      reply,
      tokenId: actor.tokenId,
      route: `DELETE /api/v1/plans/${id}`,
      requestBody: {},
      auditRepository: deps.auditRepository,
      idempotencyRepository: deps.idempotencyRepository,
      action: 'plan.delete',
      entityType: 'PlanItem',
      perform: async () => {
        const deleted = await planRepository.delete(id);
        if (!deleted) throw new Error('Plan item disappeared during delete');
        return {
          statusCode: 204,
          body: null,
          entityId: id,
          auditSummary: { date: existing.date, kind: existing.kind, title: existing.title },
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

  if (deps.completedActivityRepository && deps.activityMatchRepository) {
    app.post('/api/v1/plans/:id/activity', async (request, reply) => {
      const actor = await requireScopes(request, authorizer, ['plans:write', 'activities:read']);
      const id = (request.params as { id?: string }).id;
      if (!id) return sendValidationError(reply, request, 'Plan id is required');
      const parsed = activityLinkSchema.safeParse(request.body);
      if (!parsed.success) return sendValidationError(reply, request, 'Invalid completed activity', parsed.error.flatten());

      const plan = await planRepository.findById(id);
      if (!plan) return reply.status(404).send(errorBody(request, 'not_found', 'Plan item not found'));
      if (plan.completionStrategy !== 'activity_link') {
        return sendValidationError(reply, request, 'This plan item is not completed by linking an activity');
      }
      const activity = await findCompletedActivity(deps.completedActivityRepository!, parsed.data.completedActivityId);
      if (!activity) return reply.status(404).send(errorBody(request, 'not_found', 'Completed activity not found'));

      return executeSafeWrite({
        request,
        reply,
        tokenId: actor.tokenId,
        route: `POST /api/v1/plans/${id}/activity`,
        requestBody: parsed.data,
        auditRepository: deps.auditRepository,
        idempotencyRepository: deps.idempotencyRepository,
        action: 'plan.activity.attach',
        entityType: 'PlanItem',
        perform: async () => {
          await deps.activityMatchRepository!.attach(id, activity.id);
          const updated = await planRepository.update(id, { status: 'completed', linkedActivityId: activity.id });
          if (!updated) throw new Error('Plan item disappeared while attaching activity');
          const body = serializePlan({ ...updated, linkedActivityId: activity.id });
          return {
            statusCode: 200,
            body,
            entityId: id,
            auditSummary: { completedActivityId: activity.id, provider: activity.provider, activityType: activity.activityType },
          };
        },
      });
    });

    app.delete('/api/v1/plans/:id/activity', async (request, reply) => {
      const actor = await requireScopes(request, authorizer, ['plans:write']);
      const id = (request.params as { id?: string }).id;
      if (!id) return sendValidationError(reply, request, 'Plan id is required');
      const plan = await planRepository.findById(id);
      if (!plan) return reply.status(404).send(errorBody(request, 'not_found', 'Plan item not found'));
      if (plan.completionStrategy !== 'activity_link') {
        return sendValidationError(reply, request, 'This plan item is not completed by linking an activity');
      }

      return executeSafeWrite({
        request,
        reply,
        tokenId: actor.tokenId,
        route: `DELETE /api/v1/plans/${id}/activity`,
        requestBody: {},
        auditRepository: deps.auditRepository,
        idempotencyRepository: deps.idempotencyRepository,
        action: 'plan.activity.detach',
        entityType: 'PlanItem',
        perform: async () => {
          await deps.activityMatchRepository!.detach(id);
          const updated = await planRepository.update(id, { status: 'planned', linkedActivityId: null });
          if (!updated) throw new Error('Plan item disappeared while detaching activity');
          const body = serializePlan({ ...updated, linkedActivityId: null });
          return {
            statusCode: 200,
            body,
            entityId: id,
            auditSummary: { detachedActivityId: plan.linkedActivityId ?? null },
          };
        },
      });
    });
  }
}
