import { describe, expect, it } from 'vitest';
import { rankActivityCandidates } from '../src/activity-matching.js';

describe('rankActivityCandidates', () => {
  it('ranks the same-day, same-sport activity above weaker candidates', () => {
    const ranked = rankActivityCandidates({
      plan: {
        date: '2026-09-21',
        activityType: 'running',
        plannedDurationSeconds: 1800,
        plannedDistanceMeters: 5000,
      },
      activities: [
        {
          id: 'walk-same-day',
          activityType: 'walking',
          startedAt: '2026-09-21T11:00:00+02:00',
          durationSeconds: 1800,
          distanceMeters: 2500,
        },
        {
          id: 'run-previous-day',
          activityType: 'running',
          startedAt: '2026-09-20T08:00:00+02:00',
          durationSeconds: 1800,
          distanceMeters: 5000,
        },
        {
          id: 'run-same-day',
          activityType: 'running',
          startedAt: '2026-09-21T07:30:00+02:00',
          durationSeconds: 1860,
          distanceMeters: 5200,
        },
      ],
      timeZone: 'Europe/Warsaw',
    });

    expect(ranked.map((candidate) => candidate.id)).toEqual([
      'run-same-day',
      'run-previous-day',
      'walk-same-day',
    ]);
    expect(ranked[0]).toMatchObject({ id: 'run-same-day', score: 98 });
  });

  it('ignores activities more than one local calendar day away', () => {
    const ranked = rankActivityCandidates({
      plan: { date: '2026-09-21', activityType: 'running' },
      activities: [
        { id: 'near', activityType: 'running', startedAt: '2026-09-22T06:00:00+02:00' },
        { id: 'far', activityType: 'running', startedAt: '2026-09-23T06:00:00+02:00' },
      ],
      timeZone: 'Europe/Warsaw',
    });

    expect(ranked.map((candidate) => candidate.id)).toEqual(['near']);
  });
});
