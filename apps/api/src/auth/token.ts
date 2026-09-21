import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const TOKEN_PREFIX = 'qndh_';
const TOKEN_BYTES = 32;
const SHA256_HEX_LENGTH = 64;

export function generateApiToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(TOKEN_BYTES).toString('base64url')}`;
}

export function hashApiToken(token: string, pepper: string): string {
  return createHash('sha256')
    .update(pepper, 'utf8')
    .update('\0', 'utf8')
    .update(token, 'utf8')
    .digest('hex');
}

export function verifyApiTokenHash(token: string, expectedHash: string, pepper: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(expectedHash) || expectedHash.length !== SHA256_HEX_LENGTH) {
    return false;
  }

  const actual = Buffer.from(hashApiToken(token, pepper), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function parseBearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;

  const match = /^Bearer\s+(qndh_[A-Za-z0-9_-]+)$/i.exec(authorization.trim());
  return match?.[1] ?? null;
}
