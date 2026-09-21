import type { ApiScope } from './scopes.js';
import { authorizeTokenRecord, ApiAuthError, type StoredApiTokenRecord } from './authorize.js';
import { hashApiToken, parseBearerToken } from './token.js';

export interface ApiTokenRepository {
  findByHash(tokenHash: string): Promise<StoredApiTokenRecord | null>;
}

export interface RequestAuthorizer {
  authorize(authorization: string | undefined, requiredScopes: readonly ApiScope[]): Promise<{
    tokenId: string;
    scopes: readonly string[];
  }>;
}

export function createRequestAuthorizer(
  tokenRepository: ApiTokenRepository,
  pepper: string,
): RequestAuthorizer {
  return {
    async authorize(authorization, requiredScopes) {
      const rawToken = parseBearerToken(authorization);
      if (!rawToken) {
        throw new ApiAuthError(401, 'unauthorized', 'A valid Bearer token is required');
      }

      const tokenHash = hashApiToken(rawToken, pepper);
      const record = await tokenRepository.findByHash(tokenHash);
      return authorizeTokenRecord({ rawToken, pepper, requiredScopes, record });
    },
  };
}
