import { describe, it, expect } from 'vitest';
import { addWorkingMinutes, dueText, replyPromise, workingMinutesBetween } from '@/lib/support/reply-times';

// India time = UTC + 5:30. 2026-11-18 is a Wednesday; 2026-11-21 a Saturday; 2026-11-22 a Sunday.
const ist = (s: string) => new Date(`${s}+05:30`);

describe('working hours (Mon–Sat, 9:30–18:30 IST)', () => {
  it('adds time within the day and rolls over to the next working day', () => {
    expect(addWorkingMinutes(ist('2026-11-18T10:00:00'), 240)).toEqual(ist('2026-11-18T14:00:00'));
    expect(addWorkingMinutes(ist('2026-11-18T17:00:00'), 240)).toEqual(ist('2026-11-19T12:00:00'));
  });

  it('a ticket at night or on Sunday starts the clock at 9:30 on the next working day', () => {
    expect(addWorkingMinutes(ist('2026-11-18T22:00:00'), 60)).toEqual(ist('2026-11-19T10:30:00'));
    expect(addWorkingMinutes(ist('2026-11-22T11:00:00'), 60)).toEqual(ist('2026-11-23T10:30:00'));
    expect(addWorkingMinutes(ist('2026-11-21T18:00:00'), 60)).toEqual(ist('2026-11-23T10:00:00'));
  });

  it('counts working minutes between two moments', () => {
    expect(workingMinutesBetween(ist('2026-11-21T17:30:00'), ist('2026-11-23T10:30:00'))).toBe(120);
    expect(workingMinutesBetween(ist('2026-11-19T10:00:00'), ist('2026-11-18T10:00:00'))).toBe(0);
  });
});

describe('reply promises', () => {
  it('per plan, with urgent problems faster on paid plans and Free never promised', () => {
    expect(replyPromise('FREE', true)).toMatchObject({ workingMinutes: 1080, guaranteed: false });
    expect(replyPromise('GROWTH', false)).toMatchObject({ workingMinutes: 1080, guaranteed: true });
    expect(replyPromise('PRO', false)).toMatchObject({ workingMinutes: 540, guaranteed: true });
    expect(replyPromise('PRO', true)).toMatchObject({ workingMinutes: 240 });
    expect(replyPromise('SCALE', false)).toMatchObject({ workingMinutes: 240, whatsapp: true });
  });

  it('describes due and overdue in working time', () => {
    const now = ist('2026-11-18T12:00:00');
    expect(dueText(ist('2026-11-18T15:00:00'), now)).toEqual({ text: 'due in 3 h', overdue: false });
    expect(dueText(ist('2026-11-18T11:30:00'), now)).toEqual({ text: 'overdue by 30 min', overdue: true });
  });
});
