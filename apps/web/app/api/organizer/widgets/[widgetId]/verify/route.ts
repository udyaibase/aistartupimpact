import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { requirePermission } from "@/lib/organizer-auth/require-permission";
import { checkRateLimit } from "@/lib/rate-limit";
import { embedVerifyRateLimit } from "@/lib/event-rate-limit";
import { fetchPublicHtml } from "@/lib/embed/safe-fetch";
import { isLocalHost, widgetStatus } from "@/lib/embed/widgets";
import { sendWidgetLiveEmail } from "@/lib/embed/emails";

export const dynamic = "force-dynamic";

type VerifyResult =
  | "installed"
  | "script_missing"
  | "container_missing"
  | "not_found"
  | "local"
  | "unreachable"
  | "invalid_url";

/** Checks a public page's HTML for this widget's snippet (or direct link) and records the install when found. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ widgetId: string }> }) {
  const session = await requirePermission("embed.view");
  if (session instanceof NextResponse) return session;
  const { widgetId } = await params;

  const widget = await prisma.embedWidget.findFirst({
    where: { id: widgetId, organizerId: session.organizerId },
    include: { organizer: { select: { email: true, name: true } } },
  });
  if (!widget) return NextResponse.json({ success: false, error: "Widget not found." }, { status: 404 });

  const limit = await checkRateLimit(embedVerifyRateLimit, session.organizerId);
  if (!limit.success) {
    return NextResponse.json({ success: false, error: "Too many checks. Try again in a few minutes." }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const raw = String(body.url ?? "").trim().slice(0, 500);
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return done("invalid_url");
  }
  if (!raw || !url.hostname.includes(".") && url.hostname !== "localhost") return done("invalid_url");
  if (isLocalHost(url.host)) return done("local", url.host);
  url.protocol = "https:";

  const res = await fetchPublicHtml(url, { maxBytes: 1_500_000, timeoutMs: 8000 });
  if (!res.ok) return done("unreachable", url.host, res.status);

  const html = res.html;
  const hasContainer = html.includes(widgetId);
  const hasLoader = /\/embed\/loader\.js/.test(html);
  const hasDirectLink = html.includes(`/embed/${widgetId}`);
  const host = res.finalUrl.host.toLowerCase();

  if (hasContainer && (hasLoader || hasDirectLink)) {
    const now = new Date();
    const first = await prisma.$executeRaw`
      UPDATE "EmbedWidget" SET "firstSeenAt" = ${now}, "firstSeenHost" = ${host}
      WHERE id = ${widgetId} AND "firstSeenAt" IS NULL`;
    await prisma.$executeRaw`
      UPDATE "EmbedWidget" SET "lastSeenAt" = ${now}, "lastSeenHost" = ${host} WHERE id = ${widgetId}`;
    if (first === 1) {
      sendWidgetLiveEmail({ to: widget.organizer.email, name: widget.organizer.name, host, widgetId });
    }
    return done("installed", host);
  }
  if (hasContainer) return done("script_missing", host);
  if (hasLoader) return done("container_missing", host);
  return done("not_found", host);

  async function done(result: VerifyResult, checkedHost?: string, httpStatus?: number) {
    const fresh = await prisma.embedWidget.findUnique({ where: { id: widgetId } });
    return NextResponse.json({
      success: true,
      data: {
        result,
        host: checkedHost ?? null,
        httpStatus: httpStatus ?? null,
        widget: fresh ? { ...fresh, status: widgetStatus(fresh) } : null,
      },
    });
  }
}
