import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { jwtVerify } from 'jose';
import { refreshPaths } from '@/lib/revalidate';

export const dynamic = 'force-dynamic';
const JWT_SECRET = new TextEncoder().encode(
  process.env.USER_JWT_SECRET!
);

const DAILY_UPVOTE_CAP = 20;
const MIN_ACCOUNT_AGE_HOURS = 24;

async function getUserFromRequest(request: NextRequest): Promise<{ id: string; createdAt: Date } | null> {
  const token = request.cookies.get('user-token')?.value;
  if (!token) return null;

  try {
    const verified = await jwtVerify(token, JWT_SECRET);
    const payload = verified.payload as any;
    const users = await sql`SELECT id, "createdAt" FROM "WebUser" WHERE id = ${payload.userId} AND "isActive" = true LIMIT 1`;
    if (users.length === 0) return null;
    return { id: users[0].id, createdAt: new Date(users[0].createdAt) };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const toolSlug = params.id;
    const user = await getUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: 'Login required to upvote' }, { status: 401 });
    }

    // Account age check
    if (Date.now() - user.createdAt.getTime() < MIN_ACCOUNT_AGE_HOURS * 3600000) {
      return NextResponse.json({ error: 'Account must be at least 24 hours old to upvote' }, { status: 403 });
    }

    // Daily cap
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const daily = await sql`SELECT COUNT(*)::int AS c FROM "ToolUpvote" WHERE "userId" = ${user.id} AND "createdAt" >= ${todayStart.toISOString()}::timestamp`;
    if ((daily[0] as any).c >= DAILY_UPVOTE_CAP) {
      return NextResponse.json({ error: 'Daily limit reached (20/day)' }, { status: 429 });
    }

    // Get tool
    const tools = await sql`SELECT id, "upvoteCount" FROM "AiTool" WHERE slug = ${toolSlug} AND "deletedAt" IS NULL AND status = 'APPROVED' LIMIT 1`;
    if (tools.length === 0) return NextResponse.json({ error: 'Tool not found' }, { status: 404 });
    const toolId = tools[0].id;

    // Toggle
    const existing = await sql`SELECT id FROM "ToolUpvote" WHERE "toolId" = ${toolId} AND "userId" = ${user.id} LIMIT 1`;

    if (existing.length > 0) {
      await sql`DELETE FROM "ToolUpvote" WHERE "toolId" = ${toolId} AND "userId" = ${user.id}`;
      await sql`UPDATE "AiTool" SET "upvoteCount" = GREATEST("upvoteCount" - 1, 0) WHERE id = ${toolId}`;
      const updated = await sql`SELECT "upvoteCount" FROM "AiTool" WHERE id = ${toolId}`;
      refreshPaths([`/tools/${toolSlug}`]);
      return NextResponse.json({ upvoted: false, count: (updated[0] as any).upvoteCount });
    } else {
      await sql`INSERT INTO "ToolUpvote" (id, "toolId", "userId") VALUES (gen_random_uuid(), ${toolId}, ${user.id})`;
      await sql`UPDATE "AiTool" SET "upvoteCount" = "upvoteCount" + 1 WHERE id = ${toolId}`;
      const updated = await sql`SELECT "upvoteCount" FROM "AiTool" WHERE id = ${toolId}`;
      refreshPaths([`/tools/${toolSlug}`]);
      return NextResponse.json({ upvoted: true, count: (updated[0] as any).upvoteCount });
    }
  } catch (error: any) {
    console.error('Upvote error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const toolSlug = params.id;
    const tools = await sql`SELECT id, "upvoteCount" FROM "AiTool" WHERE slug = ${toolSlug} AND "deletedAt" IS NULL LIMIT 1`;
    if (tools.length === 0) return NextResponse.json({ upvoted: false, count: 0 });

    const toolId = tools[0].id;
    const count = (tools[0] as any).upvoteCount || 0;

    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ upvoted: false, count });

    const existing = await sql`SELECT id FROM "ToolUpvote" WHERE "toolId" = ${toolId} AND "userId" = ${user.id} LIMIT 1`;
    return NextResponse.json({ upvoted: existing.length > 0, count });
  } catch {
    return NextResponse.json({ upvoted: false, count: 0 });
  }
}
