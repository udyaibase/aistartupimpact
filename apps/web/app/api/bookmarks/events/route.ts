import { NextRequest, NextResponse } from 'next/server';
import { getUserSession } from '@/lib/user-session';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Events are saved by id (slugs can change); the client sends the slug and we resolve it.
// Only events a visitor can open are listed or saveable: published (or moved/cancelled/past, so a
// saved event doesn't silently vanish), not invite-only, not deleted.

// GET - saved events for the signed-in reader, newest save first
export async function GET() {
  try {
    const session = await getUserSession();
    if (!session?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const events = await sql`
      SELECT
        se.id AS "savedId",
        se."createdAt"::text AS "savedAt",
        e.id, e.slug, e.title, e.subtitle, e.format, e.status,
        e."startAt"::text AS "startAt",
        e."endAt"::text AS "endAt",
        e.timezone, e."venueName", e."coverImageUrl"
      FROM "SavedEvent" se
      INNER JOIN "Event" e ON e.id = se."eventId"
      WHERE se."userId" = ${session.id}
        AND e."deletedAt" IS NULL
        AND e.visibility <> 'INVITE_ONLY'
        AND e.status IN ('PUBLISHED', 'POSTPONED', 'CANCELLED', 'COMPLETED')
      ORDER BY se."createdAt" DESC
      LIMIT 200
    `;
    return NextResponse.json({ events });
  } catch (error) {
    console.error('Error fetching saved events:', error);
    return NextResponse.json({ error: 'Failed to fetch saved events' }, { status: 500 });
  }
}

// POST - save an event { eventSlug }
export async function POST(request: NextRequest) {
  try {
    const session = await getUserSession();
    if (!session?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => null);
    const eventSlug = typeof body?.eventSlug === 'string' ? body.eventSlug.trim() : '';
    if (!eventSlug || eventSlug.length > 200) {
      return NextResponse.json({ error: 'Event required' }, { status: 400 });
    }

    const rows = await sql`
      INSERT INTO "SavedEvent" (id, "userId", "eventId", "createdAt")
      SELECT gen_random_uuid()::text, ${session.id}, e.id, NOW()
      FROM "Event" e
      WHERE e.slug = ${eventSlug}
        AND e."deletedAt" IS NULL
        AND e.visibility <> 'INVITE_ONLY'
        AND e.status IN ('PUBLISHED', 'POSTPONED', 'CANCELLED', 'COMPLETED')
      ON CONFLICT ("userId", "eventId") DO NOTHING
      RETURNING id
    `;
    if (rows.length === 0) {
      // Either already saved (fine) or the event isn't public.
      const exists = await sql`
        SELECT 1 FROM "SavedEvent" se INNER JOIN "Event" e ON e.id = se."eventId"
        WHERE se."userId" = ${session.id} AND e.slug = ${eventSlug} LIMIT 1
      `;
      if (exists.length === 0) return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving event:', error);
    return NextResponse.json({ error: 'Failed to save event' }, { status: 500 });
  }
}

// DELETE - unsave an event ?eventSlug=
export async function DELETE(request: NextRequest) {
  try {
    const session = await getUserSession();
    if (!session?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const eventSlug = new URL(request.url).searchParams.get('eventSlug')?.trim();
    if (!eventSlug) return NextResponse.json({ error: 'Event required' }, { status: 400 });

    await sql`
      DELETE FROM "SavedEvent" se
      USING "Event" e
      WHERE se."eventId" = e.id AND se."userId" = ${session.id} AND e.slug = ${eventSlug}
    `;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error unsaving event:', error);
    return NextResponse.json({ error: 'Failed to unsave event' }, { status: 500 });
  }
}
