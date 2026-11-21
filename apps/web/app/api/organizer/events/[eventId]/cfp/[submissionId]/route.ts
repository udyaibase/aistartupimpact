import { hostWriteLimit } from '@/lib/organizer-auth/write-limit';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { afterEventAccess } from '@/lib/events/after-event-access';
import { SUBMISSION_STATUSES, sendDecision, speakerFromSubmission, speakerPortalUrl, type SubmissionStatus } from '@/lib/events/cfp';
import { refreshPaths } from '@/lib/revalidate';

import { logOrganizerActivity, organizerActor } from '@/lib/workspace-activity';

export const dynamic = 'force-dynamic';

/** Review one proposal: status, rating (1-5), private notes. Accepting adds them as a speaker. */
export async function PATCH(request: NextRequest, props: { params: Promise<{ eventId: string; submissionId: string }> }) {
  const { eventId, submissionId } = await props.params;
  const access = await afterEventAccess(eventId, 'events.edit');
  if (access instanceof NextResponse) return access;
  const limited = await hostWriteLimit(access.session.id);
  if (limited) return limited;
  const { event } = access;
  const sub = await prisma.eventTalkSubmission.findFirst({ where: { id: submissionId, eventId: event.id } });
  if (!sub) return NextResponse.json({ success: false, error: 'Proposal not found.' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (body.rating !== undefined) {
    const r = Number(body.rating);
    data.rating = Number.isInteger(r) && r >= 1 && r <= 5 ? r : null;
  }
  if (body.notes !== undefined) data.notes = String(body.notes ?? '').trim().slice(0, 2000) || null;
  let status: SubmissionStatus | null = null;
  if (body.status !== undefined) {
    if (!(SUBMISSION_STATUSES as readonly string[]).includes(body.status)) return NextResponse.json({ success: false, error: 'Unknown status.' }, { status: 400 });
    status = body.status as SubmissionStatus;
    data.status = status;
    data.reviewedAt = new Date();
  }
  await prisma.eventTalkSubmission.update({ where: { id: sub.id }, data });

  let speakerId: string | null = null;
  if (status === 'ACCEPTED') {
    speakerId = await speakerFromSubmission(sub.id);
    refreshPaths([`/events/${event.slug}`]);
  }
  // Tell the speaker when the decision changes and the host chose to notify (default on).
  if (status && status !== 'SUBMITTED' && status !== sub.status && body.notify !== false) {
    await sendDecision({
      to: sub.email, name: sub.name.split(' ')[0], talk: sub.title, event: event.title, status,
      portalUrl: status === 'ACCEPTED' && speakerId ? speakerPortalUrl(speakerId) : undefined,
    }).catch(() => {});
  }
  if (status && status !== sub.status) {
    await logOrganizerActivity(event.organizerId, 'event_content_changed', { actor: organizerActor(access.session), request, metadata: { what: `Marked the talk “${sub.title}” as ${status.toLowerCase().replace(/_/g, ' ')}`, event: event.title } });
  }
  return NextResponse.json({ success: true, speakerId });
}
