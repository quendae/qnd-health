import type {
  CoachConversation, CoachMessage, CoachTurnResponse, CompletedActivity, HealthProfile, HistoryResponse,
  NutritionEntry, PlanItem, ProgressResponse, TodayResponse, WorkoutStructure,
} from './types';

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly data: unknown = null) {
    super(message);
  }
}

function errorMessage(data: unknown, status: number): string {
  if (data && typeof data === 'object') {
    const body = data as { error?: { message?: string } | string; message?: string };
    if (typeof body.error === 'object' && body.error?.message) return body.error.message;
    if (typeof body.error === 'string') return body.error;
    if (body.message) return body.message;
  }
  return `Żądanie nie powiodło się (${status})`;
}

export interface PlanWriteInput {
  date: string;
  kind: PlanItem['kind'];
  title: string;
  completionStrategy: PlanItem['completionStrategy'];
  metricKey?: string | null;
  targetValue?: number | null;
  unit?: string | null;
  activityType?: string | null;
  plannedDurationSeconds?: number | null;
  plannedDistanceMeters?: number | null;
  workoutStructure?: WorkoutStructure | null;
}

export type PlanPatchInput = Partial<PlanWriteInput>;

export type NutritionPatchInput = Partial<Pick<NutritionEntry,
  'consumedAt' | 'mealType' | 'title' | 'caloriesKcal' | 'proteinGrams' | 'carbsGrams' | 'fatGrams' | 'fiberGrams' | 'quantityText' | 'notes'
>>;

export type HealthProfilePatch = Partial<Omit<HealthProfile, 'id'>>;

export class QndHealthApi {
  constructor(private readonly token: string) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${this.token}`);
    if (init.body) headers.set('Content-Type', 'application/json');
    if (init.method && init.method !== 'GET' && init.method !== 'HEAD') {
      headers.set('Idempotency-Key', crypto.randomUUID());
    }
    const response = await fetch(path, { ...init, headers });
    if (!response.ok) {
      let data: unknown = null;
      try { data = await response.json(); } catch { data = null; }
      throw new ApiError(errorMessage(data, response.status), response.status, data);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  getToday(date: string) {
    return this.request<TodayResponse>(`/api/v1/today?date=${encodeURIComponent(date)}`);
  }

  getHistory(from: string, to: string) {
    return this.request<HistoryResponse>(`/api/v1/history?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  }

  getProgress(from: string, to: string) {
    return this.request<ProgressResponse>(`/api/v1/progress?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  }

  getProfile() {
    return this.request<HealthProfile | null>('/api/v1/profile');
  }

  updateProfile(patch: HealthProfilePatch) {
    return this.request<HealthProfile>('/api/v1/profile', { method: 'PATCH', body: JSON.stringify(patch) });
  }

  listPlans(from: string, to: string) {
    return this.request<{ items: PlanItem[] }>(`/api/v1/plans?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  }

  createPlan(input: PlanWriteInput) {
    return this.request<PlanItem>('/api/v1/plans', { method: 'POST', body: JSON.stringify(input) });
  }

  updatePlan(id: string, patch: PlanPatchInput) {
    return this.request<PlanItem>(`/api/v1/plans/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
  }

  deletePlan(id: string) {
    return this.request<void>(`/api/v1/plans/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  listActivities(date: string) {
    return this.request<{ items: CompletedActivity[] }>(`/api/v1/activities?date=${encodeURIComponent(date)}`);
  }

  updateProgress(id: string, value: number) {
    return this.request<PlanItem>(`/api/v1/plans/${encodeURIComponent(id)}/progress`, {
      method: 'POST', body: JSON.stringify({ value }),
    });
  }

  attachActivity(planId: string, completedActivityId: string) {
    return this.request<PlanItem>(`/api/v1/plans/${encodeURIComponent(planId)}/activity`, {
      method: 'POST', body: JSON.stringify({ completedActivityId }),
    });
  }

  detachActivity(planId: string) {
    return this.request<PlanItem>(`/api/v1/plans/${encodeURIComponent(planId)}/activity`, { method: 'DELETE' });
  }

  updateNutrition(id: string, patch: NutritionPatchInput) {
    return this.request<NutritionEntry>(`/api/v1/nutrition/${encodeURIComponent(id)}`, {
      method: 'PATCH', body: JSON.stringify(patch),
    });
  }

  deleteNutrition(id: string) {
    return this.request<void>(`/api/v1/nutrition/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  listCoachConversations() {
    return this.request<{ conversations: CoachConversation[] }>('/api/v1/coach/conversations');
  }

  createCoachConversation(title?: string | null) {
    return this.request<{ conversation: CoachConversation }>('/api/v1/coach/conversations', {
      method: 'POST', body: JSON.stringify(title ? { title } : {}),
    });
  }

  getCoachMessages(conversationId: string) {
    return this.request<{ conversation: CoachConversation; messages: CoachMessage[] }>(
      `/api/v1/coach/conversations/${encodeURIComponent(conversationId)}/messages`,
    );
  }

  sendCoachMessage(conversationId: string, content: string) {
    return this.request<CoachTurnResponse>(`/api/v1/coach/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: 'POST', body: JSON.stringify({ content }),
    });
  }
}
