import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { requirePermission } from "@/lib/organizer-auth/require-permission";
import { checkRateLimit } from "@/lib/rate-limit";
import { embedSendInstructionsRateLimit } from "@/lib/event-rate-limit";
import { sendDeveloperInstructions } from "@/lib/embed/emails";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ widgetId: string }> }) {
  const result = await requirePermission("embed.manage");
  if (result instanceof NextResponse) return result;
  const { widgetId } = await params;

  const body = await request.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
    return NextResponse.json({ success: false, error: "Enter a valid email address." }, { status: 400 });
  }

  const limit = await checkRateLimit(embedSendInstructionsRateLimit, result.organizerId);
  if (!limit.success) {
    return NextResponse.json(
      { success: false, error: "You've sent a lot of these in the last hour. Try again later." },
      { status: 429 },
    );
  }

  const widget = await prisma.embedWidget.findFirst({
    where: { id: widgetId, organizerId: result.organizerId },
    include: { organizer: { select: { name: true, company: true, email: true } } },
  });
  if (!widget) return NextResponse.json({ success: false, error: "Widget not found." }, { status: 404 });

  const sent = await sendDeveloperInstructions({
    to: email,
    widgetId: widget.id,
    platformId: typeof body.platform === "string" ? body.platform : widget.platform,
    organizerName: widget.organizer.company || widget.organizer.name,
    organizerEmail: result.email,
    note: typeof body.note === "string" ? body.note : undefined,
  });

  if (!sent.success) {
    return NextResponse.json(
      { success: false, error: "We couldn't send the email. Copy the code and share it another way." },
      { status: 502 },
    );
  }
  return NextResponse.json({ success: true });
}
