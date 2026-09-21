import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';

export interface AppConfig {
  host: string;
  port: number;
  databaseUrl: string;
  tokenPepper: string;
  timeZone: string;
  webDistPath: string;
}

export function findProjectRoot(start = process.cwd()): string {
  let current = resolve(start);
  while (true) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) return current;
    const parent = dirname(current);
    if (parent === current) return resolve(start);
    current = parent;
  }
}

export function normalizeDatabaseUrl(databaseUrl: string, projectRoot: string): string {
  const value = databaseUrl.trim();
  if (!value.startsWith('file:./') && !value.startsWith('file:../')) return value;
  const relativePath = value.slice('file:'.length);
  return `file:${resolve(projectRoot, relativePath).replace(/\\/g, '/')}`;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function loadConfig(inputEnv?: NodeJS.ProcessEnv): AppConfig {
  const projectRoot = findProjectRoot();
  if (!inputEnv) {
    loadDotenv({ path: join(projectRoot, '.env'), override: false });
  }
  const env = inputEnv ?? process.env;
  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  const databaseUrl = normalizeDatabaseUrl(
    env.DATABASE_URL?.trim() || 'file:./data/qnd-health.db',
    projectRoot,
  );

  return {
    host: env.HOST?.trim() || '127.0.0.1',
    port,
    databaseUrl,
    tokenPepper: required(env, 'TOKEN_PEPPER'),
    timeZone: env.TIME_ZONE?.trim() || 'Europe/Warsaw',
    webDistPath: resolve(projectRoot, env.WEB_DIST_PATH?.trim() || 'apps/web/dist'),
  };
}
