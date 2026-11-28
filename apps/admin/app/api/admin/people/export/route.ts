import { toCsv } from "@/lib/csv";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { neon } from "@neondatabase/serverless";
import { logAuditEvent } from "@/lib/audit-log";

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !["SUPER_ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const people = await sql`
      SELECT 
        u.name, u.email, u."emailVerified", u."twoFactorEnabled", u."lastWorkspace",
        u."createdAt"::text as "createdAt",
        f.company as "founderCompany", f.status as "founderStatus",
        o.company as "organizerCompany", o.status as "organizerStatus",
        (SELECT COUNT(*)::int FROM "Startup" s WHERE s."ownerId" = f.id AND s."deletedAt" IS NULL) as "startups",
        (SELECT COUNT(*)::int FROM "AiTool" t WHERE t."ownerId" = f.id AND t."deletedAt" IS NULL) as "tools",
        (SELECT COUNT(*)::int FROM "Event" e WHERE e."organizerId" = o.id AND e."deletedAt" IS NULL) as "events"
      FROM "UnifiedUser" u
      LEFT JOIN "FounderUser" f ON f."unifiedUserId" = u.id
      LEFT JOIN "EventOrganizer" o ON o."unifiedUserId" = u.id
      ORDER BY u."createdAt" DESC
    `;

    const headers = ["Name", "Email", "Verified", "2FA", "Last Workspace", "Founder Company", "Founder Status", "Organizer Company", "Organizer Status", "Startups", "Tools", "Events", "Joined"];
    const rows = people.map((p: any) => [
      p.name, p.email, p.emailVerified ? "Yes" : "No", p.twoFactorEnabled ? "Yes" : "No",
      p.lastWorkspace || "COMMUNITY", p.founderCompany || "", p.founderStatus || "",
      p.organizerCompany || "", p.organizerStatus || "",
      p.startups || 0, p.tools || 0, p.events || 0,
      p.createdAt ? new Date(p.createdAt).toLocaleDateString("en-GB") : "",
    ]);

    const csv = toCsv(headers, rows); // cells that look like formulas are made plain text (lib/csv.ts)

    logAuditEvent({
      action: 'EXPORT',
      resourceType: 'PEOPLE_EXPORT',
      after: { recordCount: people.length, fields: headers },
    });

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="people-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
