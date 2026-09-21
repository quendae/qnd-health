import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

export async function registerWebFrontend(app: FastifyInstance, webDistPath: string): Promise<boolean> {
  const root = resolve(webDistPath);
  if (!existsSync(resolve(root, 'index.html'))) {
    app.log.warn({ root }, 'web build not found; API will start without the frontend');
    return false;
  }

  await app.register(fastifyStatic, {
    root,
    prefix: '/',
    index: ['index.html'],
    cacheControl: true,
    maxAge: '1h',
    immutable: false,
  });
  return true;
}
