import { describe, it, expect } from 'vitest';
import { newVerifyToken, storedVerifyToken, verifyTokenIssuedAt } from '@/lib/organizer-auth/verify-token';
import { describeDevice } from '@/lib/organizer-auth/device';
import { meetingProof, meetingProofValid } from '@/lib/integrations/meeting-proof';

describe('email confirmation tokens are stored hashed', () => {
  it('the stored form is derived from the link, never equal to it', () => {
    const { link, stored } = newVerifyToken(1_763_000_000_000);
    expect(stored).not.toContain(link.split('.')[0]);
    expect(stored.startsWith('verify:')).toBe(true);
    expect(storedVerifyToken(link)).toBe(stored);
    expect(verifyTokenIssuedAt(link)).toBe(1_763_000_000_000);
  });

  it('rejects anything that is not a link token', () => {
    const { stored } = newVerifyToken();
    expect(storedVerifyToken(stored)).toBeNull();
    expect(storedVerifyToken('reset:abc')).toBeNull();
    expect(storedVerifyToken('abc.123')).toBeNull();
    expect(storedVerifyToken(`${'a'.repeat(64)}.1763000000000.x`)).toBeNull();
  });
});

describe('signed-in devices get a readable name', () => {
  it.each([
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36', 'Chrome on macOS'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', 'Safari on iOS'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 Edg/128.0', 'Edge on Windows'],
    ['Mozilla/5.0 (Android 14; Mobile; rv:129.0) Gecko/129.0 Firefox/129.0', 'Firefox on Android'],
    [null, 'Unknown device'],
  ])('%s', (ua, name) => {
    expect(describeDevice(ua)).toBe(name);
  });
});

describe('meeting ids need proof they came from this workspace', () => {
  it('accepts its own proof and nothing else', () => {
    const proof = meetingProof('org-1', 'zoom', '987654');
    expect(meetingProofValid('org-1', 'zoom', '987654', proof)).toBe(true);
    expect(meetingProofValid('org-2', 'zoom', '987654', proof)).toBe(false);
    expect(meetingProofValid('org-1', 'zoom', '111111', proof)).toBe(false);
    expect(meetingProofValid('org-1', 'google', '987654', proof)).toBe(false);
    expect(meetingProofValid('org-1', 'zoom', '987654', undefined)).toBe(false);
    expect(meetingProofValid('org-1', 'zoom', '987654', 'short')).toBe(false);
  });
});
