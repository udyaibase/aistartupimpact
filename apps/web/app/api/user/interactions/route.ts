import { jwtSecret } from '@/lib/jwt-secret';
import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

const JWT_SECRET = jwtSecret(process.env.USER_JWT_SECRET, 'USER_JWT_SECRET');

const VALID_ACTIONS = ['view', 'click', 'save', 'upvote', 'share', 'search', 'apply', 'register', 'start', 'complete_step', 'skip_step', 'complete', 'skip_all'];
const VALID_ENTITY_TYPES = ['tool', 'startup', 'article', 'event', 'job', 'search', 'onboarding'];

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get('user-token')?.value;
    // Signed-out visitors: nothing to record. Answer quietly so every public page isn't logging a 401.
    if (!token) {
      return new NextResponse(null, { status: 204 });
    }

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = payload.userId as string;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action, entityType, entityId, categoryId, metadata } = body;

    if (!action || !entityType) {
      return NextResponse.json({ error: 'action and entityType required' }, { status: 400 });
    }

    if (!VALID_ACTIONS.includes(action) || !VALID_ENTITY_TYPES.includes(entityType)) {
      return NextResponse.json({ error: 'Invalid action or entityType' }, { status: 400 });
    }

    await sql`
      INSERT INTO "WebUserInteraction" (id, "userId", action, "entityType", "entityId", "categoryId", metadata, "createdAt")
      VALUES (gen_random_uuid(), ${userId}, ${action}, ${entityType}, ${entityId || null}, ${categoryId || null}, ${metadata ? JSON.stringify(metadata) : null}::jsonb, NOW())
    `;

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
