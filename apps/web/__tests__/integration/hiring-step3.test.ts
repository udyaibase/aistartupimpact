import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  jobBoardApplication: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  jobBoardScorecard: { findMany: vi.fn(async (..._a: any[]): Promise<any> => []) },
  jobBoardTeamMember: { findMany: vi.fn(async (..._a: any[]): Promise<any> => []) },
  jobBoardEmployer: { findUnique: vi.fn() },
  jobBoardInterview: { create: vi.fn(async (..._a: any[]): Promise<any> => ({ id: 'iv1' })) },
}));
const move = vi.hoisted(() => vi.fn(async (_o: any) => ({ moved: 1, skipped: 0, emailed: 0, scheduled: 0, failed: 0 })));
const mail = vi.hoisted(() => ({ send: vi.fn(async (_o: any) => ({ success: true })), ff: vi.fn() }));

vi.mock('@udyaibase/database', () => ({ prisma: db }));
vi.mock('@/lib/email/send', () => ({ sendEmail: mail.send, sendEmailFireAndForget: mail.ff, sendEmailBatch: vi.fn() }));
vi.mock('@/lib/employer/pipeline', async () => ({ ...(await vi.importActual<any>('@/lib/employer/pipeline')), moveApplications: move }));
vi.mock('@/lib/employer/applications', () => ({ employerContext: async () => ({ company: 'Acme', bookingUrl: null, email: 'hr@acme.co' }) }));

import { cleanRounds, roundsOf, scorecardSkills } from '@/lib/employer/rounds';
import { cleanScorecard, loadScorecards } from '@/lib/employer/scorecards';
import { interviewIcs, scheduleInterview } from '@/lib/employer/interviews';

beforeEach(() => vi.clearAllMocks());

describe('rounds and scorecards', () => {
  it('cleans round names and falls back to one Interview round', () => {
    expect(cleanRounds([' Screening  call ', 'technical', 'Technical', '', 7, 'Final'])).toEqual(['Screening call', 'technical', 'Final']);
    expect(roundsOf([])).toEqual(['Interview']);
    expect(scorecardSkills({ skills: ['Python', 'SQL', 'LLMs'], mustHaveSkills: ['LLMs'] })).toEqual(['LLMs', 'Python', 'SQL']);
    expect(scorecardSkills({ skills: [], mustHaveSkills: [] })).toHaveLength(3);
  });
  it('a scorecard needs every skill rated 1–4 and a yes or no', () => {
    expect(cleanScorecard({ round: 'Final', ratings: { A: 3 }, recommendation: 'YES' }, ['Interview'], ['A'])).toMatchObject({ ok: false });
    expect(cleanScorecard({ round: 'Interview', ratings: { A: 5 }, recommendation: 'YES' }, ['Interview'], ['A'])).toMatchObject({ ok: false });
    expect(cleanScorecard({ round: 'Interview', ratings: { A: 3 }, recommendation: 'MAYBE' }, ['Interview'], ['A'])).toMatchObject({ ok: false });
    expect(cleanScorecard({ round: 'Interview', ratings: { A: 3, B: 9 }, recommendation: 'NO', notes: ' ok ' }, ['Interview'], ['A'])).toEqual({ ok: true, round: 'Interview', ratings: { A: 3 }, recommendation: 'NO', notes: 'ok' });
  });
  it('interviewers see colleagues’ cards for a round only after submitting their own; owners see all', async () => {
    const cards = [
      { round: 'Technical', authorEmail: 'a@acme.co', authorName: 'A', ratings: {}, recommendation: 'YES', notes: null, updatedAt: new Date() },
      { round: 'Final', authorEmail: 'b@acme.co', authorName: 'B', ratings: {}, recommendation: 'NO', notes: null, updatedAt: new Date() },
      { round: 'Technical', authorEmail: 'me@acme.co', authorName: 'Me', ratings: {}, recommendation: 'YES', notes: null, updatedAt: new Date() },
    ];
    const app = { Listing: { interviewRounds: ['Technical', 'Final'], skills: [], mustHaveSkills: [] } };
    db.jobBoardApplication.findUnique.mockResolvedValue(app);
    db.jobBoardScorecard.findMany.mockResolvedValue(cards);
    const asInterviewer = await loadScorecards('a1', { email: 'ME@acme.co', role: 'INTERVIEWER' });
    expect(asInterviewer!.cards.map((c) => c.authorName)).toEqual(['A', 'Me']);
    expect(asInterviewer!.hidden).toBe(1);
    const asOwner = await loadScorecards('a1', { email: 'boss@acme.co', role: 'OWNER' });
    expect(asOwner!.cards).toHaveLength(3);
  });
});

describe('interview invites', () => {
  it('calendar file uses UTC times and lists the attendees', () => {
    const ics = interviewIcs({ uid: 'x@u', title: 'Interview, Asha', description: 'Round', startAt: new Date('2026-12-01T05:30:00Z'), endAt: new Date('2026-12-01T06:15:00Z'), organizer: { name: 'Acme', email: 'hr@acme.co' }, attendees: ['asha@x.co'], method: 'REQUEST' });
    expect(ics).toContain('DTSTART:20261201T053000Z');
    expect(ics).toContain('SUMMARY:Interview\\, Asha');
    expect(ics).toContain('ATTENDEE;ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:asha@x.co');
    expect(ics).toContain('METHOD:REQUEST');
  });

  it('emails the candidate a calendar file; the panel is limited to the team', async () => {
    db.jobBoardApplication.findFirst.mockResolvedValueOnce({ id: 'a1', email: 'asha@x.co', fullName: 'Asha Rao', status: 'SHORTLISTED', Listing: { title: 'ML Engineer', interviewRounds: ['Screen', 'Final'] } });
    db.jobBoardTeamMember.findMany.mockResolvedValueOnce([{ email: 'dev@acme.co' }]);
    db.jobBoardEmployer.findUnique.mockResolvedValueOnce({ email: 'founder@acme.co' });
    const now = new Date('2026-11-18T06:00:00Z');
    const r = await scheduleInterview({
      employerId: 'emp1', applicationId: 'a1', jobIds: null, actor: { email: 'hr@acme.co', name: 'HR' }, now,
      input: { round: 'Final', date: '2026-11-20', time: '11:00', duration: 60, timezone: 'Asia/Kolkata', panel: ['dev@acme.co', 'stranger@evil.example'] },
    });
    expect(r).toMatchObject({ ok: true });
    const created = db.jobBoardInterview.create.mock.calls[0][0].data;
    expect(created).toMatchObject({ round: 'Final', panelEmails: ['dev@acme.co'], startAt: new Date('2026-11-20T05:30:00Z'), endAt: new Date('2026-11-20T06:30:00Z') });
    expect(mail.send.mock.calls.map((c) => c[0].to)).toEqual(['asha@x.co', 'dev@acme.co']);
    expect(mail.send.mock.calls[0][0].attachments[0].filename).toBe('interview.ics');
    expect(move.mock.calls[0][0]).toMatchObject({ toStatus: 'INTERVIEW', round: 'Final' });
  });

  it('refuses times in the past', async () => {
    db.jobBoardApplication.findFirst.mockResolvedValueOnce({ id: 'a1', email: 'a@x.co', fullName: 'A', status: 'INTERVIEW', Listing: { title: 'ML', interviewRounds: [] } });
    const r = await scheduleInterview({ employerId: 'emp1', applicationId: 'a1', jobIds: null, actor: { email: 'hr@acme.co', name: 'HR' }, now: new Date('2026-11-18T06:00:00Z'), input: { date: '2026-11-17', time: '10:00' } });
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(db.jobBoardInterview.create).not.toHaveBeenCalled();
  });
});
