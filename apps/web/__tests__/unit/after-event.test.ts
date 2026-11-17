import { describe, it, expect, vi, beforeEach } from 'vitest';

const { prisma, sendEmail } = vi.hoisted(() => {
  process.env.NEXTAUTH_SECRET ??= 'test-only-secret';
  const prisma = {
    eventOrganizer: { findUnique: vi.fn() },
    eventEmailCampaign: { count: vi.fn(), create: vi.fn(), update: vi.fn() },
    eventRegistration: { findMany: vi.fn(), findUnique: vi.fn() },
    webUser: { findMany: vi.fn() },
    event: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    eventCertificate: { createMany: vi.fn() },
  };
  return { prisma, sendEmail: vi.fn() };
});
vi.mock('@udyaibase/database', () => ({ prisma }));
vi.mock('@/lib/email/send', () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));

import {
  certificateSettings, fillTemplate, followUpSettings, followUpsLeft, hostOptOutToken, isCertificateCode, newCertificateCode, verifyHostOptOutToken,
} from '@/lib/events/after-event';
import { followUpEmailHtml, sendFollowUp } from '@/lib/events/follow-ups';
import { issueCertificates, eventPlaceText, linkedInAddUrl } from '@/lib/events/certificates';

const reg = (over: Record<string, unknown>) => ({ id: 'r1', userId: null, guestName: 'Priya Sharma', guestEmail: 'priya@x.co', checkedInAt: null, hostEmailsOptOutAt: null, certificate: null, ...over });

beforeEach(() => {
  Object.values(prisma).forEach((m) => Object.values(m).forEach((f) => (f as ReturnType<typeof vi.fn>).mockReset()));
  sendEmail.mockReset(); sendEmail.mockResolvedValue({ success: true });
  prisma.webUser.findMany.mockResolvedValue([]);
});

describe('certificate codes', () => {
  it('are 16 unambiguous characters and never repeat', () => {
    const codes = new Set(Array.from({ length: 2000 }, () => newCertificateCode()));
    expect(codes.size).toBe(2000);
    for (const c of codes) expect(isCertificateCode(c)).toBe(true);
    expect(isCertificateCode('K7QX9M2PZR4TWB8N')).toBe(true);
    for (const bad of ['k7qx9m2pzr4twb8n', 'K7QX9M2PZR4TWB8', 'O0I1O0I1O0I1O0I1', '../etc/passwd', 42]) expect(isCertificateCode(bad)).toBe(false);
  });
});

describe('opt-out links', () => {
  it('round-trip, and can’t be forged or pointed at someone else', () => {
    const t = hostOptOutToken('reg-123');
    expect(verifyHostOptOutToken(t)).toBe('reg-123');
    expect(verifyHostOptOutToken(t.replace('reg-123', 'reg-999'))).toBeNull();
    expect(verifyHostOptOutToken(`${t.slice(0, -1)}x`)).toBeNull();
    expect(verifyHostOptOutToken('nonsense')).toBeNull();
    expect(verifyHostOptOutToken(undefined)).toBeNull();
  });
});

describe('settings', () => {
  it('fill sensible defaults and refuse junk', () => {
    expect(certificateSettings({ template: 'evil', audience: 'X', signatureUrl: 'javascript:alert(1)' })).toMatchObject({ template: 'classic', audience: 'CHECKED_IN', signatureUrl: null, autoIssue: false });
    const f = followUpSettings(null, 'GenAI Meetup');
    expect(f.attendedSubject).toBe('Thanks for coming to GenAI Meetup');
    expect(f.includeMissed).toBe(true);
    expect(fillTemplate('Hi {name}, thanks for {EVENT}', { name: 'Priya', event: 'GenAI Meetup' })).toBe('Hi Priya, thanks for GenAI Meetup');
  });
});

describe('follow-up allowance', () => {
  it('Free hosts get one per event; Pro is unlimited', async () => {
    prisma.eventOrganizer.findUnique.mockResolvedValue({ plan: 'FREE', planExpiresAt: null, email: 'host@x.co' });
    prisma.eventEmailCampaign.count.mockResolvedValue(0);
    expect(await followUpsLeft({ id: 'e1', organizerId: 'o1' })).toBe(1);
    prisma.eventEmailCampaign.count.mockResolvedValue(1);
    expect(await followUpsLeft({ id: 'e1', organizerId: 'o1' })).toBe(0);
    prisma.eventOrganizer.findUnique.mockResolvedValue({ plan: 'PRO', planExpiresAt: new Date(Date.now() + 9e8), email: 'host@x.co' });
    expect(await followUpsLeft({ id: 'e1', organizerId: 'o1' })).toBeNull();
  });
});

describe('follow-up emails', () => {
  const event = { id: 'e1', slug: 'genai', title: 'GenAI Meetup', organizerId: 'o1', startAt: new Date(Date.now() - 864e5), endAt: new Date(Date.now() - 36e5), status: 'PUBLISHED', followUpSettings: null, organizer: { name: 'Ravi', company: 'Acme AI', email: 'ravi@acme.ai' } };

  it('thanks attendees (with their certificate), says sorry to no-shows, and skips people who opted out', async () => {
    prisma.event.findFirst.mockResolvedValue(event);
    prisma.eventOrganizer.findUnique.mockResolvedValue({ plan: 'FREE', planExpiresAt: null, email: 'ravi@acme.ai' });
    prisma.eventEmailCampaign.count.mockResolvedValue(0);
    prisma.eventEmailCampaign.create.mockResolvedValue({ id: 'c1' });
    prisma.eventRegistration.findMany.mockResolvedValue([
      reg({ id: 'a', guestEmail: 'came@x.co', checkedInAt: new Date(), certificate: { code: 'K7QX9M2PZR4TWB8N', revokedAt: null } }),
      reg({ id: 'b', guestEmail: 'missed@x.co' }),
      reg({ id: 'c', guestEmail: 'stop@x.co', checkedInAt: new Date(), hostEmailsOptOutAt: new Date() }),
    ]);
    const r = await sendFollowUp('e1');
    expect(r).toMatchObject({ ok: true, sent: 2, attended: 1, missed: 1, skipped: 1 });
    const to = sendEmail.mock.calls.map((c) => c[0].to);
    expect(to).toEqual(expect.arrayContaining(['came@x.co', 'missed@x.co']));
    expect(to).not.toContain('stop@x.co');
    const thanks = sendEmail.mock.calls.find((c) => c[0].to === 'came@x.co')![0];
    expect(thanks.subject).toBe('Thanks for coming to GenAI Meetup');
    expect(thanks.html).toContain('/certificates/K7QX9M2PZR4TWB8N');
    expect(thanks.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    const sorry = sendEmail.mock.calls.find((c) => c[0].to === 'missed@x.co')![0];
    expect(sorry.subject).toBe('Sorry we missed you at GenAI Meetup');
    expect(sorry.html).not.toContain('/certificates/');
    expect(prisma.eventEmailCampaign.create.mock.calls[0][0].data).toMatchObject({ kind: 'FOLLOW_UP', eventId: 'e1' });
  });

  it('stops a Free host’s second follow-up', async () => {
    prisma.event.findFirst.mockResolvedValue(event);
    prisma.eventOrganizer.findUnique.mockResolvedValue({ plan: 'FREE', planExpiresAt: null, email: 'ravi@acme.ai' });
    prisma.eventEmailCampaign.count.mockResolvedValue(1);
    expect(await sendFollowUp('e1')).toMatchObject({ ok: false, status: 402 });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('won’t send before the event starts', async () => {
    prisma.event.findFirst.mockResolvedValue({ ...event, startAt: new Date(Date.now() + 864e5) });
    expect(await sendFollowUp('e1')).toMatchObject({ ok: false, status: 400 });
  });

  it('escapes the host’s message', () => {
    const html = followUpEmailHtml({ message: 'Hi <script>x</script>\n\nBye', hostName: 'A&B', eventTitle: 'E', eventUrl: 'https://u/e', optOutUrl: 'https://u/o' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('A&amp;B');
  });
});

describe('issuing certificates', () => {
  it('only checked-in people by default, and only those without one (safe to re-run)', async () => {
    prisma.event.findUnique.mockResolvedValue({ certificateSettings: { template: 'modern' } });
    prisma.eventRegistration.findMany.mockResolvedValue([
      reg({ id: 'a', checkedInAt: new Date() }),
      reg({ id: 'b', checkedInAt: new Date(), certificate: { code: 'K7QX9M2PZR4TWB8N', revokedAt: null } }),
      reg({ id: 'c' }),
    ]);
    const r = await issueCertificates('e1');
    expect(r).toEqual({ issued: 1, eligible: 2 });
    const rows = prisma.eventCertificate.createMany.mock.calls[0][0];
    expect(rows.skipDuplicates).toBe(true);
    expect(rows.data).toHaveLength(1);
    expect(rows.data[0]).toMatchObject({ eventId: 'e1', registrationId: 'a', recipientName: 'Priya Sharma' });
    expect(isCertificateCode(rows.data[0].code)).toBe(true);
  });

  it('everyone registered when the host chose that', async () => {
    prisma.event.findUnique.mockResolvedValue({ certificateSettings: { audience: 'REGISTERED' } });
    prisma.eventRegistration.findMany.mockResolvedValue([reg({ id: 'a', checkedInAt: new Date() }), reg({ id: 'c' })]);
    expect(await issueCertificates('e1')).toEqual({ issued: 2, eligible: 2 });
  });
});

describe('certificate helpers', () => {
  it('place and LinkedIn link', () => {
    expect(eventPlaceText({ format: 'VIRTUAL', venueName: null, address: null })).toBe('Online');
    expect(eventPlaceText({ format: 'IN_PERSON', venueName: 'NIMHANS', address: '1 MG Road, Bengaluru, Karnataka 560001, India' })).toBe('Bengaluru');
    const url = new URL(linkedInAddUrl({ title: 'Certificate of Participation', eventTitle: 'GenAI Meetup', hostName: 'Acme AI', issuedAt: new Date('2026-11-16'), code: 'K7QX9M2PZR4TWB8N' }));
    expect(url.hostname).toBe('www.linkedin.com');
    expect(url.searchParams.get('certId')).toBe('K7QX9M2PZR4TWB8N');
    expect(url.searchParams.get('organizationName')).toBe('Acme AI');
    expect(url.searchParams.get('issueMonth')).toBe('11');
  });
});
