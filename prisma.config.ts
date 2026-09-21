import { config as loadDotenv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';

const projectRoot = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(projectRoot, '.env'), override: false });

function normalizeDatabaseUrl(databaseUrl: string): string {
  const value = databaseUrl.trim();
  if (!value.startsWith('file:./') && !value.startsWith('file:../')) return value;
  const relativePath = value.slice('file:'.length);
  return `file:${resolve(projectRoot, relativePath).replace(/\\/g, '/')}`;
}

export default defineConfig({
  schema: 'database/prisma/schema.prisma',
  migrations: {
    path: 'database/prisma/migrations',
  },
  datasource: {
    url: normalizeDatabaseUrl(process.env.DATABASE_URL ?? 'file:./data/qnd-health.db'),
  },
});
