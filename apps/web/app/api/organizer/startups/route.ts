import { NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { requirePermission } from '@/lib/organizer-auth/require-permission';
import { taggableStartups } from '@/lib/events/trust';

export const dynamic = 'force-dynamic';

/** Verified startups this host may tag on an event ("Hosted by …"): ones they belong to as founder or team. */
export async function GET() {
  const result = await requirePermission('events.create');
  if (result instanceof NextResponse) return result;
  const host = await prisma.eventOrganizer.findUnique({ where: { id: result.organizerId }, select: { email: true } });
  return NextResponse.json({ success: true, startups: await taggableStartups([result.email, host?.email ?? '']) });
}
