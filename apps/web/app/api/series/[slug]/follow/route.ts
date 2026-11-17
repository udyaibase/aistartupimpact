import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { authRateLimit, checkRateLimit, getClientIdentifier, rateLimitMessage, retryAfterHeaders } from '@/lib/rate-limit';
import { sendFollowConfirmation } from '@/lib/events/series';

export const dynamic = 'force-dynamic';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Follow a series: sends a confirmation email. The response is the same whether or not they already follow. */
export async function POST(request: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const { success, reset } = await checkRateLimit(authRateLimit, `series-follow:${getClientIdentifier(request)}`);
  if (!success) return NextResponse.json({ success: false, error: rateLimitMessage(reset) }, { status: 429, headers: retryAfterHeaders(reset) });
  const body = await request.json().catch(() => ({}));
  if (typeof body?.website === 'string' && body.website.trim()) return NextResponse.json({ success: true });
  const email = String(body?.email ?? '').trim().toLowerCase().slice(0, 200);
  if (!EMAIL.test(email)) return NextResponse.json({ success: false, error: 'Enter a valid email address.' }, { status: 400 });
  const series = await prisma.eventSeries.findUnique({ where: { slug }, select: { id: true, name: true, slug: true } });
  if (!series) return NextResponse.json({ success: false, error: 'Series not found' }, { status: 404 });

  const existing = await prisma.eventSeriesFollower.findUnique({ where: { seriesId_email: { seriesId: series.id, email } } });
  if (existing?.confirmedAt && !existing.unsubscribedAt) return NextResponse.json({ success: true });
  const f = existing
    ? await prisma.eventSeriesFollower.update({ where: { id: existing.id }, data: { confirmedAt: null, unsubscribedAt: null } })
    : await prisma.eventSeriesFollower.create({ data: { seriesId: series.id, email } });
  // Per-address limit too, so nobody can use this to flood someone's inbox.
  const perAddress = await checkRateLimit(authRateLimit, `series-follow-to:${email}`);
  if (perAddress.success) await sendFollowConfirmation(f, series);
  return NextResponse.json({ success: true });
}
