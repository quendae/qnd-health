import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const WEB_SESSION_COOKIE = 'qnd_health_session';
export const WEB_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

function safeEqualText(left: string, right: string): boolean {
  const leftDigest = createHmac('sha256', 'qnd-health-web-compare').update(left, 'utf8').digest();
  const rightDigest = createHmac('sha256', 'qnd-health-web-compare').update(right, 'utf8').digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload, 'utf8').digest('base64url');
}

export function webCredentialsMatch(
  username: string,
  password: string,
  expectedUsername: string,
  expectedPassword: string,
): boolean {
  return safeEqualText(username, expectedUsername) && safeEqualText(password, expectedPassword);
}

export function createWebSessionToken(
  username: string,
  secret: string,
  nowMs = Date.now(),
  ttlSeconds = WEB_SESSION_TTL_SECONDS,
): string {
  const payload = Buffer.from(JSON.stringify({
    username,
    expiresAt: nowMs + ttlSeconds * 1000,
    nonce: randomBytes(16).toString('base64url'),
  }), 'utf8').toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyWebSessionToken(
  token: string,
  secret: string,
  expectedUsername: string,
  nowMs = Date.now(),
): { username: string; expiresAt: number } | null {
  const dot = token.lastIndexOf('.');
  if (dot <= 0 || dot === token.length - 1) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = sign(payload, secret);
  if (!safeEqualText(signature, expected)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      username?: unknown;
      expiresAt?: unknown;
    };
    if (typeof parsed.username !== 'string' || typeof parsed.expiresAt !== 'number') return null;
    if (!safeEqualText(parsed.username, expectedUsername) || parsed.expiresAt <= nowMs) return null;
    return { username: parsed.username, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

export function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    const value = part.slice(separator + 1).trim();
    try { return decodeURIComponent(value); } catch { return value; }
  }
  return null;
}

export function webSessionCookie(token: string, maxAge = WEB_SESSION_TTL_SECONDS): string {
  return `${WEB_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearWebSessionCookie(): string {
  return `${WEB_SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
