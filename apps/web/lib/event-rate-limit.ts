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
// analytics stays off on every limiter: @upstash/ratelimit's analytics writes an
// hourly "<prefix>:events:<bucket>" sorted set per limiter with no TTL, so those
// keys piled up in Redis forever. Nothing here reads them.

export const registrationRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(100, "15 m"),
      analytics: false,
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
      analytics: false,
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
      analytics: false,
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
      analytics: false,
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
      analytics: false,
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
      analytics: false,
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
      analytics: false,
      prefix: "ratelimit:embed:registration",
    })
  : null;

export const embedSendInstructionsRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 h"),
      analytics: false,
      prefix: "ratelimit:embed:send-instructions",
    })
  : null;

export const embedTrackRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(300, "1 m"),
      analytics: false,
      prefix: "ratelimit:embed:track",
    })
  : null;

export const embedVerifyRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, "1 h"),
      analytics: false,
      prefix: "ratelimit:embed:verify",
    })
  : null;

/** Job applications: resume uploads per IP (each also needs a Turnstile pass). */
export const resumeUploadRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 h"),
      analytics: false,
      prefix: "ratelimit:jobs:resume-upload",
    })
  : null;

/** Job applications: resume autofill (AI) per IP. */
export const resumeParseRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 h"),
      analytics: false,
      prefix: "ratelimit:jobs:resume-parse",
    })
  : null;

/** Job applications: submissions per IP. */
export const jobApplyRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, "1 h"),
      analytics: false,
      prefix: "ratelimit:jobs:apply",
    })
  : null;

/** Candidate status page lookups and actions per IP. */
export const applicationStatusRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, "10 m"),
      analytics: false,
      prefix: "ratelimit:jobs:status",
    })
  : null;

/** "Get notified when they're hiring" sign-ups per IP (each sends a confirmation email). */
export const careersSubscribeRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "1 h"),
      analytics: false,
      prefix: "ratelimit:jobs:notify",
    })
  : null;

/** Confirmation emails per recipient address per day, across all companies (stops using sign-ups to flood an inbox). */
export const careersConfirmPerEmailRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "24 h"),
      analytics: false,
      prefix: "ratelimit:jobs:notify-to",
    })
  : null;

/** Public job search per IP. Generous: the list page calls it on every filter change, and offices share one IP. */
export const jobSearchRateLimit = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(120, "1 m"), analytics: false, prefix: "ratelimit:jobs:search" })
  : null;

/** Saving and unsaving jobs, per signed-in person. */
export const jobSaveRateLimit = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(30, "1 m"), analytics: false, prefix: "ratelimit:jobs:save" })
  : null;

/** Candidate CSV exports per hiring workspace (each one reads up to 5,000 applications). */
export const candidateExportRateLimit = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(20, "1 h"), analytics: false, prefix: "ratelimit:jobs:export" })
  : null;
