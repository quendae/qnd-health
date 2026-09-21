import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { RequestAuthorizer } from '../auth/service.js';
import { sendValidationError } from '../http/errors.js';
import type { CompletedActivityRepository } from './repository.js';

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must use YYYY-MM-DD'),
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
}
