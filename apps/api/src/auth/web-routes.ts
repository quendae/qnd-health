import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { errorBody, sendValidationError } from '../http/errors.js';
import {
  clearWebSessionCookie,
  createWebSessionToken,
  readCookie,
  verifyWebSessionToken,
  WEB_SESSION_COOKIE,
  webCredentialsMatch,
  webSessionCookie,
} from './web-session.js';

export interface WebAuthRouteOptions {
  username: string;
  password: string | null;
  sessionSecret: string;
}

const loginSchema = z.object({
  username: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(1024),
});

function currentSession(request: FastifyRequest, options: WebAuthRouteOptions) {
  const token = readCookie(request.headers.cookie, WEB_SESSION_COOKIE);
  if (!token) return null;
  return verifyWebSessionToken(token, options.sessionSecret, options.username);
}

export function registerWebAuthRoutes(app: FastifyInstance, options: WebAuthRouteOptions): void {
  app.addHook('onRequest', async (request) => {
    if (request.headers.authorization) return;
    const token = readCookie(request.headers.cookie, WEB_SESSION_COOKIE);
    if (token) request.headers.authorization = `QndSession ${token}`;
  });

  app.post('/api/v1/auth/login', async (request, reply) => {
    if (!options.password) {
      return reply.status(503).send(errorBody(
        request,
        'web_auth_not_configured',
        'Local web login is not configured. Set WEB_PASSWORD on the server.',
      ));
    }

    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return sendValidationError(reply, request, 'Username and password are required', parsed.error.flatten());

    if (!webCredentialsMatch(parsed.data.username, parsed.data.password, options.username, options.password)) {
      return reply.status(401).send(errorBody(request, 'unauthorized', 'Invalid username or password'));
    }

    const token = createWebSessionToken(options.username, options.sessionSecret);
    reply.header('set-cookie', webSessionCookie(token));
    return reply.send({ username: options.username });
  });

  app.get('/api/v1/auth/session', async (request, reply) => {
    const session = currentSession(request, options);
    if (!session) return reply.status(401).send(errorBody(request, 'unauthorized', 'No active web session'));
    return reply.send({ authenticated: true, username: session.username });
  });

  app.post('/api/v1/auth/logout', async (_request, reply) => {
    reply.header('set-cookie', clearWebSessionCookie());
    return reply.status(204).send();
  });
}
