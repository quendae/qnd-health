import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { hashApiToken } from '../src/auth/token.js';

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

interface NutritionRecord {
  id: string;
  consumedAt: string;
  mealType: string;
  title: string;
  caloriesKcal: number | null;
  proteinGrams: number | null;
  carbsGrams: number | null;
  fatGrams: number | null;
  fiberGrams: number | null;
  quantityText: string | null;
  notes: string | null;
  source: string;
}

class MemoryNutritionRepository {
  private items = new Map<string, NutritionRecord>();
  private nextId = 1;

  async create(input: Omit<NutritionRecord, 'id'>) {
    const item = { ...input, id: `nutrition-${this.nextId++}` };
    this.items.set(item.id, item);
    return item;
  }

  async list(from?: string, to?: string) {
    return [...this.items.values()]
      .filter((item) => (!from || item.consumedAt >= from) && (!to || item.consumedAt <= to))
      .sort((a, b) => a.consumedAt.localeCompare(b.consumedAt));
  }

  async findById(id: string) { return this.items.get(id) ?? null; }
  async update(id: string, patch: Partial<NutritionRecord>) {
    const existing = this.items.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...patch, id };
    this.items.set(id, updated);
    return updated;
  }
  async delete(id: string) { return this.items.delete(id); }
}

interface MeasurementRecord {
  id: string;
  measuredAt: string;
  weightKg: number;
  bodyFatPercent: number | null;
  bmi: number | null;
  muscleMassKg: number | null;
  source: string;
}

class MemoryMeasurementRepository {
  private items: MeasurementRecord[] = [];
  private nextId = 1;

  async create(input: Omit<MeasurementRecord, 'id'>) {
    const item = { ...input, id: `measurement-${this.nextId++}` };
    this.items.push(item);
    return item;
  }

  async list(from?: string, to?: string) {
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
