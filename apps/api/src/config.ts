export interface AppConfig {
  host: string;
  port: number;
  databaseUrl: string;
  tokenPepper: string;
  timeZone: string;
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
    host: env.HOST ?? '0.0.0.0',
    port,
    databaseUrl: required(env, 'DATABASE_URL'),
    tokenPepper: required(env, 'TOKEN_PEPPER'),
    timeZone: env.TIME_ZONE?.trim() || 'Europe/Warsaw',
  };
}
