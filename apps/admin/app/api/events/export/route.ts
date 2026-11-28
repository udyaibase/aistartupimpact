import { toCsv } from "@/lib/csv";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@udyaibase/database";
import { logAuditEvent } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

/**
 * GET /api/events/export — Export ALL attendees across all events as CSV (admin only)
 */
export async function GET() {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !["SUPER_ADMIN", "EDITOR_IN_CHIEF"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const registrations = await prisma.eventRegistration.findMany({
    where: { deletedAt: null },
    orderBy: { registeredAt: "desc" },
    select: {
      guestName: true,
      guestEmail: true,
      guestPhone: true,
      guestCompany: true,
      guestOccupation: true,
      status: true,
      registeredAt: true,
      event: { select: { title: true, slug: true, category: true } },
    },
  });

  // Build CSV
  const headers = ["Name", "Email", "Phone", "Company", "Occupation", "Event", "Category", "Status", "Registered At"];
  const rows = registrations.map(r => [
    r.guestName || "",
    r.guestEmail || "",
    r.guestPhone || "",
    r.guestCompany || "",
    r.guestOccupation || "",
    r.event.title,
    r.event.category,
    r.status,
    new Date(r.registeredAt).toISOString(),
  ]);

  const csv = toCsv(headers, rows); // cells that look like formulas are made plain text (lib/csv.ts)

  logAuditEvent({
    action: 'EXPORT',
    resourceType: 'EVENT_EXPORT',
    after: { recordCount: registrations.length, fields: headers },
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="all-event-attendees-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
