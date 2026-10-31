import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { requirePermission } from "@/lib/organizer-auth/require-permission";
import { getPlatform } from "@/lib/embed/platforms";
import { widgetStatus } from "@/lib/embed/widgets";

export const dynamic = "force-dynamic";

const STEPS = ["setup_started", "platform_selected", "code_copied", "marked_installed"] as const;
type Step = (typeof STEPS)[number];

/** Records setup-funnel milestones; first occurrence wins so time-to-live stays measurable. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ widgetId: string }> }) {
  const result = await requirePermission("embed.view");
  if (result instanceof NextResponse) return result;
  const { widgetId } = await params;

  const body = await request.json().catch(() => ({}));
  const step = body.step as Step;
  if (!STEPS.includes(step)) {
    return NextResponse.json({ success: false, error: "Unknown step." }, { status: 400 });
  }

  const widget = await prisma.embedWidget.findFirst({
    where: { id: widgetId, organizerId: result.organizerId },
  });
  if (!widget) return NextResponse.json({ success: false, error: "Widget not found." }, { status: 404 });

  const now = new Date();
  const data: Record<string, unknown> = {};
  if (step === "setup_started" && !widget.setupStartedAt) data.setupStartedAt = now;
  if (step === "platform_selected") {
    const platform = getPlatform(body.platform);
    if (!platform) return NextResponse.json({ success: false, error: "Unknown platform." }, { status: 400 });
    data.platform = platform.id;
  }
  if (step === "code_copied" && !widget.codeCopiedAt) data.codeCopiedAt = now;
  if (step === "marked_installed") data.markedInstalledAt = now;

  const updated = Object.keys(data).length
    ? await prisma.embedWidget.update({ where: { id: widgetId }, data })
    : widget;

  return NextResponse.json({ success: true, data: { ...updated, status: widgetStatus(updated) } });
}
