import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { checkRateLimit, getClientIdentifier, strictRateLimit } from '@/lib/rate-limit';
import { sponsorTarget } from '@/lib/events/sponsors';

export const dynamic = 'force-dynamic';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Count a sponsor logo click (a few per visitor per hour at most), then go to the sponsor.
 *
 * The link lives on udyaibase.com, so it must not become a trusted-looking way to send people anywhere. It goes
 * straight through only when someone vouched for the destination: the event's organizer is verified, or the sponsor
 * is a verified startup on Udyaibase. Otherwise visitors see where they're going and choose to continue.
 */
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const s = await prisma.eventSponsor.findUnique({
    where: { id },
    select: { id: true, name: true, websiteUrl: true, startupId: true, event: { select: { organizer: { select: { verifiedAt: true } } } } },
  });
  if (!s) return NextResponse.redirect(new URL('/events', request.url));
  const startup = s.startupId ? await prisma.startup.findUnique({ where: { id: s.startupId }, select: { slug: true, isVerified: true } }) : null;
  const target = sponsorTarget({ websiteUrl: s.websiteUrl, startupSlug: startup?.slug });
  const { success } = await checkRateLimit(strictRateLimit, `sponsor-click:${s.id}:${getClientIdentifier(request)}`);
  if (success) await prisma.eventSponsor.update({ where: { id: s.id }, data: { clicks: { increment: 1 } } }).catch(() => {});
  if (!target) return NextResponse.redirect(new URL('/events', request.url), 302);

  const url = new URL(target, request.url);
  const external = url.origin !== new URL(request.url).origin;
  const vouched = !!s.event.organizer.verifiedAt || !!startup?.isVerified;
  if (!external || vouched) return NextResponse.redirect(url, 302);

  const host = esc(url.hostname.replace(/^www\./, ''));
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer"><title>Leaving Udyaibase</title>
<style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:#f8fafc;color:#0f172a}
main{max-width:480px;margin:12vh auto;padding:24px 16px}h1{font-size:20px;margin:0 0 8px}p{color:#475569;line-height:1.6;margin:0 0 20px}
a.btn{display:inline-block;background:#111827;color:#fff;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:10px}
a.back{display:inline-block;margin-left:12px;color:#475569}@media (prefers-color-scheme:dark){body{background:#0b1120;color:#e2e8f0}p,a.back{color:#94a3b8}a.btn{background:#fff;color:#111827}}</style></head>
<body><main><h1>You're leaving Udyaibase</h1><p>This sponsor link (${esc(s.name)}) goes to <strong>${host}</strong>. Udyaibase hasn't checked this site. Continue only if you trust it.</p>
<a class="btn" href="${esc(url.toString())}" rel="noopener noreferrer nofollow">Continue to ${host}</a><a class="back" href="/events">Back to events</a></main></body></html>`;
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
}
