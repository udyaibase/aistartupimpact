import { sql } from '@/lib/db';
import { startupCategoryFor, understandStartupQuery, type SearchChip, type StartupQuery } from '@/lib/search/understand';

/**
 * The /startups directory query, shared by the page (first render) and /api/startups/search (every change after).
 * One place builds the WHERE clause, so both always agree on what a filter means.
 *
 * "Funded" means the startup has at least one FundingRound — the rounds are the source of truth (the cached
 * Startup.totalFundingInr is only updated by some writers). The EXISTS check uses the (startupId, announcedAt) index.
 */

// 'all' is an explicit choice: it overrides a funding word in the search text ("funded fintech startups").
export const FUNDING_FILTERS = ['funded', 'unfunded', 'all'] as const;
export type FundingFilter = (typeof FUNDING_FILTERS)[number];

const STAGES = new Set([
  'BOOTSTRAPPED', 'IDEA', 'PRE_SEED', 'SEED', 'PRE_SERIES_A', 'SERIES_A', 'PRE_SERIES_B', 'SERIES_B', 'PRE_SERIES_C',
  'SERIES_C', 'PRE_SERIES_D', 'SERIES_D', 'SERIES_E', 'SERIES_F', 'SERIES_G', 'SERIES_I', 'SERIES_J', 'GROWTH', 'PUBLIC',
]);
const STATUSES = new Set(['ACTIVE', 'PUBLIC', 'ACQUIRED', 'INACTIVE']);
const EMPLOYEE_RANGES = new Set(['1-10', '11-50', '51-200', '201-500', '500+']);
const SORTS = new Set(['newest', 'funded', 'team', 'az']);

export interface DirectoryFilters {
  q?: string;
  stage?: string;
  category?: string;
  businessType?: string;
  status?: string;
  city?: string;
  country?: 'India' | 'International';
  employeeRange?: string;
  funding?: FundingFilter;
}

export interface DirectoryQuery extends DirectoryFilters {
  sort?: string;
  page: number;
  limit: number;
  /** Ignore filters recognised in the search text (set by the client after page 1 came back relaxed). */
  relax?: boolean;
}

export interface SearchUnderstanding {
  chips: SearchChip[];
  /** The recognised filters matched nothing, so they were ignored. */
  relaxed: boolean;
}

export interface FundingCounts { all: number; funded: number; unfunded: number }

export const MAX_PAGE_SIZE = 60;

/** Reads filters from URL params. Unknown values are dropped rather than passed to SQL (where a bad enum cast would fail the whole query). */
export function parseDirectoryQuery(get: (key: string) => string | null | undefined): DirectoryQuery {
  const str = (key: string, max = 120) => {
    const v = get(key)?.trim();
    return v ? v.slice(0, max) : undefined;
  };
  const oneOf = (key: string, allowed: Set<string> | readonly string[]) => {
    const v = str(key);
    if (!v) return undefined;
    return (allowed instanceof Set ? allowed.has(v) : allowed.includes(v)) ? v : undefined;
  };
  const int = (key: string, fallback: number) => {
    const n = parseInt(get(key) ?? '', 10);
    return Number.isFinite(n) ? n : fallback;
  };

  return {
    q: str('q', 100),
    stage: oneOf('stage', STAGES),
    category: str('category'),
    businessType: str('businessType'),
    status: oneOf('status', STATUSES),
    city: str('city'),
    country: oneOf('country', ['India', 'International']) as DirectoryFilters['country'],
    employeeRange: oneOf('employeeRange', EMPLOYEE_RANGES),
    funding: oneOf('funding', FUNDING_FILTERS) as FundingFilter | undefined,
    sort: oneOf('sort', SORTS),
    relax: get('relax') === '1',
    page: Math.max(1, int('page', 1)),
    limit: Math.min(MAX_PAGE_SIZE, Math.max(1, int('limit', 30))),
  };
}

// A function, not a constant: `sql` is created lazily and must not run at import (build) time.
const hasFunding = () => sql`EXISTS (SELECT 1 FROM "FundingRound" fr WHERE fr."startupId" = s.id)`;

function escapeLike(v: string) {
  return v.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function employeeClause(range?: string) {
  switch (range) {
    case '1-10': return sql`AND (s."employeeCount" BETWEEN 1 AND 10 OR s."employeeCount" IS NULL)`;
    case '11-50': return sql`AND s."employeeCount" BETWEEN 11 AND 50`;
    case '51-200': return sql`AND s."employeeCount" BETWEEN 51 AND 200`;
    case '201-500': return sql`AND s."employeeCount" BETWEEN 201 AND 500`;
    case '500+': return sql`AND s."employeeCount" > 500`;
    default: return sql``;
  }
}

const orJoin = (parts: ReturnType<typeof sql>[]) => parts.reduce((acc, p) => sql`${acc} OR ${p}`);
const plusJoin = (parts: ReturnType<typeof sql>[]) => parts.reduce((acc, p) => sql`${acc} + ${p}`);

const tsWord = (w: string) => w.replace(/[^a-z0-9]/g, '');
const groupTsQuery = (g: string[]) => g.map(tsWord).filter((w) => w.length > 1).map((w) => `${w}:*`).join(' | ');

/**
 * Relevance for a free-text query. Each concept (word + synonyms) matches through the weighted search index
 * (name > tagline > description), a typo-tolerant name match, or the category column. Results must match at least
 * half the concepts (any one, for 1–2 concepts) — or have the query in their name.
 */
function textSearch(u: StartupQuery) {
  const groups = u.groups.filter((g) => groupTsQuery(g));
  if (groups.length === 0) return null;

  const groupMatch = (g: string[]) => {
    const parts = [sql`s."searchVector" @@ to_tsquery('english', ${groupTsQuery(g)})`];
    // Typos in a name ("perfois" → Perfios). Longer words can drift further and still be unambiguous.
    if (g[0].length >= 4) parts.push(sql`word_similarity(${g[0]}, lower(s.name)) > ${g[0].length >= 5 ? 0.45 : 0.6}`);
    const cats = startupCategoryFor(g[0]);
    if (cats) parts.push(orJoin(cats.map((c) => sql`s.category ILIKE ${escapeLike(c) + '%'}`)));
    return sql`(${orJoin(parts)})`;
  };
  const coverage = sql`(${plusJoin(groups.map((g) => sql`(CASE WHEN ${groupMatch(g)} THEN 1 ELSE 0 END)`))})`;
  const need = groups.length >= 3 ? Math.ceil(groups.length / 2) : 1;

  const words = groups.map((g) => g[0]).join(' ');
  const nameExact = sql`lower(s.name) = ${u.phrase}`;
  const namePrefix = sql`lower(s.name) LIKE ${escapeLike(u.phrase) + '%'}`;
  const nameHit = u.phrase.length >= 3 ? sql`lower(s.name) LIKE ${'%' + escapeLike(u.phrase) + '%'}` : namePrefix;
  const allTerms = groups.map(groupTsQuery).join(' | ');
  const catBoost = u.categoryPrefixes.length
    ? sql`(CASE WHEN ${orJoin(u.categoryPrefixes.map((c) => sql`s.category ILIKE ${escapeLike(c) + '%'}`))} THEN 4 ELSE 0 END)`
    : sql`0`;

  return {
    where: sql`(${coverage} >= ${need} OR ${nameHit})`,
    rank: sql`(
      ${coverage} * 10
      + ts_rank_cd(s."searchVector", to_tsquery('english', ${allTerms})) * 10
      + (CASE WHEN ${nameExact} THEN 40 WHEN ${namePrefix} THEN 20 WHEN ${nameHit} THEN 10 ELSE 0 END)
      + word_similarity(${words}, lower(s.name)) * 5
      + ${catBoost}
    )`,
  };
}

/** Explicit filters win; filters recognised in the search text fill the gaps (unless relaxed). */
function effectiveFilters(qy: DirectoryQuery, u: StartupQuery | null, relaxed: boolean): DirectoryFilters {
  const fromText = u && !relaxed ? u : null;
  return {
    ...qy,
    city: qy.city ?? fromText?.city,
    country: qy.country ?? fromText?.country,
    stage: qy.stage ?? fromText?.stage,
    businessType: qy.businessType ?? fromText?.businessType,
    funding: qy.funding ?? fromText?.funding,
  };
}

/** Every filter except funding — the funding counts are computed over this so the toggle shows what each choice would give. */
function baseWhere(f: DirectoryFilters, text: ReturnType<typeof textSearch>) {
  return sql`
    s."deletedAt" IS NULL
    AND s."isApproved" = true
    ${text ? sql`AND ${text.where}` : sql``}
    ${f.stage ? sql`AND s.stage = ${f.stage}::"StartupStage"` : sql``}
    ${f.category ? sql`AND s.category = ${f.category}` : sql``}
    ${f.businessType ? sql`AND s."businessType" = ${f.businessType}` : sql``}
    ${f.status ? sql`AND s.status = ${f.status}::"CompanyStatus"` : sql``}
    ${f.city ? sql`AND lower(s."headquartersCity") = lower(${f.city})` : sql``}
    ${f.country === 'India' ? sql`AND s."isIndian" = true` : f.country === 'International' ? sql`AND s."isIndian" = false` : sql``}
    ${employeeClause(f.employeeRange)}
  `;
}

function fundingClause(funding?: FundingFilter) {
  if (funding === 'funded') return sql`AND ${hasFunding()}`;
  if (funding === 'unfunded') return sql`AND NOT ${hasFunding()}`;
  return sql``;
}

function orderBy(qy: DirectoryQuery, text: ReturnType<typeof textSearch>) {
  switch (qy.sort) {
    case 'newest': return sql`s."createdAt" DESC`;
    case 'funded': return sql`"totalUsd" DESC, s."createdAt" DESC`;
    case 'team': return sql`s."employeeCount" DESC NULLS LAST`;
    case 'az': return sql`s.name ASC`;
  }
  if (text) return sql`${text.rank} DESC, s."isFeatured" DESC, s."createdAt" DESC`;
  return sql`
    CASE fc.tier WHEN 'PREMIUM' THEN 1 WHEN 'STANDARD' THEN 2 WHEN 'BASIC' THEN 3
      ELSE CASE WHEN s."isFeatured" THEN 3 ELSE 4 END END ASC,
    s."createdAt" DESC`;
}

/**
 * One page of startups. The counts query (total + funded/unfunded split) only runs for page 1 —
 * "load more" pages already know the totals.
 */
export async function searchDirectory(qy: DirectoryQuery, { withCounts = qy.page === 1 } = {}) {
  const u = qy.q ? understandStartupQuery(qy.q) : null;
  const text = u ? textSearch(u) : null;
  const usesTextFilters = !!u && !!(u.city || u.country || u.stage || u.businessType || u.funding);

  let relaxed = !!qy.relax && usesTextFilters;
  let result = await runDirectory(qy, effectiveFilters(qy, u, relaxed), text, withCounts);
  // Recognised filters left nothing ("fintech in surat")? Show the closest matches instead of an empty page.
  if (!relaxed && withCounts && usesTextFilters && result.total === 0) {
    relaxed = true;
    result = await runDirectory(qy, effectiveFilters(qy, u, true), text, withCounts);
  }

  // Chips show only what the text actually decided: not relaxed filters, not ones the user set explicitly.
  const overridden = (c: SearchChip) =>
    (c.kind === 'city' && qy.city) || (c.kind === 'country' && qy.country) || (c.kind === 'stage' && qy.stage) ||
    (c.kind === 'businessType' && qy.businessType) || (c.kind === 'funding' && qy.funding);
  const understood: SearchUnderstanding | null = u
    ? { chips: u.chips.filter((c) => (relaxed ? c.kind === 'category' : !overridden(c))), relaxed }
    : null;
  return { ...result, understood };
}

async function runDirectory(qy: DirectoryQuery, f: DirectoryFilters, text: ReturnType<typeof textSearch>, withCounts: boolean) {
  const offset = (qy.page - 1) * qy.limit;
  const funding = f.funding === 'all' ? undefined : f.funding;

  const rowsQuery = sql`
    SELECT s.id, s.name, s.slug, s.tagline, s."logoUrl", s.stage, s.status,
           s."headquartersCity", s."isFeatured", s."isVerified",
           s."employeeCount", s."foundedYear", s.category, s."businessType", s.founders,
           COALESCE((SELECT SUM(fr."amountUsd") FROM "FundingRound" fr WHERE fr."startupId" = s.id), 0) / 100 AS "totalUsd",
           (fc.id IS NOT NULL) AS "isCurrentlyFeatured",
           fc.tier AS "featuredTier"
    FROM "Startup" s
    LEFT JOIN LATERAL (
      SELECT c.id, c.tier FROM "FeaturedCampaign" c
      WHERE c."startupId" = s.id AND c."cancelledAt" IS NULL AND c."startDate" <= NOW() AND c."endDate" >= NOW()
      ORDER BY CASE c.tier WHEN 'PREMIUM' THEN 1 WHEN 'STANDARD' THEN 2 ELSE 3 END
      LIMIT 1
    ) fc ON true
    WHERE ${baseWhere(f, text)} ${fundingClause(funding)}
    ORDER BY ${orderBy(qy, text)}
    LIMIT ${qy.limit} OFFSET ${offset}
  `;

  const countsQuery = withCounts
    ? sql`
        SELECT COUNT(*)::int AS "all", COUNT(*) FILTER (WHERE ${hasFunding()})::int AS funded
        FROM "Startup" s
        WHERE ${baseWhere(f, text)}
      `
    : null;

  const [rows, countRows] = await Promise.all([rowsQuery, countsQuery ?? Promise.resolve(null)]);

  let counts: FundingCounts | null = null;
  if (countRows) {
    const all = Number((countRows[0] as any)?.all ?? 0);
    const funded = Number((countRows[0] as any)?.funded ?? 0);
    counts = { all, funded, unfunded: all - funded };
  }
  const total = counts ? (funding ? counts[funding] : counts.all) : null;

  return {
    startups: rows.map((r: any) => ({ ...r, totalUsd: Number(r.totalUsd) })),
    total,
    counts,
    /** The funding filter actually applied (from the toggle or the search text). */
    funding: funding ?? null,
  };
}
