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
import type { DailyHealthRepository } from './health/repository.js';
import type { CompletedActivityRepository } from './activities/repository.js';
import { registerTodayRoutes } from './today/routes.js';

export interface BuildAppOptions {
  tokenPepper?: string;
  tokenRepository?: ApiTokenRepository;
  planRepository?: PlanRepository;
  nutritionRepository?: NutritionRepository;
  measurementRepository?: MeasurementRepository;
  dailyHealthRepository?: DailyHealthRepository;
  completedActivityRepository?: CompletedActivityRepository;
  timeZone?: string;
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
  if (
    authorizer
    && options.planRepository
    && options.nutritionRepository
    && options.measurementRepository
    && options.dailyHealthRepository
    && options.completedActivityRepository
  ) {
    registerTodayRoutes(app, {
      authorizer,
      planRepository: options.planRepository,
      nutritionRepository: options.nutritionRepository,
      measurementRepository: options.measurementRepository,
      dailyHealthRepository: options.dailyHealthRepository,
      completedActivityRepository: options.completedActivityRepository,
      timeZone: options.timeZone ?? 'Europe/Warsaw',
    });
  }

  return app;
}
