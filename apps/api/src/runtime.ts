import { buildApp } from './app.js';
import { createPrismaRepositories, type PrismaClientPort } from './persistence/prisma-repositories.js';

export interface RuntimeAppOptions {
  prisma: PrismaClientPort;
  tokenPepper: string;
  timeZone?: string;
}

export function buildRuntimeApp(options: RuntimeAppOptions) {
  const repositories = createPrismaRepositories(options.prisma);
  return buildApp({
    tokenPepper: options.tokenPepper,
    timeZone: options.timeZone ?? 'Europe/Warsaw',
    ...repositories,
  });
}
