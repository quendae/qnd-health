export interface ActivityMatchRepository {
  attach(planItemId: string, completedActivityId: string): Promise<void>;
  detach(planItemId: string): Promise<void>;
}
