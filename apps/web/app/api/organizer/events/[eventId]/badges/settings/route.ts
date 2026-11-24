import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { afterEventAccess } from '@/lib/events/after-event-access';
import { badgeContext } from '@/lib/events/badge-design';
import { proOptionsUsed } from '@/lib/events/badge-settings';
import { checkBadgeSvg } from '@/lib/events/badge-custom';
import { cleanBadgeSvg } from '@/lib/events/badge-custom-server';
import { hostWriteLimit } from '@/lib/organizer-auth/write-limit';

export const dynamic = 'force-dynamic';

/**
 * Save the event's badge design. Templates, accent colour and logo are for every host; the custom options are
 * Pro-only and refused for Free hosts (not quietly dropped), so the page can say so.
 */
export async function PUT(request: NextRequest, props: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await props.params;
  const access = await afterEventAccess(eventId, 'events.edit');
  if (access instanceof NextResponse) return access;
  const { event, session } = access;
  const limited = await hostWriteLimit(session.id); // per person, like other host writes
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  const ctx = await badgeContext(event.id, body);
  if (!ctx) return NextResponse.json({ success: false, error: 'Event not found' }, { status: 404 });
  const proUsed = proOptionsUsed(body);
  if (!ctx.pro && proUsed.length) {
    return NextResponse.json({ success: false, code: 'pro_required', error: `Custom badges (${proUsed.join(', ')}) are part of the Pro plan.` }, { status: 402 });
  }
  // An own design is checked (plain-language reasons) and stored cleaned: only a picture, nothing that runs or loads.
  let customSvg = ctx.settings.customSvg;
  if (customSvg) {
    const errors = checkBadgeSvg(customSvg).filter((p) => p.level === 'error');
    if (errors.length) return NextResponse.json({ success: false, error: errors[0].message, problems: errors }, { status: 400 });
    customSvg = cleanBadgeSvg(customSvg) || null;
    if (!customSvg) return NextResponse.json({ success: false, error: 'This design couldn’t be read. Export it again as SVG and try once more.' }, { status: 400 });
  }
  // Only this event's own ticket types and questions are kept.
  const tierIds = new Set(ctx.tiers.map((t) => t.id));
  const questionIds = new Set(ctx.questions.map((q) => q.id));
  const settings = {
    ...ctx.settings,
    customSvg,
    template: ctx.settings.template === 'custom' && !customSvg ? 'classic' : ctx.settings.template,
    tierColors: Object.fromEntries(Object.entries(ctx.settings.tierColors).filter(([id]) => tierIds.has(id))),
    questionIds: ctx.settings.questionIds.filter((id) => questionIds.has(id)),
  };
  await prisma.event.update({ where: { id: event.id }, data: { badgeSettings: JSON.parse(JSON.stringify(settings)) } });
  return NextResponse.json({ success: true, settings });
}
