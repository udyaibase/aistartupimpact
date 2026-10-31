import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { jwtVerify } from 'jose';

export const dynamic = 'force-dynamic';

const JWT_SECRET = new TextEncoder().encode(
  process.env.USER_JWT_SECRET!
);

async function getUserId(request: NextRequest): Promise<string | null> {
  const token = request.cookies.get('user-token')?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return (payload as any).userId || null;
  } catch {
    return null;
  }
}

// POST: Toggle save/unsave a job
export async function POST(request: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Login required' }, { status: 401 });

    const { slug } = params;

    // Find job
    const jobs = await sql`
      SELECT id FROM "JobBoardListing"
      WHERE slug = ${slug} AND status = 'OPEN' AND "moderationHold" = false AND "deletedAt" IS NULL
        AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
      LIMIT 1
    `;
    if (jobs.length === 0) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    const listingId = (jobs[0] as any).id;

    // Toggle
    const existing = await sql`
      SELECT id FROM "JobBoardSaved"
      WHERE "listingId" = ${listingId} AND "userId" = ${userId}
      LIMIT 1
    `;

    if (existing.length > 0) {
      await sql`DELETE FROM "JobBoardSaved" WHERE "listingId" = ${listingId} AND "userId" = ${userId}`;
      await sql`UPDATE "JobBoardListing" SET "savedCount" = GREATEST("savedCount" - 1, 0) WHERE id = ${listingId}`;
      return NextResponse.json({ saved: false });
    } else {
      await sql`INSERT INTO "JobBoardSaved" ("id", "listingId", "userId") VALUES (gen_random_uuid()::text, ${listingId}, ${userId})`;
      await sql`UPDATE "JobBoardListing" SET "savedCount" = "savedCount" + 1 WHERE id = ${listingId}`;
      return NextResponse.json({ saved: true });
    }
  } catch (error: any) {
    console.error('[POST /api/jobs/save]', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
