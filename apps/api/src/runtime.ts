import { buildApp } from './app.js';
import { DeepSeekClient } from './coach/deepseek.js';
import { createPrismaCoachSettingsRepository } from './coach/prisma-settings-repository.js';
import { CoachSettingsAwareProvider } from './coach/settings-provider.js';
import { createPrismaRepositories, type PrismaClientPort } from './persistence/prisma-repositories.js';
import { createPrismaMeasurementRepository } from './measurements/prisma-repository.js';
import { createPrismaGoalRevisionRepository } from './profile/prisma-goal-repository.js';
import { ProfileGoalService } from './profile/goals.js';

export interface RuntimeAppOptions {
  prisma: PrismaClientPort;
  tokenPepper: string;
  webUsername?: string;
  webPassword?: string | null;
  timeZone?: string;
  deepseekApiKey?: string | null;
  deepseekBaseUrl?: string;
  deepseekModel?: string;
}

export function buildRuntimeApp(options: RuntimeAppOptions) {
  const repositories = createPrismaRepositories(options.prisma);
  const measurementRepository = createPrismaMeasurementRepository(options.prisma);
  const coachSettingsRepository = createPrismaCoachSettingsRepository(options.prisma);
  const goalRevisionRepository = createPrismaGoalRevisionRepository(options.prisma);
  const profileGoalService = new ProfileGoalService(goalRevisionRepository, repositories.profileRepository);
  const baseDeepseekClient = options.deepseekApiKey
    ? new DeepSeekClient({
      apiKey: options.deepseekApiKey,
      baseUrl: options.deepseekBaseUrl,
      model: options.deepseekModel,
    })
    : null;
  const deepseekClient = baseDeepseekClient
    ? new CoachSettingsAwareProvider(baseDeepseekClient, coachSettingsRepository)
    : null;
  return buildApp({
    tokenPepper: options.tokenPepper,
    webUsername: options.webUsername ?? 'quendae',
    webPassword: options.webPassword ?? null,
    timeZone: options.timeZone ?? 'Europe/Warsaw',
    deepseekClient,
    coachSettingsRepository,
    profileGoalService,
    coachModel: options.deepseekModel ?? 'deepseek-flash',
    ...repositories,
    measurementRepository,
  });
}
