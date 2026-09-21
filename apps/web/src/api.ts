import type { PlanItem, TodayResponse } from './types';

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

async function parseError(response: Response): Promise<string> {
  try {
    const data = await response.json() as { error?: { message?: string } | string; message?: string };
    if (typeof data.error === 'object' && data.error?.message) return data.error.message;
    if (typeof data.error === 'string') return data.error;
    if (data.message) return data.message;
  } catch {
    // fall through
  }
  return `Request failed (${response.status})`;
}

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
    if (!response.ok) throw new ApiError(await parseError(response), response.status);
    return response.json() as Promise<T>;
  }

  getToday(date: string) {
    return this.request<TodayResponse>(`/api/v1/today?date=${encodeURIComponent(date)}`);
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
}
