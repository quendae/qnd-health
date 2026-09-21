import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { RequestAuthorizer } from '../auth/service.js';
import type { AuditRepository } from '../audit/repository.js';
import type { IdempotencyRepository } from '../idempotency/repository.js';
import { sendValidationError } from '../http/errors.js';
import { executeSafeWrite } from '../writes/safe-write.js';
import { localIsoDate } from '../today/date-utils.js';
import { calculateAge } from './energy.js';
import type { HealthProfileRepository } from './repository.js';

const profilePatchSchema = z.object({
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  sexForBmr: z.enum(['male', 'female']).nullable().optional(),
  heightCm: z.number().positive().max(260).nullable().optional(),
  activityFactor: z.number().min(1).max(3).optional(),
  defaultStepsGoal: z.number().int().min(1).max(100000).optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });

async function requireRead(request: FastifyRequest, authorizer: RequestAuthorizer) {
  return authorizer.authorize(request.headers.authorization, ['measurements:read']);
}

async function requireWrite(request: FastifyRequest, authorizer: RequestAuthorizer) {
  return authorizer.authorize(request.headers.authorization, ['measurements:write']);
}

export function registerProfileRoutes(app: FastifyInstance, deps: {
  authorizer: RequestAuthorizer;
  profileRepository: HealthProfileRepository;
  auditRepository: AuditRepository;
  idempotencyRepository: IdempotencyRepository;
  timeZone: string;
}): void {
  app.get('/api/v1/profile', async (request) => {
    await requireRead(request, deps.authorizer);
    return deps.profileRepository.get();
  });

  app.patch('/api/v1/profile', async (request, reply) => {
    const actor = await requireWrite(request, deps.authorizer);
    const parsed = profilePatchSchema.safeParse(request.body);
    if (!parsed.success) return sendValidationError(reply, request, 'Invalid health profile', parsed.error.flatten());

    if (parsed.data.dateOfBirth) {
      const today = localIsoDate(new Date().toISOString(), deps.timeZone);
      try {
        calculateAge(parsed.data.dateOfBirth, today);
      } catch (error) {
        return sendValidationError(reply, request, error instanceof Error ? error.message : 'Invalid date of birth');
      }
    }

    return executeSafeWrite({
      request,
      reply,
      tokenId: actor.tokenId,
      route: 'PATCH /api/v1/profile',
      requestBody: parsed.data,
      auditRepository: deps.auditRepository,
      idempotencyRepository: deps.idempotencyRepository,
      action: 'profile.update',
      entityType: 'HealthProfile',
      perform: async () => {
        const saved = await deps.profileRepository.upsert(parsed.data);
        return {
          statusCode: 200,
          body: saved,
          entityId: saved.id,
          auditSummary: {
            dateOfBirth: saved.dateOfBirth,
            sexForBmr: saved.sexForBmr,
            heightCm: saved.heightCm,
            activityFactor: saved.activityFactor,
            defaultStepsGoal: saved.defaultStepsGoal,
          },
        };
      },
    });
  });
}
