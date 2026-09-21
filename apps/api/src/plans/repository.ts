export type PlanKind = 'workout' | 'metric_goal' | 'count_goal' | 'manual';
export type CompletionStrategy = 'metric_auto' | 'count_manual' | 'activity_link' | 'manual';
export type PlanStatus = 'planned' | 'partial' | 'completed' | 'skipped' | 'moved' | 'replaced';

export interface WorkoutStructure {
  sets?: number | null;
  repsPerSet?: number | null;
  secondsPerSet?: number | null;
  restSeconds?: number | null;
}

export interface StoredPlanItem {
  id: string;
  date: string;
  kind: PlanKind;
  title: string;
  completionStrategy: CompletionStrategy;
  metricKey: string | null;
  targetValue: number | null;
  currentManualValue: number | null;
  unit: string | null;
  status: PlanStatus;
  activityType?: string | null;
  plannedDurationSeconds?: number | null;
  plannedDistanceMeters?: number | null;
  workoutStructure?: WorkoutStructure | null;
  linkedActivityId?: string | null;
}

export type NewStoredPlanItem = Omit<StoredPlanItem, 'id'>;

export interface PlanRepository {
  create(input: NewStoredPlanItem): Promise<StoredPlanItem>;
  list(from?: string, to?: string): Promise<StoredPlanItem[]>;
  findById(id: string): Promise<StoredPlanItem | null>;
  update(id: string, patch: Partial<StoredPlanItem>): Promise<StoredPlanItem | null>;
  delete(id: string): Promise<boolean>;
}
