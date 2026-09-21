import type { FastifyReply, FastifyRequest } from 'fastify';
import { ApiAuthError } from '../auth/authorize.js';

export function errorBody(request: FastifyRequest, code: string, message: string, details: unknown = {}) {
  return {
    error: { code, message, details },
    requestId: request.id,
  };
}

export function installErrorHandler(app: import('fastify').FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiAuthError) {
      return reply.status(error.statusCode).send(errorBody(request, error.code, error.message));
    }

    request.log.error({ err: error }, 'unhandled request error');
    return reply.status(500).send(errorBody(request, 'internal_error', 'Internal server error'));
  });
}

export function sendValidationError(reply: FastifyReply, request: FastifyRequest, message: string, details: unknown = {}) {
  return reply.status(422).send(errorBody(request, 'validation_error', message, details));
}
