import { NextRequest, NextResponse } from "next/server";
import { humanCheckFailed } from '@/lib/turnstile';
import { prisma } from "@udyaibase/database";
import { checkRateLimit, getClientIdentifier } from "@/lib/rate-limit";
import { strictRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/reports — Submit a content report (public, rate-limited)
 */
export async function POST(request: NextRequest) {
  const identifier = getClientIdentifier(request);
  const { success } = await checkRateLimit(strictRateLimit, identifier);
  if (!success) {
    return NextResponse.json({ success: false, error: "Too many reports. Please wait." }, { status: 429 });
  }

  try {
    const { entityType, entityId, entityName, entitySlug, reportType, description, reporterEmail, turnstileToken } = await request.json();
    const notHuman = await humanCheckFailed(turnstileToken);
    if (notHuman) return notHuman;

    if (!entityType || !entityId || !reportType || !description) {
      return NextResponse.json({ success: false, error: "Missing required fields." }, { status: 400 });
    }

    await prisma.contentReport.create({
      data: {
        entityType,
        entityId,
        entityName: entityName || "",
        entitySlug: entitySlug || "",
        reportType,
        description,
        reporterEmail: reporterEmail || null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Report submission error:", error);
    return NextResponse.json({ success: false, error: "Failed to submit." }, { status: 500 });
  }
}
