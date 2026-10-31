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

/**
 * Hash an OTP for storage (we don't store plain codes).
 */
function hashOtp(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
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

/**
 * Verify an OTP code.
 * Returns true if valid, false if invalid/expired/too many attempts.
 */
export async function verifyOtp(email: string, code: string, purpose: string = "signup"): Promise<{ valid: boolean; error?: string }> {
  const emailLower = email.toLowerCase();
  const hashedCode = hashOtp(code);

  // Find the latest unverified OTP for this email+purpose
  const otpRecord = await prisma.emailOtp.findFirst({
    where: {
      email: emailLower,
      purpose,
      verified: false,
      expiresAt: { gte: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!otpRecord) {
    return { valid: false, error: "Code expired or not found. Please request a new one." };
  }

  // Check attempts
  if (otpRecord.attempts >= MAX_ATTEMPTS) {
    // Invalidate this OTP
    await prisma.emailOtp.update({ where: { id: otpRecord.id }, data: { verified: true } });
    return { valid: false, error: "Too many incorrect attempts. Please request a new code." };
  }

  // Verify code
  if (otpRecord.code !== hashedCode) {
    // Increment attempts
    await prisma.emailOtp.update({ where: { id: otpRecord.id }, data: { attempts: otpRecord.attempts + 1 } });
    const remaining = MAX_ATTEMPTS - otpRecord.attempts - 1;
    return { valid: false, error: `Incorrect code. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.` };
  }

  // Mark as verified
  await prisma.emailOtp.update({ where: { id: otpRecord.id }, data: { verified: true } });

  return { valid: true };
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
