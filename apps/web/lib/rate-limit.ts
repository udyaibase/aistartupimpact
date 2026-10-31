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

/** Codes sent to one email address (sign-in, verification, claims): stops anyone flooding an inbox. */
export const emailCodeRateLimit = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, "15 m"), // per email address and purpose
  analytics: true,
  prefix: "ratelimit:emailcode",
}) : null;

/** False when this email already received EMAIL_CODE limit codes for this purpose in the last 15 minutes. */
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
