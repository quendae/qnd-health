export interface CompletedActivityRecord {
  id: string;
  provider: string;
  providerActivityId?: string | null;
  transport?: string | null;
  activityType: string;
  startedAt: string;
  durationSeconds?: number | null;
  distanceMeters?: number | null;
  avgHr?: number | null;
  maxHr?: number | null;
  avgPaceSecondsPerKm?: number | null;
  cadence?: number | null;
  elevationGainMeters?: number | null;
  calories?: number | null;
  [key: string]: unknown;
}

export interface ProviderActivityUpsert {
  provider: string;
  providerActivityId: string;
  transport?: string | null;
  activityType: string;
  startedAt: string;
  durationSeconds?: number | null;
  distanceMeters?: number | null;
  avgHr?: number | null;
  maxHr?: number | null;
  avgPaceSecondsPerKm?: number | null;
  cadence?: number | null;
  elevationGainMeters?: number | null;
  calories?: number | null;
}

export interface CompletedActivityRepository {
  list(from?: string, to?: string): Promise<CompletedActivityRecord[]>;
  findById?(id: string): Promise<CompletedActivityRecord | null>;
  upsertProviderActivity?(input: ProviderActivityUpsert): Promise<CompletedActivityRecord>;
}
