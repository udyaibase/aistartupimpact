import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { requirePermission } from "@/lib/organizer-auth/require-permission";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const result = await requirePermission("registrations.view");
  if (result instanceof NextResponse) return result;
  const session = result;

  const eventFilter: any = { organizerId: session.organizerId, deletedAt: null };
  if (session.assignedEventIds) {
    eventFilter.id = { in: session.assignedEventIds };
  }

  const registrations = await prisma.eventRegistration.findMany({
    where: {
      deletedAt: null,
      event: eventFilter,
    },
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
    take: 500,
  });

  return NextResponse.json({
    success: true,
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
