import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const db = vi.hoisted(() => ({
  jobBoardEmployer: { findUnique: vi.fn(), update: vi.fn() },
  jobBoardOpenProfile: {
    findMany: vi.fn(async (): Promise<any[]> => []), findUnique: vi.fn(async (): Promise<any> => null), create: vi.fn(), update: vi.fn(),
    updateMany: vi.fn(async () => ({ count: 1 })), deleteMany: vi.fn(async () => ({ count: 0 })),
  },
  jobBoardIntroRequest: {
    count: vi.fn(async () => 0), groupBy: vi.fn(async (): Promise<any[]> => []), findMany: vi.fn(async (): Promise<any[]> => []),
    findFirst: vi.fn(async (): Promise<any> => null), create: vi.fn(async () => ({ id: 'r1' })), update: vi.fn(),
    updateMany: vi.fn(async () => ({ count: 1 })),
  },
  jobBoardApplication: { findMany: vi.fn(async (): Promise<any[]> => []), findFirst: vi.fn(async () => null) },
  jobBoardListing: { findFirst: vi.fn(async (): Promise<any> => ({ id: 'L1', title: 'ML Engineer' })) },
}));
const mail = vi.hoisted(() => ({ sendEmail: vi.fn(async () => ({ success: true })), sendEmailFireAndForget: vi.fn() }));
const ops = vi.hoisted(() => ({ opsAlert: vi.fn(async () => true) }));
const who = vi.hoisted(() => ({ role: 'OWNER', jobIds: null as string[] | null }));

vi.mock('@udyaibase/database', () => ({ prisma: db }));
vi.mock('@/lib/email/send', () => mail);
vi.mock('@/lib/ops/alert', () => ops);
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(async () => ({ success: true })), getClientIdentifier: () => 'ip', apiRateLimit: {} }));
vi.mock('@/lib/employer/applications', () => ({ employerContext: vi.fn(async () => ({ company: 'Acme AI', bookingUrl: null, email: '' })) }));
vi.mock('@/lib/employer-auth', () => ({ getEmployerSession: async () => ({ id: 'emp1', email: 'hr@acme.ai', role: who.role, jobIds: who.jobIds }) }));
vi.mock('@/lib/employer/permissions', async () => {
  const roles = await vi.importActual<any>('@/lib/employer/roles');
  return { can: roles.can, canSeeJob: () => true, forbidden: () => NextResponse.json({}, { status: 403 }) };
});

process.env.EMPLOYER_JWT_SECRET = 'test-secret-for-network-0123456789';

import { cleanIntroMessage, cleanOpenProfile, toNetworkCard, PENDING_CAP } from '@/lib/network/rules';
import { networkAccess, requestIntro, runNetworkMaintenance, searchNetwork, worksAt } from '@/lib/network/intros';
import { linkIntroApplication, respondToIntro, saveOpenProfile, verifyPauseToken, pauseToken } from '@/lib/network/profile';
import { POST as postRequest } from '@/app/api/employer/network/requests/route';
import { GET as getJobMatches } from '@/app/api/employer/jobs/[id]/network-matches/route';

const DAY = 864e5;
const employer = (over: Record<string, unknown> = {}) => ({
  id: 'emp1', networkPilot: true, networkPausedAt: null, plan: 'FREE', planExpiresAt: null, planIsTrial: false,
  companyName: 'Acme AI', email: 'hr@acme.ai', websiteUrl: 'https://acme.ai', Startup: null, ...over,
});
const profile = (id: string, email: string, over: Record<string, unknown> = {}) => ({
  id, headline: 'ML Engineer', experienceYears: 4, skills: ['Python'], city: 'Pune', workMode: 'ANY', noticePeriodDays: 30,
  currentCompany: 'Other Co', showCompany: false, WebUser: { email }, ...over,
});
const message = 'We are building retrieval for legal documents and your Python work stands out.';

beforeEach(() => {
  vi.clearAllMocks();
  who.role = 'OWNER'; who.jobIds = null;
  db.jobBoardEmployer.findUnique.mockResolvedValue(employer());
  db.jobBoardIntroRequest.count.mockResolvedValue(0);
  db.jobBoardIntroRequest.updateMany.mockResolvedValue({ count: 1 });
  db.jobBoardOpenProfile.findMany.mockResolvedValue([]);
  db.jobBoardOpenProfile.findUnique.mockResolvedValue(null);
});

describe('rules', () => {
  it('a profile needs a role; skills are de-duplicated; the company shows only when chosen and given', () => {
    expect(cleanOpenProfile({ headline: ' ' }).ok).toBe(false);
    const r = cleanOpenProfile({ headline: 'ML Engineer', skills: ['Python', 'Python', ' RAG '], workMode: 'MOON', showCompany: true, currentCompany: '' });
    expect(r).toMatchObject({ ok: true, data: { skills: ['Python', 'RAG'], workMode: 'ANY', showCompany: false, currentCompany: null } });
  });

  it('what companies see carries no name, email, phone, links or resume, and hides the company unless chosen', () => {
    const c = toNetworkCard({ ...profile('p1', 'x@y.com'), currentCompany: 'Secret Co', showCompany: false } as any);
    expect(Object.keys(c).sort()).toEqual(['city', 'currentCompany', 'experienceYears', 'headline', 'id', 'noticePeriodDays', 'requestedAt', 'skills', 'workMode']);
    expect(c.currentCompany).toBeNull();
    expect(JSON.stringify(c)).not.toContain('x@y.com');
  });

  it('a request note must be personal and short', () => {
    expect(cleanIntroMessage('Hi, apply pls').ok).toBe(false);
    expect(cleanIntroMessage('x'.repeat(501)).ok).toBe(false);
    expect(cleanIntroMessage(message).ok).toBe(true);
  });

  it('recognises the company’s own staff by email domain or current company name', () => {
    const acme = { domains: new Set(['acme.ai']), names: new Set(['acme ai']) };
    expect(worksAt({ email: 'riya@eng.acme.ai', currentCompany: null }, acme)).toBe(true);
    expect(worksAt({ email: 'riya@gmail.com', currentCompany: 'Acme AI' }, acme)).toBe(true);
    expect(worksAt({ email: 'riya@gmail.com', currentCompany: 'Other' }, acme)).toBe(false);
  });

  it('the email pause link is signed per profile', () => {
    expect(verifyPauseToken('p1', pauseToken('p1'))).toBe(true);
    expect(verifyPauseToken('p2', pauseToken('p1'))).toBe(false);
  });
});

describe('turning it on', () => {
  const me = { id: 'u1', email: 'riya@gmail.com', name: 'Riya', emailVerified: true };
  it('needs a verified email and explicit consent, and records the consent wording', async () => {
    expect((await saveOpenProfile({ ...me, emailVerified: false }, { headline: 'ML Engineer' }, { consent: true })).ok).toBe(false);
    expect(await saveOpenProfile(me, { headline: 'ML Engineer' }, { consent: false })).toMatchObject({ ok: false, field: 'consent' });
    const now = new Date('2027-01-01T00:00:00Z');
    expect((await saveOpenProfile(me, { headline: 'ML Engineer' }, { consent: true }, now)).ok).toBe(true);
    const data = (db.jobBoardOpenProfile.create.mock.calls[0] as any)[0].data;
    expect(data.webUserId).toBe('u1');
    expect(data.visibleUntil.toISOString()).toBe('2027-04-01T00:00:00.000Z');
    expect(data.consentText).toMatch(/^\[\d{4}-\d{2}-\d{2}\] I agree/);
  });
});

describe('search', () => {
  it('leaves out the company’s own staff, people who applied to it, and people with a full inbox', async () => {
    db.jobBoardOpenProfile.findMany.mockResolvedValueOnce([
      profile('ok', 'a@gmail.com'),
      profile('staff', 'b@acme.ai'),
      profile('applied', 'c@gmail.com'),
      profile('busy', 'd@gmail.com'),
      profile('asked', 'e@gmail.com'),
    ]);
    db.jobBoardIntroRequest.groupBy.mockResolvedValueOnce([{ profileId: 'busy', _count: { _all: PENDING_CAP } }, { profileId: 'asked', _count: { _all: PENDING_CAP } }]);
    db.jobBoardIntroRequest.findMany.mockResolvedValueOnce([{ profileId: 'asked', createdAt: new Date() }]);
    db.jobBoardApplication.findMany.mockResolvedValueOnce([{ email: 'C@gmail.com' }]);
    const cards = await searchNetwork('emp1');
    expect(cards.map((c) => c.id)).toEqual(['ok', 'asked']);
    expect(cards[1].requestedAt).not.toBeNull();
    const where = (db.jobBoardOpenProfile.findMany.mock.calls[0] as any)[0].where;
    expect(where).toMatchObject({ pausedAt: null, NOT: { blockedEmployerIds: { has: 'emp1' } } });
  });
});

describe('requests', () => {
  const ask = (over: Record<string, unknown> = {}) => requestIntro({ employerId: 'emp1', sentByEmail: 'hr@acme.ai', profileId: 'ok', listingId: 'L1', message, ...over });
  beforeEach(() => {
    db.jobBoardOpenProfile.findMany.mockResolvedValue([profile('ok', 'a@gmail.com')]);
    db.jobBoardOpenProfile.findUnique.mockResolvedValue({ id: 'ok', WebUser: { email: 'a@gmail.com' } });
  });

  it('only pilot companies, and not while paused after a report', async () => {
    db.jobBoardEmployer.findUnique.mockResolvedValue(employer({ networkPilot: false }));
    expect((await ask())).toMatchObject({ ok: false, status: 403 });
    db.jobBoardEmployer.findUnique.mockResolvedValue(employer({ networkPausedAt: new Date() }));
    expect((await ask())).toMatchObject({ ok: false, status: 403 });
  });

  it('Free gets 5 a month; the 6th is refused', async () => {
    expect((await networkAccess('emp1')).allowance).toBe(5);
    db.jobBoardIntroRequest.count.mockResolvedValue(5);
    expect(await ask()).toMatchObject({ ok: false, status: 429 });
  });

  it('a paid plan gets its own allowance', async () => {
    db.jobBoardEmployer.findUnique.mockResolvedValue(employer({ plan: 'PRO', planExpiresAt: new Date(Date.now() + 20 * DAY) }));
    expect((await networkAccess('emp1')).allowance).toBe(60);
  });

  it('needs an open job of theirs and a personal note', async () => {
    expect(await ask({ message: 'Apply now' })).toMatchObject({ ok: false, status: 400 });
    db.jobBoardListing.findFirst.mockResolvedValueOnce(null);
    expect(await ask()).toMatchObject({ ok: false, status: 400 });
  });

  it('sends the email without telling the company who it went to, and refuses a repeat within 90 days', async () => {
    const r = await ask();
    expect(r).toMatchObject({ ok: true, id: 'r1', left: 4 });
    const sent = (mail.sendEmail.mock.calls[0] as any)[0];
    expect(sent.to).toBe('a@gmail.com');
    expect(sent.html).toContain('They don’t know who you are');
    expect(sent.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    db.jobBoardIntroRequest.findMany.mockResolvedValueOnce([{ profileId: 'ok', createdAt: new Date() }]);
    expect(await ask()).toMatchObject({ ok: false, status: 409 });
  });

  it('someone not listed for this company can’t be asked', async () => {
    db.jobBoardApplication.findMany.mockResolvedValueOnce([{ email: 'a@gmail.com' }]);
    expect(await ask()).toMatchObject({ ok: false, status: 404 });
  });

  it('the route needs the move permission and the whole-company view', async () => {
    const req = () => new NextRequest('http://x', { method: 'POST', body: JSON.stringify({ profileId: 'ok', listingId: 'L1', message }) });
    who.role = 'INTERVIEWER';
    expect((await postRequest(req())).status).toBe(403);
    who.role = 'RECRUITER'; who.jobIds = ['L1'];
    expect((await postRequest(req())).status).toBe(403);
    who.jobIds = null;
    expect((await postRequest(req())).status).toBe(200);
  });
});

describe('answering', () => {
  const pending = (over: Record<string, unknown> = {}) => ({
    id: 'r1', status: 'PENDING', employerId: 'emp1', createdAt: new Date(), message,
    Listing: { slug: 'ml-engineer', title: 'ML Engineer', status: 'OPEN', deletedAt: null }, Employer: { companyName: 'Acme AI' }, ...over,
  });

  it('only their own requests', async () => {
    expect(await respondToIntro('u1', 'r1', 'accept', null)).toMatchObject({ ok: false, status: 404 });
    expect((db.jobBoardIntroRequest.findFirst.mock.calls[0] as any)[0].where).toEqual({ id: 'r1', Profile: { webUserId: 'u1' } });
  });

  it('accept opens the normal application form with the request attached', async () => {
    db.jobBoardIntroRequest.findFirst.mockResolvedValueOnce(pending());
    expect(await respondToIntro('u1', 'r1', 'accept', null)).toEqual({ ok: true, status: 'ACCEPTED', applyUrl: '/jobs/ml-engineer/apply?intro=r1' });
  });

  it('a report pauses the company and tells our team, but reads as a decline to the company', async () => {
    db.jobBoardIntroRequest.findFirst.mockResolvedValueOnce(pending());
    expect(await respondToIntro('u1', 'r1', 'report', 'spam')).toMatchObject({ ok: true, status: 'REPORTED' });
    expect((db.jobBoardEmployer.update.mock.calls[0] as any)[0]).toMatchObject({ where: { id: 'emp1' }, data: { networkPausedAt: expect.any(Date) } });
    expect(ops.opsAlert).toHaveBeenCalled();
  });

  it('old requests expire instead of being accepted', async () => {
    db.jobBoardIntroRequest.findFirst.mockResolvedValueOnce(pending({ createdAt: new Date(Date.now() - 15 * DAY) }));
    expect(await respondToIntro('u1', 'r1', 'accept', null)).toMatchObject({ ok: false, status: 410 });
  });

  it('the application links back only for their own accepted request, for that job', async () => {
    expect(await linkIntroApplication({ introId: 'r1', userId: null, listingId: 'L1', applicationId: 'a1' })).toBe(false);
    await linkIntroApplication({ introId: 'r1', userId: 'u1', listingId: 'L1', applicationId: 'a1' });
    expect((db.jobBoardIntroRequest.updateMany.mock.calls[0] as any)[0].where).toEqual({ id: 'r1', listingId: 'L1', status: 'ACCEPTED', applicationId: null, Profile: { webUserId: 'u1' } });
  });
});

describe('daily tidy-up', () => {
  it('expires unanswered requests after 14 days and deletes profiles 30 days after they end', async () => {
    const now = new Date('2027-03-01T00:00:00Z');
    await runNetworkMaintenance(now);
    const exp = (db.jobBoardIntroRequest.updateMany.mock.calls[0] as any)[0];
    expect(exp.where.status).toBe('PENDING');
    expect(exp.where.createdAt.lt.toISOString()).toBe('2027-02-15T00:00:00.000Z');
    expect((db.jobBoardOpenProfile.deleteMany.mock.calls[0] as any)[0].where.visibleUntil.lt.toISOString()).toBe('2027-01-30T00:00:00.000Z');
  });
});

describe('Add candidates dialog: network tab', () => {
  const call = () => getJobMatches(new NextRequest('http://x/api/employer/jobs/L1/network-matches'), { params: Promise.resolve({ id: 'L1' }) });

  it('says "not in pilot" so the tab stays hidden, for outsiders and job-limited interviewers alike', async () => {
    db.jobBoardEmployer.findUnique.mockResolvedValue(employer({ networkPilot: false }));
    expect(await (await call()).json()).toEqual({ pilot: false });
    db.jobBoardEmployer.findUnique.mockResolvedValue(employer());
    who.jobIds = ['L1'];
    expect(await (await call()).json()).toEqual({ pilot: false });
  });

  it('ranks anonymous cards by fit for this job, with no identity fields', async () => {
    db.jobBoardListing.findFirst.mockResolvedValueOnce({ skills: ['Python', 'PyTorch'], mustHaveSkills: ['PyTorch'], experienceMin: 2, experienceMax: 6 });
    db.jobBoardOpenProfile.findMany.mockResolvedValueOnce([
      profile('weak', 'a@gmail.com', { skills: ['Excel'] }),
      profile('strong', 'b@gmail.com', { skills: ['Python', 'PyTorch'] }),
    ]);
    const body = await (await call()).json();
    expect(body.pilot).toBe(true);
    expect(body.people.map((p: any) => p.id)).toEqual(['strong', 'weak']);
    expect(body.people[0].score).toBeGreaterThan(body.people[1].score);
    expect(JSON.stringify(body)).not.toContain('gmail.com');
  });

  it('a closed job shows no one', async () => {
    db.jobBoardListing.findFirst.mockResolvedValueOnce(null);
    expect(await (await call()).json()).toMatchObject({ pilot: true, jobOpen: false, people: [] });
  });
});
