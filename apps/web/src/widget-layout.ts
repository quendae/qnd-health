export type TodayWidgetId = 'health_metrics' | 'activity' | 'nutrition' | 'week_progress' | 'remaining_week' | 'coach';

export interface TodayWidgetPreference {
  id: TodayWidgetId;
  visible: boolean;
}

export const defaultTodayWidgetLayout: TodayWidgetPreference[] = [
  { id: 'health_metrics', visible: true },
  { id: 'activity', visible: true },
  { id: 'nutrition', visible: true },
  { id: 'week_progress', visible: true },
  { id: 'remaining_week', visible: true },
  { id: 'coach', visible: true },
];

const known = new Set<TodayWidgetId>(defaultTodayWidgetLayout.map(widget => widget.id));

export function normalizeTodayWidgetLayout(value: unknown): TodayWidgetPreference[] {
  const parsed: TodayWidgetPreference[] = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      if (!item || typeof item !== 'object') continue;
      const id = (item as { id?: unknown }).id;
      const visible = (item as { visible?: unknown }).visible;
      if (typeof id === 'string' && known.has(id as TodayWidgetId) && typeof visible === 'boolean' && !parsed.some(widget => widget.id === id)) {
        parsed.push({ id: id as TodayWidgetId, visible });
      }
    }
  }
  for (const fallback of defaultTodayWidgetLayout) {
    if (!parsed.some(widget => widget.id === fallback.id)) parsed.push({ ...fallback });
  }
  return parsed;
}

export function moveWidget(layout: TodayWidgetPreference[], id: TodayWidgetId, delta: -1 | 1): TodayWidgetPreference[] {
  const index = layout.findIndex(widget => widget.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= layout.length) return layout.map(widget => ({ ...widget }));
  const next = layout.map(widget => ({ ...widget }));
  const [widget] = next.splice(index, 1);
  if (!widget) return next;
  next.splice(target, 0, widget);
  return next;
}
