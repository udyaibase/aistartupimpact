import { describe, it, expect } from 'vitest';
import { cleanRows, distinctValues, guessMapping, guessStage, parseCsv, parseDate } from '@/lib/employer/import-csv';

describe('parseCsv', () => {
  it('handles quotes, commas and line breaks inside quotes, CRLF and a BOM', () => {
    const t = parseCsv('﻿Name,Email,Notes\r\n"Rao, Asha",asha@x.co,"said ""hi""\non call"\r\n\r\nRavi,ravi@x.co,\n');
    expect(t).toEqual([['Name', 'Email', 'Notes'], ['Rao, Asha', 'asha@x.co', 'said "hi"\non call'], ['Ravi', 'ravi@x.co', '']]);
  });
});

describe('guessMapping and guessStage', () => {
  it('maps common header names from other tools', () => {
    expect(guessMapping(['Candidate Name', 'Email Address', 'Mobile', 'Job Title', 'Current Stage', 'Applied On', 'LinkedIn Profile'])).toEqual({
      fullName: 0, email: 1, phone: 2, job: 3, stage: 4, appliedAt: 5, linkedinUrl: 6,
    });
    expect(guessMapping(['first_name', 'last_name', 'email'])).toMatchObject({ firstName: 0, lastName: 1, email: 2 });
  });

  it('maps stage names to our pipeline', () => {
    expect(guessStage('Technical Round 2')).toBe('INTERVIEW');
    expect(guessStage('Phone screen')).toBe('SHORTLISTED');
    expect(guessStage('Offer Extended')).toBe('OFFER');
    expect(guessStage('Joined')).toBe('HIRED');
    expect(guessStage('Archived - not a fit')).toBe('REJECTED');
    expect(guessStage('On Hold')).toBe('ON_HOLD');
    expect(guessStage('Sourced')).toBe('APPLIED');
  });
});

describe('parseDate', () => {
  const now = new Date('2026-11-18T06:00:00Z');
  it('reads Indian day-first dates and ISO, never the future', () => {
    expect(parseDate('03/04/2026', now)?.slice(0, 10)).toBe('2026-04-03');
    expect(parseDate('2026-02-10', now)?.slice(0, 10)).toBe('2026-02-10');
    expect(parseDate('12 Mar 2026', now)).not.toBeNull();
    expect(parseDate('01/01/2030', now)).toBeNull();
    expect(parseDate('yesterday', now)).toBeNull();
  });
});

describe('cleanRows', () => {
  const rows = [
    ['Asha Rao', 'ASHA@x.co', 'ML Engineer', 'Interview', 'linkedin.com/in/asha', '5 yrs', 'great'],
    ['', 'ravi@x.co', 'ML Engineer', '', '', '', ''],
    ['Bad', 'not-an-email', 'ML Engineer', '', '', '', ''],
    ['Asha again', 'asha@x.co', 'ML Engineer', '', '', '', ''],
    ['Meera', 'meera@x.co', 'Old Role', 'Rejected', '', '', ''],
    ['Kiran', 'kiran@x.co', 'Skip Me', '', '', '', ''],
  ];
  const mapping = { fullName: 0, email: 1, job: 2, stage: 3, linkedinUrl: 4, experienceYears: 5, notes: 6 };
  const jobs = { 'ML Engineer': { kind: 'existing' as const, listingId: 'j1' }, 'Old Role': { kind: 'new' as const }, 'Skip Me': { kind: 'skip' as const } };

  it('cleans each row and gives reasons for the ones left out', () => {
    const r = cleanRows({ rows, mapping, jobs, stages: { Interview: 'INTERVIEW' } });
    expect(r.rows.map((x) => [x.email, x.jobKey, x.stage])).toEqual([['asha@x.co', 'ML Engineer', 'INTERVIEW'], ['ravi@x.co', 'ML Engineer', 'APPLIED'], ['meera@x.co', 'Old Role', 'REJECTED']]);
    expect(r.rows[0]).toMatchObject({ fullName: 'Asha Rao', linkedinUrl: 'https://linkedin.com/in/asha', experienceYears: 5, notes: 'great', row: 2 });
    expect(r.rows[1].fullName).toBe('ravi');
    expect(r.problems.map((p) => [p.row, p.reason])).toEqual([
      [4, 'Email doesn’t look right'], [5, 'Same person twice for the same job (kept the first)'], [7, 'Skipped job “Skip Me”'],
    ]);
  });

  it('uses one job for everyone when the file has no job column', () => {
    const r = cleanRows({ rows: [['a@x.co'], ['b@x.co']], mapping: { email: 0 }, jobs: { __all__: { kind: 'existing', listingId: 'j1' } }, stages: {}, defaultJob: '__all__' });
    expect(r.rows.map((x) => x.jobKey)).toEqual(['__all__', '__all__']);
  });

  it('counts distinct values, most common first', () => {
    expect(distinctValues(rows, 2)[0]).toEqual({ value: 'ML Engineer', count: 4 });
  });
});
