import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { verifyFeedbackToken } from '@/lib/events/after-event';
import { cleanFeedback, feedbackOpen, feedbackSettings } from '@/lib/events/feedback';
import { apiRateLimit, checkRateLimit, getClientIdentifier, rateLimitMessage, retryAfterHeaders } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/** Save (or update) one attendee's feedback. The signed token names the registration; no sign-in needed. */
export async function POST(request: NextRequest) {
  const { success, reset } = await checkRateLimit(apiRateLimit, `event-feedback:${getClientIdentifier(request)}`);
  if (!success) return NextResponse.json({ success: false, error: rateLimitMessage(reset) }, { status: 429, headers: retryAfterHeaders(reset) });

  const body = await request.json().catch(() => ({}));
  const registrationId = verifyFeedbackToken(body?.t);
  if (!registrationId) return NextResponse.json({ success: false, error: 'This feedback link isn’t valid.' }, { status: 400 });

  const reg = await prisma.eventRegistration.findUnique({
    where: { id: registrationId },
    select: { id: true, deletedAt: true, cancelledAt: true, event: { select: { id: true, startAt: true, endAt: true, deletedAt: true, feedbackSettings: true } } },
  });
  if (!reg || reg.deletedAt || reg.cancelledAt || reg.event.deletedAt) return NextResponse.json({ success: false, error: 'This feedback link isn’t valid.' }, { status: 400 });
  const settings = feedbackSettings(reg.event.feedbackSettings);
  if (!settings.enabled) return NextResponse.json({ success: false, error: 'The host isn’t collecting feedback for this event.' }, { status: 400 });
  if (!feedbackOpen(reg.event)) return NextResponse.json({ success: false, error: 'Feedback for this event has closed.' }, { status: 400 });

  const input = cleanFeedback(body ?? {}, settings.questions);
  if (!input) return NextResponse.json({ success: false, error: 'Choose a rating from 1 to 5 stars.', field: 'rating' }, { status: 400 });

  await prisma.eventFeedback.upsert({
    where: { registrationId: reg.id },
    create: { eventId: reg.event.id, registrationId: reg.id, ...input, answers: input.answers },
    update: { ...input, answers: input.answers },
  });
  return NextResponse.json({ success: true });
}
