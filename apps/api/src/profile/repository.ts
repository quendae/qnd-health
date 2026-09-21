import type { SexForBmr } from './energy.js';

export interface HealthProfileRecord {
  id: 'default';
  dateOfBirth: string | null;
  sexForBmr: SexForBmr | null;
  heightCm: number | null;
  activityFactor: number;
  defaultStepsGoal: number;
}

export type HealthProfilePatch = Partial<Omit<HealthProfileRecord, 'id'>>;

export interface HealthProfileRepository {
  get(): Promise<HealthProfileRecord | null>;
  upsert(patch: HealthProfilePatch): Promise<HealthProfileRecord>;
}
