import { describe, it, expect, vi, afterEach } from 'vitest';
import crypto from 'crypto';

process.env.NEXTAUTH_SECRET = 'test-otp-secret-for-testing';

import { generateOTP, verifyOTP } from '@/lib/action-otp';

const USER = 'founder-1';
const ACTION = 'role_change';

describe('action-otp', () => {
  afterEach(() => vi.useRealTimers());

  describe('generateOTP', () => {
    it('returns a 6-digit code and a base64url token', () => {
      const { code, token } = generateOTP(USER, ACTION);
      expect(code).toMatch(/^\d{6}$/);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('generates different codes and tokens each time', () => {
      const made = Array.from({ length: 20 }, () => generateOTP(USER, ACTION));
      expect(new Set(made.map((m) => m.code)).size).toBeGreaterThan(1);
      expect(new Set(made.map((m) => m.token)).size).toBeGreaterThan(1);
    });
  });

  describe('verifyOTP', () => {
    it('verifies the correct code for the same founder and action', () => {
      const { code, token } = generateOTP(USER, ACTION);
      expect(verifyOTP(token, code, USER, ACTION)).toEqual({ valid: true });
    });

    it('rejects a wrong code', () => {
      const { code, token } = generateOTP(USER, ACTION);
      const wrong = code === '000000' ? '111111' : '000000';
      expect(verifyOTP(token, wrong, USER, ACTION)).toEqual({ valid: false, error: 'Incorrect code' });
    });

    it('rejects the right code for another founder or another action', () => {
      const { code, token } = generateOTP(USER, ACTION);
      expect(verifyOTP(token, code, 'founder-2', ACTION).valid).toBe(false);
      expect(verifyOTP(token, code, USER, 'revoke').valid).toBe(false);
    });

    it('rejects malformed and empty tokens', () => {
      expect(verifyOTP('tampered-token-data', '123456', USER, ACTION)).toEqual({ valid: false, error: 'Invalid verification token' });
      expect(verifyOTP('', '123456', USER, ACTION)).toEqual({ valid: false, error: 'Invalid verification token' });
    });

    it('rejects a token after 10 minutes', () => {
      vi.useFakeTimers();
      const { code, token } = generateOTP(USER, ACTION);
      vi.advanceTimersByTime(10 * 60 * 1000 + 1);
      expect(verifyOTP(token, code, USER, ACTION)).toEqual({ valid: false, error: 'Code expired — request a new one' });
    });

    it('rejects a token whose expiry was extended', () => {
      const { code, token } = generateOTP(USER, ACTION);
      const decoded = JSON.parse(Buffer.from(token, 'base64url').toString());
      decoded.e += 60 * 60 * 1000;
      const modified = Buffer.from(JSON.stringify(decoded)).toString('base64url');
      expect(verifyOTP(modified, code, USER, ACTION).valid).toBe(false);
    });

    it('the token does not reveal the code: no plain hash of any 6-digit code appears in it', () => {
      const { code, token } = generateOTP(USER, ACTION);
      const { m } = JSON.parse(Buffer.from(token, 'base64url').toString());
      expect(m).not.toBe(crypto.createHash('sha256').update(code).digest('hex'));
    });
  });
});
