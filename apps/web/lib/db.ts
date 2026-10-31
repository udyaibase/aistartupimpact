// Direct DB queries for server components — bypasses the need for the API server
import { neon, NeonQueryFunction } from '@neondatabase/serverless';
import { cached, CK } from './cache';

// Lazy sql client — not instantiated at module load time (avoids build-time DATABASE_URL errors)
let _sql: NeonQueryFunction<false, false> | undefined;
function getSql(): NeonQueryFunction<false, false> {
  if (!_sql) {
    if (!process.env.DATABASE_URL) {
      console.warn('[db] DATABASE_URL not set — returning empty stub');
      return ((() => Promise.resolve([])) as unknown) as NeonQueryFunction<false, false>;
    }
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}
// sql is used as a tagged template literal throughout this file
export const sql: NeonQueryFunction<false, false> = new Proxy(
  ((...args: Parameters<NeonQueryFunction<false, false>>) => getSql()(...args)) as NeonQueryFunction<false, false>,
  {
    get(_target, prop) {
      return (getSql() as any)[prop];
    },
  }
);

export async function getArticleBySlugDirect(slug: string) {
  try {
    const rows: any[] = await sql`
      SELECT
        a.id, a.title, a.slug, a.type, a.excerpt, a.content,
        a."coverImage", a."thumbnailImage", a."readTimeMinutes", a."viewCount", a."isFeatured",
        a."likeCount",
        a."publishedAt"::text AS "publishedAt",
        a."createdAt"::text AS "createdAt",
        a."updatedAt"::text AS "updatedAt",
        u.name AS "authorName", u.slug AS "authorSlug",
        c.name AS "categoryName", c.slug AS "categorySlug",
        a."toolId", a."startupId"
      FROM "Article" a
      LEFT JOIN "User" u ON u.id = a."authorId"
      LEFT JOIN "Category" c ON c.id = a."categoryId"
      WHERE a.slug = ${slug} AND a.status = 'PUBLISHED' AND a."deletedAt" IS NULL
      LIMIT 1
    `;
    if (!rows.length) return null;
    const a = rows[0];

    // Cross-link: Fetch related tool if toolId is attached
    let linkedTool = null;
    if (a.toolId) {
      const toolRows = await sql`
        SELECT name, slug, tagline, "logoUrl", "pricingModel", "avgRating"
        FROM "AiTool"
        WHERE id = ${a.toolId} AND "deletedAt" IS NULL
        LIMIT 1
      `;
      if (toolRows.length) linkedTool = toolRows[0];
    }

    // Cross-link: Fetch related startup if startupId is attached (for founder stories)
    let linkedStartup = null;
    if (a.startupId) {
      const startupRows = await sql`
        SELECT name, slug, founders
        FROM "Startup"
        WHERE id = ${a.startupId} AND "deletedAt" IS NULL
        LIMIT 1
      `;
      if (startupRows.length) {
        const startup = startupRows[0];
        linkedStartup = {
          name: startup.name,
          slug: startup.slug,
          founders: startup.founders || []
        };
      }
    }

    return {
      ...a,
      author: { name: a.authorName, slug: a.authorSlug },
      category: { name: a.categoryName, slug: a.categorySlug },
      linkedTool,
      linkedStartup
    };
  } catch (e) {
    console.error('getArticleBySlugDirect error:', e);
    return null;
  }
}

// ── Opinions ──────────────────────────────────────────────────────────────────

export async function getOpinionsDirect(params: {
  tagSlug?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'latest' | 'trending';
  isFeatured?: boolean;
} = {}) {
  const limit = params.limit || 12;
  const offset = params.offset || 0;
  const sortBy = params.sortBy || 'latest';

  if (params.isFeatured) {
    return cached(CK.opinionFeatured(), { ttl: 120, staleTtl: 300 }, async () => {
      try {
        const rows: any[] = await sql`
          SELECT
            a.id, a.title, a.slug, a.excerpt, a."coverImage", a."readTimeMinutes",
            a."isFeatured", a."viewCount", a."likeCount", a."agreeCount", a."disagreeCount",
            a."publishedAt"::text AS "publishedAt",
            a."updatedAt"::text AS "updatedAt",
            u.name AS "authorName", u.slug AS "authorSlug", u.avatar AS "authorAvatar", u.bio AS "authorBio",
            fu.name AS "founderAuthorName", fu.id AS "founderAuthorId", fu.avatar AS "founderAuthorAvatar", fu.company AS "founderCompany",
            pt.name AS "primaryTagName", pt.slug AS "primaryTagSlug"
          FROM "Article" a
          LEFT JOIN "User" u ON u.id = a."authorId"
          LEFT JOIN "FounderUser" fu ON fu.id = a."founderAuthorId"
          LEFT JOIN "Tag" pt ON pt.id = a."primaryTagId"
          WHERE a.type = 'OPINION' AND a.status = 'PUBLISHED' AND a."deletedAt" IS NULL
            AND a."isFeatured" = true
          ORDER BY a."publishedAt" DESC NULLS LAST
          LIMIT ${limit}
        `;
        return rows.map(mapOpinionRow);
      } catch (e) {
        console.error('getOpinionsDirect featured error:', e);
        return [];
      }
    });
  }

  if (sortBy === 'trending') {
    return cached(CK.opinionTrending(), { ttl: 300, staleTtl: 600 }, async () => {
      try {
        const rows: any[] = await sql`
          SELECT
            a.id, a.title, a.slug, a.excerpt, a."coverImage", a."readTimeMinutes",
            a."isFeatured", a."viewCount", a."likeCount", a."agreeCount", a."disagreeCount",
            a."publishedAt"::text AS "publishedAt",
            a."updatedAt"::text AS "updatedAt",
            u.name AS "authorName", u.slug AS "authorSlug", u.avatar AS "authorAvatar", u.bio AS "authorBio",
            fu.name AS "founderAuthorName", fu.id AS "founderAuthorId", fu.avatar AS "founderAuthorAvatar", fu.company AS "founderCompany",
            pt.name AS "primaryTagName", pt.slug AS "primaryTagSlug",
            COALESCE(cc.cnt, 0)::int AS "commentCount",
            (a."viewCount" + a."likeCount" * 3 + a."agreeCount" * 2 + a."disagreeCount" + COALESCE(cc.cnt, 0) * 4)::float
              / POWER(EXTRACT(EPOCH FROM (NOW() - COALESCE(a."publishedAt", a."createdAt"))) / 86400 + 2, 1.5) AS "trendingScore"
          FROM "Article" a
          LEFT JOIN "User" u ON u.id = a."authorId"
          LEFT JOIN "FounderUser" fu ON fu.id = a."founderAuthorId"
          LEFT JOIN "Tag" pt ON pt.id = a."primaryTagId"
          LEFT JOIN LATERAL (
            SELECT COUNT(*)::int AS cnt FROM "Comment" WHERE "articleId" = a.id AND status = 'APPROVED'
          ) cc ON true
          WHERE a.type = 'OPINION' AND a.status = 'PUBLISHED' AND a."deletedAt" IS NULL
          ORDER BY "trendingScore" DESC
          LIMIT ${limit}
        `;
        return rows.map(mapOpinionRow);
      } catch (e) {
        console.error('getOpinionsDirect trending error:', e);
        return [];
      }
    });
  }

  // Latest — paginated, optionally filtered by tag
  const cacheKey = CK.opinionLatest(params.tagSlug || '', Math.floor(offset / limit));
  return cached(cacheKey, { ttl: 120, staleTtl: 300 }, async () => {
    try {
      let rows: any[];
      if (params.tagSlug) {
        rows = await sql`
          SELECT
            a.id, a.title, a.slug, a.excerpt, a."coverImage", a."readTimeMinutes",
            a."isFeatured", a."viewCount", a."likeCount", a."agreeCount", a."disagreeCount",
            a."publishedAt"::text AS "publishedAt",
            a."updatedAt"::text AS "updatedAt",
            u.name AS "authorName", u.slug AS "authorSlug", u.avatar AS "authorAvatar", u.bio AS "authorBio",
            fu.name AS "founderAuthorName", fu.id AS "founderAuthorId", fu.avatar AS "founderAuthorAvatar", fu.company AS "founderCompany",
            pt.name AS "primaryTagName", pt.slug AS "primaryTagSlug"
          FROM "Article" a
          LEFT JOIN "User" u ON u.id = a."authorId"
          LEFT JOIN "FounderUser" fu ON fu.id = a."founderAuthorId"
          LEFT JOIN "Tag" pt ON pt.id = a."primaryTagId"
          WHERE a.type = 'OPINION' AND a.status = 'PUBLISHED' AND a."deletedAt" IS NULL
            AND (
              pt.slug = ${params.tagSlug}
              OR EXISTS (
                SELECT 1 FROM "ArticleTag" at2
                JOIN "Tag" t2 ON t2.id = at2."tagId"
                WHERE at2."articleId" = a.id AND t2.slug = ${params.tagSlug}
              )
            )
          ORDER BY a."publishedAt" DESC NULLS LAST
          LIMIT ${limit} OFFSET ${offset}
        `;
      } else {
        rows = await sql`
          SELECT
            a.id, a.title, a.slug, a.excerpt, a."coverImage", a."readTimeMinutes",
            a."isFeatured", a."viewCount", a."likeCount", a."agreeCount", a."disagreeCount",
            a."publishedAt"::text AS "publishedAt",
            a."updatedAt"::text AS "updatedAt",
            u.name AS "authorName", u.slug AS "authorSlug", u.avatar AS "authorAvatar", u.bio AS "authorBio",
            fu.name AS "founderAuthorName", fu.id AS "founderAuthorId", fu.avatar AS "founderAuthorAvatar", fu.company AS "founderCompany",
            pt.name AS "primaryTagName", pt.slug AS "primaryTagSlug"
          FROM "Article" a
          LEFT JOIN "User" u ON u.id = a."authorId"
          LEFT JOIN "FounderUser" fu ON fu.id = a."founderAuthorId"
          LEFT JOIN "Tag" pt ON pt.id = a."primaryTagId"
          WHERE a.type = 'OPINION' AND a.status = 'PUBLISHED' AND a."deletedAt" IS NULL
          ORDER BY a."publishedAt" DESC NULLS LAST
          LIMIT ${limit} OFFSET ${offset}
        `;
      }
      return rows.map(mapOpinionRow);
    } catch (e) {
      console.error('getOpinionsDirect error:', e);
      return [];
    }
  });
}

export async function getOpinionBySlugDirect(slug: string) {
  try {
    const rows: any[] = await sql`
      SELECT
        a.id, a.title, a.slug, a.type, a.excerpt, a.content,
        a."coverImage", a."thumbnailImage", a."readTimeMinutes", a."viewCount", a."isFeatured",
        a."likeCount", a."agreeCount", a."disagreeCount", a."keyTakeaways",
        a."publishedAt"::text AS "publishedAt",
        a."createdAt"::text AS "createdAt",
        a."updatedAt"::text AS "updatedAt",
        a."toolId", a."startupId",
        u.name AS "authorName", u.slug AS "authorSlug", u.avatar AS "authorAvatar",
        u.bio AS "authorBio", u.twitter AS "authorTwitter", u.linkedin AS "authorLinkedin", u.role AS "authorRole",
        fu.name AS "founderAuthorName", fu.id AS "founderAuthorId", fu.avatar AS "founderAuthorAvatar",
        fu.bio AS "founderAuthorBio", fu.twitter AS "founderTwitter", fu.linkedin AS "founderLinkedin",
        fu.company AS "founderCompany", fu.role AS "founderRole",
        pt.name AS "primaryTagName", pt.slug AS "primaryTagSlug"
      FROM "Article" a
      LEFT JOIN "User" u ON u.id = a."authorId"
      LEFT JOIN "FounderUser" fu ON fu.id = a."founderAuthorId"
      LEFT JOIN "Tag" pt ON pt.id = a."primaryTagId"
      WHERE a.slug = ${slug} AND a.type = 'OPINION' AND a.status = 'PUBLISHED' AND a."deletedAt" IS NULL
      LIMIT 1
    `;
    if (!rows.length) return null;
    const a = rows[0];

    // Fetch secondary tags, linked entities, and related opinions in parallel
    const [tags, linkedTool, linkedStartup, related] = await Promise.all([
      sql`
        SELECT t.name, t.slug
        FROM "ArticleTag" at2
        JOIN "Tag" t ON t.id = at2."tagId"
        WHERE at2."articleId" = ${a.id}
        ORDER BY t.name
      `,
      a.toolId
        ? sql`SELECT name, slug, tagline, "logoUrl", "pricingModel", "avgRating" FROM "AiTool" WHERE id = ${a.toolId} AND "deletedAt" IS NULL LIMIT 1`.then((r: any[]) => r[0] || null)
        : Promise.resolve(null),
      a.startupId
        ? sql`SELECT name, slug, founders FROM "Startup" WHERE id = ${a.startupId} AND "deletedAt" IS NULL LIMIT 1`.then((r: any[]) => r[0] || null)
        : Promise.resolve(null),
      sql`
        SELECT
          r.id, r.title, r.slug, r.excerpt, r."coverImage", r."readTimeMinutes",
          r."publishedAt"::text AS "publishedAt",
          u2.name AS "authorName", u2.slug AS "authorSlug",
          pt2.name AS "primaryTagName", pt2.slug AS "primaryTagSlug",
          (
            CASE WHEN r."primaryTagId" = ${a.primaryTagId || ''} THEN 3 ELSE 0 END
            + CASE WHEN r."authorId" = COALESCE(${a.authorId || ''}, '') THEN 1 ELSE 0 END
            + (SELECT COUNT(*) FROM "ArticleTag" at3
               WHERE at3."articleId" = r.id AND at3."tagId" IN (
                 SELECT "tagId" FROM "ArticleTag" WHERE "articleId" = ${a.id}
               ))::int * 2
          ) AS "relevanceScore"
        FROM "Article" r
        LEFT JOIN "User" u2 ON u2.id = r."authorId"
        LEFT JOIN "Tag" pt2 ON pt2.id = r."primaryTagId"
        WHERE r.type = 'OPINION' AND r.status = 'PUBLISHED' AND r."deletedAt" IS NULL
          AND r.id != ${a.id}
        ORDER BY "relevanceScore" DESC, r."publishedAt" DESC
        LIMIT 4
      `,
    ]);

    const authorName = a.authorName || a.founderAuthorName || 'ASI Editorial';
    const authorSlug = a.authorSlug || (a.founderAuthorId ? `founder-${a.founderAuthorId}` : 'editorial');

    return {
      ...a,
      author: {
        name: authorName,
        slug: authorSlug,
        avatar: a.authorAvatar || a.founderAuthorAvatar || null,
        bio: a.authorBio || a.founderAuthorBio || null,
        twitter: a.authorTwitter || a.founderTwitter || null,
        linkedin: a.authorLinkedin || a.founderLinkedin || null,
        role: a.authorRole || a.founderRole || null,
        company: a.founderCompany || null,
      },
      primaryTag: a.primaryTagName ? { name: a.primaryTagName, slug: a.primaryTagSlug } : null,
      secondaryTags: (tags as any[]).map((t: any) => ({ name: t.name, slug: t.slug })),
      keyTakeaways: a.keyTakeaways || [],
      linkedTool,
      linkedStartup,
      related: (related as any[]).map(mapOpinionRow),
    };
  } catch (e) {
    console.error('getOpinionBySlugDirect error:', e);
    return null;
  }
}

export async function getRelatedContentForOpinion(articleId: string, tagIds: string[], primaryTagId: string | null) {
  try {
    const tagList = tagIds.length > 0 ? tagIds : ['__none__'];

    const [relatedNews, relatedFounderStories, recommendedTools, relevantJobs] = await Promise.all([
      sql`
        SELECT a.title, a.slug, a.excerpt, a."coverImage", a."readTimeMinutes",
               a."publishedAt"::text AS "publishedAt",
               u.name AS "authorName", c.name AS "categoryName"
        FROM "Article" a
        LEFT JOIN "User" u ON u.id = a."authorId"
        LEFT JOIN "Category" c ON c.id = a."categoryId"
        WHERE a.type = 'NEWS' AND a.status = 'PUBLISHED' AND a."deletedAt" IS NULL
          AND a.id != ${articleId}
          AND (
            a."primaryTagId" = ANY(${tagList}::text[])
            OR EXISTS (
              SELECT 1 FROM "ArticleTag" at2
              WHERE at2."articleId" = a.id AND at2."tagId" = ANY(${tagList}::text[])
            )
          )
        ORDER BY a."publishedAt" DESC NULLS LAST
        LIMIT 4
      ` as Promise<any[]>,

      sql`
        SELECT a.title, a.slug, a.excerpt, a."coverImage", a."readTimeMinutes",
               a."publishedAt"::text AS "publishedAt",
               u.name AS "authorName",
               fu.name AS "founderName", fu.company AS "founderCompany"
        FROM "Article" a
        LEFT JOIN "User" u ON u.id = a."authorId"
        LEFT JOIN "FounderUser" fu ON fu.id = a."founderAuthorId"
        WHERE a.type = 'FOUNDER_STORY' AND a.status = 'PUBLISHED' AND a."deletedAt" IS NULL
          AND a.id != ${articleId}
          AND (
            a."primaryTagId" = ANY(${tagList}::text[])
            OR EXISTS (
              SELECT 1 FROM "ArticleTag" at2
              WHERE at2."articleId" = a.id AND at2."tagId" = ANY(${tagList}::text[])
            )
          )
        ORDER BY a."publishedAt" DESC NULLS LAST
        LIMIT 4
      ` as Promise<any[]>,

      sql`
        SELECT DISTINCT t.name, t.slug, t.tagline, t."logoUrl", t."pricingModel", t."avgRating", t."isFeatured"
        FROM "AiTool" t
        JOIN "ToolTag" tt ON tt."toolId" = t.id
        WHERE t.status = 'APPROVED' AND t."deletedAt" IS NULL
          AND LOWER(tt.name) IN (
            SELECT LOWER(tg.name) FROM "Tag" tg WHERE tg.id = ANY(${tagList}::text[])
          )
        ORDER BY t."avgRating" DESC, t."isFeatured" DESC
        LIMIT 4
      ` as Promise<any[]>,

      sql`
        SELECT jl.id, jl.slug, jl.title, COALESCE(jl.city, jl.location) AS location, jl."workType"::text AS type,
               CASE WHEN jl."showSalary" AND jl."salaryCurrency" = 'INR' THEN jl."salaryMin" END AS "salaryRangeMin",
               CASE WHEN jl."showSalary" AND jl."salaryCurrency" = 'INR' THEN jl."salaryMax" END AS "salaryRangeMax",
               e."companyName", e.slug AS "companySlug", e."logoUrl" AS "companyLogo"
        FROM "JobBoardListing" jl
        JOIN "JobBoardEmployer" e ON e.id = jl."employerId"
        WHERE jl.status = 'OPEN' AND jl."moderationHold" = false AND jl."deletedAt" IS NULL
          AND (jl."expiresAt" IS NULL OR jl."expiresAt" > NOW()) AND jl."showOnJobsPage" = true
        ORDER BY jl."isFeatured" DESC, jl."publishedAt" DESC NULLS LAST
        LIMIT 3
      ` as Promise<any[]>,
    ]);

    return { relatedNews, relatedFounderStories, recommendedTools, relevantJobs };
  } catch (e) {
    console.error('getRelatedContentForOpinion error:', e);
    return { relatedNews: [], relatedFounderStories: [], recommendedTools: [], relevantJobs: [] };
  }
}

export async function getOpinionTagsDirect() {
  return cached(CK.OPINION_TAGS, { ttl: 300, staleTtl: 600 }, async () => {
    try {
      const rows: any[] = await sql`
        SELECT t.id, t.name, t.slug, COUNT(DISTINCT a.id)::int AS "articleCount"
        FROM "Tag" t
        LEFT JOIN "Article" a ON a."primaryTagId" = t.id
          AND a.type = 'OPINION' AND a.status = 'PUBLISHED' AND a."deletedAt" IS NULL
        WHERE EXISTS (
          SELECT 1 FROM "Article" a2
          WHERE a2."primaryTagId" = t.id AND a2.type = 'OPINION' AND a2.status = 'PUBLISHED' AND a2."deletedAt" IS NULL
        )
        GROUP BY t.id, t.name, t.slug
        ORDER BY "articleCount" DESC, t.name ASC
      `;
      return rows;
    } catch (e) {
      console.error('getOpinionTagsDirect error:', e);
      return [];
    }
  });
}

export async function getOpinionContributorsDirect(limit = 12) {
  return cached(CK.OPINION_CONTRIBUTORS, { ttl: 600, staleTtl: 1200 }, async () => {
    try {
      // User authors
      const userAuthors: any[] = await sql`
        SELECT u.name, u.slug, u.avatar, u.role, u.bio, NULL AS company,
               COUNT(a.id)::int AS "articleCount", 'user' AS "authorType"
        FROM "User" u
        JOIN "Article" a ON a."authorId" = u.id
          AND a.type = 'OPINION' AND a.status = 'PUBLISHED' AND a."deletedAt" IS NULL
        GROUP BY u.id, u.name, u.slug, u.avatar, u.role, u.bio
        ORDER BY "articleCount" DESC
      `;
      // Founder authors
      const founderAuthors: any[] = await sql`
        SELECT fu.name, fu.id AS slug, fu.avatar, fu.role, fu.bio, fu.company,
               COUNT(a.id)::int AS "articleCount", 'founder' AS "authorType"
        FROM "FounderUser" fu
        JOIN "Article" a ON a."founderAuthorId" = fu.id
          AND a.type = 'OPINION' AND a.status = 'PUBLISHED' AND a."deletedAt" IS NULL
        GROUP BY fu.id, fu.name, fu.avatar, fu.role, fu.bio, fu.company
        ORDER BY "articleCount" DESC
      `;
      const combined = [...userAuthors, ...founderAuthors]
        .sort((a, b) => b.articleCount - a.articleCount)
        .slice(0, limit);
      return combined;
    } catch (e) {
      console.error('getOpinionContributorsDirect error:', e);
      return [];
    }
  });
}

export async function getAuthorBySlugDirect(slug: string) {
  return cached(CK.author(slug), { ttl: 300, staleTtl: 600 }, async () => {
    try {
      // Try User first
      const users: any[] = await sql`
        SELECT id, name, slug, avatar, bio, role, twitter, linkedin
        FROM "User"
        WHERE slug = ${slug} AND "isActive" = true
        LIMIT 1
      `;
      if (users.length) {
        const u = users[0];
        const articles: any[] = await sql`
          SELECT a.id, a.title, a.slug, a.type, a.excerpt, a."coverImage", a."readTimeMinutes",
                 a."publishedAt"::text AS "publishedAt",
                 pt.name AS "primaryTagName", pt.slug AS "primaryTagSlug"
          FROM "Article" a
          LEFT JOIN "Tag" pt ON pt.id = a."primaryTagId"
          WHERE a."authorId" = ${u.id} AND a.status = 'PUBLISHED' AND a."deletedAt" IS NULL
          ORDER BY a."publishedAt" DESC NULLS LAST
        `;
        const topicRows: any[] = await sql`
          SELECT DISTINCT t.name, t.slug
          FROM "Article" a
          JOIN "Tag" t ON t.id = a."primaryTagId"
          WHERE a."authorId" = ${u.id} AND a.type = 'OPINION' AND a.status = 'PUBLISHED' AND a."deletedAt" IS NULL
        `;
        return {
          ...u,
          authorType: 'user' as const,
          articles: articles.map((a: any) => ({
            ...a,
            primaryTag: a.primaryTagName ? { name: a.primaryTagName, slug: a.primaryTagSlug } : null,
          })),
          topics: topicRows,
        };
      }

      // Try FounderUser (slug = founder-{id})
      const founderId = slug.startsWith('founder-') ? slug.slice(8) : null;
      if (!founderId) return null;

      const founders: any[] = await sql`
        SELECT id, name, avatar, bio, role, company, twitter, linkedin, website
        FROM "FounderUser"
        WHERE id = ${founderId}
        LIMIT 1
      `;
      if (!founders.length) return null;
      const fu = founders[0];
      const articles: any[] = await sql`
        SELECT a.id, a.title, a.slug, a.type, a.excerpt, a."coverImage", a."readTimeMinutes",
               a."publishedAt"::text AS "publishedAt",
               pt.name AS "primaryTagName", pt.slug AS "primaryTagSlug"
        FROM "Article" a
        LEFT JOIN "Tag" pt ON pt.id = a."primaryTagId"
        WHERE a."founderAuthorId" = ${founderId} AND a.status = 'PUBLISHED' AND a."deletedAt" IS NULL
        ORDER BY a."publishedAt" DESC NULLS LAST
      `;
      const topicRows: any[] = await sql`
        SELECT DISTINCT t.name, t.slug
        FROM "Article" a
        JOIN "Tag" t ON t.id = a."primaryTagId"
        WHERE a."founderAuthorId" = ${founderId} AND a.type = 'OPINION' AND a.status = 'PUBLISHED' AND a."deletedAt" IS NULL
      `;
      return {
        ...fu,
        slug: `founder-${fu.id}`,
        authorType: 'founder' as const,
        articles: articles.map((a: any) => ({
          ...a,
          primaryTag: a.primaryTagName ? { name: a.primaryTagName, slug: a.primaryTagSlug } : null,
        })),
        topics: topicRows,
      };
    } catch (e) {
      console.error('getAuthorBySlugDirect error:', e);
      return null;
    }
  });
}

export async function getOpinionCountByTagDirect(tagSlug: string): Promise<number> {
  try {
    const rows: any[] = await sql`
      SELECT COUNT(DISTINCT a.id)::int AS cnt
      FROM "Article" a
      LEFT JOIN "Tag" pt ON pt.id = a."primaryTagId"
      WHERE a.type = 'OPINION' AND a.status = 'PUBLISHED' AND a."deletedAt" IS NULL
        AND (
          pt.slug = ${tagSlug}
          OR EXISTS (
            SELECT 1 FROM "ArticleTag" at2
            JOIN "Tag" t2 ON t2.id = at2."tagId"
            WHERE at2."articleId" = a.id AND t2.slug = ${tagSlug}
          )
        )
    `;
    return rows[0]?.cnt || 0;
  } catch {
    return 0;
  }
}

function mapOpinionRow(a: any) {
  const authorName = a.authorName || a.founderAuthorName || 'ASI Editorial';
  const authorSlug = a.authorSlug || (a.founderAuthorId ? `founder-${a.founderAuthorId}` : 'editorial');
  return {
    id: a.id,
    title: a.title,
    slug: a.slug,
    excerpt: a.excerpt,
    coverImage: a.coverImage,
    readTimeMinutes: a.readTimeMinutes,
    isFeatured: a.isFeatured,
    viewCount: a.viewCount || 0,
    likeCount: a.likeCount || 0,
    agreeCount: a.agreeCount || 0,
    disagreeCount: a.disagreeCount || 0,
    publishedAt: a.publishedAt,
    updatedAt: a.updatedAt,
    author: {
      name: authorName,
      slug: authorSlug,
      avatar: a.authorAvatar || a.founderAuthorAvatar || null,
      bio: a.authorBio || null,
      company: a.founderCompany || null,
    },
    primaryTag: a.primaryTagName ? { name: a.primaryTagName, slug: a.primaryTagSlug } : null,
    commentCount: a.commentCount || 0,
    trendingScore: a.trendingScore || 0,
  };
}

// ── Directory Entities ─────────────────────────────────────────────────────────

export async function getAiToolBySlugDirect(slug: string) {
  return cached(CK.tool(slug), { ttl: 120, staleTtl: 300 }, async () => {
    try {
      const rows = await sql`
        SELECT
          t.*,
          c.name AS "categoryName",
          c.slug AS "categorySlug",
          pc.name AS "parentCategoryName",
          pc.slug AS "parentCategorySlug",
          pc.icon AS "parentCategoryIcon",
          s.id AS "startupId", s.name AS "startupName", s.slug AS "startupSlug", s."logoUrl" AS "startupLogoUrl", s."totalFundingInr"
        FROM "AiTool" t
        LEFT JOIN "ToolCategory" c ON c.id = t."categoryId"
        LEFT JOIN "ToolCategory" pc ON pc.id = c."parentId"
        LEFT JOIN "Startup" s ON s.id = t."startupId"
        WHERE t.slug = ${slug} AND t."deletedAt" IS NULL
        LIMIT 1
      `;
      if (!rows.length) return null;
      const tool = rows[0];

      // Fetch all cross-linked data in parallel
      const [stories, fundingRounds, userReviews, useCases] = await Promise.all([
        sql`
          SELECT id, title, slug, excerpt, "coverImage", "publishedAt"::text AS "publishedAt"
          FROM "Article"
          WHERE "toolId" = ${tool.id} AND status = 'PUBLISHED' AND "deletedAt" IS NULL
          ORDER BY "publishedAt" DESC
        `,
        tool.startupId
          ? sql`
              SELECT "roundType", "amountInr", "amountUsd", "announcedAt"::text AS "announcedAt", "leadInvestors", "sourceUrl"
              FROM "FundingRound"
              WHERE "startupId" = ${tool.startupId}
              ORDER BY "announcedAt" DESC
            `
          : Promise.resolve([]),
        sql`
          SELECT r.id, r.rating, r.title, r.body, r."publishedAt"::text AS "publishedAt", r."helpfulCount",
                 u.name AS "authorName", u.role AS "authorRole"
          FROM "ToolReview" r
          JOIN "User" u ON u.id = r."userId"
          WHERE r."toolId" = ${tool.id} AND r.status = 'APPROVED'
          ORDER BY r."helpfulCount" DESC, r."publishedAt" DESC
        `,
        sql`
          SELECT id, text, type
          FROM "ToolUseCase"
          WHERE "toolId" = ${tool.id}
          ORDER BY id
        `,
      ]);

      const keyFeatures = (useCases as any[]).filter((uc: any) => uc.type === 'feature');
      const toolUseCases = (useCases as any[]).filter((uc: any) => uc.type !== 'feature');

      return { ...tool, stories, fundingRounds, userReviews, useCases: toolUseCases, keyFeatures, category: tool.categoryName };
    } catch (e) {
      console.error('getAiToolBySlugDirect error:', e);
      return null;
    }
  });
}

export async function getSimilarToolsDirect(categoryId: string, excludeSlug: string, limit = 8) {
  try {
    // Priority 1: same subcategory, sorted by rating
    const sameCategory = await sql`
      SELECT
        t.id, t.name, t.slug, t.tagline, t."logoUrl",
        t."avgRating", t."pricingModel", t."websiteUrl",
        c.name AS "categoryName", c.slug AS "categorySlug",
        'same-category' AS "matchType"
      FROM "AiTool" t
      LEFT JOIN "ToolCategory" c ON c.id = t."categoryId"
      WHERE t."categoryId" = ${categoryId}
        AND t.slug != ${excludeSlug}
        AND t.status = 'APPROVED'
        AND t."deletedAt" IS NULL
      ORDER BY t."avgRating" DESC NULLS LAST, t."listingTier" DESC
      LIMIT ${limit}
    `;

    // If we have enough from same subcategory, return early
    if (sameCategory.length >= limit) {
      return sameCategory as any[];
    }

    // Priority 2: same parent category (sibling subcategories)
    const slugsAlready = sameCategory.map((r: any) => r.slug).concat([excludeSlug]);
    const needed = limit - sameCategory.length;
    const sameParent = await sql`
      SELECT
        t.id, t.name, t.slug, t.tagline, t."logoUrl",
        t."avgRating", t."pricingModel", t."websiteUrl",
        c.name AS "categoryName", c.slug AS "categorySlug",
        'same-parent' AS "matchType"
      FROM "AiTool" t
      LEFT JOIN "ToolCategory" c ON c.id = t."categoryId"
      WHERE c."parentId" = (SELECT "parentId" FROM "ToolCategory" WHERE id = ${categoryId})
        AND t."categoryId" != ${categoryId}
        AND t.slug != ALL(${slugsAlready}::text[])
        AND t.status = 'APPROVED'
        AND t."deletedAt" IS NULL
      ORDER BY t."avgRating" DESC NULLS LAST
      LIMIT ${needed}
    `;

    const combined = [...sameCategory, ...sameParent];
    if (combined.length >= limit) {
      return combined as any[];
    }

    // Priority 3: top-rated approved tools as fallback filler
    const allSlugs = combined.map((r: any) => r.slug).concat([excludeSlug]);
    const fillerNeeded = limit - combined.length;
    const filler = await sql`
      SELECT
        t.id, t.name, t.slug, t.tagline, t."logoUrl",
        t."avgRating", t."pricingModel", t."websiteUrl",
        c.name AS "categoryName", c.slug AS "categorySlug",
        'top-rated' AS "matchType"
      FROM "AiTool" t
      LEFT JOIN "ToolCategory" c ON c.id = t."categoryId"
      WHERE t.status = 'APPROVED' AND t."deletedAt" IS NULL
        AND t.slug != ALL(${allSlugs}::text[])
      ORDER BY t."avgRating" DESC NULLS LAST, t."listingTier" DESC
      LIMIT ${fillerNeeded}
    `;

    return [...combined, ...filler] as Array<{
      id: string;
      name: string;
      slug: string;
      tagline: string;
      logoUrl: string | null;
      avgRating: string | null;
      pricingModel: string;
      websiteUrl: string;
      categoryName: string;
      categorySlug?: string;
      matchType?: string;
    }>;
  } catch (e) {
    console.error('getSimilarToolsDirect error:', e);
    return [];
  }
}

export async function getFeaturedToolsDirect(limit = 4) {
  return cached(CK.FEATURED_TOOLS, { ttl: 300, staleTtl: 600 }, async () => {
    try {
      const rows: any[] = await sql`
        SELECT t.id, t.name, t.slug, t.tagline, t.description, t."logoUrl", t."websiteUrl", t."avgRating", c.name AS "categoryName"
        FROM "AiTool" t
        LEFT JOIN "ToolCategory" c ON c.id = t."categoryId"
        WHERE t."listingTier" = 'FEATURED' AND t.status = 'APPROVED' AND t."deletedAt" IS NULL
        ORDER BY t."updatedAt" DESC
        LIMIT ${limit}
      `;
      return rows.map((t: any) => ({
        ...t,
        category: { name: t.categoryName }
      }));
    } catch (e) {
      console.error('getFeaturedToolsDirect error:', e);
      return [];
    }
  });
}

export async function getPriorityToolsDirect(limit = 6) {
  return cached(CK.PRIORITY_TOOLS, { ttl: 300, staleTtl: 600 }, async () => {
    try {
      const rows: any[] = await sql`
        SELECT t.id, t.name, t.slug, t.tagline, t."logoUrl", t."avgRating", c.name AS "categoryName"
        FROM "AiTool" t
        LEFT JOIN "ToolCategory" c ON c.id = t."categoryId"
        WHERE t."listingTier" = 'PRIORITY' AND t.status = 'APPROVED' AND t."deletedAt" IS NULL
        ORDER BY md5(t.id || (EXTRACT(EPOCH FROM NOW())::bigint / 300)::text)
        LIMIT ${limit}
      `;
      return rows.map((t: any) => ({
        ...t,
        category: { name: t.categoryName }
      }));
    } catch (e) {
      console.error('getPriorityToolsDirect error:', e);
      return [];
    }
  });
}

export async function getToolCategoriesDirect() {
  try {
    const rows = await sql`
      SELECT id, name, slug, icon, description, "parentId", level, "toolCount", "sortOrder"
      FROM "ToolCategory"
      WHERE "isActive" = true
      ORDER BY level ASC, "sortOrder" ASC, name ASC
    `;
    return rows;
  } catch (e) {
    console.error('getToolCategoriesDirect error:', e);
    return [];
  }
}

/**
 * Get hierarchical tool categories: parents with nested subcategories.
 */
export async function getToolCategoryTreeDirect() {
  return cached(CK.TOOL_CATEGORIES, { ttl: 900, staleTtl: 1800 }, async () => {
    try {
      const parents = await sql`
        SELECT id, name, slug, icon, description, "toolCount", "sortOrder"
        FROM "ToolCategory"
        WHERE level = 0 AND "isActive" = true
        ORDER BY "sortOrder" ASC
      `;
      const subcategories = await sql`
        SELECT id, name, slug, description, "parentId", "toolCount", "sortOrder"
        FROM "ToolCategory"
        WHERE level = 1 AND "isActive" = true
        ORDER BY "sortOrder" ASC, name ASC
      `;

      const subsByParent = new Map<string, any[]>();
      for (const sub of subcategories) {
        const parentId = sub.parentId;
        if (!subsByParent.has(parentId)) subsByParent.set(parentId, []);
        subsByParent.get(parentId)!.push(sub);
      }

      return parents.map((p: any) => ({
        ...p,
        subcategories: subsByParent.get(p.id) || [],
      }));
    } catch (e) {
      console.error('getToolCategoryTreeDirect error:', e);
      return [];
    }
  });
}

/**
 * Get tag groups with tags for the public tools listing filter sidebar.
 * Only returns active, non-admin-only groups with active tags that have tagCount > 0 OR are commonly needed.
 */
export async function getToolTagGroupsForFilterDirect() {
  return cached(CK.TAG_GROUPS, { ttl: 900, staleTtl: 1800 }, async () => {
    try {
      const groups = await sql`
        SELECT id, name, slug, icon, description, "sortOrder", "displayMode", "maxVisibleDefault"
        FROM "ToolTagGroup"
        WHERE "isActive" = true AND "isAdminOnly" = false
        ORDER BY "sortOrder" ASC
      `;

      const tags = await sql`
        SELECT id, name, slug, emoji, "groupId", "sortOrder", "tagCount"
        FROM "ToolSystemTag"
        WHERE "isActive" = true
        ORDER BY "sortOrder" ASC, name ASC
      `;

      const tagsByGroup: Record<string, any[]> = {};
      for (const tag of tags) {
        const gid = (tag as any).groupId;
        if (!tagsByGroup[gid]) tagsByGroup[gid] = [];
        tagsByGroup[gid].push(tag);
      }

      return groups.map((g: any) => ({
        ...g,
        tags: tagsByGroup[g.id] || [],
      }));
    } catch (e) {
      console.error('getToolTagGroupsForFilterDirect error:', e);
      return [];
    }
  });
}

/**
 * Get tag IDs mapped to tool IDs for client-side filtering.
 * Returns a map: { toolId -> [tagId, tagId, ...] }
 */
export async function getToolTagMappingsDirect() {
  return cached(CK.TOOL_TAG_MAP, { ttl: 300, staleTtl: 600 }, async () => {
    try {
      const mappings = await sql`
        SELECT "toolId", "tagId"
        FROM "ToolSystemTagMapping"
      `;
      const map: Record<string, string[]> = {};
      for (const m of mappings) {
        const tid = (m as any).toolId;
        if (!map[tid]) map[tid] = [];
        map[tid].push((m as any).tagId);
      }
      return map;
    } catch (e) {
      console.error('getToolTagMappingsDirect error:', e);
      return {};
    }
  });
}

/**
 * Get all tags for a specific tool, grouped by tag group.
 * Used on tool detail pages.
 */
export async function getToolTagsGroupedDirect(toolId: string) {
  return cached(CK.toolTags(toolId), { ttl: 300, staleTtl: 600 }, async () => {
  try {
    const rows = await sql`
      SELECT t.id, t.name, t.slug, t.emoji, 
             g.id AS "groupId", g.name AS "groupName", g.slug AS "groupSlug", g.icon AS "groupIcon", g."sortOrder" AS "groupSortOrder"
      FROM "ToolSystemTagMapping" m
      JOIN "ToolSystemTag" t ON t.id = m."tagId"
      JOIN "ToolTagGroup" g ON g.id = t."groupId"
      WHERE m."toolId" = ${toolId} AND t."isActive" = true AND g."isActive" = true
      ORDER BY g."sortOrder" ASC, t."sortOrder" ASC
    `;

    // Group by tag group
    const groupMap = new Map<string, { id: string; name: string; slug: string; icon: string | null; tags: any[] }>();
    for (const row of rows) {
      const r = row as any;
      if (!groupMap.has(r.groupId)) {
        groupMap.set(r.groupId, {
          id: r.groupId,
          name: r.groupName,
          slug: r.groupSlug,
          icon: r.groupIcon,
          tags: [],
        });
      }
      groupMap.get(r.groupId)!.tags.push({
        id: r.id,
        name: r.name,
        slug: r.slug,
        emoji: r.emoji,
      });
    }

    return Array.from(groupMap.values());
  } catch (e) {
    console.error('getToolTagsGroupedDirect error:', e);
    return [];
  }
  });
}

export async function getDirectoryToolsDirect(categorySlug?: string) {
  return cached(CK.toolDirectory(categorySlug || ''), { ttl: 60, staleTtl: 120 }, async () => {
  try {
    let rows: any[];
    if (categorySlug && categorySlug !== 'all') {
      // Check if slug is a parent category or subcategory
      rows = await sql`
        SELECT t.id, t.name, t.slug, t.tagline, LEFT(t.description, 130) AS description, t."pricingModel", t."logoUrl", t."avgRating",
               t."hasApi", t."hasMobileApp", t."freeTrialDays", t."upvoteCount", t."saveCount", t."launchYear", t."headquartersCountry", t."founderNames",
               c.name AS "categoryName", c.slug AS "categorySlug",
               pc.name AS "parentCategoryName", pc.slug AS "parentCategorySlug",
               tfc.tier AS "campaignTier"
        FROM "AiTool" t
        LEFT JOIN "ToolCategory" c ON c.id = t."categoryId"
        LEFT JOIN "ToolCategory" pc ON pc.id = c."parentId"
        LEFT JOIN "ToolFeaturedCampaign" tfc ON tfc."toolId" = t.id
          AND tfc."cancelledAt" IS NULL
          AND tfc."startDate" <= NOW() AND tfc."endDate" >= NOW()
        WHERE t.status = 'APPROVED' AND t."deletedAt" IS NULL
          AND (
            c.slug = ${categorySlug}
            OR c."parentId" IN (SELECT id FROM "ToolCategory" WHERE slug = ${categorySlug})
          )
        ORDER BY
          CASE WHEN tfc.tier = 'FEATURED' THEN 1
               WHEN tfc.tier = 'PRIORITY' THEN 2
               WHEN t."listingTier" = 'FEATURED' THEN 1
               WHEN t."listingTier" = 'PRIORITY' THEN 2
               ELSE 3 END ASC,
          t."createdAt" DESC
      `;
    } else {
      rows = await sql`
        SELECT t.id, t.name, t.slug, t.tagline, LEFT(t.description, 130) AS description, t."pricingModel", t."logoUrl", t."avgRating",
               t."hasApi", t."hasMobileApp", t."freeTrialDays", t."upvoteCount", t."saveCount", t."launchYear", t."headquartersCountry", t."founderNames",
               c.name AS "categoryName", c.slug AS "categorySlug",
               pc.name AS "parentCategoryName", pc.slug AS "parentCategorySlug",
               tfc.tier AS "campaignTier"
        FROM "AiTool" t
        LEFT JOIN "ToolCategory" c ON c.id = t."categoryId"
        LEFT JOIN "ToolCategory" pc ON pc.id = c."parentId"
        LEFT JOIN "ToolFeaturedCampaign" tfc ON tfc."toolId" = t.id
          AND tfc."cancelledAt" IS NULL
          AND tfc."startDate" <= NOW() AND tfc."endDate" >= NOW()
        WHERE t.status = 'APPROVED' AND t."deletedAt" IS NULL
        ORDER BY
          CASE WHEN tfc.tier = 'FEATURED' THEN 1
               WHEN tfc.tier = 'PRIORITY' THEN 2
               WHEN t."listingTier" = 'FEATURED' THEN 1
               WHEN t."listingTier" = 'PRIORITY' THEN 2
               ELSE 3 END ASC,
          t."createdAt" DESC
      `;
    }

    return rows.map((t: any) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      tagline: t.tagline,
      logoUrl: t.logoUrl || null,
      category: t.categoryName || 'General',
      categorySlug: t.categorySlug || 'general',
      parentCategory: t.parentCategoryName || null,
      parentCategorySlug: t.parentCategorySlug || null,
      rating: parseFloat(t.avgRating || '4.0'),
      pricing: t.pricingModel || 'Free',
      verdict: t.description || 'An excellent AI tool optimized for productivity.',
      hasApi: t.hasApi || false,
      hasMobileApp: t.hasMobileApp || false,
      freeTrialDays: t.freeTrialDays || null,
      upvoteCount: parseInt(t.upvoteCount) || 0,
      saveCount: parseInt(t.saveCount) || 0,
      launchYear: t.launchYear || null,
      country: t.headquartersCountry || null,
      founderNames: t.founderNames || []
    }));
  } catch (e) {
    console.error('getDirectoryToolsDirect error:', e);
    return [];
  }
  });
}

/**
 * Related articles, ranked by how much they share with this one:
 *   shared primary tag +3 · each shared tag +2 · same startup or tool +2 · same category +1 · same type +1,
 * newest first on ties. Limited to the given article types so links stay in the right section;
 * articles sharing nothing fill the remaining slots by recency.
 */
export async function getRelatedArticlesDirect(articleId: string, types: string[], limit = 3) {
  try {
    const rows: any[] = await sql`
      WITH cur AS (
        SELECT id, type, "primaryTagId", "categoryId", "startupId", "toolId" FROM "Article" WHERE id = ${articleId}
      ), curtags AS (
        SELECT "tagId" FROM "ArticleTag" WHERE "articleId" = ${articleId}
      )
      SELECT a.id, a.title, a.slug, a.type, a."readTimeMinutes", a."coverImage", a."thumbnailImage",
             a."publishedAt"::text AS "publishedAt", c.name AS "categoryName",
             (
               CASE WHEN a."primaryTagId" IS NOT NULL
                     AND (a."primaryTagId" = cur."primaryTagId" OR a."primaryTagId" IN (SELECT "tagId" FROM curtags)) THEN 3 ELSE 0 END
               + 2 * (SELECT COUNT(*) FROM "ArticleTag" at2 WHERE at2."articleId" = a.id AND at2."tagId" IN (SELECT "tagId" FROM curtags))
               + CASE WHEN (a."startupId" IS NOT NULL AND a."startupId" = cur."startupId")
                        OR (a."toolId" IS NOT NULL AND a."toolId" = cur."toolId") THEN 2 ELSE 0 END
               + CASE WHEN a."categoryId" IS NOT NULL AND a."categoryId" = cur."categoryId" THEN 1 ELSE 0 END
               + CASE WHEN a.type = cur.type THEN 1 ELSE 0 END
             )::int AS score
      FROM "Article" a
      CROSS JOIN cur
      LEFT JOIN "Category" c ON c.id = a."categoryId"
      WHERE a.status = 'PUBLISHED' AND a."deletedAt" IS NULL AND a.id <> cur.id
        AND a.type::text = ANY(${types}::text[])
      ORDER BY score DESC, a."publishedAt" DESC NULLS LAST
      LIMIT ${limit}
    `;
    return rows.map((a: any) => ({ ...a, category: { name: a.categoryName } }));
  } catch (e) {
    console.error('getRelatedArticlesDirect error:', e);
    return [];
  }
}

export async function getArticlesDirect(params: { type?: string; limit?: number; isFeatured?: boolean } = {}) {
  try {
    const limit = params.limit || 10;

    if (params.type && params.isFeatured !== undefined) {
      const rows: any[] = await sql`
        SELECT
          a.id, a.title, a.slug, a.type, a.excerpt, a."coverImage", a."thumbnailImage",
          a."readTimeMinutes", a."isFeatured",
          a."publishedAt"::text AS "publishedAt",
          u.name AS "authorName",
          c.name AS "categoryName"
        FROM "Article" a
        LEFT JOIN "User" u ON u.id = a."authorId"
        LEFT JOIN "Category" c ON c.id = a."categoryId"
        WHERE a.status = 'PUBLISHED' AND a."deletedAt" IS NULL
          AND a.type = ${params.type} AND a."isFeatured" = ${params.isFeatured}
        ORDER BY a."publishedAt" DESC NULLS LAST
        LIMIT ${limit}
      `;
      return rows.map((a: any) => ({
        ...a,
        author: { name: a.authorName },
        category: { name: a.categoryName },
      }));
    } else if (params.type) {
      const rows: any[] = await sql`
        SELECT
          a.id, a.title, a.slug, a.type, a.excerpt, a."coverImage", a."thumbnailImage",
          a."readTimeMinutes", a."isFeatured",
          a."publishedAt"::text AS "publishedAt",
          u.name AS "authorName",
          c.name AS "categoryName"
        FROM "Article" a
        LEFT JOIN "User" u ON u.id = a."authorId"
        LEFT JOIN "Category" c ON c.id = a."categoryId"
        WHERE a.status = 'PUBLISHED' AND a."deletedAt" IS NULL AND a.type = ${params.type}
        ORDER BY a."publishedAt" DESC NULLS LAST
        LIMIT ${limit}
      `;
      return rows.map((a: any) => ({
        ...a,
        author: { name: a.authorName },
        category: { name: a.categoryName },
      }));
    } else if (params.isFeatured !== undefined) {
      const rows: any[] = await sql`
        SELECT
          a.id, a.title, a.slug, a.type, a.excerpt, a."coverImage", a."thumbnailImage",
          a."readTimeMinutes", a."isFeatured",
          a."publishedAt"::text AS "publishedAt",
          u.name AS "authorName",
          c.name AS "categoryName"
        FROM "Article" a
        LEFT JOIN "User" u ON u.id = a."authorId"
        LEFT JOIN "Category" c ON c.id = a."categoryId"
        WHERE a.status = 'PUBLISHED' AND a."deletedAt" IS NULL AND a."isFeatured" = ${params.isFeatured}
        ORDER BY a."publishedAt" DESC NULLS LAST
        LIMIT ${limit}
      `;
      return rows.map((a: any) => ({
        ...a,
        author: { name: a.authorName },
        category: { name: a.categoryName },
      }));
    } else {
      const rows: any[] = await sql`
        SELECT
          a.id, a.title, a.slug, a.type, a.excerpt, a."coverImage", a."thumbnailImage",
          a."readTimeMinutes", a."isFeatured",
          a."publishedAt"::text AS "publishedAt",
          u.name AS "authorName",
          c.name AS "categoryName"
        FROM "Article" a
        LEFT JOIN "User" u ON u.id = a."authorId"
        LEFT JOIN "Category" c ON c.id = a."categoryId"
        WHERE a.status = 'PUBLISHED' AND a."deletedAt" IS NULL
        ORDER BY a."publishedAt" DESC NULLS LAST
        LIMIT ${limit}
      `;
      return rows.map((a: any) => ({
        ...a,
        author: { name: a.authorName },
        category: { name: a.categoryName },
      }));
    }
  } catch (e) {
    console.error('getArticlesDirect error:', e);
    return [];
  }
}

export async function getHeroArticleDirect() {
  return cached(CK.HERO_ARTICLE, { ttl: 120, staleTtl: 300 }, async () => {
    const rows = await getArticlesDirect({ isFeatured: true, limit: 1 });
    if (rows.length) return rows[0];
    const latest = await getArticlesDirect({ limit: 1 });
    return latest.length ? latest[0] : null;
  });
}

/** Titles of the most-read published articles, for the homepage ticker fallback. */
export async function getTrendingNewsDirect(limit = 10): Promise<string[]> {
  try {
    const rows = await sql`
      SELECT title FROM "Article"
      WHERE status = 'PUBLISHED' AND "deletedAt" IS NULL
      ORDER BY "viewCount" DESC
      LIMIT ${limit}
    `;
    return (rows as { title: string }[]).map((r) => r.title);
  } catch (e) {
    console.error('getTrendingNewsDirect error:', e);
    return [];
  }
}

export async function getLatestStoriesDirect(limit = 3) {
  return cached(CK.LATEST_STORIES, { ttl: 60, staleTtl: 120 }, async () => {
    return getArticlesDirect({ limit });
  });
}

export async function getFounderSpotlightDirect(limit = 5) {
  return cached(CK.FOUNDER_SPOTLIGHTS, { ttl: 120, staleTtl: 300 }, async () => {
    const rows = await getArticlesDirect({ type: 'STORY', limit });
    return rows.length ? rows : null;
  });
}

export async function getIndiaAIEcosystemDirect(limit = 4) {
  return cached(CK.INDIA_AI_ECOSYSTEM, { ttl: 120, staleTtl: 300 }, async () => {
    return getArticlesDirect({ limit });
  });
}

// ── Ad Zones ──────────────────────────────────────────────────────────────────

export async function getActiveCreativeForZone(zone: string) {
  try {
    const rows: any[] = await sql`
      SELECT
        cr.id, cr.zone, cr.headline, cr."bodyText", cr."ctaText", cr."ctaUrl", cr."imageUrl",
        c."companyName", c.status AS "campaignStatus"
      FROM "AdCreative" cr
      JOIN "AdCampaign" c ON c.id = cr."campaignId"
      WHERE cr.zone = ${zone}::"AdZoneType"
        AND cr."isActive" = true
        AND c.status = 'ACTIVE'
        AND c."startDate" <= NOW()
        AND c."endDate" >= NOW()
      ORDER BY md5(cr.id || (EXTRACT(EPOCH FROM NOW())::bigint / 300)::text)
      LIMIT 1
    `;
    return rows.length ? rows[0] : null;
  } catch (e) {
    console.error('getActiveCreativeForZone error:', e);
    return null;
  }
}
// ── Tickers ──────────────────────────────────────────────────────────────────

export async function getActiveBreakingTickers() {
  try {
    const tickers = await sql`
      SELECT text
      FROM "BreakingTicker"
      WHERE "isActive" = true
      ORDER BY "sortOrder" ASC, "createdAt" DESC
    `;
    return (tickers as any[]).map(t => t.text);
  } catch (error) {
    console.error('Error fetching breaking tickers:', error);
    return [];
  }
}

export async function getActiveLiveTickers() {
  return cached(CK.LIVE_TICKERS, { ttl: 60, staleTtl: 120 }, async () => {
    try {
      const tickers = await sql`
        SELECT text
        FROM "LiveTicker"
        WHERE "isActive" = true
        ORDER BY "sortOrder" ASC, "createdAt" DESC
      `;
      return (tickers as any[]).map(t => t.text);
    } catch (error) {
      console.error('Error fetching live tickers:', error);
      return [];
    }
  });
}

// ── Featured Startups ──────────────────────────────────────────────────────────────────

export async function getFeaturedStartupDirect() {
  return cached(CK.FEATURED_STARTUPS, { ttl: 300, staleTtl: 600 }, async () => {
    try {
      const startups = await sql`
        SELECT id, name, tagline, description, "websiteUrl", "logoUrl", "statValue", "statLabel"
        FROM "Startup"
        WHERE "isFeatured" = true AND "deletedAt" IS NULL
        ORDER BY "createdAt" DESC
      `;
      if (!startups.length) return null;
      return startups.map((s: any) => ({
        name: s.name,
        tagline: s.tagline,
        description: s.description,
        ctaUrl: s.websiteUrl || '#',
        logoUrl: s.logoUrl,
        statValue: s.statValue || null,
        statLabel: s.statLabel || null,
      }));
    } catch (error) {
      console.error('getFeaturedStartupDirect: Error fetching featured startups:', error);
      return null;
    }
  });
}

// ── Funding Digests ──────────────────────────────────────────────────────────────────

export async function getFundingDigestsDirect(limit = 3) {
  return cached(CK.FUNDING_DIGESTS, { ttl: 120, staleTtl: 300 }, async () => {
    try {
      const digests = await sql`
        SELECT
          id, title, date, status, "dealsCount", "totalRaised", deals
        FROM "FundingDigest"
        WHERE status = 'PUBLISHED'
        ORDER BY date DESC
        LIMIT ${limit}
      `;
      return digests.map((digest: any) => ({
        slug: `week-${digest.id.substring(0, 8)}`,
        title: digest.title,
        date: digest.date,
        dealsCount: digest.dealsCount,
        totalRaised: digest.totalRaised,
        deals: typeof digest.deals === 'string' ? JSON.parse(digest.deals) : digest.deals || [],
      }));
    } catch (error) {
      console.error('getFundingDigestsDirect error:', error);
      return [];
    }
  });
}

export async function getAllFundingRoundsDirect() {
  try {
    const rows = await sql`
      SELECT
        fr.id, fr."roundType", fr."amountInr", fr."amountUsd",
        fr."announcedAt"::text AS "announcedAt", fr."leadInvestors", fr."allInvestors",
        s.name AS "startupName", s.slug AS "startupSlug", s."headquartersCity",
        s.category AS "startupCategory", s."logoUrl" AS "startupLogoUrl"
      FROM "FundingRound" fr
      JOIN "Startup" s ON s.id = fr."startupId"
      WHERE s."deletedAt" IS NULL
      ORDER BY fr."announcedAt" DESC
    `;
    return rows;
  } catch (error) {
    console.error('getAllFundingRoundsDirect error:', error);
    return [];
  }
}

// Helper function to format rupees from paise
function formatRupeesFromPaise(paise: number): string {
  const crores = paise / 1000000000;
  if (crores >= 1) {
    return `₹${crores.toFixed(0)}Cr`;
  }
  const lakhs = paise / 10000000;
  return `₹${lakhs.toFixed(0)}L`;
}

// ── Hero Slots ──────────────────────────────────────────────────────────────────

export async function getActiveHeroSlotsDirect() {
  return cached(CK.HERO_SLOTS, { ttl: 300, staleTtl: 600 }, async () => {
    try {
      const rows: any[] = await sql`
        SELECT id, title, excerpt, "coverImage", "ctaUrl", "ctaLabel",
               "badgeText", "authorName", "readTimeMinutes",
               "startDate"::text AS "startDate", "endDate"::text AS "endDate",
               "sortOrder"
        FROM "HeroSlot"
        WHERE "isActive" = true
          AND ("startDate" IS NULL OR "startDate" <= NOW())
          AND ("endDate" IS NULL OR "endDate" >= NOW())
        ORDER BY "sortOrder" ASC, "createdAt" DESC
        LIMIT 5
      `;
      return rows;
    } catch (e) {
      console.error('getActiveHeroSlotsDirect error:', e);
      return [];
    }
  });
}

// ── Sponsors ──────────────────────────────────────────────────────────────────

export async function getActiveSponsorsDirect() {
  return cached(CK.ACTIVE_SPONSORS, { ttl: 300, staleTtl: 600 }, async () => {
    try {
      const sponsors = await sql`
        SELECT brand, tagline, "ctaUrl", "logoUrl"
        FROM "Sponsor"
        WHERE "isActive" = true
          AND ("startDate" IS NULL OR "startDate" <= NOW())
          AND ("endDate" IS NULL OR "endDate" >= NOW())
        ORDER BY "sortOrder" ASC, "createdAt" DESC
      `;
      return sponsors.length > 0 ? sponsors : null;
    } catch (error) {
      console.error('Error fetching active sponsors:', error);
      return null;
    }
  });
}

export async function getActiveSponsorDirect() {
  const sponsors = await getActiveSponsorsDirect();
  return sponsors ? sponsors[0] : null;
}

// ── Funding Rounds ──────────────────────────────────────────────────────────────────

export async function getFundingRoundBySlugDirect(slug: string) {
  try {
    const rows = await sql`
      SELECT 
        fr.id, fr.slug, fr."roundType", fr."amountInr", fr."amountUsd",
        fr."announcedAt"::text AS "announcedAt", 
        fr."leadInvestors", fr."allInvestors", fr."sourceUrl",
        s.name AS "startupName", 
        s.slug AS "startupSlug", 
        s."headquartersCity"
      FROM "FundingRound" fr
      JOIN "Startup" s ON s.id = fr."startupId"
      WHERE fr.slug = ${slug} AND s."deletedAt" IS NULL
      LIMIT 1
    `;
    return rows.length ? rows[0] : null;
  } catch (error) {
    console.error('getFundingRoundBySlugDirect error:', error);
    return null;
  }
}


// ── db adapter for API routes that use db.query() pattern ─────────────────────
export const db = {
  async query(text: string, params?: any[]) {
    const s = getSql();
    // Convert $1, $2 style params to tagged template
    if (params && params.length > 0) {
      // Use Neon's sql function with raw query
      const result = await s.call(s, [text] as any, ...params);
      return { rows: result as any[] };
    }
    const result = await s.call(s, [text] as any);
    return { rows: result as any[] };
  }
};


/**
 * Get pros and cons for a tool (for detail page display).
 */
export async function getToolProsConsDirect(toolId: string) {
  return cached(CK.toolProsCons(toolId), { ttl: 300, staleTtl: 600 }, async () => {
    try {
      const [pros, cons] = await Promise.all([
        sql`SELECT id, text FROM "ToolPro" WHERE "toolId" = ${toolId} ORDER BY id`,
        sql`SELECT id, text FROM "ToolCon" WHERE "toolId" = ${toolId} ORDER BY id`,
      ]);
      return { pros, cons };
    } catch (e) {
      console.error('getToolProsConsDirect error:', e);
      return { pros: [], cons: [] };
    }
  });
}


/**
 * Get alternative tools for a tool (for detail page).
 */
export async function getToolAlternativesDirect(toolId: string) {
  return cached(CK.toolAlternatives(toolId), { ttl: 300, staleTtl: 600 }, async () => {
    try {
      const rows = await sql`
        SELECT t.id, t.name, t.slug, t."logoUrl", t.tagline, t."avgRating", t."pricingModel",
               c.name AS "categoryName"
        FROM "ToolAlternative" a
        JOIN "AiTool" t ON t.id = a."alternativeId"
        LEFT JOIN "ToolCategory" c ON c.id = t."categoryId"
        WHERE a."toolId" = ${toolId} AND t."deletedAt" IS NULL AND t.status = 'APPROVED'
        ORDER BY t."avgRating" DESC
        LIMIT 10
      `;
      return rows;
    } catch (e) {
      console.error('getToolAlternativesDirect error:', e);
      return [];
    }
  });
}


/**
 * Get founder responses to reviews for display on the detail page.
 * Returns a map: { reviewId -> { body, founderName, createdAt } }
 */
export async function getReviewResponsesDirect(toolId: string) {
  return cached(CK.toolReviewResponses(toolId), { ttl: 120, staleTtl: 300 }, async () => {
    try {
      const rows = await sql`
        SELECT rr."reviewId", rr.body, rr."createdAt", fu.name AS "founderName"
        FROM "ToolReviewResponse" rr
        JOIN "FounderUser" fu ON fu.id = rr."founderId"
        JOIN "ToolReview" tr ON tr.id = rr."reviewId"
        WHERE tr."toolId" = ${toolId}
      `;
      const map: Record<string, any> = {};
      for (const r of rows) {
        map[(r as any).reviewId] = { body: (r as any).body, founderName: (r as any).founderName, createdAt: (r as any).createdAt };
      }
      return map;
    } catch (e) {
      console.error('getReviewResponsesDirect error:', e);
      return {};
    }
  });
}


// ─── Discovery Sections ─────────────────────────────────────────────────────

/**
 * Get trending tools (by click velocity in last 7 days).
 */
export async function getTrendingToolsDirect(limit = 12) {
  return cached(CK.TRENDING, { ttl: 600, staleTtl: 1200 }, async () => {
    try {
      const rows = await sql`
        SELECT t.id, t.name, t.slug, t.tagline, t."logoUrl", t."avgRating", t."pricingModel",
               c.name AS "categoryName", c.slug AS "categorySlug",
               COUNT(ac.id)::int AS "recentClicks"
        FROM "AiTool" t
        LEFT JOIN "ToolCategory" c ON c.id = t."categoryId"
        LEFT JOIN "AffiliateClick" ac ON ac."toolId" = t.id AND ac."createdAt" >= NOW() - INTERVAL '7 days'
        WHERE t.status = 'APPROVED' AND t."deletedAt" IS NULL
        GROUP BY t.id, t.name, t.slug, t.tagline, t."logoUrl", t."avgRating", t."pricingModel", c.name, c.slug
        HAVING COUNT(ac.id) > 0
        ORDER BY COUNT(ac.id) DESC, t."avgRating" DESC
        LIMIT ${limit}
      `;
      return rows;
    } catch (e) {
      console.error('getTrendingToolsDirect error:', e);
      return [];
    }
  });
}

/**
 * Get recently added tools (last 30 days, approved).
 */
export async function getRecentlyAddedToolsDirect(limit = 12) {
  return cached(CK.RECENT_TOOLS, { ttl: 300, staleTtl: 600 }, async () => {
    try {
      const rows = await sql`
        SELECT t.id, t.name, t.slug, t.tagline, t."logoUrl", t."avgRating", t."pricingModel",
               c.name AS "categoryName", c.slug AS "categorySlug"
        FROM "AiTool" t
        LEFT JOIN "ToolCategory" c ON c.id = t."categoryId"
        WHERE t.status = 'APPROVED' AND t."deletedAt" IS NULL
          AND t."createdAt" >= NOW() - INTERVAL '30 days'
        ORDER BY t."createdAt" DESC
        LIMIT ${limit}
      `;
      return rows;
    } catch (e) {
      console.error('getRecentlyAddedToolsDirect error:', e);
      return [];
    }
  });
}

/**
 * Get editor's picks (featured tools with active campaigns).
 */
export async function getEditorPicksDirect(limit = 12) {
  return cached(CK.EDITORS_PICKS, { ttl: 900, staleTtl: 1800 }, async () => {
    try {
      const rows = await sql`
        SELECT t.id, t.name, t.slug, t.tagline, t."logoUrl", t."avgRating", t."pricingModel",
               c.name AS "categoryName", c.slug AS "categorySlug"
        FROM "AiTool" t
        LEFT JOIN "ToolCategory" c ON c.id = t."categoryId"
        LEFT JOIN "ToolFeaturedCampaign" tfc ON tfc."toolId" = t.id
          AND tfc."cancelledAt" IS NULL AND tfc."startDate" <= NOW() AND tfc."endDate" >= NOW()
        WHERE t.status = 'APPROVED' AND t."deletedAt" IS NULL
          AND (tfc.tier = 'FEATURED' OR t."listingTier" = 'FEATURED')
        ORDER BY t."avgRating" DESC
        LIMIT ${limit}
      `;
      return rows;
    } catch (e) {
      console.error('getEditorPicksDirect error:', e);
      return [];
    }
  });
}


/**
 * Get most upvoted tools this month (30-day window for time decay).
 */
export async function getMostUpvotedThisMonthDirect(limit = 12) {
  return cached(CK.UPVOTED_MONTH, { ttl: 600, staleTtl: 1200 }, async () => {
    try {
      const rows = await sql`
        SELECT t.id, t.name, t.slug, t.tagline, t."logoUrl", t."avgRating", t."pricingModel",
               c.name AS "categoryName", c.slug AS "categorySlug",
               COUNT(u.id)::int AS "monthlyUpvotes"
        FROM "AiTool" t
        LEFT JOIN "ToolCategory" c ON c.id = t."categoryId"
        JOIN "ToolUpvote" u ON u."toolId" = t.id AND u."createdAt" >= NOW() - INTERVAL '30 days'
        WHERE t.status = 'APPROVED' AND t."deletedAt" IS NULL
        GROUP BY t.id, t.name, t.slug, t.tagline, t."logoUrl", t."avgRating", t."pricingModel", c.name, c.slug
        ORDER BY COUNT(u.id) DESC
        LIMIT ${limit}
      `;
      return rows;
    } catch (e) {
      console.error('getMostUpvotedThisMonthDirect error:', e);
      return [];
    }
  });
}


// ─── Homepage Statistics (PostgreSQL = source of truth, Redis = cache) ───────

export async function getHomepageStatsDirect() {
  return cached(CK.HOMEPAGE_STATS, { ttl: 300, staleTtl: 600 }, async () => {
    try {
      const [tools, startups, events, funding] = await Promise.all([
        sql`SELECT COUNT(*)::int AS c FROM "AiTool" WHERE status = 'APPROVED' AND "deletedAt" IS NULL`,
        sql`SELECT COUNT(*)::int AS c FROM "Startup" WHERE "isApproved" = true AND "deletedAt" IS NULL`,
        sql`SELECT COUNT(*)::int AS c FROM "Event" WHERE status = 'PUBLISHED' AND "deletedAt" IS NULL`,
        sql`SELECT COUNT(*)::int AS c FROM "FundingRound"`,
      ]);
      return {
        toolCount: tools[0]?.c || 0,
        startupCount: startups[0]?.c || 0,
        eventCount: events[0]?.c || 0,
        fundingCount: funding[0]?.c || 0,
      };
    } catch (e) {
      console.error('getHomepageStatsDirect error:', e);
      return { toolCount: 0, startupCount: 0, eventCount: 0, fundingCount: 0 };
    }
  });
}

export async function getLatestJobsDirect(limit = 6) {
  try {
    const rows = await sql`
      SELECT jl.id, jl.slug, jl.title, jl."shortDescription", jl.category,
             jl."workType", jl.location, jl.city, jl.country,
             jl."salaryMin", jl."salaryMax", jl."salaryCurrency", jl."showSalary",
             jl."isFeatured", jl."listingTier",
             jl."publishedAt"::text,
             e."companyName", e.slug AS "companySlug", e."logoUrl"
      FROM "JobBoardListing" jl
      JOIN "JobBoardEmployer" e ON e.id = jl."employerId"
      WHERE jl.status = 'OPEN' AND jl."moderationHold" = false
        AND jl."deletedAt" IS NULL
        AND (jl."expiresAt" IS NULL OR jl."expiresAt" > NOW()) AND jl."showOnJobsPage" = true
      ORDER BY jl."isFeatured" DESC, jl."publishedAt" DESC NULLS LAST
      LIMIT ${limit}
    `;
    return rows as any[];
  } catch {
    return [];
  }
}

export async function getUpcomingEventsDirect(limit = 4) {
  try {
    const rows = await sql`
      SELECT e.id, e.slug, e.title, e.subtitle, e.category, e.format,
             e."startAt"::text, e."endAt"::text,
             e."venueName", e.address, e."coverImageUrl",
             e.capacity, e."registrationCount",
             o."organizationName"
      FROM "Event" e
      JOIN "EventOrganizer" o ON o.id = e."organizerId"
      WHERE e.status = 'PUBLISHED'
        AND e."deletedAt" IS NULL
        AND e."startAt" > NOW()
        AND e.visibility = 'PUBLIC'
      ORDER BY e."startAt" ASC
      LIMIT ${limit}
    `;
    return rows as any[];
  } catch {
    return [];
  }
}

export async function getRecentMilestonesDirect(limit = 6) {
  try {
    const rows = await sql`
      SELECT fm.id, fm.title, fm.type, fm.amount, fm.currency,
             fm.date::text AS date, fm."verificationStatus",
             s.name AS "startupName", s.slug AS "startupSlug"
      FROM "FounderMilestone" fm
      JOIN "Startup" s ON s.id = fm."startupId"
      WHERE fm.status = 'ACTIVE' AND fm."isPublic" = true
        AND s."isApproved" = true AND s."deletedAt" IS NULL
      ORDER BY fm.date DESC
      LIMIT ${limit}
    `;
    return rows as any[];
  } catch {
    return [];
  }
}
