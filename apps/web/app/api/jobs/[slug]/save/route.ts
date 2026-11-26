import { verifyUserToken } from '@/lib/user-session';
import { jwtSecret } from '@/lib/jwt-secret';
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { checkRateLimit } from '@/lib/rate-limit';
import { jobSaveRateLimit } from '@/lib/event-rate-limit';

export const dynamic = 'force-dynamic';

const JWT_SECRET = jwtSecret(process.env.USER_JWT_SECRET, 'USER_JWT_SECRET');

async function getUserId(request: NextRequest): Promise<string | null> {
  return (await verifyUserToken(request.cookies.get('user-token')?.value))?.userId ?? null;
}

// POST: Toggle save/unsave a job
export async function POST(request: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Login required' }, { status: 401 });
    const { success } = await checkRateLimit(jobSaveRateLimit, `save:${userId}`);
    if (!success) return NextResponse.json({ error: 'Too many requests. Try again in a minute.' }, { status: 429 });

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

    // Toggle. Each step is safe to run twice or at the same moment as another click: removing returns what it
    // removed, adding ignores a row that already exists, and the count is recounted from the rows instead of
    // being nudged up or down (two quick clicks used to leave it one out).
    const removed = await sql`
      DELETE FROM "JobBoardSaved" WHERE "listingId" = ${listingId} AND "userId" = ${userId} RETURNING id
    `;
    const saved = removed.length === 0;
    if (saved) {
      await sql`
        INSERT INTO "JobBoardSaved" ("id", "listingId", "userId") VALUES (gen_random_uuid()::text, ${listingId}, ${userId})
        ON CONFLICT ("listingId", "userId") DO NOTHING
      `;
    }
    await sql`
      UPDATE "JobBoardListing" SET "savedCount" = (SELECT COUNT(*)::int FROM "JobBoardSaved" WHERE "listingId" = ${listingId})
      WHERE id = ${listingId}
    `;
    return NextResponse.json({ saved });
  } catch (error: any) {
    console.error('[POST /api/jobs/save]', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
