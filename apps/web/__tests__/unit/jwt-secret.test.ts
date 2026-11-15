import { describe, it, expect, vi } from 'vitest';
import { SignJWT, jwtVerify } from 'jose';
import { jwtSecret, missingSecrets } from '@/lib/jwt-secret';

describe('jwtSecret', () => {
  it('uses the configured value', () => {
    expect(jwtSecret('abc', 'X_SECRET')).toEqual(new TextEncoder().encode('abc'));
  });

  it('never returns an empty key when the variable is missing', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const key = jwtSecret(undefined, 'MISSING_TEST_SECRET');
    expect(key.length).toBe(32);
    expect(jwtSecret('', 'MISSING_TEST_SECRET')).toBe(key); // same key for the life of the server, logged once
    expect(log).toHaveBeenCalledTimes(1);

    // A token forged with an empty key (what a missing secret used to mean) is rejected.
    const forged = await new SignJWT({ employerId: 'any' }).setProtectedHeader({ alg: 'HS256' }).sign(new Uint8Array(0));
    await expect(jwtVerify(forged, key)).rejects.toThrow();
    log.mockRestore();
  });

  it('lists required secrets that are not set', () => {
    expect(missingSecrets({ USER_JWT_SECRET: 'a', FOUNDER_JWT_SECRET: 'b', NEXTAUTH_SECRET: 'c' })).toEqual(['EMPLOYER_JWT_SECRET']);
  });
});
