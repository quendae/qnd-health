import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { hashApiToken } from '../src/auth/token.js';
import type { NewNutritionRecord, NutritionRecord, NutritionRepository } from '../src/nutrition/repository.js';
import type { MeasurementRecord, MeasurementRepository, NewMeasurementRecord } from '../src/measurements/repository.js';

const pepper = 'test-pepper';
const token = 'qndh_health-writer';

function tokenRepository() {
  const digest = hashApiToken(token, pepper);
  return {
    async findByHash(hash: string) {
      if (hash !== digest) return null;
      return {
        id: 'health-writer', tokenHash: digest,
        scopes: ['nutrition:read', 'nutrition:write', 'measurements:read', 'measurements:write'],
        revokedAt: null,
      };
    },
  };
}

function auth() {
  return { authorization: `Bearer ${token}` };
}

class MemoryNutritionRepository implements NutritionRepository {
  private items = new Map<string, NutritionRecord>();
  private nextId = 1;

  async create(input: NewNutritionRecord): Promise<NutritionRecord> {
    const item: NutritionRecord = { ...input, id: `nutrition-${this.nextId++}` };
    this.items.set(item.id, item);
    return item;
  }

  async list(from?: string, to?: string): Promise<NutritionRecord[]> {
    return [...this.items.values()]
      .filter((item) => (!from || item.consumedAt >= from) && (!to || item.consumedAt <= to))
      .sort((a, b) => a.consumedAt.localeCompare(b.consumedAt));
  }

  async findById(id: string): Promise<NutritionRecord | null> { return this.items.get(id) ?? null; }
  async update(id: string, patch: Partial<NutritionRecord>): Promise<NutritionRecord | null> {
    const existing = this.items.get(id);
    if (!existing) return null;
    const updated: NutritionRecord = { ...existing, ...patch, id };
    this.items.set(id, updated);
    return updated;
  }
  async delete(id: string): Promise<boolean> { return this.items.delete(id); }
}

class MemoryMeasurementRepository implements MeasurementRepository {
  private items: MeasurementRecord[] = [];
  private nextId = 1;

  async create(input: NewMeasurementRecord): Promise<MeasurementRecord> {
    const item: MeasurementRecord = { ...input, id: `measurement-${this.nextId++}` };
    this.items.push(item);
    return item;
  }

  async list(from?: string, to?: string): Promise<MeasurementRecord[]> {
    return this.items
      .filter((item) => (!from || item.measuredAt >= from) && (!to || item.measuredAt <= to))
      .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
  }
}

describe('Hermes nutrition and measurement API', () => {
  let nutrition: MemoryNutritionRepository;
  let measurements: MemoryMeasurementRepository;

  beforeEach(() => {
    nutrition = new MemoryNutritionRepository();
    measurements = new MemoryMeasurementRepository();
  });

  function app() {
    return buildApp({
      tokenPepper: pepper,
      tokenRepository: tokenRepository(),
      nutritionRepository: nutrition,
      measurementRepository: measurements,
    });
  }

  it('stores Hermes meals and lists them chronologically', async () => {
    const server = app();
    for (const payload of [
      { consumedAt: '2026-09-21T12:30:00+02:00', mealType: 'lunch', title: 'Lunch', caloriesKcal: 700, proteinGrams: 40, carbsGrams: 60, fatGrams: 25 },
      { consumedAt: '2026-09-21T08:00:00+02:00', mealType: 'breakfast', title: 'Breakfast', caloriesKcal: 500, proteinGrams: 30, fatGrams: 20 },
    ]) {
      const response = await server.inject({ method: 'POST', url: '/api/v1/nutrition', headers: auth(), payload });
      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({ source: 'hermes' });
    }

    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/nutrition?from=2026-09-21T00:00:00%2B02:00&to=2026-09-21T23:59:59%2B02:00',
      headers: auth(),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().items.map((item: NutritionRecord) => item.title)).toEqual(['Breakfast', 'Lunch']);
    await server.close();
  });

  it('defaults missing meal metadata and allows correction and deletion', async () => {
    const server = app();
    const created = await server.inject({
      method: 'POST',
      url: '/api/v1/nutrition',
      headers: auth(),
      payload: { title: 'Owsianka', caloriesKcal: 420 },
    });

    expect(created.statusCode).toBe(201);
    expect(created.json().mealType).toBe('other');
    expect(Number.isNaN(Date.parse(created.json().consumedAt))).toBe(false);

    const id = created.json().id as string;
    const edited = await server.inject({
      method: 'PATCH',
      url: `/api/v1/nutrition/${id}`,
      headers: auth(),
      payload: { caloriesKcal: 390, proteinGrams: 31.2 },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json()).toMatchObject({ caloriesKcal: 390, proteinGrams: 31.2, title: 'Owsianka' });

    const deleted = await server.inject({ method: 'DELETE', url: `/api/v1/nutrition/${id}`, headers: auth() });
    expect(deleted.statusCode).toBe(204);

    const list = await server.inject({ method: 'GET', url: '/api/v1/nutrition', headers: auth() });
    expect(list.json().items).toEqual([]);
    await server.close();
  });

  it('rejects invalid nutrition corrections and returns 404 for missing entries', async () => {
    const server = app();
    const invalid = await server.inject({
      method: 'PATCH',
      url: '/api/v1/nutrition/missing',
      headers: auth(),
      payload: { proteinGrams: -1 },
    });
    expect(invalid.statusCode).toBe(422);

    const missingPatch = await server.inject({
      method: 'PATCH',
      url: '/api/v1/nutrition/missing',
      headers: auth(),
      payload: { proteinGrams: 10 },
    });
    expect(missingPatch.statusCode).toBe(404);

    const missingDelete = await server.inject({ method: 'DELETE', url: '/api/v1/nutrition/missing', headers: auth() });
    expect(missingDelete.statusCode).toBe(404);
    await server.close();
  });

  it('sums known nutrition values but reports incomplete macros instead of treating missing data as known zero', async () => {
    const server = app();
    await server.inject({
      method: 'POST', url: '/api/v1/nutrition', headers: auth(),
      payload: { consumedAt: '2026-09-21T08:00:00+02:00', mealType: 'breakfast', title: 'Breakfast', caloriesKcal: 500, proteinGrams: 30, fatGrams: 20 },
    });
    await server.inject({
      method: 'POST', url: '/api/v1/nutrition', headers: auth(),
      payload: { consumedAt: '2026-09-21T12:30:00+02:00', mealType: 'lunch', title: 'Lunch', caloriesKcal: 700, proteinGrams: 40, carbsGrams: 60, fatGrams: 25 },
    });

    const response = await server.inject({
      method: 'GET', url: '/api/v1/nutrition/summary?date=2026-09-21', headers: auth(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      date: '2026-09-21',
      entryCount: 2,
      totals: {
        caloriesKcal: 1200,
        proteinGrams: 70,
        carbsGrams: 60,
        fatGrams: 45,
        fiberGrams: null,
      },
      completeness: {
        caloriesKcal: true,
        proteinGrams: true,
        carbsGrams: false,
        fatGrams: true,
        fiberGrams: false,
      },
    });
    await server.close();
  });

  it('stores body weight from Hermes and returns newest measurements first', async () => {
    const server = app();
    const older = await server.inject({
      method: 'POST', url: '/api/v1/measurements', headers: auth(),
      payload: { measuredAt: '2026-09-20T07:00:00+02:00', weightKg: 123.4 },
    });
    expect(older.statusCode).toBe(201);

    const newer = await server.inject({
      method: 'POST', url: '/api/v1/measurements', headers: auth(),
      payload: { measuredAt: '2026-09-21T07:00:00+02:00', weightKg: 122.8 },
    });
    expect(newer.statusCode).toBe(201);
    expect(newer.json()).toMatchObject({ weightKg: 122.8, source: 'hermes' });

    const list = await server.inject({ method: 'GET', url: '/api/v1/measurements', headers: auth() });
    expect(list.statusCode).toBe(200);
    expect(list.json().items.map((item: MeasurementRecord) => item.weightKg)).toEqual([122.8, 123.4]);
    await server.close();
  });
});
