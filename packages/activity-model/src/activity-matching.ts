export interface MatchPlan {
  date: string;
  activityType?: string | null;
  plannedDurationSeconds?: number | null;
  plannedDistanceMeters?: number | null;
}

export interface MatchActivity {
  id: string;
  activityType: string;
  startedAt: string;
  durationSeconds?: number | null;
  distanceMeters?: number | null;
  [key: string]: unknown;
}

export interface RankedActivity<T extends MatchActivity = MatchActivity> extends MatchActivity {
  score: number;
  source: T;
}

function localIsoDate(timestamp: string, timeZone: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) throw new Error('startedAt must be a valid timestamp');

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dayNumber(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return Math.floor(Date.UTC(year!, month! - 1, day!) / 86_400_000);
}

function similarityScore(actual: number | null | undefined, planned: number | null | undefined): number {
  if (actual == null || planned == null || planned <= 0 || actual < 0) return 0;
  if (actual === planned) return 10;
  const relativeDifference = Math.abs(actual - planned) / planned;
  if (relativeDifference <= 0.10) return 9;
  if (relativeDifference <= 0.25) return 6;
  if (relativeDifference < 0.50) return 3;
  return 0;
}

export function rankActivityCandidates<T extends MatchActivity>(input: {
  plan: MatchPlan;
  activities: readonly T[];
  timeZone: string;
}): Array<T & { score: number }> {
  const planDay = dayNumber(input.plan.date);
  const normalizedPlanType = input.plan.activityType?.trim().toLowerCase() ?? null;

  return input.activities
    .map((activity) => {
      const activityDate = localIsoDate(activity.startedAt, input.timeZone);
      const dayDistance = Math.abs(dayNumber(activityDate) - planDay);
      if (dayDistance > 1) return null;

      let score = dayDistance === 0 ? 50 : 0;
      const normalizedActivityType = activity.activityType.trim().toLowerCase();
      if (normalizedPlanType) {
        score += normalizedActivityType === normalizedPlanType ? 30 : -30;
      }
      score += similarityScore(activity.durationSeconds, input.plan.plannedDurationSeconds);
      score += similarityScore(activity.distanceMeters, input.plan.plannedDistanceMeters);

      return { ...activity, score: Math.max(0, score) };
    })
    .filter((candidate): candidate is T & { score: number } => candidate !== null)
    .sort((a, b) => b.score - a.score || a.startedAt.localeCompare(b.startedAt));
}
