export interface DailyHealthRecord {
  date: string;
  source: string;
  steps?: number | null;
  floorsAscended?: number | null;
  intensityMinutes?: number | null;
  restingHr?: number | null;
  hrv?: number | null;
  stress?: number | null;
  bodyBattery?: number | null;
  sleepDurationSeconds?: number | null;
  respiration?: number | null;
  spo2?: number | null;
  calories?: number | null;
  activeCalories?: number | null;
  hydrationMl?: number | null;
  [key: string]: unknown;
}

export interface DailyHealthRepository {
  findByDate(date: string): Promise<DailyHealthRecord | null>;
  list(from?: string, to?: string): Promise<DailyHealthRecord[]>;
}
