import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { RequestAuthorizer } from '../auth/service.js';
import type { AuditRepository } from '../audit/repository.js';
import type { IdempotencyRepository } from '../idempotency/repository.js';
import { sendValidationError } from '../http/errors.js';
import { executeSafeWrite } from '../writes/safe-write.js';
import { localIsoDate } from '../today/date-utils.js';
import { calculateAge } from './energy.js';
import type { ProfileGoalService } from './goals.js';
import type { ProfileGoalValues } from './goal-repository.js';
import type { HealthProfileRepository } from './repository.js';

const profilePatchSchema = z.object({
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  sexForBmr: z.enum(['male', 'female']).nullable().optional(),
  heightCm: z.number().positive().max(260).nullable().optional(),
  activityFactor: z.number().min(1).max(3).optional(),
  defaultStepsGoal: z.number().int().min(1).max(100000).optional(),
  dailyCaloriesGoalKcal: z.number().int().min(1).max(20000).nullable().optional(),
  dailyProteinGoalGrams: z.number().int().min(1).max(1000).nullable().optional(),
  dailyCarbsGoalGrams: z.number().int().min(1).max(2000).nullable().optional(),
  dailyFatGoalGrams: z.number().int().min(1).max(1000).nullable().optional(),
  dailyFiberGoalGrams: z.number().int().min(1).max(500).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });

const goalKeys: Array<keyof ProfileGoalValues> = [
  'activityFactor',
  'defaultStepsGoal',
  'dailyCaloriesGoalKcal',
  'dailyProteinGoalGrams',
  'dailyCarbsGoalGrams',
  'dailyFatGoalGrams',
  'dailyFiberGoalGrams',
];

async function requireRead(request: FastifyRequest, authorizer: RequestAuthorizer) {
  return authorizer.authorize(request.headers.authorization, ['measurements:read']);
}

async function requireWrite(request: FastifyRequest, authorizer: RequestAuthorizer) {
  return authorizer.authorize(request.headers.authorization, ['measurements:write']);
}

export function registerProfileRoutes(app: FastifyInstance, deps: {
  authorizer: RequestAuthorizer;
  profileRepository: HealthProfileRepository;
  profileGoalService?: ProfileGoalService;
  auditRepository: AuditRepository;
  idempotencyRepository: IdempotencyRepository;
  timeZone: string;
}): void {
  app.get('/api/v1/profile', async (request) => {
    await requireRead(request, deps.authorizer);
    const profile = await deps.profileRepository.get();
    if (!profile || !deps.profileGoalService) return profile;
    const date = localIsoDate(new Date().toISOString(), deps.timeZone);
    const goals = await deps.profileGoalService.resolve(date);
    return { ...profile, ...goals };
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
        const profilePatch: Record<string, unknown> = {};
        const goalPatch: Partial<ProfileGoalValues> = {};
        for (const [key, value] of Object.entries(parsed.data)) {
          if (goalKeys.includes(key as keyof ProfileGoalValues)) {
            (goalPatch as Record<string, unknown>)[key] = value;
          } else {
            profilePatch[key] = value;
          }
        }

        const before = await deps.profileRepository.get();
        const savedProfile = Object.keys(profilePatch).length > 0
          ? await deps.profileRepository.upsert(profilePatch)
          : before;

        const today = localIsoDate(new Date().toISOString(), deps.timeZone);
        let goals = deps.profileGoalService ? await deps.profileGoalService.resolve(today) : null;
        if (Object.keys(goalPatch).length > 0) {
          if (deps.profileGoalService) {
            goals = await deps.profileGoalService.createRevision(goalPatch, {
              effectiveFrom: today,
              source: 'manual',
              sourceRef: null,
              reason: 'Zmiana w Ustawieniach',
            });
          } else {
            await deps.profileRepository.upsert(goalPatch);
          }
        }

        const finalProfile = savedProfile ?? await deps.profileRepository.get();
        const body = finalProfile && goals ? { ...finalProfile, ...goals } : finalProfile;
        return {
          statusCode: 200,
          body,
          entityId: finalProfile?.id ?? 'default',
          auditSummary: {
            before,
            after: body,
            goalEffectiveFrom: goals?.effectiveFrom ?? null,
            goalRevisionId: goals?.revisionId ?? (goals && 'id' in goals ? goals.id : null),
          },
        };
      },
    });
  });
}
