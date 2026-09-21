export interface DailyHealthRecord {
  date: string;
  source: string;
  transport?: string | null;
  steps?: number | null;
  stepsGoal?: number | null;
  floorsAscended?: number | null;
  intensityMinutes?: number | null;
  restingHr?: number | null;
  hrv?: number | null;
  stress?: number | null;
  bodyBattery?: number | null;
  sleepDurationSeconds?: number | null;
  sleepStages?: unknown;
  respiration?: number | null;
  spo2?: number | null;
  calories?: number | null;
  activeCalories?: number | null;
  hydrationMl?: number | null;
  readiness?: unknown;
  [key: string]: unknown;
}

export interface DailyHealthUpsert {
  date: string;
  source: string;
  transport?: string | null;
  steps?: number | null;
  stepsGoal?: number | null;
  floorsAscended?: number | null;
  intensityMinutes?: number | null;
  restingHr?: number | null;
  hrv?: number | null;
  stress?: number | null;
  bodyBattery?: number | null;
  sleepDurationSeconds?: number | null;
  sleepStages?: unknown;
  respiration?: number | null;
  spo2?: number | null;
  calories?: number | null;
  activeCalories?: number | null;
  hydrationMl?: number | null;
  readiness?: unknown;
}

export interface DailyHealthRepository {
  findByDate(date: string): Promise<DailyHealthRecord | null>;
  list(from?: string, to?: string): Promise<DailyHealthRecord[]>;
  upsert?(input: DailyHealthUpsert): Promise<DailyHealthRecord>;
}
