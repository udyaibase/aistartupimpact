import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { cfpIsOpen, cfpSettings, cleanSubmission, sendSubmissionReceived } from '@/lib/events/cfp';
import { authRateLimit, checkRateLimit, getClientIdentifier, rateLimitMessage, retryAfterHeaders } from '@/lib/rate-limit';
import { sendEmailFireAndForget } from '@/lib/email/send';

export const dynamic = 'force-dynamic';

/** Public: propose a talk for an event whose call for speakers is open. */
export async function POST(request: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const { success, reset } = await checkRateLimit(authRateLimit, `cfp-submit:${getClientIdentifier(request)}`);
  if (!success) return NextResponse.json({ success: false, error: rateLimitMessage(reset) }, { status: 429, headers: retryAfterHeaders(reset) });

  const body = await request.json().catch(() => ({}));
  // Hidden field people never see; bots fill it.
  if (typeof body?.website === 'string' && body.website.trim()) return NextResponse.json({ success: true });

  const event = await prisma.event.findUnique({
    where: { slug },
    select: { id: true, title: true, endAt: true, status: true, deletedAt: true, cfpSettings: true, agendaTracks: true, organizer: { select: { email: true } } },
  });
  if (!event) return NextResponse.json({ success: false, error: 'Event not found.' }, { status: 404 });
  const settings = cfpSettings(event.cfpSettings);
  if (!cfpIsOpen(settings, event)) return NextResponse.json({ success: false, error: 'This call for speakers is closed.' }, { status: 400 });

  const input = cleanSubmission(body ?? {}, { formats: settings.formats, tracks: event.agendaTracks });
  if ('error' in input) return NextResponse.json({ success: false, error: input.error, field: input.field }, { status: 400 });

  const dup = await prisma.eventTalkSubmission.findFirst({ where: { eventId: event.id, email: input.email, title: input.title }, select: { id: true } });
  if (dup) return NextResponse.json({ success: false, error: 'You’ve already proposed a talk with this title.' }, { status: 409 });
  const perPerson = await prisma.eventTalkSubmission.count({ where: { eventId: event.id, email: input.email } });
  if (perPerson >= 5) return NextResponse.json({ success: false, error: 'You can propose up to 5 talks for one event.' }, { status: 400 });

  await prisma.eventTalkSubmission.create({ data: { eventId: event.id, ...input } });
  sendSubmissionReceived(input.email, input.name.split(' ')[0], input.title, event.title).catch(() => {});
  if (event.organizer?.email && !/@udyaibase\.com$/i.test(event.organizer.email)) {
    sendEmailFireAndForget({ to: event.organizer.email, type: 'cfp_new', subject: `New talk proposal for ${event.title}`, html: `<p>${input.name.replace(/[<>&]/g, '')} proposed “${input.title.replace(/[<>&]/g, '')}”. Review it in your organizer portal under Speakers.</p>` });
  }
  return NextResponse.json({ success: true });
}
