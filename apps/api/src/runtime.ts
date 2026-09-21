import { buildApp } from './app.js';
import { DeepSeekClient } from './coach/deepseek.js';
import { createPrismaRepositories, type PrismaClientPort } from './persistence/prisma-repositories.js';

export interface RuntimeAppOptions {
  prisma: PrismaClientPort;
  tokenPepper: string;
  timeZone?: string;
  deepseekApiKey?: string | null;
  deepseekBaseUrl?: string;
  deepseekModel?: string;
}

export function buildRuntimeApp(options: RuntimeAppOptions) {
  const repositories = createPrismaRepositories(options.prisma);
  const deepseekClient = options.deepseekApiKey
    ? new DeepSeekClient({
      apiKey: options.deepseekApiKey,
      baseUrl: options.deepseekBaseUrl,
      model: options.deepseekModel,
    })
    : null;
  return buildApp({
    tokenPepper: options.tokenPepper,
    timeZone: options.timeZone ?? 'Europe/Warsaw',
    deepseekClient,
    coachModel: options.deepseekModel ?? 'deepseek-flash',
    ...repositories,
  });
}
