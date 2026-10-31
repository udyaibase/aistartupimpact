import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Rate limiters specifically for the Events platform.
 * Separate from general API rate limits to allow fine-grained control.
 */

let redis: Redis | null = null;

try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
} catch (error) {
  console.error("Failed to initialize Redis for event rate limiting:", error);
}

/**
 * Registration endpoint — 100 requests per 15 minutes per IP.
 * High limit: Indian campus Wi-Fi, corporate NAT, and carrier-grade NAT
 * share one IP across hundreds of users. Turnstile is the primary bot defense.
 */
export const registrationRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(100, "15 m"),
      analytics: true,
      prefix: "ratelimit:event:registration",
    })
  : null;

/**
 * Event listing/search — 60 requests per minute per IP.
 * Generous for normal browsing, blocks automated scraping.
 */
export const eventSearchRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, "1 m"),
      analytics: true,
      prefix: "ratelimit:event:search",
    })
  : null;

/**
 * Newsletter subscribe — 5 requests per hour per IP.
 * Very strict to prevent list poisoning.
 */
export const newsletterSubscribeRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "1 h"),
      analytics: true,
      prefix: "ratelimit:event:newsletter",
    })
  : null;

/**
 * Event creation — 10 events per hour per user.
 * Prevents abuse by organizers (keyed by user ID, not IP).
 */
export const eventCreationRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 h"),
      analytics: true,
      prefix: "ratelimit:event:create",
    })
  : null;

/**
 * Email campaign sending — 5 campaigns per day per organizer.
 */
export const campaignSendRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "24 h"),
      analytics: true,
      prefix: "ratelimit:event:campaign",
    })
  : null;

/**
 * Embed events listing — 120 requests per minute per widget.
 * Keyed by widgetId. Generous for normal browsing across many visitors.
 */
export const embedEventsRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(120, "1 m"),
      analytics: true,
      prefix: "ratelimit:embed:events",
    })
  : null;

/**
 * Embed registration — 1000 requests per hour per widget.
 * High circuit-breaker only; per-IP + Turnstile are the real controls.
 */
export const embedRegistrationRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(1000, "1 h"),
      analytics: true,
      prefix: "ratelimit:embed:registration",
    })
  : null;

export const embedSendInstructionsRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 h"),
      analytics: true,
      prefix: "ratelimit:embed:send-instructions",
    })
  : null;

export const embedTrackRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(300, "1 m"),
      analytics: true,
      prefix: "ratelimit:embed:track",
    })
  : null;

export const embedVerifyRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, "1 h"),
      analytics: true,
      prefix: "ratelimit:embed:verify",
    })
  : null;

/** Job applications: resume uploads per IP (each also needs a Turnstile pass). */
export const resumeUploadRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 h"),
      analytics: true,
      prefix: "ratelimit:jobs:resume-upload",
    })
  : null;

/** Job applications: resume autofill (AI) per IP. */
export const resumeParseRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 h"),
      analytics: true,
      prefix: "ratelimit:jobs:resume-parse",
    })
  : null;

/** Job applications: submissions per IP. */
export const jobApplyRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, "1 h"),
      analytics: true,
      prefix: "ratelimit:jobs:apply",
    })
  : null;

/** Candidate status page lookups and actions per IP. */
export const applicationStatusRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, "10 m"),
      analytics: true,
      prefix: "ratelimit:jobs:status",
    })
  : null;
