import { NextRequest, NextResponse } from 'next/server';
import { afterEventAccess } from '@/lib/events/after-event-access';
import { certificatesAllowed } from '@/lib/events/after-event';
import { issueCertificates } from '@/lib/events/certificates';
import { apiRateLimit, checkRateLimit, rateLimitMessage, retryAfterHeaders } from '@/lib/rate-limit';
import { logOrganizerActivity, organizerActor } from '@/lib/workspace-activity';

export const dynamic = 'force-dynamic';

/** Issue certificates to everyone in the chosen audience who doesn't have one yet. Safe to run again. */
export async function POST(request: NextRequest, props: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await props.params;
  const access = await afterEventAccess(eventId, 'events.edit');
  if (access instanceof NextResponse) return access;
  const { event, session } = access;
  const { success, reset } = await checkRateLimit(apiRateLimit, `certificates-issue:${event.id}`);
  if (!success) return NextResponse.json({ success: false, error: rateLimitMessage(reset) }, { status: 429, headers: retryAfterHeaders(reset) });
  if (!event.certificateSettings) return NextResponse.json({ success: false, error: 'Set up the certificate design first.' }, { status: 400 });
  if (event.startAt > new Date()) return NextResponse.json({ success: false, error: 'Certificates can be issued once the event has started.' }, { status: 400 });
  if (!(await certificatesAllowed(event))) {
    return NextResponse.json({ success: false, error: 'Certificates are part of Pro, or can be added for this event.', code: 'CERTIFICATES_LOCKED' }, { status: 402 });
  }
  const r = await issueCertificates(event.id);
  if (r.issued) await logOrganizerActivity(session.organizerId, 'event_updated', { actor: organizerActor(session), request, metadata: { title: event.title, what: `${r.issued} certificates issued` } }).catch(() => {});
  return NextResponse.json({ success: true, ...r });
}
