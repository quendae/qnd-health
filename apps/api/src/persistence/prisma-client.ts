import { mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../generated/prisma/client.js';

export function sqliteFilePath(databaseUrl: string): string | null {
  if (!databaseUrl.startsWith('file:')) return null;
  const withoutScheme = databaseUrl.slice('file:'.length).split('?')[0] ?? '';
  if (!withoutScheme || withoutScheme === ':memory:') return null;
  return isAbsolute(withoutScheme) ? withoutScheme : resolve(withoutScheme);
}

export async function ensureDatabaseDirectory(databaseUrl: string): Promise<void> {
  const filePath = sqliteFilePath(databaseUrl);
  if (!filePath) return;
  await mkdir(dirname(filePath), { recursive: true });
}

export function createPrismaClient(databaseUrl: string): PrismaClient {
  const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
  return new PrismaClient({ adapter });
}
