import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { requirePermission } from "@/lib/organizer-auth/require-permission";
import {
  ensureDefaultWidget, syncWidgetCsp, parseWidgetInput, WidgetInputError,
} from "@/lib/embed/widgets";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await requirePermission("embed.view");
  if (result instanceof NextResponse) return result;

  const widgets = await ensureDefaultWidget(result.organizerId);
  return NextResponse.json({ success: true, data: widgets });
}

/**
 * Create a widget. With `forEventId`, returns the existing single-event widget for
 * that event if there is one, so "Embed on website" from an event is idempotent.
 * With `duplicateOf`, copies that widget's settings.
 */
export async function POST(request: NextRequest) {
  const result = await requirePermission("embed.manage");
  if (result instanceof NextResponse) return result;
  const session = result;

  try {
    const body = await request.json().catch(() => ({}));
    await ensureDefaultWidget(session.organizerId);

    if (body.forEventId) {
      const event = await prisma.event.findFirst({
        where: { id: String(body.forEventId), organizerId: session.organizerId, deletedAt: null },
        select: { id: true, title: true },
      });
      if (!event) {
        return NextResponse.json({ success: false, error: "Event not found." }, { status: 404 });
      }
      const existing = await prisma.embedWidget.findFirst({
        where: { organizerId: session.organizerId, eventIds: { equals: [event.id] } },
      });
      if (existing) return NextResponse.json({ success: true, data: existing });

      const base = await prisma.embedWidget.findFirst({
        where: { organizerId: session.organizerId, isDefault: true },
      });
      const widget = await prisma.embedWidget.create({
        data: {
          organizerId: session.organizerId,
          name: event.title.slice(0, 60),
          accentColor: base?.accentColor,
          darkMode: base?.darkMode,
          cornerStyle: base?.cornerStyle,
          eventIds: [event.id],
          maxEvents: 1,
          allowedDomains: base?.allowedDomains ?? [],
        },
      });
      await syncWidgetCsp(widget);
      return NextResponse.json({ success: true, data: widget }, { status: 201 });
    }

    let copyFrom: Record<string, unknown> = {};
    if (body.duplicateOf) {
      const src = await prisma.embedWidget.findFirst({
        where: { id: String(body.duplicateOf), organizerId: session.organizerId },
      });
      if (!src) return NextResponse.json({ success: false, error: "Widget not found." }, { status: 404 });
      const {
        id: _id, createdAt: _c, updatedAt: _u, organizerId: _o, isDefault: _d,
        platform: _p, setupStartedAt: _s, codeCopiedAt: _cc, markedInstalledAt: _m,
        firstSeenAt: _f, firstSeenHost: _fh, lastSeenAt: _l, lastSeenHost: _lh,
        ...settings
      } = src;
      copyFrom = { ...settings, name: `${src.name} (copy)`.slice(0, 60) };
    }

    const data = parseWidgetInput({ ...copyFrom, ...body, name: body.name ?? copyFrom.name ?? "New widget" });
    const widget = await prisma.embedWidget.create({
      data: { ...(data as object), organizerId: session.organizerId, allowedDomains: (data.allowedDomains as string[]) ?? [] } as any,
    });
    await syncWidgetCsp(widget);
    return NextResponse.json({ success: true, data: widget }, { status: 201 });
  } catch (error) {
    if (error instanceof WidgetInputError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error("Widget create error:", error);
    return NextResponse.json({ success: false, error: "Couldn't create the widget. Try again." }, { status: 500 });
  }
}
