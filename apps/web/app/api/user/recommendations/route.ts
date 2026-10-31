import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

const JWT_SECRET = new TextEncoder().encode(process.env.USER_JWT_SECRET!);

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get('user-token')?.value;
    if (!token) return NextResponse.json({ items: [] });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = payload.userId as string;
    if (!userId) return NextResponse.json({ items: [] });

    const users = await sql`
      SELECT "primaryIntent", "cityId", "onboardingCompleted"
      FROM "WebUser"
      WHERE id = ${userId}
      LIMIT 1
    `;
    if (users.length === 0 || !users[0].onboardingCompleted) {
      return NextResponse.json({ items: [] });
    }

    const user = users[0] as any;

    const interests = await sql`
      SELECT "categoryId" FROM "WebUserInterest" WHERE "userId" = ${userId}
    `;
    const categoryIds = interests.map((i: any) => i.categoryId);

    const recentInteractions = await sql`
      SELECT DISTINCT "entityType", "entityId"
      FROM "WebUserInteraction"
      WHERE "userId" = ${userId} AND action = 'view' AND "createdAt" > NOW() - INTERVAL '7 days'
      ORDER BY "createdAt" DESC
      LIMIT 50
    `;
    const viewedToolIds = recentInteractions.filter((i: any) => i.entityType === 'tool').map((i: any) => i.entityId);
    const viewedStartupIds = recentInteractions.filter((i: any) => i.entityType === 'startup').map((i: any) => i.entityId);

    const items: any[] = [];

    // Tools — prioritize user's interests, exclude recently viewed
    if (categoryIds.length > 0) {
      const tools = await sql`
        SELECT id, name, slug, "logoUrl", "shortDescription", "avgRating", "pricingModel", 'tool' as "entityType"
        FROM "AiTool"
        WHERE status = 'APPROVED' AND "deletedAt" IS NULL
          AND "categoryId" = ANY(${categoryIds})
          ${viewedToolIds.length > 0 ? sql`AND id != ALL(${viewedToolIds})` : sql``}
        ORDER BY "avgRating" DESC NULLS LAST, "createdAt" DESC
        LIMIT 6
      `;
      items.push(...tools);
    }

    // Backfill with popular tools if not enough
    if (items.filter(i => i.entityType === 'tool').length < 4) {
      const existingIds = items.filter(i => i.entityType === 'tool').map(i => i.id);
      const excludeIds = [...existingIds, ...viewedToolIds];
      const popular = await sql`
        SELECT id, name, slug, "logoUrl", "shortDescription", "avgRating", "pricingModel", 'tool' as "entityType"
        FROM "AiTool"
        WHERE status = 'APPROVED' AND "deletedAt" IS NULL
          ${excludeIds.length > 0 ? sql`AND id != ALL(${excludeIds})` : sql``}
        ORDER BY "avgRating" DESC NULLS LAST, "createdAt" DESC
        LIMIT ${4 - items.filter(i => i.entityType === 'tool').length}
      `;
      items.push(...popular);
    }

    // Startups — freshest approved
    const startups = await sql`
      SELECT id, name, slug, "logoUrl", "tagline", 'startup' as "entityType"
      FROM "Startup"
      WHERE "isApproved" = true AND "deletedAt" IS NULL
        ${viewedStartupIds.length > 0 ? sql`AND id != ALL(${viewedStartupIds})` : sql``}
      ORDER BY "createdAt" DESC
      LIMIT 4
    `;
    items.push(...startups);

    // Jobs — if user intent is job-seeking or we have location
    if (user.primaryIntent === 'looking_for_jobs' || user.cityId) {
      const jobs = await sql`
        SELECT jl.id, jl.title as name, jl.slug, e."logoUrl", jl."shortDescription" as tagline, 'job' as "entityType"
        FROM "JobBoardListing" jl
        JOIN "JobBoardEmployer" e ON e.id = jl."employerId"
        WHERE jl.status = 'OPEN' AND jl."deletedAt" IS NULL AND jl."moderationHold" = false AND (jl."expiresAt" IS NULL OR jl."expiresAt" > NOW()) AND jl."showOnJobsPage" = true
        ORDER BY jl."createdAt" DESC
        LIMIT 3
      `;
      items.push(...jobs);
    }

    // Shuffle to mix entity types
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }

    return NextResponse.json({ items: items.slice(0, 12) });
  } catch (e) {
    console.error('Recommendations error:', e);
    return NextResponse.json({ items: [] });
  }
}
