import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { requirePermission, eventScope, canAccessEvent } from "@/lib/organizer-auth/require-permission";
import { hasPermission } from "@/lib/organizer-auth/permissions";

export const dynamic = "force-dynamic";

const MAX_PAGE_SIZE = 500;
const STATUSES = ["CONFIRMED", "PENDING_APPROVAL", "CHECKED_IN", "WAITLISTED", "CANCELLED", "PENDING_PAYMENT"] as const;

export async function GET(request: NextRequest) {
  const result = await requirePermission("registrations.view");
  if (result instanceof NextResponse) return result;
  const session = result;

  // Paging and filters: ?page=2&pageSize=100&eventId=…&status=…&q=name, email, company or event. Without them:
  // the newest 500.
  const q = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(q.get("page") || "1") || 1);
  const PAGE_SIZE = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(q.get("pageSize") || String(MAX_PAGE_SIZE)) || MAX_PAGE_SIZE));
  const statusParam = q.get("status");
  const status = (STATUSES as readonly string[]).includes(statusParam || "") ? (statusParam as (typeof STATUSES)[number]) : null;
  const eventId = q.get("eventId");
  const search = (q.get("q") || "").trim().slice(0, 100);
  if (eventId && !canAccessEvent(session, eventId)) return NextResponse.json({ success: false, error: "Not authorized for this event" }, { status: 403 });

  const scope = {
    deletedAt: null,
    event: { ...eventScope(session), deletedAt: null },
    ...(eventId ? { eventId } : {}),
  };
  const where = {
    ...scope,
    ...(status ? { status } : {}),
    ...(search ? { OR: [
      { guestName: { contains: search, mode: "insensitive" as const } },
      { guestEmail: { contains: search, mode: "insensitive" as const } },
      { guestCompany: { contains: search, mode: "insensitive" as const } },
      { event: { title: { contains: search, mode: "insensitive" as const } } },
    ] } : {}),
  };
  const [total, byStatus] = await Promise.all([
    prisma.eventRegistration.count({ where }),
    prisma.eventRegistration.groupBy({ by: ["status"], where: scope, _count: { _all: true } }),
  ]);
  const counts = Object.fromEntries(byStatus.map((g) => [g.status, g._count._all]));

  const registrations = await prisma.eventRegistration.findMany({
    where,
    skip: (page - 1) * PAGE_SIZE,
    orderBy: { registeredAt: "desc" },
    select: {
      id: true,
      guestName: true,
      guestEmail: true,
      guestPhone: true,
      guestCompany: true,
      guestOccupation: true,
      status: true,
      registeredAt: true,
      checkedInAt: true,
      paymentStatus: true, amountPaise: true,
      event: { select: { id: true, title: true, slug: true } },
    },
    take: PAGE_SIZE,
  });

  return NextResponse.json({
    success: true,
    canExport: hasPermission(session.role, "registrations.export"),
    total, page, pageSize: PAGE_SIZE, hasMore: page * PAGE_SIZE < total,
    counts: { all: Object.values(counts).reduce((a, b) => a + b, 0), pending: counts.PENDING_APPROVAL ?? 0, waitlisted: counts.WAITLISTED ?? 0 },
    registrations: registrations.map(r => ({
      id: r.id,
      guestName: r.guestName,
      guestEmail: r.guestEmail,
      guestPhone: r.guestPhone,
      guestCompany: r.guestCompany,
      guestOccupation: r.guestOccupation,
      status: r.status,
      registeredAt: r.registeredAt,
      checkedInAt: r.checkedInAt,
      paymentStatus: r.paymentStatus,
      amountPaise: r.amountPaise,
      eventId: r.event.id,
      eventTitle: r.event.title,
      eventSlug: r.event.slug,
    })),
  });
}
