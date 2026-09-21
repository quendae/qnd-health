import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('GET /api/v1/health', () => {
  it('returns ok', async () => {
    const app = buildApp();
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });

    await app.close();
  });
});
