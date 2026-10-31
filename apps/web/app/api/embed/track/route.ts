import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { checkRateLimit, getClientIdentifier } from "@/lib/rate-limit";
import { embedTrackRateLimit } from "@/lib/event-rate-limit";
import { getEmbedRedis, isLocalHost } from "@/lib/embed/widgets";
import { sendWidgetLiveEmail } from "@/lib/embed/emails";
import { jobsViewsKey } from "@/lib/jobs/careers";

export const dynamic = "force-dynamic";

const VIEW_TTL_SECONDS = 60 * 60 * 24 * 35;
const SEEN_THROTTLE_MS = 5 * 60 * 1000;

function hostOf(ref: unknown): string | null {
  if (typeof ref !== "string" || !ref) return null;
  try {
    const u = new URL(ref);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.host.toLowerCase().slice(0, 253);
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const limit = await checkRateLimit(embedTrackRateLimit, getClientIdentifier(request));
    if (!limit.success) return NextResponse.json({ ok: true });

    const { widgetId, eventIds, ref, kind } = await request.json();
    if (typeof widgetId !== "string" || !/^[0-9a-f-]{36}$/i.test(widgetId)) {
      return NextResponse.json({ ok: true });
    }

    const host = hostOf(ref);
    const ownHost = request.nextUrl.host.toLowerCase();
    const siteHost = (() => {
      try { return new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://udyaibase.com").host; } catch { return ""; }
    })();
    if (!host) return NextResponse.json({ ok: true });
    // The organizer portal's live preview never counts as an install or a view;
    // any other page, including pages on our own domain, is a real install.
    const refPath = (() => { try { return new URL(String(ref)).pathname; } catch { return ""; } })();
    if ((host === ownHost || host === siteHost) && (refPath.startsWith("/organizer") || refPath.startsWith("/employer"))) {
      return NextResponse.json({ ok: true });
    }

    if (kind === "jobs") {
      // Careers widget: daily views for the portal stats, plus install detection.
      const redis = getEmbedRedis();
      if (redis) {
        const key = jobsViewsKey(widgetId, new Date().toISOString().slice(0, 10));
        await redis.pipeline().incr(key).expire(key, VIEW_TTL_SECONDS).exec().catch(() => {});
      }
      const now = new Date();
      const throttle = new Date(now.getTime() - SEEN_THROTTLE_MS);
      const seen = await prisma.$executeRaw`
        UPDATE "JobBoardCareersWidget" SET "lastSeenAt" = ${now}, "lastSeenHost" = ${host}
        WHERE id = ${widgetId} AND active = true
          AND ("lastSeenAt" IS NULL OR "lastSeenAt" < ${throttle} OR "firstSeenAt" IS NULL)`;
      if (seen > 0 && !isLocalHost(host)) {
        await prisma.$executeRaw`
          UPDATE "JobBoardCareersWidget" SET "firstSeenAt" = ${now}, "firstSeenHost" = ${host}
          WHERE id = ${widgetId} AND "firstSeenAt" IS NULL`;
      }
      return NextResponse.json({ ok: true });
    }

    const redis = getEmbedRedis();
    if (redis) {
      const date = new Date().toISOString().slice(0, 10);
      const pipeline = redis.pipeline();
      pipeline.incr(`embed:views:widget:${widgetId}:${date}`);
      pipeline.expire(`embed:views:widget:${widgetId}:${date}`, VIEW_TTL_SECONDS);
      for (const eventId of (Array.isArray(eventIds) ? eventIds : []).slice(0, 50)) {
        if (typeof eventId !== "string") continue;
        pipeline.incr(`embed:views:event:${eventId}:${date}`);
        pipeline.expire(`embed:views:event:${eventId}:${date}`, VIEW_TTL_SECONDS);
      }
      await pipeline.exec().catch(() => {});
    }

    const now = new Date();
    const throttle = new Date(now.getTime() - SEEN_THROTTLE_MS);
    const seen = await prisma.$executeRaw`
      UPDATE "EmbedWidget" SET "lastSeenAt" = ${now}, "lastSeenHost" = ${host}
      WHERE id = ${widgetId} AND active = true
        AND ("lastSeenAt" IS NULL OR "lastSeenAt" < ${throttle} OR "firstSeenAt" IS NULL)`;

    if (seen > 0 && !isLocalHost(host)) {
      const first = await prisma.$executeRaw`
        UPDATE "EmbedWidget" SET "firstSeenAt" = ${now}, "firstSeenHost" = ${host}
        WHERE id = ${widgetId} AND "firstSeenAt" IS NULL`;
      if (first === 1) {
        const widget = await prisma.embedWidget.findUnique({
          where: { id: widgetId },
          select: { organizer: { select: { email: true, name: true } } },
        });
        if (widget) sendWidgetLiveEmail({ to: widget.organizer.email, name: widget.organizer.name, host, widgetId });
      }
    }
  } catch (e) {
    console.error("Embed track error:", e);
  }

  return NextResponse.json({ ok: true });
}
