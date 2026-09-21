import { describe, expect, it } from 'vitest';
import {
  generateApiToken,
  hashApiToken,
  parseBearerToken,
  verifyApiTokenHash,
} from '../src/auth/token.js';
import { authorizeTokenRecord } from '../src/auth/authorize.js';
import { apiScopes, hasRequiredScopes } from '../src/auth/scopes.js';

describe('Hermes API token primitives', () => {
  it('generates a prefixed opaque token', () => {
    const token = generateApiToken();
    expect(token).toMatch(/^qndh_[A-Za-z0-9_-]{43}$/);
  });

  it('hashes a token with the server pepper and verifies in constant-time form', () => {
    const token = 'qndh_example';
    const digest = hashApiToken(token, 'pepper-a');

    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyApiTokenHash(token, digest, 'pepper-a')).toBe(true);
    expect(verifyApiTokenHash(token, digest, 'pepper-b')).toBe(false);
    expect(verifyApiTokenHash('qndh_other', digest, 'pepper-a')).toBe(false);
  });

  it('extracts only a valid Bearer credential without echoing malformed input', () => {
    expect(parseBearerToken('Bearer qndh_secret')).toBe('qndh_secret');
    expect(parseBearerToken('bearer qndh_secret')).toBe('qndh_secret');
    expect(parseBearerToken('Basic qndh_secret')).toBeNull();
    expect(parseBearerToken('Bearer')).toBeNull();
    expect(parseBearerToken(undefined)).toBeNull();
  });
});

describe('Hermes API scopes', () => {
  it('contains the explicit Today, plan, nutrition, health and coach scopes', () => {
    expect(apiScopes).toEqual([
      'today:read',
      'plans:read', 'plans:write',
      'activities:read', 'activities:write',
      'nutrition:read', 'nutrition:write',
      'measurements:read', 'measurements:write',
      'health:read',
      'progress:read',
      'coach:read', 'coach:write',
    ]);
  });

  it('does not let a read-only token satisfy a write requirement', () => {
    expect(hasRequiredScopes(['plans:read'], ['plans:read'])).toBe(true);
    expect(hasRequiredScopes(['plans:read'], ['plans:write'])).toBe(false);
  });
});

describe('Hermes token authorization', () => {
  const rawToken = 'qndh_test-token';
  const pepper = 'server-pepper';
  const tokenHash = hashApiToken(rawToken, pepper);

  it('authorizes an active token with every required scope', () => {
    const result = authorizeTokenRecord({
      rawToken,
      pepper,
      requiredScopes: ['nutrition:write'],
      record: {
        id: 'token-1',
        tokenHash,
        scopes: ['nutrition:read', 'nutrition:write'],
        revokedAt: null,
      },
    });

    expect(result).toEqual({ tokenId: 'token-1', scopes: ['nutrition:read', 'nutrition:write'] });
  });

  it('returns unauthorized for a revoked token', () => {
    expect(() => authorizeTokenRecord({
      rawToken,
      pepper,
      requiredScopes: ['nutrition:read'],
      record: {
        id: 'token-1',
        tokenHash,
        scopes: ['nutrition:read'],
        revokedAt: new Date('2026-09-21T07:00:00Z'),
      },
    })).toThrowErrorMatchingObject({ statusCode: 401, code: 'unauthorized' });
  });

  it('returns forbidden when a valid token lacks a required scope', () => {
    expect(() => authorizeTokenRecord({
      rawToken,
      pepper,
      requiredScopes: ['nutrition:write'],
      record: {
        id: 'token-1',
        tokenHash,
        scopes: ['nutrition:read'],
        revokedAt: null,
      },
    })).toThrowErrorMatchingObject({ statusCode: 403, code: 'forbidden' });
  });

  it('returns unauthorized for an invalid token without exposing it in the error', () => {
    try {
      authorizeTokenRecord({
        rawToken: 'qndh_DO_NOT_LEAK_ME',
        pepper,
        requiredScopes: [],
        record: {
          id: 'token-1',
          tokenHash,
          scopes: ['today:read'],
          revokedAt: null,
        },
      });
      throw new Error('expected authorizeTokenRecord to throw');
    } catch (error) {
      expect(error).toMatchObject({ statusCode: 401, code: 'unauthorized' });
      expect(String(error)).not.toContain('qndh_DO_NOT_LEAK_ME');
    }
  });
});
