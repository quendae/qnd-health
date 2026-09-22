import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { RequestAuthorizer } from '../auth/service.js';
import { errorBody, sendValidationError } from '../http/errors.js';
import { COACH_SYSTEM_PROMPT } from './system-prompt.js';
import type { CoachSettingsRepository } from './settings.js';

export interface CoachSettingsRouteDependencies {
  authorizer: RequestAuthorizer;
  coachSettingsRepository: CoachSettingsRepository;
}

const bodySchema = z.object({
  systemPrompt: z.string().trim().min(1).max(30000).nullable(),
});

async function authorize(request: FastifyRequest, deps: CoachSettingsRouteDependencies, mode: 'read' | 'write') {
  return deps.authorizer.authorize(request.headers.authorization, [mode === 'read' ? 'coach:read' : 'coach:write']);
}

async function responseBody(repository: CoachSettingsRepository) {
  const override = await repository.getSystemPromptOverride();
  return {
    systemPrompt: override ?? COACH_SYSTEM_PROMPT,
    isDefault: override === null,
  };
}

export function registerCoachSettingsRoutes(app: FastifyInstance, deps: CoachSettingsRouteDependencies): void {
  app.get('/api/v1/coach/settings', async (request, reply) => {
    await authorize(request, deps, 'read');
    return reply.send(await responseBody(deps.coachSettingsRepository));
  });

  app.patch('/api/v1/coach/settings', async (request, reply) => {
    await authorize(request, deps, 'write');
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) return sendValidationError(reply, request, 'Invalid Coach settings', parsed.error.flatten());

    try {
      await deps.coachSettingsRepository.setSystemPromptOverride(parsed.data.systemPrompt);
      return reply.send(await responseBody(deps.coachSettingsRepository));
    } catch (error) {
      request.log.warn({ err: error }, 'coach settings update failed');
      return reply.status(500).send(errorBody(request, 'settings_update_failed', 'Could not update Coach settings'));
    }
  });
}
