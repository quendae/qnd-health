import type { ApiScope } from './scopes.js';
import { apiScopes } from './scopes.js';
import { authorizeTokenRecord, ApiAuthError, type StoredApiTokenRecord } from './authorize.js';
import { hashApiToken, parseBearerToken } from './token.js';
import { verifyWebSessionToken } from './web-session.js';

export interface ApiTokenRepository {
  findByHash(tokenHash: string): Promise<StoredApiTokenRecord | null>;
}

export interface RequestAuthorizer {
  authorize(authorization: string | undefined, requiredScopes: readonly ApiScope[]): Promise<{
    tokenId: string;
    scopes: readonly string[];
  }>;
}

export interface WebSessionAuthorizationOptions {
  username: string;
  secret: string;
}

export function createRequestAuthorizer(
  tokenRepository: ApiTokenRepository,
  pepper: string,
  webSession?: WebSessionAuthorizationOptions,
): RequestAuthorizer {
  return {
    async authorize(authorization, requiredScopes) {
      if (webSession && authorization?.startsWith('QndSession ')) {
        const rawSession = authorization.slice('QndSession '.length).trim();
        const verified = rawSession
          ? verifyWebSessionToken(rawSession, webSession.secret, webSession.username)
          : null;
        if (!verified) {
          throw new ApiAuthError(401, 'unauthorized', 'A valid web session is required');
        }
        return { tokenId: 'web-session', scopes: [...apiScopes] };
      }

      const rawToken = parseBearerToken(authorization);
      if (!rawToken) {
        throw new ApiAuthError(401, 'unauthorized', 'A valid Bearer token or web session is required');
      }

      const tokenHash = hashApiToken(rawToken, pepper);
      const record = await tokenRepository.findByHash(tokenHash);
      return authorizeTokenRecord({ rawToken, pepper, requiredScopes, record });
    },
  };
}
