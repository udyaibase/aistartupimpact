import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@udyaibase/database";
import { requirePermission } from "@/lib/organizer-auth/require-permission";
import {
  syncWidgetCsp, parseWidgetInput, WidgetInputError, widgetStatus,
} from "@/lib/embed/widgets";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ widgetId: string }> };

export async function GET(_request: NextRequest, { params }: Ctx) {
  const result = await requirePermission("embed.view");
  if (result instanceof NextResponse) return result;
  const { widgetId } = await params;

  const widget = await prisma.embedWidget.findFirst({
    where: { id: widgetId, organizerId: result.organizerId },
  });
  if (!widget) {
    return NextResponse.json({ success: false, error: "Widget not found." }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: { ...widget, status: widgetStatus(widget) } });
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  const result = await requirePermission("embed.manage");
  if (result instanceof NextResponse) return result;
  const { widgetId } = await params;

  const existing = await prisma.embedWidget.findFirst({
    where: { id: widgetId, organizerId: result.organizerId },
  });
  if (!existing) {
    return NextResponse.json({ success: false, error: "Widget not found." }, { status: 404 });
  }

  try {
    const body = await request.json();
    const data = parseWidgetInput(body);

    if (Array.isArray(data.eventIds) && (data.eventIds as string[]).length > 0) {
      const owned = await prisma.event.count({
        where: { id: { in: data.eventIds as string[] }, organizerId: result.organizerId },
      });
      if (owned !== (data.eventIds as string[]).length) {
        return NextResponse.json({ success: false, error: "One of the selected events isn't yours." }, { status: 400 });
      }
    }

    const widget = await prisma.embedWidget.update({ where: { id: widgetId }, data });
    await syncWidgetCsp(widget);
    revalidatePath(`/embed/${widgetId}`);

    return NextResponse.json({ success: true, data: { ...widget, status: widgetStatus(widget) } });
  } catch (error) {
    if (error instanceof WidgetInputError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error("Widget update error:", error);
    return NextResponse.json({ success: false, error: "Couldn't save. Check your connection and try again." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const result = await requirePermission("embed.manage");
  if (result instanceof NextResponse) return result;
  const { widgetId } = await params;

  const existing = await prisma.embedWidget.findFirst({
    where: { id: widgetId, organizerId: result.organizerId },
  });
  if (!existing) {
    return NextResponse.json({ success: false, error: "Widget not found." }, { status: 404 });
  }
  if (existing.isDefault) {
    return NextResponse.json(
      { success: false, error: "Your main widget can't be deleted. Pause it instead." },
      { status: 400 },
    );
  }

  await prisma.embedWidget.delete({ where: { id: widgetId } });
  await syncWidgetCsp({ id: widgetId, active: false, allowedDomains: [] });
  revalidatePath(`/embed/${widgetId}`);

  return NextResponse.json({ success: true });
}
