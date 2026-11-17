import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const db = vi.hoisted(() => ({
  event: { findUnique: vi.fn() },
  eventTalkSubmission: { findFirst: vi.fn(async () => null), count: vi.fn(async () => 0), create: vi.fn(async () => ({})) },
  eventSponsor: { findUnique: vi.fn(), update: vi.fn(async () => ({})) },
  startup: { findUnique: vi.fn(async () => null) },
  eventSpeaker: { findUnique: vi.fn(), update: vi.fn(async () => ({})) },
}));
const limits = vi.hoisted(() => ({ blocked: new Set<string>(), keys: [] as string[] }));
const captcha = vi.hoisted(() => ({ ok: true }));
const mail = vi.hoisted(() => ({ received: vi.fn(async () => ({ success: true })) }));

vi.mock('@udyaibase/database', () => ({ prisma: db }));
vi.mock('@/lib/rate-limit', () => ({
  authRateLimit: {}, strictRateLimit: {}, apiRateLimit: {}, accountCodeRateLimit: {},
  checkRateLimit: async (_l: unknown, key: string) => { limits.keys.push(key); return { success: ![...limits.blocked].some((b) => key.startsWith(b)), reset: 0 }; },
  getClientIdentifier: () => 'ip', rateLimitMessage: () => 'Too many attempts.', retryAfterHeaders: () => ({}),
}));
vi.mock('@/lib/turnstile', () => ({ verifyTurnstileToken: async () => captcha.ok }));
vi.mock('@/lib/email/send', () => ({ sendEmailFireAndForget: vi.fn(), sendEmail: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/events/cfp', async (orig) => ({ ...(await orig<any>()), sendSubmissionReceived: mail.received }));
vi.mock('@/lib/revalidate', () => ({ refreshPaths: vi.fn() }));

import { POST as cfp } from '@/app/api/events/[slug]/cfp/route';
import { GET as sponsorClick } from '@/app/api/events/sponsors/[id]/click/route';
import { POST as speakerSave } from '@/app/api/speaker/portal/route';
import { sponsorReportCsv } from '@/lib/events/sponsors';
import { speakerLinkOpen, speakerPortalToken } from '@/lib/events/after-event';

process.env.NEXTAUTH_SECRET = 'test-secret-for-review-fixes-0123456789';
const proposal = { name: 'Asha Rao', email: 'victim@example.in', title: 'Shipping LLM agents', abstract: 'x'.repeat(60), format: 'Talk' };
const open = { id: 'e1', title: 'Summit', endAt: new Date(Date.now() + 864e5), status: 'PUBLISHED', deletedAt: null, cfpSettings: { open: true, formats: ['Talk'] }, agendaTracks: [], organizer: { email: 'host@x.in' } };
const cfpReq = (body: unknown) => cfp(new NextRequest('http://localhost/api/events/summit/cfp', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ slug: 'summit' }) });

beforeEach(() => { vi.clearAllMocks(); limits.blocked.clear(); limits.keys = []; captcha.ok = true; db.event.findUnique.mockResolvedValue(open); });

describe('#2 call for papers can’t be used to send spam', () => {
  it('needs the security check', async () => {
    captcha.ok = false;
    expect((await cfpReq(proposal)).status).toBe(403);
    expect(db.eventTalkSubmission.create).not.toHaveBeenCalled();
  });
  it('caps the confirmation email per address, whoever submits', async () => {
    expect((await cfpReq({ ...proposal, turnstileToken: 't' })).status).toBe(200);
    expect(mail.received).toHaveBeenCalledTimes(1);
    expect(limits.keys).toContain('cfp-received:victim@example.in');
    limits.blocked.add('cfp-received:');
    expect((await cfpReq({ ...proposal, title: 'Another title here', turnstileToken: 't' })).status).toBe(200);
    expect(mail.received).toHaveBeenCalledTimes(1);
  });
});

describe('#3 sponsor links don’t send people anywhere unchecked', () => {
  const click = () => sponsorClick(new NextRequest('http://localhost/api/events/sponsors/s1/click'), { params: Promise.resolve({ id: 's1' }) });
  const sponsor = (verified: boolean) => db.eventSponsor.findUnique.mockResolvedValue({ id: 's1', name: 'Acme', websiteUrl: 'https://scam.example.com/x', startupId: null, event: { organizer: { verifiedAt: verified ? new Date() : null } } });
  it('unverified organizer: a "You’re leaving Udyaibase" page, not a redirect', async () => {
    sponsor(false);
    const res = await click();
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('scam.example.com');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });
  it('verified organizer: straight to the sponsor', async () => {
    sponsor(true);
    const res = await click();
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://scam.example.com/x');
  });
});

describe('#5 sponsor report can’t carry spreadsheet formulas', () => {
  it('prefixes text starting with = + - @', () => {
    const csv = sponsorReportCsv('Summit', [{ name: '=HYPERLINK("http://x")', tier: 'GOLD', impressions: 10, clicks: 1 }]);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(csv).toContain('"10"');
  });
});

describe('#7 speaker links expire 30 days after the event', () => {
  it('works until then, refuses after', async () => {
    expect(speakerLinkOpen({ endAt: new Date(Date.now() - 29 * 864e5) })).toBe(true);
    expect(speakerLinkOpen({ endAt: new Date(Date.now() - 31 * 864e5) })).toBe(false);
    db.eventSpeaker.findUnique.mockResolvedValue({ id: 'sp1', event: { slug: 'summit', deletedAt: null, endAt: new Date(Date.now() - 40 * 864e5) } });
    const res = await speakerSave(new NextRequest('http://localhost/api/speaker/portal', { method: 'POST', body: JSON.stringify({ t: speakerPortalToken('sp1'), name: 'Asha Rao' }) }));
    expect(res.status).toBe(410);
    expect(db.eventSpeaker.update).not.toHaveBeenCalled();
  });
});
