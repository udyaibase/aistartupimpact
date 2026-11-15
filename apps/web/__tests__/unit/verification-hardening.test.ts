import { describe, it, expect, vi } from 'vitest';
import crypto from 'crypto';

vi.mock('@udyaibase/database', () => ({ prisma: {} }));

import { hashOtp, otpMatches } from '@/lib/otp';
import { emailMatchesDomain } from '@/lib/jobs/trust';
import { emailVerificationDomain, listingDomainKey } from '@/lib/startups/listing-domain';
import { isPlatformPage, registrableDomain, websiteDomain } from '@udyaibase/utils';
import { formatCountdown, maskEmail } from '@/lib/ui/code-entry';

describe('stored verification codes', () => {
  it('are not a plain SHA-256 of the code (that could be reversed from a leaked row)', () => {
    const plain = crypto.createHash('sha256').update('123456').digest('hex');
    expect(hashOtp('123456')).not.toBe(plain);
    expect(hashOtp('123456')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('match the right code only, and still accept codes stored the old way until they expire', () => {
    expect(otpMatches(hashOtp('123456'), '123456')).toBe(true);
    expect(otpMatches(hashOtp('123456'), '654321')).toBe(false);
    expect(otpMatches(crypto.createHash('sha256').update('123456').digest('hex'), '123456')).toBe(true);
    expect(otpMatches(null, '123456')).toBe(false);
    expect(otpMatches('short', '123456')).toBe(false);
  });
});

describe('company domain rule (Public Suffix List)', () => {
  it('vercel.app-style hosting: each subdomain is its own domain, and the platform’s mailbox never matches it', () => {
    expect(registrableDomain('acme.vercel.app')).toBe('acme.vercel.app');
    expect(websiteDomain('https://acme.vercel.app')).toBe('acme.vercel.app');
    expect(emailMatchesDomain('dev@vercel.app', websiteDomain('https://acme.vercel.app')!)).toBe(false);
    expect(websiteDomain('https://vercel.app')).toBeNull();
    // No mailbox exists on a hosting suffix, so email isn't offered; DNS or support instead.
    expect(emailVerificationDomain('https://acme.netlify.app')).toBeNull();
    expect(emailVerificationDomain('https://acme.notion.site')).toBeNull();
  });

  it('pages on big platforms are not a company domain', () => {
    for (const u of ['https://sites.google.com/view/acme', 'https://www.linkedin.com/company/acme', 'https://linktr.ee/acme', 'https://play.google.com/store/apps/details?id=ai.acme']) {
      expect(isPlatformPage(u)).toBe(true);
      expect(websiteDomain(u)).toBeNull();
      expect(emailVerificationDomain(u)).toBeNull();
    }
    expect(emailMatchesDomain('anyone@google.com', websiteDomain('https://sites.google.com/view/acme') ?? '')).toBe(false);
  });

  it('a platform’s own root site is a real company and verifies by email as normal', () => {
    for (const [u, d] of [['https://google.com', 'google.com'], ['https://www.linkedin.com/', 'linkedin.com']]) {
      expect(isPlatformPage(u)).toBe(false);
      expect(emailVerificationDomain(u)).toBe(d);
    }
    expect(emailMatchesDomain('someone@google.com', 'google.com')).toBe(true);
  });

  it('www. and app. subdomains belong to the company domain', () => {
    expect(websiteDomain('https://www.acme.ai')).toBe('acme.ai');
    expect(websiteDomain('https://app.acme.ai/login')).toBe('acme.ai');
    expect(emailMatchesDomain('priya@mail.acme.ai', 'acme.ai')).toBe(true);
    expect(listingDomainKey('http://www.acme.ai/about')).toBe(listingDomainKey('https://app.acme.ai'));
  });

  it('.co.in and .com.au style suffixes', () => {
    expect(websiteDomain('https://www.acme.co.in')).toBe('acme.co.in');
    expect(websiteDomain('https://app.acme.com.au')).toBe('acme.com.au');
    expect(emailMatchesDomain('priya@acme.co.in', 'acme.co.in')).toBe(true);
    expect(emailMatchesDomain('priya@other.co.in', 'acme.co.in')).toBe(false);
  });

  it('uppercase emails and addresses', () => {
    expect(emailMatchesDomain('PRIYA@ACME.AI', 'acme.ai')).toBe(true);
    expect(websiteDomain('HTTPS://WWW.ACME.AI')).toBe('acme.ai');
  });

  it('free mail never counts', () => {
    expect(emailMatchesDomain('priya@gmail.com', 'gmail.com')).toBe(false);
  });
});

describe('code entry helpers', () => {
  it('masks where the code went', () => {
    expect(maskEmail('priya@acme.ai')).toBe('pr***@acme.ai');
    expect(maskEmail('a@acme.ai')).toBe('a***@acme.ai');
  });
  it('shows the resend countdown as m:ss', () => {
    expect(formatCountdown(42)).toBe('0:42');
    expect(formatCountdown(75)).toBe('1:15');
    expect(formatCountdown(0)).toBe('0:00');
  });
});
