import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const APP_NAME = 'Udyaibase Admin';

/** Development-only fallback. Production refuses to encrypt or decrypt without ENCRYPTION_KEY. */
const DEV_FALLBACK_KEY = 'default-encryption-key-change-in-production';

export class TwoFactorConfigError extends Error {
  constructor() {
    super('Two-factor authentication is not configured on this server (ENCRYPTION_KEY is missing).');
    this.name = 'TwoFactorConfigError';
  }
}

function encryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key && process.env.NODE_ENV === 'production') throw new TwoFactorConfigError();
  return crypto.createHash('sha256').update(key || DEV_FALLBACK_KEY).digest();
}

export function generateTOTPSecret(email: string) {
  const secret = speakeasy.generateSecret({
    name: `${APP_NAME} (${email})`,
    issuer: APP_NAME,
    length: 32,
  });
  return { secret: secret.base32, otpauthUrl: secret.otpauth_url! };
}

export async function generateQRCode(otpauthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpauthUrl);
}

/** Accepts the current 30-second code and one step either side (clock drift), nothing wider. */
export function verifyTOTPToken(token: string, secret: string): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  return speakeasy.totp.verify({ secret, encoding: 'base32', token, window: 1 });
}

export function generateBackupCodes(count = 10): string[] {
  return Array.from({ length: count }, () => crypto.randomBytes(4).toString('hex').toUpperCase());
}

export async function hashBackupCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((code) => bcrypt.hash(code, 10)));
}

/** Backup codes are shown as 8 uppercase hex characters; accept them with spaces/dashes and in any case. */
export function normalizeBackupCode(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase();
}

export async function verifyBackupCode(code: string, hashedCodes: string[]): Promise<number> {
  const normalized = normalizeBackupCode(code);
  if (!/^[0-9A-F]{8}$/.test(normalized)) return -1;
  for (let i = 0; i < hashedCodes.length; i++) {
    if (await bcrypt.compare(normalized, hashedCodes[i])) return i;
  }
  return -1;
}

/** AES-256-GCM (authenticated): "v2:iv:tag:ciphertext". */
export function encryptSecret(secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return ['v2', iv.toString('hex'), cipher.getAuthTag().toString('hex'), encrypted.toString('hex')].join(':');
}

/** Reads both the current format and the earlier AES-256-CBC "iv:ciphertext" format. */
export function decryptSecret(encryptedSecret: string): string {
  const key = encryptionKey();
  const parts = encryptedSecret.split(':');
  if (parts[0] === 'v2' && parts.length === 4) {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parts[1], 'hex'));
    decipher.setAuthTag(Buffer.from(parts[2], 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(parts[3], 'hex')), decipher.final()]).toString('utf8');
  }
  const [ivHex, encrypted] = parts;
  if (parts.length !== 2 || !ivHex || !encrypted) throw new Error('Invalid encrypted secret format');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
  return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
}

// ── Proof that this sign-in passed 2FA ──────────────────────────────────────
// The browser can ask next-auth to update the session with any data, so "I passed" from the client means nothing.
// After checking a code, the server returns a short-lived proof signed with NEXTAUTH_SECRET and bound to the
// user and to this sign-in (sid). The jwt callback only marks the session verified when the proof checks out.

const PROOF_TTL_MS = 2 * 60 * 1000;

function proofSignature(userId: string, sid: string, exp: number): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('NEXTAUTH_SECRET is not set');
  return crypto.createHmac('sha256', secret).update(`2fa-proof:${userId}:${sid}:${exp}`).digest('base64url');
}

export function createTwoFactorProof(userId: string, sid: string, now = Date.now()): string {
  const exp = now + PROOF_TTL_MS;
  return `${exp}.${proofSignature(userId, sid, exp)}`;
}

export function verifyTwoFactorProof(proof: unknown, userId: unknown, sid: unknown, now = Date.now()): boolean {
  if (typeof proof !== 'string' || typeof userId !== 'string' || typeof sid !== 'string' || !userId || !sid) return false;
  const [expStr, sig] = proof.split('.');
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < now || !sig) return false;
  const expected = Buffer.from(proofSignature(userId, sid, exp));
  const given = Buffer.from(sig);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}
