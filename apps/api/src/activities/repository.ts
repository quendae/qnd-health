export interface CompletedActivityRecord {
  id: string;
  provider: string;
  activityType: string;
  startedAt: string;
  durationSeconds?: number | null;
  distanceMeters?: number | null;
  [key: string]: unknown;
}

export interface CompletedActivityRepository {
  list(from?: string, to?: string): Promise<CompletedActivityRecord[]>;
}
