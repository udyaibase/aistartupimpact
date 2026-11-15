import { NextRequest, NextResponse } from 'next/server';
import { getUserSession } from '@/lib/user-session';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Stories = any published article (news, stories, opinions...). Saved by article id; the client
// sends the slug. Only published, non-deleted articles are listed or saveable.

// GET - saved stories for the signed-in reader, newest save first
export async function GET() {
  try {
    const session = await getUserSession();
    if (!session?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const stories = await sql`
      SELECT
        sa.id AS "savedId",
        sa."createdAt"::text AS "savedAt",
        a.id, a.slug, a.title, a.excerpt, a.type,
        COALESCE(a."thumbnailImage", a."coverImage") AS "coverImage",
        a."readTimeMinutes",
        a."publishedAt"::text AS "publishedAt"
      FROM "SavedArticle" sa
      INNER JOIN "Article" a ON a.id = sa."articleId"
      WHERE sa."userId" = ${session.id}
        AND a.status = 'PUBLISHED'
        AND a."deletedAt" IS NULL
      ORDER BY sa."createdAt" DESC
      LIMIT 200
    `;
    return NextResponse.json({ stories });
  } catch (error) {
    console.error('Error fetching saved stories:', error);
    return NextResponse.json({ error: 'Failed to fetch saved stories' }, { status: 500 });
  }
}

// POST - save a story { storySlug } or several { storySlugs: [] } (used once to move old
// browser-only saves onto the account)
export async function POST(request: NextRequest) {
  try {
    const session = await getUserSession();
    if (!session?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => null);
    const raw: unknown[] = Array.isArray(body?.storySlugs) ? body.storySlugs : [body?.storySlug];
    const slugs = [...new Set(
      raw.filter((s): s is string => typeof s === 'string').map((s) => s.trim()).filter((s) => s && s.length <= 200),
    )].slice(0, 50);
    if (slugs.length === 0) return NextResponse.json({ error: 'Story required' }, { status: 400 });

    await sql`
      INSERT INTO "SavedArticle" (id, "userId", "articleId", "createdAt")
      SELECT gen_random_uuid()::text, ${session.id}, a.id, NOW()
      FROM "Article" a
      WHERE a.slug = ANY(${slugs})
        AND a.status = 'PUBLISHED'
        AND a."deletedAt" IS NULL
      ON CONFLICT ("userId", "articleId") DO NOTHING
    `;

    if (slugs.length === 1) {
      const exists = await sql`
        SELECT 1 FROM "SavedArticle" sa INNER JOIN "Article" a ON a.id = sa."articleId"
        WHERE sa."userId" = ${session.id} AND a.slug = ${slugs[0]} LIMIT 1
      `;
      if (exists.length === 0) return NextResponse.json({ error: 'Story not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving story:', error);
    return NextResponse.json({ error: 'Failed to save story' }, { status: 500 });
  }
}

// DELETE - unsave a story ?storySlug=
export async function DELETE(request: NextRequest) {
  try {
    const session = await getUserSession();
    if (!session?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const storySlug = new URL(request.url).searchParams.get('storySlug')?.trim();
    if (!storySlug) return NextResponse.json({ error: 'Story required' }, { status: 400 });

    await sql`
      DELETE FROM "SavedArticle" sa
      USING "Article" a
      WHERE sa."articleId" = a.id AND sa."userId" = ${session.id} AND a.slug = ${storySlug}
    `;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error unsaving story:', error);
    return NextResponse.json({ error: 'Failed to unsave story' }, { status: 500 });
  }
}
