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
    expect(canPublish({ ...base, emailVerified: false, startupClaimMethod: 'FOUNDER', Startup: { isVerified: true } }).code).toBe('email_unverified');
  });
});
