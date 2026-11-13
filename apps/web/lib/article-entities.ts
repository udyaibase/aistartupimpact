import { sql } from '@/lib/db';

/**
 * Preview cards for the startups and AI tools an article links to (@-tags from the editor, or plain links to
 * /startups/<slug> and /tools/<slug>). Built on the server with the article, so hovering never hits the database.
 * Keyed by the link's path; deleted, unapproved or unknown entries get no card and stay plain links.
 */

export interface StartupCard {
  kind: 'startup'; name: string; slug: string; tagline: string | null; logoUrl: string | null; verified: boolean;
  sector: string | null; city: string | null; stage: string | null; foundedYear: number | null;
  /** US dollars across recorded rounds (INR-only rounds converted). */
  raisedUsd: number | null; lastRound: { type: string; date: string } | null;
}
export interface ToolCard {
  kind: 'tool'; id: string; name: string; slug: string; tagline: string | null; logoUrl: string | null; websiteUrl: string | null;
  category: string | null; pricing: string | null; rating: number | null; reviews: number;
}
export type EntityCard = StartupCard | ToolCard;

/** Only for a round stored without dollars (the database normally fills them at the announcement-date rate). */
const FALLBACK_INR_PER_USD = 94;
const MAX = 30;
const LINK_RE = /<a\b[^>]*\shref="(?:https?:\/\/(?:www\.)?udyaibase\.com)?\/(startups|tools)\/([a-z0-9-]+)\/?(?:[?#][^"]*)?"/gi;

export function linkedEntitySlugs(html: string): { startups: string[]; tools: string[] } {
  const startups = new Set<string>(), tools = new Set<string>();
  for (const m of String(html ?? '').matchAll(LINK_RE)) (m[1].toLowerCase() === 'tools' ? tools : startups).add(m[2].toLowerCase());
  return { startups: [...startups].slice(0, MAX), tools: [...tools].slice(0, MAX) };
}

const stageLabel = (s: string | null) => (s ? s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/^Pre /, 'Pre-') : null);

export async function getArticleEntityCards(html: string): Promise<Record<string, EntityCard>> {
  const { startups, tools } = linkedEntitySlugs(html);
  if (!startups.length && !tools.length) return {};
  try {
    const [s, t] = await Promise.all([
      startups.length
        ? sql`
            SELECT s.name, s.slug, s."previousSlugs", s.tagline, s."logoUrl", s."isVerified", s.category, s."headquartersCity",
                   s.stage::text AS stage, s."foundedYear",
                   (SELECT SUM(COALESCE(NULLIF(r."amountUsd", 0) / 100.0, r."amountInr" / 100.0 / ${FALLBACK_INR_PER_USD})) FROM "FundingRound" r WHERE r."startupId" = s.id) AS "raisedUsd",
                   lr."roundType" AS "lastRoundType", lr."announcedAt"::text AS "lastRoundAt"
            FROM "Startup" s
            LEFT JOIN LATERAL (SELECT "roundType", "announcedAt" FROM "FundingRound" WHERE "startupId" = s.id ORDER BY "announcedAt" DESC LIMIT 1) lr ON true
            WHERE s."deletedAt" IS NULL AND s."isApproved" = true
              AND (s.slug = ANY(${startups}) OR s."previousSlugs" && ${startups}::text[])`
        : Promise.resolve([]),
      tools.length
        ? sql`
            SELECT t.id, t.name, t.slug, t.tagline, t."logoUrl", t."websiteUrl", t."pricingModel"::text AS pricing, t."avgRating", t."reviewCount", c.name AS category
            FROM "AiTool" t LEFT JOIN "ToolCategory" c ON c.id = t."categoryId"
            WHERE t."deletedAt" IS NULL AND t.status = 'APPROVED' AND t.slug = ANY(${tools})`
        : Promise.resolve([]),
    ]);
    const cards: Record<string, EntityCard> = {};
    for (const r of s as any[]) {
      const raised = Number(r.raisedUsd ?? 0);
      const card: StartupCard = {
        kind: 'startup', name: r.name, slug: r.slug, tagline: r.tagline || null, logoUrl: r.logoUrl || null, verified: !!r.isVerified,
        sector: r.category || null, city: r.headquartersCity || null, stage: stageLabel(r.stage), foundedYear: r.foundedYear ?? null,
        raisedUsd: raised > 0 ? Math.round(raised) : null,
        lastRound: r.lastRoundType && r.lastRoundAt ? { type: r.lastRoundType, date: r.lastRoundAt } : null,
      };
      // Old slugs still link to the startup (its page redirects), so they get the card too.
      for (const slug of [r.slug, ...(r.previousSlugs ?? [])]) if (startups.includes(String(slug).toLowerCase())) cards[`/startups/${String(slug).toLowerCase()}`] = card;
    }
    for (const r of t as any[]) {
      cards[`/tools/${String(r.slug).toLowerCase()}`] = {
        kind: 'tool', id: r.id, name: r.name, slug: r.slug, tagline: r.tagline || null, logoUrl: r.logoUrl || null, websiteUrl: r.websiteUrl || null,
        category: r.category || null, pricing: r.pricing ? r.pricing.charAt(0) + r.pricing.slice(1).toLowerCase() : null,
        rating: Number(r.avgRating) > 0 ? Math.round(Number(r.avgRating) * 10) / 10 : null, reviews: Number(r.reviewCount ?? 0),
      };
    }
    return cards;
  } catch (err) {
    // Cards are an extra; the article must render without them.
    console.error('[article-entities]', err instanceof Error ? err.message : err);
    return {};
  }
}
