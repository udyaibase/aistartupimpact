import { Ratelimit } from "@upstash/ratelimit";
import { clientIp } from "./client-ip";
import { Redis } from "@upstash/redis";

// Create Redis client with error handling
let redis: Redis | null = null;
let rateLimitingEnabled = false;

try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    rateLimitingEnabled = true;
  } else {
    console.warn('⚠️ Upstash Redis credentials not found. Rate limiting disabled.');
  }
} catch (error) {
  console.error('Failed to initialize Redis client:', error);
  rateLimitingEnabled = false;
}

// Rate limiters for different endpoints (only if Redis is available)
export const authRateLimit = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "15 m"), // 5 requests per 15 minutes
  analytics: true,
  prefix: "ratelimit:auth",
}) : null;

export const apiRateLimit = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, "1 m"), // 100 requests per minute
  analytics: true,
  prefix: "ratelimit:api",
}) : null;

export const strictRateLimit = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, "1 h"), // 3 requests per hour (for sensitive operations)
  analytics: true,
  prefix: "ratelimit:strict",
}) : null;

export const twoFactorRateLimit = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "30 m"), // 5 attempts per 30 minutes per account
  analytics: true,
  prefix: "ratelimit:2fa",
}) : null;

export const jdParseRateLimit = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, "1 h"), // AI job-description parsing, per employer
  analytics: true,
  prefix: "ratelimit:jdparse",
}) : null;

export const gstinLookupRateLimit = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, "1 h"), // GSTIN register lookups (paid API), per account
  analytics: true,
  prefix: "ratelimit:gstin",
}) : null;

/** New companies added at signup: one per email address a day (stops directory spam). */
export const companyCreateRateLimit = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(1, "24 h"),
  analytics: true,
  prefix: "ratelimit:newcompany",
}) : null;

/** Codes sent to one email address (sign-in, verification, claims): stops anyone flooding an inbox. */
export const emailCodeRateLimit = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, "15 m"), // per email address and purpose
  analytics: true,
  prefix: "ratelimit:emailcode",
}) : null;

/** Codes one account may send in an hour, whatever addresses it tries (stops one account spraying many inboxes). */
export const accountCodeRateLimit = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 h"),
  analytics: false,
  prefix: "ratelimit:acctcode",
}) : null;

/** Codes any one inbox may receive in an hour, from every account and purpose combined (stops inbox flooding). */
export const recipientCodeRateLimit = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "1 h"),
  analytics: false,
  prefix: "ratelimit:rcptcode",
}) : null;

/** False when this email already received EMAIL_CODE limit codes for this purpose in the last 15 minutes. */
// Wrong passwords for one account from one network (IP). Counted only on failures, so a stranger elsewhere
// can't lock the real owner out; the account-wide lock in the sign-in route is a much higher backstop.
export const loginFailureRateLimit = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "15 m"),
  analytics: false,
  prefix: "ratelimit:loginfail",
}) : null;

// Daily image-upload allowance per organizer workspace (5 MB each, so at most ~1 GB a day), so one workspace
// can't fill the storage bucket. Generous for real use: a big event needs a few dozen images.
export const organizerUploadDailyLimit = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(200, "24 h"),
  analytics: false,
  prefix: "ratelimit:orgupload",
}) : null;

/** Whether the failures for this key are used up, without counting this call. Errors count as "not used up". */
export async function failuresUsedUp(ratelimit: Ratelimit | null, identifier: string): Promise<boolean> {
  if (!ratelimit || !rateLimitingEnabled) return false;
  try {
    const { remaining } = await ratelimit.getRemaining(identifier);
    return remaining <= 0;
  } catch {
    return false;
  }
}

export async function emailCodeAllowed(email: string, purpose: string): Promise<boolean> {
  const { success } = await checkRateLimit(emailCodeRateLimit, `${purpose}:${email.trim().toLowerCase()}`);
  return success;
}

// Client IP for rate limiting (spoof-resistant; see lib/client-ip.ts)
export function getClientIdentifier(request: Request): string {
  return clientIp(request);
}

// Rate limit check helper with fallback
export async function checkRateLimit(
  ratelimit: Ratelimit | null,
  identifier: string
): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
  if (!ratelimit || !rateLimitingEnabled) {
    if (process.env.NODE_ENV === 'production') {
      console.warn(`[SECURITY] Rate limiting unavailable — Redis not configured. Blocking request.`);
      return { success: false, limit: 0, remaining: 0, reset: 0 };
    }
    return { success: true, limit: 999, remaining: 999, reset: 0 };
  }

  try {
    const { success, limit, remaining, reset } = await ratelimit.limit(identifier);
    return { success, limit, remaining, reset };
  } catch (error) {
    if (process.env.NODE_ENV === 'production') {
      console.error(`[SECURITY] Rate limit check failed — blocking request.`);
      return { success: false, limit: 0, remaining: 0, reset: 0 };
    }
    return { success: true, limit: 999, remaining: 999, reset: 0 };
  }
}

/**
 * What to tell someone who hit a limit, from the limiter's reset time (ms since epoch):
 * "Too many attempts. Please try again in 12 minutes." Falls back to a general line when the time isn't known.
 */
export function rateLimitMessage(reset: number | null | undefined, now = Date.now()): string {
  const ms = (reset ?? 0) - now;
  if (!reset || !Number.isFinite(ms) || ms <= 0) return 'Too many attempts. Please wait a little and try again.';
  const minutes = Math.ceil(ms / 60_000);
  if (minutes <= 1) return 'Too many attempts. Please try again in a minute.';
  if (minutes < 60) return `Too many attempts. Please try again in ${minutes} minutes.`;
  const hours = Math.round(minutes / 60);
  if (hours <= 1) return 'Too many attempts. Please try again in about an hour.';
  if (hours < 24) return `Too many attempts. Please try again in about ${hours} hours.`;
  return 'Too many attempts. Please try again tomorrow.';
}

/** Retry-After header (seconds) for a 429, so clients and browsers know when to retry. */
export function retryAfterHeaders(reset: number | null | undefined, now = Date.now()): Record<string, string> {
  const seconds = Math.max(1, Math.ceil(((reset ?? 0) - now) / 1000));
  return reset && reset > now ? { 'Retry-After': String(seconds) } : {};
}
