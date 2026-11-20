import { describe, it, expect } from 'vitest';
import { canPublish } from '@/lib/jobs/trust';

const base = { emailVerified: true, startupId: 's1' };

describe('canPublish: only a verified startup’s own workspace can publish jobs', () => {
  it('founder-opened workspace of a verified startup → can publish', () => {
    expect(canPublish({ ...base, startupClaimMethod: 'FOUNDER', Startup: { isVerified: true } }).ok).toBe(true);
    expect(canPublish({ ...base, startupClaimMethod: 'ADMIN', Startup: { isVerified: true } }).ok).toBe(true);
  });

  it('someone who merely links a verified startup (e.g. Sarvam) cannot publish under its name', () => {
    const r = canPublish({ ...base, startupClaimMethod: null, Startup: { isVerified: true } });
    expect(r).toMatchObject({ ok: false, code: 'startup_unverified' });
  });

  it('a trusted link is not enough while the startup itself is unverified', () => {
    expect(canPublish({ ...base, startupClaimMethod: 'FOUNDER', Startup: { isVerified: false } }).ok).toBe(false);
    expect(canPublish({ ...base, startupClaimMethod: 'LEGACY_UNVERIFIED', Startup: { isVerified: true } }).ok).toBe(false);
  });

  it('no startup → no jobs; unverified email → blocked first', () => {
    expect(canPublish({ emailVerified: true, startupId: null, startupClaimMethod: null, Startup: null }).ok).toBe(false);
    expect(canPublish({ ...base, emailVerified: false, startupClaimMethod: 'FOUNDER', Startup: { isVerified: true } })).toMatchObject({ ok: false, code: 'email_unverified' });
  });
});

describe('canPublish: the admin company check for workspaces without a founder-verified startup', () => {
  const ws = { emailVerified: true, startupId: 's1', startupClaimMethod: null, Startup: { isVerified: false }, websiteUrl: 'https://acme.ai' };

  it('a work email on the company’s domain can ask for the check; others can only ask their founder', () => {
    expect(canPublish(ws, 'asha@acme.ai')).toMatchObject({ ok: false, code: 'review_needed' });
    expect(canPublish(ws, 'asha@careers.acme.ai')).toMatchObject({ ok: false, code: 'review_needed' });
    expect(canPublish(ws, 'asha@gmail.com')).toMatchObject({ ok: false, code: 'startup_unverified' });
    expect(canPublish(ws, 'asha@other.ai')).toMatchObject({ ok: false, code: 'startup_unverified' });
    expect(canPublish({ ...ws, websiteUrl: null }, 'asha@acme.ai')).toMatchObject({ ok: false, code: 'startup_unverified' });
  });

  it('pending waits, approved allows 2 live jobs, rejected shows the note', () => {
    expect(canPublish({ ...ws, companyReview: 'PENDING' }, 'asha@acme.ai')).toMatchObject({ ok: false, code: 'review_pending' });
    expect(canPublish({ ...ws, companyReview: 'APPROVED' }, 'x@gmail.com')).toEqual({ ok: true, tier: 'reviewed', maxLive: 2 });
    const r = canPublish({ ...ws, companyReview: 'REJECTED', companyReviewNote: 'website is down' }, 'asha@acme.ai');
    expect(r).toMatchObject({ ok: false, code: 'review_rejected' });
    expect(!r.ok && r.reason).toContain('website is down');
  });

  it('a founder-verified startup is always the full tier, whatever the check says', () => {
    expect(canPublish({ ...ws, startupClaimMethod: 'FOUNDER', Startup: { isVerified: true }, companyReview: 'REJECTED' })).toEqual({ ok: true, tier: 'verified' });
  });
});

describe('an employer verified by an admin counts as verified', () => {
  const unproven = { emailVerified: true, startupId: 's1', startupClaimMethod: 'LEGACY_UNVERIFIED', Startup: { isVerified: false } };

  it('publishes as a verified company, without the checked-company job limit', () => {
    expect(canPublish({ ...unproven, isVerified: true })).toEqual({ ok: true, tier: 'verified' });
    expect(canPublish({ emailVerified: true, isVerified: true, startupId: null, startupClaimMethod: null, Startup: null })).toEqual({ ok: true, tier: 'verified' });
  });

  it('still needs a confirmed email, and without the admin switch nothing changes', () => {
    expect(canPublish({ ...unproven, isVerified: true, emailVerified: false })).toMatchObject({ ok: false, code: 'email_unverified' });
    expect(canPublish({ ...unproven, isVerified: false })).toMatchObject({ ok: false, code: 'startup_unverified' });
    expect(canPublish({ ...unproven })).toMatchObject({ ok: false });
  });

  it('whoever shows the public tick can publish as verified, except a proven link to a startup its founder hasn’t verified', async () => {
    const { showsVerifiedTick, isCompanyVerified } = await import('@/lib/jobs/trust');
    const cases = [
      { isVerified: true, startupId: null, startupClaimMethod: null, Startup: null },
      { isVerified: false, startupId: 's1', startupClaimMethod: 'FOUNDER', Startup: { isVerified: true } },
      { isVerified: false, startupId: 's1', startupClaimMethod: 'SELF', Startup: { isVerified: true } },
      { isVerified: false, startupId: null, startupClaimMethod: null, Startup: null },
    ];
    for (const c of cases) expect(isCompanyVerified(c)).toBe(showsVerifiedTick(c));
    // The one remaining difference, left as it was: the tick follows the proven link alone.
    const provenLinkOnly = { isVerified: false, startupId: 's1', startupClaimMethod: 'FOUNDER', Startup: { isVerified: false } };
    expect(showsVerifiedTick(provenLinkOnly)).toBe(true);
    expect(isCompanyVerified(provenLinkOnly)).toBe(false);
  });
});
