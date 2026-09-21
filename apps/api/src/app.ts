import Fastify, { type FastifyInstance } from 'fastify';
import type { ApiTokenRepository } from './auth/service.js';
import { createRequestAuthorizer } from './auth/service.js';
import { installErrorHandler } from './http/errors.js';
import type { PlanRepository } from './plans/repository.js';
import { registerPlanRoutes } from './plans/routes.js';

export interface BuildAppOptions {
  tokenPepper?: string;
  tokenRepository?: ApiTokenRepository;
  planRepository?: PlanRepository;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
  });

  installErrorHandler(app);
  app.get('/api/v1/health', async () => ({ status: 'ok' as const }));

  if (options.tokenPepper && options.tokenRepository && options.planRepository) {
    registerPlanRoutes(app, {
      authorizer: createRequestAuthorizer(options.tokenRepository, options.tokenPepper),
      planRepository: options.planRepository,
    });
  }

  return app;
}
