export interface AppConfig {
  host: string;
  port: number;
  databaseUrl: string;
  tokenPepper: string;
  timeZone: string;
  webDistPath: string;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  return {
    host: env.HOST?.trim() || '127.0.0.1',
    port,
    databaseUrl: env.DATABASE_URL?.trim() || 'file:./data/qnd-health.db',
    tokenPepper: required(env, 'TOKEN_PEPPER'),
    timeZone: env.TIME_ZONE?.trim() || 'Europe/Warsaw',
    webDistPath: env.WEB_DIST_PATH?.trim() || 'apps/web/dist',
  };
}
