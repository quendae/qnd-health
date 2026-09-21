import Fastify, { type FastifyInstance } from 'fastify';
import type { ApiTokenRepository } from './auth/service.js';
import { createRequestAuthorizer } from './auth/service.js';
import { installErrorHandler } from './http/errors.js';
import type { PlanRepository } from './plans/repository.js';
import { registerPlanRoutes } from './plans/routes.js';
import type { NutritionRepository } from './nutrition/repository.js';
import { registerNutritionRoutes } from './nutrition/routes.js';
import type { MeasurementRepository } from './measurements/repository.js';
import { registerMeasurementRoutes } from './measurements/routes.js';

export interface BuildAppOptions {
  tokenPepper?: string;
  tokenRepository?: ApiTokenRepository;
  planRepository?: PlanRepository;
  nutritionRepository?: NutritionRepository;
  measurementRepository?: MeasurementRepository;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
  });

  installErrorHandler(app);
  app.get('/api/v1/health', async () => ({ status: 'ok' as const }));

  const authorizer = options.tokenPepper && options.tokenRepository
    ? createRequestAuthorizer(options.tokenRepository, options.tokenPepper)
    : null;

  if (authorizer && options.planRepository) {
    registerPlanRoutes(app, { authorizer, planRepository: options.planRepository });
  }
  if (authorizer && options.nutritionRepository) {
    registerNutritionRoutes(app, { authorizer, nutritionRepository: options.nutritionRepository });
  }
  if (authorizer && options.measurementRepository) {
    registerMeasurementRoutes(app, { authorizer, measurementRepository: options.measurementRepository });
  }

  return app;
}
