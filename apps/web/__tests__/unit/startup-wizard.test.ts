import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const findUnique = vi.fn();
vi.mock('@udyaibase/database', () => ({ prisma: { founderUser: { findUnique: (...a: unknown[]) => findUnique(...a) } } }));
const getFounderSession = vi.fn();
vi.mock('@/lib/founder-auth', () => ({ getFounderSession: () => getFounderSession() }));
const sendDomainCode = vi.fn();
const checkDomainCode = vi.fn();
vi.mock('@/lib/startups/domain-otp', () => ({
  sendDomainCode: (...a: unknown[]) => sendDomainCode(...a),
  checkDomainCode: (...a: unknown[]) => checkDomainCode(...a),
}));
vi.mock('@/lib/rate-limit', () => ({
  authRateLimit: null,
  checkRateLimit: async () => ({ success: true }),
  getClientIdentifier: () => 'test',
}));

import { listingDomainKey } from '@/lib/startups/listing-domain';
import { contactEmailConfirmed, signContactEmailProof } from '@/lib/startups/contact-email';
import { POST as contactEmail } from '@/app/api/founder/contact-email/route';

const post = (body: unknown) =>
  new NextRequest('http://x/api/founder/contact-email', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  findUnique.mockReset();
  getFounderSession.mockReset();
  sendDomainCode.mockReset();
  checkDomainCode.mockReset();
});

describe('listingDomainKey (duplicate check)', () => {
  it('treats every address on a company domain as the same startup', () => {
    for (const u of ['https://acme.ai', 'http://www.acme.ai/about', 'acme.ai', 'https://app.acme.ai/x?y=1']) expect(listingDomainKey(u)).toBe('acme.ai');
    expect(listingDomainKey('https://www.acme.co.in')).toBe('acme.co.in');
  });

  it('keeps the full host on free hosting, where each subdomain is a different company', () => {
    expect(listingDomainKey('https://acme.vercel.app')).toBe('acme.vercel.app');
    expect(listingDomainKey('https://other.vercel.app')).toBe('other.vercel.app');
    expect(listingDomainKey('https://vercel.app')).toBeNull();
  });

  it('ignores shared sites where the domain says nothing about the company', () => {
    expect(listingDomainKey('https://linkedin.com/company/acme')).toBeNull();
    expect(listingDomainKey('https://www.instagram.com/acme')).toBeNull();
  });

  it('ignores junk', () => {
    for (const u of ['', '   ', 'not a url', 'https://localhost', null, undefined]) expect(listingDomainKey(u as string)).toBeNull();
  });
});

describe('contact email proof', () => {
  it('accepts a proof only for the same founder and address', async () => {
    findUnique.mockResolvedValue(null);
    const proof = await signContactEmailProof('f1', 'Priya@Acme.ai');
    expect(await contactEmailConfirmed('f1', 'priya@acme.ai', proof)).toBe(true);
    expect(await contactEmailConfirmed('f2', 'priya@acme.ai', proof)).toBe(false);
    expect(await contactEmailConfirmed('f1', 'someone@acme.ai', proof)).toBe(false);
    expect(await contactEmailConfirmed('f1', 'priya@acme.ai', 'forged.token.value')).toBe(false);
    expect(await contactEmailConfirmed('f1', 'priya@acme.ai', null)).toBe(false);
  });

  it('needs no code for the founder’s own verified email', async () => {
    findUnique.mockResolvedValue({ email: 'priya@acme.ai', emailVerified: true, authProvider: 'email', companyEmail: null, companyEmailVerified: false });
    expect(await contactEmailConfirmed('f1', 'PRIYA@acme.ai', null)).toBe(true);
  });

  it('still needs a code when the sign-in email isn’t verified', async () => {
    findUnique.mockResolvedValue({ email: 'priya@acme.ai', emailVerified: false, authProvider: 'email', companyEmail: null, companyEmailVerified: false });
    expect(await contactEmailConfirmed('f1', 'priya@acme.ai', null)).toBe(false);
  });
});

describe('POST /api/founder/contact-email', () => {
  it('needs a founder session', async () => {
    getFounderSession.mockResolvedValue(null);
    expect((await contactEmail(post({ step: 'send', email: 'a@b.co' }))).status).toBe(401);
  });

  it('confirms the founder’s own verified email without sending anything', async () => {
    getFounderSession.mockResolvedValue({ userId: 'f1', name: 'Priya' });
    findUnique.mockResolvedValue({ email: 'priya@acme.ai', emailVerified: true, authProvider: 'email', companyEmail: null, companyEmailVerified: false });
    const data = await (await contactEmail(post({ step: 'check', email: 'priya@acme.ai' }))).json();
    expect(data.confirmed).toBe(true);
    expect(typeof data.proof).toBe('string');
    expect(sendDomainCode).not.toHaveBeenCalled();
  });

  it('a check for another address sends nothing and is not confirmed', async () => {
    getFounderSession.mockResolvedValue({ userId: 'f1', name: 'Priya' });
    findUnique.mockResolvedValue({ email: 'priya@acme.ai', emailVerified: true, authProvider: 'email', companyEmail: null, companyEmailVerified: false });
    const data = await (await contactEmail(post({ step: 'check', email: 'team@acme.ai' }))).json();
    expect(data.confirmed).toBe(false);
    expect(sendDomainCode).not.toHaveBeenCalled();
  });

  it('sends a code, then returns a proof for the right code', async () => {
    getFounderSession.mockResolvedValue({ userId: 'f1', name: 'Priya' });
    findUnique.mockResolvedValue(null);
    sendDomainCode.mockResolvedValue({ ok: true, cooldown: 60 });
    const sent = await (await contactEmail(post({ step: 'send', email: 'Team@Acme.ai' }))).json();
    expect(sent.sent).toBe(true);
    expect(sendDomainCode.mock.calls[0][0]).toMatchObject({ email: 'team@acme.ai', purpose: 'startup_contact:f1' });

    checkDomainCode.mockResolvedValue({ ok: true });
    const done = await (await contactEmail(post({ step: 'verify', email: 'team@acme.ai', code: '123456' }))).json();
    expect(done.confirmed).toBe(true);
    expect(await contactEmailConfirmed('f1', 'team@acme.ai', done.proof)).toBe(true);
  });

  it('rejects a wrong code and a bad address', async () => {
    getFounderSession.mockResolvedValue({ userId: 'f1', name: 'Priya' });
    findUnique.mockResolvedValue(null);
    checkDomainCode.mockResolvedValue({ ok: false, status: 400, error: 'Invalid code. 2 attempts remaining.' });
    expect((await contactEmail(post({ step: 'verify', email: 'team@acme.ai', code: '000000' }))).status).toBe(400);
    expect((await contactEmail(post({ step: 'send', email: 'not-an-email' }))).status).toBe(400);
  });
});
