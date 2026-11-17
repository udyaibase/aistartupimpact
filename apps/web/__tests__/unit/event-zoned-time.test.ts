import { describe, it, expect } from 'vitest';
import { cleanTimeZone, utcToZoned, zonedToUtc } from '@/lib/events/zoned-time';
import { descriptionTooLong, EVENT_DESCRIPTION_MAX } from '@/lib/events/description-limit';

describe('event times are in the event time zone, not the computer’s', () => {
  it('10:00 IST is 04:30 UTC, and reads back as 10:00', () => {
    const utc = zonedToUtc('2026-11-20', '10:00', 'Asia/Kolkata')!;
    expect(utc.toISOString()).toBe('2026-11-20T04:30:00.000Z');
    expect(utcToZoned(utc, 'Asia/Kolkata')).toEqual({ date: '2026-11-20', time: '10:00' });
  });
  it('an early-morning IST event keeps its own date (the old form showed the previous day)', () => {
    const utc = zonedToUtc('2026-11-20', '02:00', 'Asia/Kolkata')!;
    expect(utc.toISOString()).toBe('2026-11-19T20:30:00.000Z');
    expect(utcToZoned(utc, 'Asia/Kolkata').date).toBe('2026-11-20');
  });
  it('handles daylight saving zones', () => {
    expect(zonedToUtc('2026-07-01', '09:00', 'America/New_York')!.toISOString()).toBe('2026-07-01T13:00:00.000Z');
    expect(zonedToUtc('2026-12-01', '09:00', 'America/New_York')!.toISOString()).toBe('2026-12-01T14:00:00.000Z');
  });
  it('defaults to IST and maps the old Calcutta name', () => {
    expect(cleanTimeZone('')).toBe('Asia/Kolkata');
    expect(cleanTimeZone('Asia/Calcutta')).toBe('Asia/Kolkata');
    expect(cleanTimeZone('Not/AZone')).toBe('Asia/Kolkata');
    expect(cleanTimeZone('Europe/London')).toBe('Europe/London');
    expect(zonedToUtc('2026-11-20', '', 'Asia/Kolkata')).toBeNull();
  });
});

describe('description limit on the server', () => {
  const para = (n: number) => `<p>${'a'.repeat(n)}</p>`;
  it('accepts up to the limit (with the small allowance for paragraph breaks) and refuses well past it', () => {
    expect(descriptionTooLong(para(EVENT_DESCRIPTION_MAX))).toBe(false);
    expect(descriptionTooLong(Array.from({ length: 20 }, () => para(100)).join(''))).toBe(false);
    expect(descriptionTooLong(para(EVENT_DESCRIPTION_MAX + 500))).toBe(true);
    expect(descriptionTooLong('')).toBe(false);
  });
});
