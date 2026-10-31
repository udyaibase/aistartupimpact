import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { getEmployerSession } from '@/lib/employer-auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { embedVerifyRateLimit } from '@/lib/event-rate-limit';
import { fetchPublicHtml } from '@/lib/embed/safe-fetch';
import { isLocalHost } from '@/lib/embed/widgets';
import { ensureCareersWidget, toJobsPortalWidget } from '@/lib/jobs/careers';
import { can, forbidden } from '@/lib/employer/permissions';

export const dynamic = 'force-dynamic';

type VerifyResult = 'installed' | 'script_missing' | 'container_missing' | 'not_found' | 'local' | 'unreachable' | 'invalid_url';

/** Checks a public page's HTML for the careers widget snippet and records the install when found. */
export async function POST(request: NextRequest) {
  const session = await getEmployerSession();
  if (!session) return NextResponse.json({ success: false, error: 'Please log in again.' }, { status: 401 });
  if (!can(session.role, 'widget.manage')) return forbidden();
  const widget = await ensureCareersWidget(session.id);
  const widgetId = widget.id;

  const limit = await checkRateLimit(embedVerifyRateLimit, `employer:${session.id}`);
  if (!limit.success) return NextResponse.json({ success: false, error: 'Too many checks. Try again in a few minutes.' }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const raw = String(body.url ?? '').trim().slice(0, 500);
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return done('invalid_url');
  }
  if (!raw || (!url.hostname.includes('.') && url.hostname !== 'localhost')) return done('invalid_url');
  if (isLocalHost(url.host)) return done('local', url.host);
  url.protocol = 'https:';

  const res = await fetchPublicHtml(url, { maxBytes: 1_500_000, timeoutMs: 8000 });
  if (!res.ok) return done('unreachable', url.host);

  const html = res.html;
  const hasContainer = html.includes(widgetId);
  const hasLoader = /\/embed\/loader\.js/.test(html);
  const hasDirectLink = html.includes(`/embed/jobs/${widgetId}`);
  const host = res.finalUrl.host.toLowerCase();

  if (hasContainer && (hasLoader || hasDirectLink)) {
    const now = new Date();
    await prisma.$executeRaw`UPDATE "JobBoardCareersWidget" SET "firstSeenAt" = ${now}, "firstSeenHost" = ${host} WHERE id = ${widgetId} AND "firstSeenAt" IS NULL`;
    await prisma.$executeRaw`UPDATE "JobBoardCareersWidget" SET "lastSeenAt" = ${now}, "lastSeenHost" = ${host} WHERE id = ${widgetId}`;
    return done('installed', host);
  }
  if (hasContainer) return done('script_missing', host);
  if (hasLoader) return done('container_missing', host);
  return done('not_found', host);

  async function done(result: VerifyResult, checkedHost?: string) {
    const fresh = await prisma.jobBoardCareersWidget.findUnique({ where: { id: widgetId } });
    return NextResponse.json({ success: true, data: { result, host: checkedHost ?? null, widget: fresh ? toJobsPortalWidget(fresh) : null } });
  }
}
