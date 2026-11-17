import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { checkRateLimit, getClientIdentifier, strictRateLimit } from '@/lib/rate-limit';
import { sponsorTarget } from '@/lib/events/sponsors';

export const dynamic = 'force-dynamic';

/** Count a sponsor logo click (a few per visitor per hour at most), then go to the sponsor. */
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const s = await prisma.eventSponsor.findUnique({ where: { id }, select: { id: true, websiteUrl: true, startupId: true } });
  if (!s) return NextResponse.redirect(new URL('/events', request.url));
  const startup = s.startupId ? await prisma.startup.findUnique({ where: { id: s.startupId }, select: { slug: true } }) : null;
  const target = sponsorTarget({ websiteUrl: s.websiteUrl, startupSlug: startup?.slug });
  const { success } = await checkRateLimit(strictRateLimit, `sponsor-click:${s.id}:${getClientIdentifier(request)}`);
  if (success) await prisma.eventSponsor.update({ where: { id: s.id }, data: { clicks: { increment: 1 } } }).catch(() => {});
  return NextResponse.redirect(target ? new URL(target, request.url) : new URL('/events', request.url), 302);
}
