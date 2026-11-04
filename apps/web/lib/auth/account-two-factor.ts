import { NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { accountHasPassword, confirmAccountPassword } from '@/lib/founder/account';
import {
  decryptSecret, encryptSecret, generateBackupCodes, generateQRCode, generateTOTPSecret,
  hashBackupCodes, verifyBackupCode, verifyTOTPToken,
} from '@/lib/two-factor';

/**
 * Two-factor sign-in is one setting per person, stored once by email. Profile, Founder Settings and Event Host
 * settings are all windows onto this record, and every sign-in checks it. The old per-account columns are unused.
 */
const key = (email: string) => email.trim().toLowerCase();

export async function isTwoFactorOn(email: string): Promise<boolean> {
  const row = await prisma.accountTwoFactor.findUnique({ where: { email: key(email) }, select: { enabled: true } });
  return !!row?.enabled;
}

/** Checks a code or a backup code. A backup code works once. */
export async function verifyAccountCode(email: string, token: string, isBackupCode = false): Promise<boolean> {
  const row = await prisma.accountTwoFactor.findUnique({ where: { email: key(email) } });
  if (!row?.enabled || !row.secret) return false;
  if (!isBackupCode) return verifyTOTPToken(token, decryptSecret(row.secret));
  const index = await verifyBackupCode(token, row.backupCodes);
  if (index < 0) return false;
  const remaining = [...row.backupCodes];
  remaining.splice(index, 1);
  await prisma.accountTwoFactor.update({ where: { email: row.email }, data: { backupCodes: remaining } });
  return true;
}

/** Status for any settings page. */
export async function twoFactorStatusResponse(email: string) {
  return NextResponse.json({ success: true, enabled: await isTwoFactorOn(email), hasPassword: await accountHasPassword(key(email)) });
}

/** Setup for any settings page: `generate` starts it, `verify` proves the app works and turns it on. */
export async function twoFactorSetupResponse(email: string, body: { action?: string; token?: string }) {
  const address = key(email);
  if (body.action === 'generate') {
    const existing = await prisma.accountTwoFactor.findUnique({ where: { email: address }, select: { enabled: true } });
    if (existing?.enabled) return NextResponse.json({ success: false, error: 'Two-factor sign-in is already on.' }, { status: 400 });
    const { secret, otpauthUrl } = generateTOTPSecret(address);
    const qrCode = await generateQRCode(otpauthUrl);
    const encrypted = encryptSecret(secret);
    await prisma.accountTwoFactor.upsert({
      where: { email: address },
      create: { email: address, secret: encrypted, updatedAt: new Date() },
      update: { secret: encrypted, updatedAt: new Date() },
    });
    return NextResponse.json({ success: true, qrCode, secret });
  }

  if (body.action === 'verify') {
    if (!body.token || body.token.length !== 6) return NextResponse.json({ success: false, error: 'Enter a 6-digit code' }, { status: 400 });
    const row = await prisma.accountTwoFactor.findUnique({ where: { email: address } });
    if (!row?.secret) return NextResponse.json({ success: false, error: 'Start setup again.' }, { status: 400 });
    if (!verifyTOTPToken(body.token, decryptSecret(row.secret))) return NextResponse.json({ success: false, error: 'Invalid verification code' }, { status: 400 });
    const backupCodes = generateBackupCodes(10);
    await prisma.accountTwoFactor.update({
      where: { email: address },
      data: { enabled: true, backupCodes: await hashBackupCodes(backupCodes), updatedAt: new Date() },
    });
    return NextResponse.json({ success: true, backupCodes, message: '2FA enabled successfully' });
  }

  return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
}

/** Turning it off needs the password (when the account has one) and a current code or backup code. */
export async function twoFactorDisableCheck(email: string, body: { token?: string; password?: string; isBackupCode?: boolean }): Promise<{ ok: true } | { ok: false; response: NextResponse; wrongCode?: boolean }> {
  const fail = (error: string, status = 400, wrongCode = false) => ({ ok: false as const, response: NextResponse.json({ success: false, error }, { status }), wrongCode });
  if (!(await isTwoFactorOn(email))) return fail('Two-factor sign-in is not on.');
  if (!body.token) return fail('Verification code is required');
  if (!(await confirmAccountPassword(key(email), body.password))) return fail('Incorrect password', 401);
  if (!(await verifyAccountCode(email, body.token, !!body.isBackupCode))) return fail('Invalid verification code', 400, true);
  return { ok: true };
}

export async function turnOffTwoFactor(email: string): Promise<void> {
  await prisma.accountTwoFactor.deleteMany({ where: { email: key(email) } });
}

/** Keeps the setting when someone changes their email address. */
export async function moveTwoFactor(oldEmail: string, newEmail: string): Promise<void> {
  await prisma.accountTwoFactor.updateMany({ where: { email: key(oldEmail) }, data: { email: key(newEmail) } });
}
