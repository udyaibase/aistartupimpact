import { describe, expect, it } from 'vitest';
import { cleanRecurrence, describeEnd, lastDateOf, plannedDates, scheduleKey, todayIn } from '@/lib/events/recurrence';

const base = { freq: 'WEEKLY', interval: 1, createAheadDays: 21, templateEventId: 'tpl' };

describe('series repeat rules', () => {
  it('keeps rules saved before ends/pause/skips existed working (never ends, not paused)', () => {
    expect(cleanRecurrence(base)).toMatchObject({ ends: 'never', endAfter: null, endOn: null, paused: false, skipDates: [] });
  });

  it('cleans end settings and falls back to never when incomplete', () => {
    expect(cleanRecurrence({ ...base, ends: 'after', endAfter: 6 })).toMatchObject({ ends: 'after', endAfter: 6 });
    expect(cleanRecurrence({ ...base, ends: 'after', endAfter: 0 })).toMatchObject({ ends: 'never', endAfter: null });
    expect(cleanRecurrence({ ...base, ends: 'after', endAfter: 9999 })).toMatchObject({ endAfter: 104 });
    expect(cleanRecurrence({ ...base, ends: 'on', endOn: '2027-02-30' })).toMatchObject({ ends: 'never', endOn: null });
    expect(cleanRecurrence({ ...base, ends: 'on', endOn: '2027-03-01' })).toMatchObject({ ends: 'on', endOn: '2027-03-01' });
  });

  it('dedupes, sorts and validates skipped dates', () => {
    expect(cleanRecurrence({ ...base, skipDates: ['2026-12-09', 'nope', '2026-12-02', '2026-12-09'] })!.skipDates).toEqual(['2026-12-02', '2026-12-09']);
  });

  it('ends after N dates counted from the template', () => {
    const rule = cleanRecurrence({ ...base, ends: 'after', endAfter: 3 })!;
    expect(lastDateOf(rule, '2026-11-04')).toBe('2026-11-25');
    expect(plannedDates(rule, '2026-11-04', '2026-11-04', '2027-12-31').map((d) => d.date)).toEqual(['2026-11-11', '2026-11-18', '2026-11-25']);
    expect(describeEnd(rule, '2026-11-04')).toBe('Ends after 3 events (last on 25 Nov 2026)');
  });

  it('stops on the end date and marks skipped dates', () => {
    const rule = cleanRecurrence({ ...base, ends: 'on', endOn: '2026-12-02', skipDates: ['2026-11-18'] })!;
    expect(plannedDates(rule, '2026-11-04', '2026-11-04', '2027-12-31')).toEqual([
      { date: '2026-11-11', skipped: false }, { date: '2026-11-18', skipped: true }, { date: '2026-11-25', skipped: false }, { date: '2026-12-02', skipped: false },
    ]);
    expect(plannedDates(rule, '2026-11-04', '2026-12-02', '2027-12-31')).toEqual([]);
  });

  it('only restarts the schedule when how often, which week or the template changes', () => {
    const a = cleanRecurrence(base)!;
    expect(scheduleKey({ ...a, paused: true, skipDates: ['2026-12-02'], ends: 'after', endAfter: 2 })).toBe(scheduleKey(a));
    expect(scheduleKey({ ...a, interval: 2 })).not.toBe(scheduleKey(a));
    expect(scheduleKey({ ...a, templateEventId: 'other' })).not.toBe(scheduleKey(a));
  });

  it('gives today in the event time zone', () => {
    expect(todayIn('Asia/Kolkata', new Date('2026-11-24T20:00:00Z'))).toBe('2026-11-25');
    expect(todayIn('America/New_York', new Date('2026-11-25T03:00:00Z'))).toBe('2026-11-24');
  });
});
