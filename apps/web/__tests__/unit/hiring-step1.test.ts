import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('@udyaibase/database', () => ({ prisma: {} }));

import { parseExitInput, exitReasonLabel, ON_HOLD_DEFAULT_DAYS } from '@/lib/employer/exit-reasons';
import { waitLevel } from '@/lib/employer/pipeline';
import { whatsappLink } from '@/lib/employer/whatsapp';
import { reportIsEmpty, reportToken, verifyReportToken, weeklyReportEmail, type WeeklyReport } from '@/lib/employer/weekly-report';
import { CANDIDATE_STAGE } from '@/lib/jobs/candidate-status';

beforeAll(() => { process.env.EMPLOYER_JWT_SECRET = 'test-employer-secret-min-32-characters-long'; });

const now = new Date('2026-12-01T06:00:00Z');
const DAY = 864e5;

describe('exit reasons', () => {
  it('rejecting needs a known reason, and "Other" needs a note', () => {
    expect(parseExitInput('REJECTED', {}, now)).toMatchObject({ ok: false, field: 'reason' });
    expect(parseExitInput('REJECTED', { reason: 'MADE_UP' }, now)).toMatchObject({ ok: false, field: 'reason' });
    expect(parseExitInput('REJECTED', { reason: 'OTHER', note: '   ' }, now)).toMatchObject({ ok: false, field: 'note' });
    expect(parseExitInput('REJECTED', { reason: 'OTHER', note: ' wants  remote only ' }, now)).toEqual({ ok: true, reason: 'OTHER', note: 'wants remote only', holdUntil: null });
    expect(parseExitInput('REJECTED', { reason: 'SALARY' }, now)).toEqual({ ok: true, reason: 'SALARY', note: null, holdUntil: null });
  });

  it('On hold defaults to 30 days and refuses past or far-off dates', () => {
    const d = parseExitInput('ON_HOLD', {}, now);
    expect(d.ok && d.holdUntil!.getTime()).toBe(now.getTime() + ON_HOLD_DEFAULT_DAYS * DAY);
    expect(parseExitInput('ON_HOLD', { holdUntil: new Date(now.getTime() - DAY).toISOString() }, now)).toMatchObject({ ok: false, field: 'holdUntil' });
    expect(parseExitInput('ON_HOLD', { holdUntil: new Date(now.getTime() + 400 * DAY).toISOString() }, now)).toMatchObject({ ok: false });
    expect(parseExitInput('ON_HOLD', { holdUntil: 'not a date' }, now)).toMatchObject({ ok: false });
    expect(parseExitInput('ON_HOLD', { holdUntil: new Date(now.getTime() + 14 * DAY).toISOString() }, now).ok).toBe(true);
  });

  it('other moves carry no reason, even if one is sent', () => {
    expect(parseExitInput('SHORTLISTED', { reason: 'SALARY', note: 'x' }, now)).toEqual({ ok: true, reason: null, note: null, holdUntil: null });
  });

  it('labels the reason for the team, and the candidate only ever sees "Under review" for On hold', () => {
    expect(exitReasonLabel('NOTICE')).toBe('Notice period too long');
    expect(exitReasonLabel('nope')).toBeNull();
    expect(CANDIDATE_STAGE.ON_HOLD.label).toBe('Under review');
    expect(JSON.stringify(Object.values(CANDIDATE_STAGE))).not.toMatch(/hold/i);
  });
});

describe('waiting too long badge', () => {
  const t = now.getTime();
  it('amber after 3 days, red after 5, only in waiting stages', () => {
    expect(waitLevel('REVIEWED', new Date(t - 2 * DAY), t)).toBeNull();
    expect(waitLevel('REVIEWED', new Date(t - 3 * DAY), t)).toBe('amber');
    expect(waitLevel('INTERVIEW', new Date(t - 5 * DAY), t)).toBe('red');
    expect(waitLevel('HIRED', new Date(t - 50 * DAY), t)).toBeNull();
    expect(waitLevel('REJECTED', new Date(t - 50 * DAY), t)).toBeNull();
    expect(waitLevel('ON_HOLD', new Date(t - 50 * DAY), t)).toBeNull();
    expect(waitLevel('APPLIED', null, t)).toBeNull();
  });
});

describe('WhatsApp link', () => {
  const ctx = { firstName: 'Asha', jobTitle: 'ML Engineer', company: 'Nimbus' };
  it('adds +91 to Indian numbers and fills a short message', () => {
    const url = whatsappLink('98765 43210', ctx)!;
    expect(url.startsWith('https://wa.me/919876543210?text=')).toBe(true);
    expect(decodeURIComponent(url.split('text=')[1])).toBe('Hi Asha, this is the hiring team from Nimbus about your application for ML Engineer.');
    expect(whatsappLink('+91 98765 43210', ctx)).toContain('wa.me/919876543210');
    expect(whatsappLink('09876543210', ctx)).toContain('wa.me/919876543210');
    expect(whatsappLink('+44 7700 900123', ctx)).toContain('wa.me/447700900123');
  });
  it('gives no link for missing or broken numbers', () => {
    expect(whatsappLink(null, ctx)).toBeNull();
    expect(whatsappLink('12345', ctx)).toBeNull();
  });
});

describe('weekly report email', () => {
  const report: WeeklyReport = {
    company: 'Nimbus <AI>', applications: 12, aiReviewed: 30, aiShortlisted: 4, hoursSaved: 2, waitingLong: 3, holdDue: 1, openJobs: 2, hires: 0,
    top: [{ name: 'Asha <b>', job: 'ML Engineer', reason: 'Shipped RAG in production' }],
  };
  it('shows the numbers, the top candidates and an unsubscribe link, escaping names', () => {
    const { subject, html } = weeklyReportEmail(report, 'https://udyaibase.com/hiring-report/unsubscribe?x=1');
    expect(subject).toBe('12 new applications this week · Nimbus <AI>');
    expect(html).toContain('Asha &lt;b&gt;');
    expect(html).not.toContain('Asha <b>');
    expect(html).toContain('~2h');
    expect(html).toContain('3</strong> candidates have waited 5+ days');
    expect(html).toContain('/employer/applications?review=new');
    expect(html).toContain('hiring-report/unsubscribe?x=1');
  });
  it('is skipped when nothing is open, new or waiting', () => {
    expect(reportIsEmpty({ ...report, openJobs: 0, applications: 0, waitingLong: 0, holdDue: 0, hires: 0 })).toBe(true);
    expect(reportIsEmpty({ ...report, openJobs: 0, applications: 0, waitingLong: 1, holdDue: 0, hires: 0 })).toBe(false);
  });
  it('unsubscribe links are signed per person and kind', () => {
    const t = reportToken({ kind: 'member', id: 'm1' });
    expect(verifyReportToken({ kind: 'member', id: 'm1' }, t)).toBe(true);
    expect(verifyReportToken({ kind: 'member', id: 'm2' }, t)).toBe(false);
    expect(verifyReportToken({ kind: 'workspace', id: 'm1' }, t)).toBe(false);
    expect(verifyReportToken({ kind: 'member', id: 'm1' }, '')).toBe(false);
  });
});
