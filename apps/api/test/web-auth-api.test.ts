import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { PlanRepository } from '../src/plans/repository.js';

const planRepository: PlanRepository = {
  async create(input) { return { id: 'plan-1', ...input }; },
  async list() { return []; },
  async findById() { return null; },
  async update() { return null; },
  async delete() { return false; },
};

describe('local web authentication', () => {
  it('logs in quendae with a password and uses an HttpOnly session cookie for protected API calls', async () => {
    const app = buildApp({
      tokenPepper: 'test-pepper',
      tokenRepository: { async findByHash() { return null; } },
      planRepository,
      webUsername: 'quendae',
      webPassword: 'correct horse battery staple',
    } as any);

    const rejected = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'quendae', password: 'wrong' },
    });
    expect(rejected.statusCode).toBe(401);

    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'quendae', password: 'correct horse battery staple' },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json()).toEqual({ username: 'quendae' });

    const setCookie = login.headers['set-cookie'];
    expect(setCookie).toBeTypeOf('string');
    expect(setCookie).toContain('qnd_health_session=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    const cookie = String(setCookie).split(';', 1)[0];

    const session = await app.inject({ method: 'GET', url: '/api/v1/auth/session', headers: { cookie } });
    expect(session.statusCode).toBe(200);
    expect(session.json()).toEqual({ authenticated: true, username: 'quendae' });

    const plans = await app.inject({ method: 'GET', url: '/api/v1/plans?from=2026-09-22&to=2026-09-22', headers: { cookie } });
    expect(plans.statusCode).toBe(200);
    expect(plans.json()).toEqual({ items: [] });

    const logout = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie } });
    expect(logout.statusCode).toBe(204);
    expect(String(logout.headers['set-cookie'])).toContain('Max-Age=0');

    await app.close();
  });

  it('does not authenticate a browser session without the cookie', async () => {
    const app = buildApp({
      tokenPepper: 'test-pepper',
      tokenRepository: { async findByHash() { return null; } },
      planRepository,
      webUsername: 'quendae',
      webPassword: 'secret',
    } as any);

    const session = await app.inject({ method: 'GET', url: '/api/v1/auth/session' });
    expect(session.statusCode).toBe(401);
    const plans = await app.inject({ method: 'GET', url: '/api/v1/plans?from=2026-09-22&to=2026-09-22' });
    expect(plans.statusCode).toBe(401);

    await app.close();
  });
});
