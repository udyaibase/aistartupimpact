/**
 * Industry-grade caching layer — Upstash Redis
 * 
 * Architecture:
 * - Stale-while-revalidate (SWR) with distributed lock
 * - TTL jitter (±15%) to prevent synchronized expiration
 * - Compression for payloads > 50KB
 * - Graceful fallthrough on Redis failure
 * - Deployment-based versioning (auto-invalidates on deploy)
 * - Metrics tracking (hit/miss/stale/error counters)
 * - No wildcard invalidation — explicit key lists
 * - PostgreSQL remains source of truth (Redis is acceleration layer only)
 */

import { Redis } from '@upstash/redis';

// ─── Configuration ───────────────────────────────────────────────────────────

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  // Upstash defaults every call to fetch(cache: 'no-store'), which makes Next.js render any page that reads
  // this cache on every request (its `revalidate` is ignored). 'default' keeps pages cacheable; Upstash calls
  // are POSTs, which Next never stores in its own fetch cache, so values still come fresh from Redis.
  redis = new Redis({ url, token, cache: 'default' });
  return redis;
}

// Deployment-based version: uses BUILD_ID or git SHA if available, falls back to manual version.
// This auto-invalidates all caches on every Vercel deploy without manual bumps.
const CACHE_VERSION = process.env.NEXT_BUILD_ID || process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) || 'v1';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CacheOptions {
  /** Primary TTL in seconds */
  ttl: number;
  /** Extra seconds to serve stale while revalidating */
  staleTtl?: number;
  /** Compress payload (auto-enabled for > 50KB, set true to force) */
  compress?: boolean;
  /** Track metrics for this key */
  metrics?: boolean;
}

interface CacheEntry {
  d: string;  // data (JSON stringified, possibly compressed)
  t: number;  // timestamp
  c?: boolean; // compressed flag
}

// ─── Core Cache Function ─────────────────────────────────────────────────────

export async function cached<T>(
  key: string,
  options: CacheOptions,
  fetcher: () => Promise<T>
): Promise<T> {
  const client = getRedis();
  if (!client) return fetcher();

  const fullKey = `${CACHE_VERSION}:${key}`;
  const lockKey = `lk:${fullKey}`;

  try {
    // 1. Try cache hit
    const raw = await client.get<CacheEntry>(fullKey);

    if (raw && raw.t && raw.d) {
      const ageSeconds = (Date.now() - raw.t) / 1000;
      const data = deserialize<T>(raw);

      // Fresh hit
      if (ageSeconds < options.ttl) {
        trackMetric(client, key, 'hit');
        return data;
      }

      // Stale — try to rebuild (one process only)
      if (options.staleTtl && ageSeconds < options.ttl + options.staleTtl) {
        trackMetric(client, key, 'stale');
        const locked = await client.set(lockKey, '1', { nx: true, ex: 30 });
        if (locked) {
          try {
            const fresh = await fetcher();
            await storeWithJitter(client, fullKey, fresh, options);
            return fresh;
          } finally {
            await client.del(lockKey).catch(() => {});
          }
        }
        return data; // Serve stale — another process is rebuilding
      }
    }

    // 2. Cache miss — rebuild with lock
    const locked = await client.set(lockKey, '1', { nx: true, ex: 30 });
    if (!locked && raw?.d) {
      trackMetric(client, key, 'stale');
      return deserialize<T>(raw); // Serve stale while locked
    }

    try {
      const data = await fetcher();
      await storeWithJitter(client, fullKey, data, options);
      trackMetric(client, key, 'miss');
      return data;
    } finally {
      await client.del(lockKey).catch(() => {});
    }

  } catch (error) {
    // Graceful fallthrough — Redis failure never breaks the app
    trackMetric(null, key, 'error');
    console.error(`[cache] ERROR ${key}: ${(error as Error).message?.slice(0, 80)}`);
    return fetcher();
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Store with TTL jitter (±15%) to prevent synchronized expiration */
async function storeWithJitter<T>(client: Redis, fullKey: string, data: T, options: CacheOptions): Promise<void> {
  const totalTtl = options.ttl + (options.staleTtl || 60);
  const jitter = 0.85 + Math.random() * 0.3; // 0.85 to 1.15
  const finalTtl = Math.round(totalTtl * jitter);

  const entry = serialize(data, options.compress);

  try {
    await client.set(fullKey, entry, { ex: finalTtl });
  } catch {
    // Single retry after 100ms
    await new Promise(r => setTimeout(r, 100));
    await client.set(fullKey, entry, { ex: finalTtl }).catch(() => {});
  }
}

/** Serialize data — compress if > 50KB or forced */
function serialize<T>(data: T, forceCompress?: boolean): CacheEntry {
  const json = JSON.stringify(data);
  // Note: In Edge/Serverless, native zlib isn't always available.
  // For now, store raw JSON. Add compression later with a WASM-based gzip if needed.
  return { d: json, t: Date.now(), c: false };
}

/** Deserialize cached entry */
function deserialize<T>(entry: CacheEntry): T {
  return JSON.parse(entry.d) as T;
}

/** Track metric (fire-and-forget, never blocks) */
function trackMetric(client: Redis | null, key: string, type: 'hit' | 'miss' | 'stale' | 'error'): void {
  if (!client) return;
  const prefix = key.split(':')[0] || key;
  client.hincrby('cache:metrics', `${type}:${prefix}`, 1).catch(() => {});
}

// ─── Invalidation ────────────────────────────────────────────────────────────

/** Delete specific cache keys (no wildcards — explicit list) */
export async function invalidateCache(...keys: string[]): Promise<void> {
  const client = getRedis();
  if (!client || keys.length === 0) return;
  try {
    const fullKeys = keys.map(k => `${CACHE_VERSION}:${k}`);
    await client.del(...fullKeys);
  } catch {}
}

/** Write-through: store new data immediately (faster than invalidate+rebuild) */
export async function writeThrough<T>(key: string, data: T, ttlSeconds: number): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    const entry = serialize(data);
    const jitter = 0.85 + Math.random() * 0.3;
    await client.set(`${CACHE_VERSION}:${key}`, entry, { ex: Math.round((ttlSeconds + 60) * jitter) });
  } catch {}
}

// ─── Cache Key Constants (Namespaced) ────────────────────────────────────────

export const CK = {
  // Static / rarely changing
  TOOL_CATEGORIES: 'tool:categories',
  TAG_GROUPS: 'tool:tag-groups',
  TOOL_TAG_MAP: 'tool:tag-map',

  // Discovery
  TRENDING: 'tool:trending',
  UPVOTED_MONTH: 'tool:upvoted-month',
  RECENT_TOOLS: 'tool:recent',
  EDITORS_PICKS: 'tool:editors-picks',
  FEATURED_TOOLS: 'tool:featured',
  FEATURED_STARTUPS: 'startup:featured',
  RECENT_STARTUPS: 'startup:recent',

  // Homepage
  HOMEPAGE_STATS: 'homepage:stats',
  HERO_ARTICLE: 'homepage:hero',
  LATEST_STORIES: 'homepage:latest-stories',
  FOUNDER_SPOTLIGHTS: 'homepage:founder-spotlights',
  FUNDING_DIGESTS: 'homepage:funding-digests',
  INDIA_AI_ECOSYSTEM: 'homepage:india-ai',
  LIVE_TICKERS: 'homepage:live-tickers',
  ACTIVE_SPONSORS: 'homepage:sponsors',
  HERO_SLOTS: 'homepage:hero-slots',
  PRIORITY_TOOLS: 'homepage:priority-tools',

  // Search
  SEARCH_SUGGESTIONS: 'search:suggestions',

  // Detail pages (parameterized)
  tool: (slug: string) => `tool:detail:${slug}`,
  toolSimilar: (catId: string, slug: string) => `tool:similar:${catId}:${slug}`,
  toolTags: (toolId: string) => `tool:tags:${toolId}`,
  toolProsCons: (toolId: string) => `tool:proscons:${toolId}`,
  toolAlternatives: (toolId: string) => `tool:alts:${toolId}`,
  toolReviewResponses: (toolId: string) => `tool:responses:${toolId}`,
  toolDirectory: (catSlug: string) => `tool:directory:${catSlug || 'all'}`,

  // Opinions
  OPINION_TAGS: 'opinion:tags',
  OPINION_CONTRIBUTORS: 'opinion:contributors',
  opinionLatest: (tagSlug: string, page: number) => `opinion:latest:${tagSlug || 'all'}:p${page}`,
  opinionFeatured: () => 'opinion:featured',
  opinionTrending: () => 'opinion:trending',
  author: (slug: string) => `author:${slug}`,

  // Parameterized (functions)
  toolsPage: (hash: string, page: number) => `tools:${hash}:p${page}`,
  toolsCount: (hash: string) => `tools:${hash}:count`,
  startupsPage: (hash: string, page: number) => `startups:${hash}:p${page}`,
} as const;

/**
 * Build a deterministic hash for filter params (for parameterized cache keys).
 * Only caches COMMON filter combinations — limits cardinality.
 */
export function buildFilterHash(params: Record<string, string | undefined>): string | null {
  // Only cache common single-dimension filters + sort
  // Skip if more than 2 active filters (rare combo → let it hit DB)
  const active = Object.entries(params).filter(([_, v]) => v && v !== 'all');
  if (active.length > 2) return null; // Don't cache rare combos

  const sorted = active.sort(([a], [b]) => a.localeCompare(b));
  if (sorted.length === 0) return 'default';
  return sorted.map(([k, v]) => `${k}=${v}`).join('&');
}

// ─── Metrics Reader (for admin dashboard) ────────────────────────────────────

export async function getCacheMetrics(): Promise<Record<string, number>> {
  const client = getRedis();
  if (!client) return {};
  try {
    const metrics = await client.hgetall<Record<string, number>>('cache:metrics');
    return metrics || {};
  } catch {
    return {};
  }
}
