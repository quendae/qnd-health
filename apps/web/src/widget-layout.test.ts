import { describe, expect, it } from 'vitest';
import { defaultTodayWidgetLayout, normalizeTodayWidgetLayout, moveWidget } from './widget-layout';

describe('Today widget layout', () => {
  it('keeps a stable default order for configurable widgets', () => {
    expect(defaultTodayWidgetLayout.map(widget => widget.id)).toEqual([
      'health_metrics', 'activity', 'nutrition', 'week_progress', 'remaining_week', 'coach',
    ]);
    expect(defaultTodayWidgetLayout.every(widget => widget.visible)).toBe(true);
  });

  it('normalizes stored layouts by preserving known choices and appending new widgets', () => {
    const restored = normalizeTodayWidgetLayout([
      { id: 'nutrition', visible: false },
      { id: 'activity', visible: true },
      { id: 'unknown', visible: true },
    ]);

    expect(restored.map(widget => widget.id)).toEqual([
      'nutrition', 'activity', 'health_metrics', 'week_progress', 'remaining_week', 'coach',
    ]);
    expect(restored[0]).toEqual({ id: 'nutrition', visible: false });
  });

  it('moves a widget without changing its visibility', () => {
    const moved = moveWidget(defaultTodayWidgetLayout, 'coach', -1);
    expect(moved.at(-2)?.id).toBe('coach');
    expect(moved.find(widget => widget.id === 'coach')?.visible).toBe(true);
  });
});
