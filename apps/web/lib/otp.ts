import crypto from "crypto";
import { prisma } from "@udyaibase/database";

const OTP_EXPIRY_MINUTES = 10;
const MAX_ATTEMPTS = 3;
const MAX_REQUESTS_PER_HOUR = 5;

/**
 * Generate a cryptographically secure 6-digit OTP.
 */
function generateOtp(): string {
  // Use crypto.randomInt for uniform distribution (no modulo bias)
  return crypto.randomInt(100000, 999999).toString();
}

// A 6-digit code has only a million values, so a plain hash of it could be reversed instantly from a leaked row.
// Codes are stored as an HMAC under OTP_HASH_SECRET: its own secret, so rotating the session (JWT) secrets never
// breaks codes in flight, and a leak of one doesn't expose the other. Required in production.
const IS_PROD = process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build';
const OTP_SECRET = process.env.OTP_HASH_SECRET || (IS_PROD ? '' : 'dev-only-otp-hash-secret');
if (IS_PROD && !OTP_SECRET) console.error('[security] OTP_HASH_SECRET is not set. Verification codes cannot be sent or checked until it is.');

function otpSecret(): string {
  if (!OTP_SECRET) throw new Error('OTP_HASH_SECRET is not set');
  return OTP_SECRET;
}

function legacyHash(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

/** How every verification code is stored (we never store plain codes). */
export function hashOtp(code: string): string {
  return crypto.createHmac("sha256", otpSecret()).update(code).digest("hex");
}

/**
 * Constant-time check of a code against a stored hash. Also accepts the old plain hash, so codes sent just before
 * this change keep working until they expire (10 minutes); that branch can be removed later.
 */
export function otpMatches(stored: string | null | undefined, code: string): boolean {
  if (!stored) return false;
  const a = Buffer.from(stored);
  for (const h of [hashOtp(code), legacyHash(code)]) {
    const b = Buffer.from(h);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }
  return false;
}

/**
 * Create and store a new OTP for an email.
 * Returns the plain OTP (to send via email) or null if rate limited.
 */
export async function createOtp(email: string, purpose: string = "signup"): Promise<{ otp: string | null; error?: string }> {
  const emailLower = email.toLowerCase();

  // Rate limit: max 5 OTP requests per email per hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentCount = await prisma.emailOtp.count({
    where: { email: emailLower, purpose, createdAt: { gte: oneHourAgo } },
  });

  if (recentCount >= MAX_REQUESTS_PER_HOUR) {
    return { otp: null, error: "Too many requests. Please try again later." };
  }

  // Invalidate any existing unused OTPs for this email+purpose
  await prisma.emailOtp.updateMany({
    where: { email: emailLower, purpose, verified: false },
    data: { verified: true }, // mark as used so they can't be reused
  });

  // Generate new OTP
  const plainOtp = generateOtp();
  const hashedCode = hashOtp(plainOtp);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await prisma.emailOtp.create({
    data: {
      email: emailLower,
      code: hashedCode,
      purpose,
      expiresAt,
    },
  });

  return { otp: plainOtp };
}

export type CodeCheck = { ok: true } | { ok: false; reason: "none" | "locked" | "wrong"; left: number };

/**
 * The one place an emailed code is checked, for every flow (sign-up, sign-in, startup claims, hiring team codes).
 * Works on the latest unused, unexpired code for this email and purpose.
 *
 * - The attempt is taken and the code read in a single statement. Reading first and counting afterwards let many
 *   requests sent at once all see "0 attempts used" and each get a guess.
 * - A code works once, even if the right answer arrives twice at the same moment.
 * - A right answer gives its attempt back, so one given on the last attempt still counts as proof afterwards.
 * - A code whose attempts are used up is retired (kept, marked used, attempts at the maximum: consumeVerifiedOtp
 *   tells it from a correct one by that) or deleted, as the caller's flow expects.
 *
 * `email` is matched as given: callers pass it the way they stored it.
 */
export async function checkEmailCode(email: string, purpose: string, code: string, opts: { whenSpent: "retire" | "delete" }): Promise<CodeCheck> {
  const claimed = await prisma.$queryRaw<{ id: string; attempts: number; code: string }[]>`
    UPDATE "EmailOtp" SET attempts = attempts + 1
    WHERE id = (
      SELECT id FROM "EmailOtp"
      WHERE email = ${email} AND purpose = ${purpose} AND verified = false AND "expiresAt" >= NOW()
      ORDER BY "createdAt" DESC LIMIT 1
    ) AND attempts < ${MAX_ATTEMPTS}
    RETURNING id, attempts, code
  `;
  const otp = claimed[0];

  if (!otp) {
    const spentWhere = { email, purpose, verified: false, expiresAt: { gte: new Date() }, attempts: { gte: MAX_ATTEMPTS } };
    const spent = opts.whenSpent === "delete"
      ? await prisma.emailOtp.deleteMany({ where: spentWhere })
      : await prisma.emailOtp.updateMany({ where: spentWhere, data: { verified: true } });
    return { ok: false, reason: spent.count ? "locked" : "none", left: 0 };
  }

  if (!otpMatches(otp.code, code)) {
    return { ok: false, reason: "wrong", left: MAX_ATTEMPTS - otp.attempts };
  }

  const used = await prisma.emailOtp.updateMany({
    where: { id: otp.id, verified: false },
    data: { verified: true, attempts: { decrement: 1 } },
  });
  return used.count ? { ok: true } : { ok: false, reason: "none", left: 0 };
}

/**
 * Verify an OTP code.
 * Returns true if valid, false if invalid/expired/too many attempts.
 */
export async function verifyOtp(email: string, code: string, purpose: string = "signup"): Promise<{ valid: boolean; error?: string }> {
  const r = await checkEmailCode(email.toLowerCase(), purpose, code, { whenSpent: "retire" });
  if (r.ok) return { valid: true };
  if (r.reason === "locked") return { valid: false, error: "Too many incorrect attempts. Please request a new code." };
  if (r.reason === "wrong") return { valid: false, error: `Incorrect code. ${r.left} attempt${r.left !== 1 ? "s" : ""} remaining.` };
  return { valid: false, error: "Code expired or not found. Please request a new one." };
}

/** How long a verified code stays valid as proof of email ownership for the next step. */
const PROOF_MAX_AGE_MINUTES = 30;

/**
 * Server-side proof that this email passed a code check moments ago (e.g. signup verifies the
 * code first, then creates the account in a second request). Consumes the proof so it can't be reused.
 * Codes invalidated after too many wrong attempts are also stored as verified, so `attempts` tells them apart.
 */
export async function consumeVerifiedOtp(email: string, purpose: string = "signup"): Promise<boolean> {
  const proof = await prisma.emailOtp.findFirst({
    where: {
      email: email.toLowerCase(),
      purpose,
      verified: true,
      attempts: { lt: MAX_ATTEMPTS },
      createdAt: { gte: new Date(Date.now() - PROOF_MAX_AGE_MINUTES * 60_000) },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!proof) return false;
  const used = await prisma.emailOtp.deleteMany({ where: { id: proof.id } });
  return used.count === 1;
}
