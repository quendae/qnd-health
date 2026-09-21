import { describe, expect, it } from 'vitest';
import * as insights from './insights';
import { rangeForDays, presentSeriesValues } from './insights';

describe('insight view helpers', () => {
  it('builds inclusive 7/30/90 day ranges ending on the selected date', () => {
    expect(rangeForDays('2026-09-21', 7)).toEqual({ from: '2026-09-15', to: '2026-09-21' });
    expect(rangeForDays('2026-09-21', 30)).toEqual({ from: '2026-08-23', to: '2026-09-21' });
  });

  it('keeps unknown trend values unknown instead of converting them to zero', () => {
    expect(presentSeriesValues([{ value: null }, { value: 0 }, { value: 42 }, { value: undefined }])).toEqual([0, 42]);
  });

  it('splits chart lines at missing values instead of drawing through unknown data', () => {
    const buildChartSegments = (insights as any).buildChartSegments;
    expect(typeof buildChartSegments).toBe('function');
    expect(buildChartSegments([
      { date: '2026-09-18', value: 100 },
      { date: '2026-09-19', value: 110 },
      { date: '2026-09-20', value: null },
      { date: '2026-09-21', value: 120 },
    ])).toEqual([
      [{ date: '2026-09-18', value: 100 }, { date: '2026-09-19', value: 110 }],
      [{ date: '2026-09-21', value: 120 }],
    ]);
  });

  it('includes target values when calculating chart bounds', () => {
    const chartExtent = (insights as any).chartExtent;
    expect(typeof chartExtent).toBe('function');
    expect(chartExtent([1800, 2100, null], [2200, 2200, 2200])).toEqual({ min: 1800, max: 2200 });
  });
});
