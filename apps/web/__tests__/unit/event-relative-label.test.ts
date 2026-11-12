import { describe, it, expect } from 'vitest';
import { getRelativeLabel } from '@/components/events/EventListClient';

// Local-time dates, so the test means the same thing in any timezone.
const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute).toISOString();
const now = new Date(2026, 10, 11, 10, 0); // 11 Nov, 10:00

describe('event relative label (calendar days, viewer timezone)', () => {
  it('shows nothing for an event two days away, even within 48 hours', () => {
    expect(getRelativeLabel(at(13, 1), now)).toBe(''); // 39h away — used to say "Tomorrow"
    expect(getRelativeLabel(at(13, 9), now)).toBe('');
  });

  it('says Tomorrow for any time on the next calendar day', () => {
    expect(getRelativeLabel(at(12, 0, 30), now)).toBe('Tomorrow');
    expect(getRelativeLabel(at(12, 23, 59), now)).toBe('Tomorrow');
  });

  it('counts hours for later today', () => {
    expect(getRelativeLabel(at(11, 15), now)).toBe('In 5h');
    expect(getRelativeLabel(at(11, 10, 30), now)).toBe('Today');
  });

  it('late in the evening, an event after midnight is Tomorrow, not "In 2h"', () => {
    expect(getRelativeLabel(at(12, 1), new Date(2026, 10, 11, 23, 0))).toBe('Tomorrow');
  });

  it('marks events that started within 3 hours as live, and older ones as nothing', () => {
    expect(getRelativeLabel(at(11, 8), now)).toBe('Live Now');
    expect(getRelativeLabel(at(11, 6), now)).toBe('');
  });
});
