import type { ApiScope } from './scopes.js';
import { hasRequiredScopes } from './scopes.js';
import { verifyApiTokenHash } from './token.js';

export class ApiAuthError extends Error {
  constructor(
    public readonly statusCode: 401 | 403,
    public readonly code: 'unauthorized' | 'forbidden',
    message: string,
  ) {
    super(message);
    this.name = 'ApiAuthError';
  }
}

export interface StoredApiTokenRecord {
  id: string;
  tokenHash: string;
  scopes: readonly string[];
  revokedAt: Date | null;
}

interface AuthorizeTokenRecordInput {
  rawToken: string;
  pepper: string;
  requiredScopes: readonly ApiScope[];
  record: StoredApiTokenRecord | null;
}

export interface AuthorizedToken {
  tokenId: string;
  scopes: readonly string[];
}

export function authorizeTokenRecord(input: AuthorizeTokenRecordInput): AuthorizedToken {
  const { rawToken, pepper, requiredScopes, record } = input;

  if (
    !record
    || record.revokedAt !== null
    || !verifyApiTokenHash(rawToken, record.tokenHash, pepper)
  ) {
    throw new ApiAuthError(401, 'unauthorized', 'Invalid or revoked API token');
  }

  if (!hasRequiredScopes(record.scopes, requiredScopes)) {
    throw new ApiAuthError(403, 'forbidden', 'API token does not have the required scope');
  }

  return { tokenId: record.id, scopes: [...record.scopes] };
}
