export interface MeasurementRecord {
  id: string;
  measuredAt: string;
  weightKg: number;
  bodyFatPercent: number | null;
  bmi: number | null;
  muscleMassKg: number | null;
  bodyWaterPercent?: number | null;
  boneMassKg?: number | null;
  visceralFat?: number | null;
  metabolicAge?: number | null;
  physiqueRating?: number | null;
  transport?: string | null;
  source: 'garmin' | 'hermes' | 'manual';
}

export type NewMeasurementRecord = Omit<MeasurementRecord, 'id'>;

export interface MeasurementRepository {
  create(input: NewMeasurementRecord): Promise<MeasurementRecord>;
  list(from?: string, to?: string): Promise<MeasurementRecord[]>;
}
