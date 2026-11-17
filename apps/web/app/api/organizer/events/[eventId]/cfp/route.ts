import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { afterEventAccess } from '@/lib/events/after-event-access';
import { cfpIsOpen, cfpSettings } from '@/lib/events/cfp';

import { logOrganizerActivity, organizerActor } from '@/lib/workspace-activity';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, props: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await props.params;
  // Proposals hold speakers' contact details and the host's private notes: not for the Check-in role.
  const access = await afterEventAccess(eventId, 'registrations.view');
  if (access instanceof NextResponse) return access;
  const { event } = access;
  const full = await prisma.event.findUnique({ where: { id: event.id }, select: { cfpSettings: true, agendaTracks: true, status: true, deletedAt: true, endAt: true } });
  const submissions = await prisma.eventTalkSubmission.findMany({ where: { eventId: event.id }, orderBy: { createdAt: 'desc' }, take: 500 });
  const settings = cfpSettings(full?.cfpSettings);
  return NextResponse.json({
    success: true,
    event: { id: event.id, slug: event.slug, title: event.title },
    settings, isOpen: full ? cfpIsOpen(settings, full) : false, tracks: full?.agendaTracks ?? [],
    submissions: submissions.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() })),
  });
}

export async function PUT(request: NextRequest, props: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await props.params;
  const access = await afterEventAccess(eventId, 'events.edit');
  if (access instanceof NextResponse) return access;
  const body = await request.json().catch(() => ({}));
  const settings = cfpSettings(body.settings);
  await prisma.event.update({ where: { id: access.event.id }, data: { cfpSettings: settings as object } });
  await logOrganizerActivity(access.event.organizerId, 'event_content_changed', { actor: organizerActor(access.session), request, metadata: { what: settings.open ? 'Opened or updated the call for speakers' : 'Closed the call for speakers', event: access.event.title } });
  return NextResponse.json({ success: true });
}
