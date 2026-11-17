import { NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { requirePermission } from "@/lib/organizer-auth/require-permission";
import { logOrganizerActivity, organizerActor } from '@/lib/workspace-activity';
import { apiRateLimit, checkRateLimit, rateLimitMessage, retryAfterHeaders } from "@/lib/rate-limit";
import { eventScope } from "@/lib/organizer-auth/require-permission";

export const dynamic = "force-dynamic";

const MAX_ROWS = 50_000;

/**
 * One CSV cell. Attendees type their own names and companies: a value starting with = + - @ (or a tab / return)
 * would run as a formula when the host opens the file in Excel or Sheets, so it gets a leading apostrophe.
 */
function csvCell(value: string): string {
  const v = value || "";
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * GET /api/organizer/attendees — Export organizer's attendees as CSV
 */
export async function GET() {
  const result = await requirePermission("registrations.export");
  if (result instanceof NextResponse) return result;
  const session = result;

  const { success, reset } = await checkRateLimit(apiRateLimit, `attendees-export:${session.organizerId}`);
  if (!success) return NextResponse.json({ success: false, error: rateLimitMessage(reset) }, { status: 429, headers: retryAfterHeaders(reset) });

  // This workspace's events that still exist, narrowed to the assigned ones for limited teammates.
  const registrations = await prisma.eventRegistration.findMany({
    where: { event: { ...eventScope(session), deletedAt: null }, deletedAt: null },
    orderBy: { registeredAt: "desc" },
    take: MAX_ROWS,
    select: {
      guestName: true, guestEmail: true, guestPhone: true,
      guestCompany: true, guestOccupation: true, status: true, registeredAt: true,
      event: { select: { title: true } },
    },
  });

  const headers = ["Name", "Email", "Phone", "Company", "Occupation", "Event", "Status", "Date"];
  const rows = registrations.map(r => [
    r.guestName || "", r.guestEmail || "", r.guestPhone || "",
    r.guestCompany || "", r.guestOccupation || "", r.event.title,
    r.status, new Date(r.registeredAt).toISOString(),
  ]);

  const csv = [headers.join(","), ...rows.map(row => row.map(csvCell).join(","))].join("\n");
  // Attendees' personal data left the portal: always on record.
  await logOrganizerActivity(session.organizerId, "attendees_exported", { actor: organizerActor(session) });

  return new NextResponse(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="my-attendees-${new Date().toISOString().split("T")[0]}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
