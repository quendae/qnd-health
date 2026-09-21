import { describe, expect, it } from 'vitest';
import { rangeForDays, presentSeriesValues } from './insights';

describe('insight view helpers', () => {
  it('builds inclusive 7/30/90 day ranges ending on the selected date', () => {
    expect(rangeForDays('2026-09-21', 7)).toEqual({ from: '2026-09-15', to: '2026-09-21' });
    expect(rangeForDays('2026-09-21', 30)).toEqual({ from: '2026-08-23', to: '2026-09-21' });
  });

  it('keeps unknown trend values unknown instead of converting them to zero', () => {
    expect(presentSeriesValues([{ value: null }, { value: 0 }, { value: 42 }, { value: undefined }])).toEqual([0, 42]);
  });
});
