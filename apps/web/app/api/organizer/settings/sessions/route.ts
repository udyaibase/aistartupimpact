import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { getOrganizerSession, currentOrganizerSessionToken } from "@/lib/organizer-auth";
import { apiRateLimit, checkRateLimit } from "@/lib/rate-limit";
import { logOrganizerActivity, organizerActor } from "@/lib/workspace-activity";
import { describeDevice } from "@/lib/organizer-auth/device";

export const dynamic = "force-dynamic";

/** The devices signed in to this account (the person's own account, whichever workspace they're working in). */
export async function GET() {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  const current = await currentOrganizerSessionToken();
  const rows = await prisma.eventOrganizerSession.findMany({
    where: { organizerId: session.id, expiresAt: { gt: new Date() } },
    orderBy: [{ lastSeenAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    select: { id: true, token: true, ipAddress: true, userAgent: true, createdAt: true, lastSeenAt: true },
    take: 50,
  });
  return NextResponse.json({
    success: true,
    sessions: rows.map((r) => ({
      id: r.id,
      device: describeDevice(r.userAgent),
      ipAddress: r.ipAddress,
      signedInAt: r.createdAt,
      lastSeenAt: r.lastSeenAt ?? r.createdAt,
      current: r.token === current,
    })),
  });
}

/** Sign out one device (`{ id }`) or every device except this one (`{ all: true }`). */
export async function DELETE(request: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  const { success } = await checkRateLimit(apiRateLimit, `organizer-sessions:${session.id}`);
  if (!success) return NextResponse.json({ success: false, error: "Too many requests. Try again in a minute." }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const current = await currentOrganizerSessionToken();
  let count = 0;
  if (body.all === true) {
    count = (await prisma.eventOrganizerSession.deleteMany({
      where: { organizerId: session.id, ...(current ? { token: { not: current } } : {}) },
    })).count;
  } else if (typeof body.id === "string" && body.id) {
    count = (await prisma.eventOrganizerSession.deleteMany({
      where: { id: body.id, organizerId: session.id, ...(current ? { token: { not: current } } : {}) },
    })).count;
  } else {
    return NextResponse.json({ success: false, error: "Choose a device." }, { status: 400 });
  }
  await logOrganizerActivity(session.id, "devices_signed_out", { actor: organizerActor(session), request, metadata: { what: body.all ? "Signed out all other devices" : "Signed out a device", count } });
  return NextResponse.json({ success: true, count });
}
