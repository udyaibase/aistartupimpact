import crypto from "crypto";

/**
 * Human-friendly character set (30 chars).
 * Excluded ambiguous: 0/O, 1/I/L
 */
const CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/**
 * Generate a cryptographically secure 6-character short code.
 * Uses crypto.randomBytes for unpredictability.
 * 30^6 = 729,000,000 possible combinations.
 */
export function generateShortCode(length: number = 6): string {
  // randomInt is uniform; taking a random byte modulo the charset size would favour some characters.
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CHARSET[crypto.randomInt(CHARSET.length)];
  }
  return code;
}

/**
 * Reserved slugs that cannot be used for events.
 * Prevents routing conflicts.
 */
export const RESERVED_SLUGS = new Set([
  "admin", "api", "dashboard", "events", "e", "organizer", "pricing",
  "about", "login", "signup", "settings", "privacy", "terms", "auth",
  "verify", "reset", "profile", "newsletter", "unsubscribe", "checkout",
  "billing", "new", "create", "edit", "delete", "search", "explore",
  "robots.txt", "favicon.ico", "sitemap.xml", "feed", "rss",
  "contact", "help", "support", "docs", "blog", "news", "stories",
  "tools", "startups", "funding", "india-ai", "founders",
]);

/**
 * Validate a slug against reserved words.
 */
export function isSlugReserved(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}
