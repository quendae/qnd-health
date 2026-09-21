export interface ProfileGoalValues {
  activityFactor: number;
  defaultStepsGoal: number;
  dailyCaloriesGoalKcal: number | null;
  dailyProteinGoalGrams: number | null;
  dailyCarbsGoalGrams: number | null;
  dailyFatGoalGrams: number | null;
  dailyFiberGoalGrams: number | null;
}

export type GoalRevisionSource = 'manual' | 'coach' | 'migration';

export interface ProfileGoalRevisionRecord extends ProfileGoalValues {
  id: string;
  effectiveFrom: string;
  source: GoalRevisionSource;
  sourceRef: string | null;
  reason: string | null;
  createdAt: string;
}

export interface CreateProfileGoalRevision extends ProfileGoalValues {
  effectiveFrom: string;
  source: GoalRevisionSource;
  sourceRef: string | null;
  reason: string | null;
}

export interface ProfileGoalRevisionRepository {
  findActiveOn(date: string): Promise<ProfileGoalRevisionRecord | null>;
  list(): Promise<ProfileGoalRevisionRecord[]>;
  count(): Promise<number>;
  create(input: CreateProfileGoalRevision): Promise<ProfileGoalRevisionRecord>;
}
