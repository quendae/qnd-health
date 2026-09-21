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
import { registerHealthRoutes } from './health/routes.js';
import type { CompletedActivityRepository } from './activities/repository.js';
import type { ActivityMatchRepository } from './activities/matches.js';
import { registerActivityRoutes } from './activities/routes.js';
import { registerTodayRoutes } from './today/routes.js';
import { registerInsightRoutes } from './insights/routes.js';
import type { AuditRepository } from './audit/repository.js';
import { noopAuditRepository } from './audit/repository.js';
import type { IdempotencyRepository } from './idempotency/repository.js';
import { noopIdempotencyRepository } from './idempotency/repository.js';
import { openApiDocument } from './openapi.js';

export interface BuildAppOptions {
  tokenPepper?: string;
  tokenRepository?: ApiTokenRepository;
  planRepository?: PlanRepository;
  nutritionRepository?: NutritionRepository;
  measurementRepository?: MeasurementRepository;
  dailyHealthRepository?: DailyHealthRepository;
  completedActivityRepository?: CompletedActivityRepository;
  activityMatchRepository?: ActivityMatchRepository;
  auditRepository?: AuditRepository;
  idempotencyRepository?: IdempotencyRepository;
  timeZone?: string;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });
  installErrorHandler(app);
  app.get('/api/v1/health', async () => ({ status: 'ok' as const }));
  app.get('/api/openapi.json', async () => openApiDocument);

  const authorizer = options.tokenPepper && options.tokenRepository
    ? createRequestAuthorizer(options.tokenRepository, options.tokenPepper)
    : null;
  const auditRepository = options.auditRepository ?? noopAuditRepository;
  const idempotencyRepository = options.idempotencyRepository ?? noopIdempotencyRepository;
  const timeZone = options.timeZone ?? 'Europe/Warsaw';

  if (authorizer && options.planRepository) {
    registerPlanRoutes(app, {
      authorizer,
      planRepository: options.planRepository,
      completedActivityRepository: options.completedActivityRepository,
      activityMatchRepository: options.activityMatchRepository,
      auditRepository,
      idempotencyRepository,
    });
  }
  if (authorizer && options.completedActivityRepository) {
    registerActivityRoutes(app, {
      authorizer,
      completedActivityRepository: options.completedActivityRepository,
      timeZone,
      auditRepository,
      idempotencyRepository,
    });
  }
  if (authorizer && options.dailyHealthRepository) {
    registerHealthRoutes(app, { authorizer, dailyHealthRepository: options.dailyHealthRepository, auditRepository, idempotencyRepository });
  }
  if (authorizer && options.nutritionRepository) {
    registerNutritionRoutes(app, { authorizer, nutritionRepository: options.nutritionRepository, auditRepository, idempotencyRepository });
  }
  if (authorizer && options.measurementRepository) {
    registerMeasurementRoutes(app, { authorizer, measurementRepository: options.measurementRepository, auditRepository, idempotencyRepository });
  }
  if (authorizer && options.planRepository && options.measurementRepository && options.dailyHealthRepository && options.completedActivityRepository) {
    registerInsightRoutes(app, {
      authorizer,
      planRepository: options.planRepository,
      measurementRepository: options.measurementRepository,
      dailyHealthRepository: options.dailyHealthRepository,
      completedActivityRepository: options.completedActivityRepository,
      timeZone,
    });
  }
  if (authorizer && options.planRepository && options.nutritionRepository && options.measurementRepository && options.dailyHealthRepository && options.completedActivityRepository) {
    registerTodayRoutes(app, {
      authorizer,
      planRepository: options.planRepository,
      nutritionRepository: options.nutritionRepository,
      measurementRepository: options.measurementRepository,
      dailyHealthRepository: options.dailyHealthRepository,
      completedActivityRepository: options.completedActivityRepository,
      timeZone,
    });
  }

  return app;
}
