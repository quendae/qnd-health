import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('GET /api/openapi.json', () => {
  it('documents bearer auth, Today, profile and mutable nutrition endpoints', async () => {
    const app = buildApp();
    const response = await app.inject({ method: 'GET', url: '/api/openapi.json' });

    expect(response.statusCode).toBe(200);
    const document = response.json();
    expect(document.openapi).toMatch(/^3\./);
    expect(document.components.securitySchemes.bearerAuth).toEqual({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'QND Health API token',
    });
    expect(document.paths['/api/v1/today'].get).toBeDefined();
    expect(document.paths['/api/v1/profile'].get).toBeDefined();
    expect(document.paths['/api/v1/profile'].patch).toBeDefined();
    expect(document.paths['/api/v1/plans'].get).toBeDefined();
    expect(document.paths['/api/v1/plans'].post).toBeDefined();
    expect(document.paths['/api/v1/nutrition'].post).toBeDefined();
    expect(document.paths['/api/v1/nutrition/{id}'].patch).toBeDefined();
    expect(document.paths['/api/v1/nutrition/{id}'].delete).toBeDefined();
    expect(document.paths['/api/v1/measurements'].post).toBeDefined();

    const nutritionHeaders = document.paths['/api/v1/nutrition'].post.parameters;
    expect(nutritionHeaders).toContainEqual(expect.objectContaining({
      name: 'Idempotency-Key', in: 'header', required: false,
    }));
    expect(document.paths['/api/v1/profile'].patch.parameters).toContainEqual(expect.objectContaining({
      name: 'Idempotency-Key', in: 'header', required: false,
    }));

    expect(document.components.schemas.TodayResponse).toBeDefined();
    expect(document.components.schemas.TodayResponse.properties.energy).toEqual({
      oneOf: [
        { $ref: '#/components/schemas/EnergyEstimate' },
        { type: 'null' },
      ],
    });
    expect(document.components.schemas.HealthProfile).toBeDefined();
    expect(document.components.schemas.EnergyEstimate).toBeDefined();
    expect(document.components.schemas.NutritionEntry).toBeDefined();

    await app.close();
  });
});
