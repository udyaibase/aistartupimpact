import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@udyaibase/database";
import { requirePermission } from "@/lib/organizer-auth/require-permission";
import { apiRateLimit, checkRateLimit } from "@/lib/rate-limit";
import { hostPlanStatus } from "@/lib/events/billing";
import { promoAudienceSize, startPromo, NOTE_MAX } from "@/lib/events/promote";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** GET: promo credits, upcoming events, past promos. `?eventId=` adds that event's audience size. */
export async function GET(request: NextRequest) {
  const result = await requirePermission("promote");
  if (result instanceof NextResponse) return result;
  const organizerId = result.organizerId;

  const eventId = request.nextUrl.searchParams.get("eventId");
  if (eventId) {
    const size = await promoAudienceSize(organizerId, eventId);
    if (size == null) return NextResponse.json({ success: false, error: "Event not found." }, { status: 404 });
    return NextResponse.json({ success: true, audience: size });
  }

  const [status, events, campaigns] = await Promise.all([
    hostPlanStatus(organizerId),
    prisma.event.findMany({
      where: { organizerId, status: "PUBLISHED", visibility: "PUBLIC", deletedAt: null, endAt: { gt: new Date() } },
      orderBy: { startAt: "asc" },
      select: { id: true, title: true, startAt: true, format: true, promoCredits: true, boostedAt: true },
    }),
    prisma.eventEmailCampaign.findMany({
      where: { organizerId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, subject: true, status: true, recipientCount: true, createdAt: true, creditSource: true, event: { select: { title: true } } },
    }),
  ]);
  return NextResponse.json({ success: true, plan: status?.plan.key, promo: status?.promo, events, campaigns, noteMax: NOTE_MAX });
}

/** POST { eventId, note }: email nearby subscribers about the event (uses one promo credit). */
export async function POST(request: NextRequest) {
  const result = await requirePermission("promote");
  if (result instanceof NextResponse) return result;
  const { success } = await checkRateLimit(apiRateLimit, `host-promo:${result.organizerId}`);
  if (!success) return NextResponse.json({ success: false, error: "Too many requests. Try again in a minute." }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const out = await startPromo(result.organizerId, String(body.eventId ?? ""), typeof body.note === "string" ? body.note : "");
  if (!out.ok) return NextResponse.json({ success: false, error: out.error }, { status: out.status });
  after(() => out.send!().catch((err) => console.error("[host promo send]", err instanceof Error ? err.message : err)));
  return NextResponse.json({ success: true, recipients: out.recipients });
}
