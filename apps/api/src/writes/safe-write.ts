import { createHash } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuditRepository } from '../audit/repository.js';
import type { IdempotencyRepository } from '../idempotency/repository.js';
import { errorBody } from '../http/errors.js';

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;

  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(',')}}`;
}

export function hashWriteRequest(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

export interface PerformedWrite<T> {
  statusCode: number;
  body: T;
  entityId: string | null;
  auditSummary?: unknown;
}

export async function executeSafeWrite<T>(input: {
  request: FastifyRequest;
  reply: FastifyReply;
  tokenId: string;
  route: string;
  requestBody: unknown;
  auditRepository: AuditRepository;
  idempotencyRepository: IdempotencyRepository;
  action: string;
  entityType: string;
  perform: () => Promise<PerformedWrite<T>>;
}) {
  const header = input.request.headers['idempotency-key'];
  const idempotencyKey = typeof header === 'string' && header.trim() !== '' ? header.trim() : null;
  if (idempotencyKey && idempotencyKey.length > 200) {
    return input.reply.status(422).send(errorBody(
      input.request,
      'validation_error',
      'Idempotency-Key must be at most 200 characters',
    ));
  }

  const requestHash = hashWriteRequest(input.requestBody);

  if (idempotencyKey) {
    const existing = await input.idempotencyRepository.find(input.tokenId, input.route, idempotencyKey);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        return input.reply.status(409).send(errorBody(
          input.request,
          'idempotency_conflict',
          'Idempotency-Key was already used for a different request',
        ));
      }
      return input.reply.status(existing.responseStatus).send(existing.responseJson);
    }
  }

  const result = await input.perform();

  await input.auditRepository.record({
    actorType: 'api_token',
    apiTokenId: input.tokenId,
    action: input.action,
    entityType: input.entityType,
    entityId: result.entityId,
    requestId: input.request.id,
    summaryJson: result.auditSummary ?? {},
  });

  if (idempotencyKey) {
    await input.idempotencyRepository.save({
      tokenId: input.tokenId,
      route: input.route,
      idempotencyKey,
      requestHash,
      responseStatus: result.statusCode,
      responseJson: result.body,
    });
  }

  return input.reply.status(result.statusCode).send(result.body);
}
