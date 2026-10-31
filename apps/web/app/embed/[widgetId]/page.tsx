import type { Metadata } from "next";
import { effectiveHostPlan } from "@/lib/events/plans";
import { prisma } from "@udyaibase/database";
import EmbedWidgetView, { type EmbedEvent, type WidgetConfig } from "@/components/embed/EmbedWidgetView";
import EmbedEmptyState from "@/components/embed/EmbedEmptyState";

export const revalidate = 60;

export const metadata: Metadata = { title: "Events", robots: { index: false, follow: false } };

interface Props {
  params: Promise<{ widgetId: string }>;
}

const UPCOMING_LIMIT = 50;
const PAST_LIMIT = 6;

const eventSelect = {
  id: true, title: true, slug: true, subtitle: true, category: true, format: true,
  startAt: true, endAt: true, timezone: true, venueName: true, address: true,
  coverImageUrl: true, capacity: true, registrationCount: true, registrationDeadline: true,
  approvalRequired: true,
  customQuestions: {
    select: { id: true, questionText: true, questionType: true, options: true, required: true, sortOrder: true },
    orderBy: { sortOrder: "asc" as const },
  },
  ticketTiers: {
    select: {
      id: true, name: true, tierType: true, priceCents: true, quantity: true,
      soldCount: true, saleStart: true, saleEnd: true,
    },
  },
};

export default async function EmbedPage({ params }: Props) {
  const { widgetId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(widgetId)) return <EmbedEmptyState />;

  const widget = await prisma.embedWidget.findUnique({
    where: { id: widgetId },
    include: { organizer: { select: { id: true, name: true, company: true, avatar: true, plan: true, planExpiresAt: true } } },
  });
  if (!widget || !widget.active) return <EmbedEmptyState />;

  const now = new Date();
  const base: Record<string, unknown> = {
    organizerId: widget.organizerId,
    status: "PUBLISHED",
    visibility: "PUBLIC",
    deletedAt: null,
  };
  if (widget.eventIds.length > 0) base.id = { in: widget.eventIds };
  else if (widget.categories.length > 0) base.category = { in: widget.categories };

  const [upcoming, past] = await Promise.all([
    prisma.event.findMany({
      where: { ...base, endAt: { gte: now } },
      orderBy: { startAt: "asc" },
      take: UPCOMING_LIMIT,
      select: eventSelect,
    }),
    prisma.event.findMany({
      where: { ...base, endAt: { lt: now } },
      orderBy: { startAt: "desc" },
      take: PAST_LIMIT,
      select: eventSelect,
    }),
  ]);

  const config: WidgetConfig = {
    id: widget.id,
    layout: widget.layout as WidgetConfig["layout"],
    accentColor: widget.accentColor,
    darkMode: widget.darkMode as WidgetConfig["darkMode"],
    cornerStyle: widget.cornerStyle as WidgetConfig["cornerStyle"],
    buttonText: widget.buttonText,
    heading: widget.heading,
    subheading: widget.subheading,
    headingAlign: widget.headingAlign as WidgetConfig["headingAlign"],
    headingSize: widget.headingSize as WidgetConfig["headingSize"],
    fontFamily: widget.fontFamily,
    textScale: widget.textScale as WidgetConfig["textScale"],
    showCover: widget.showCover,
    showPrice: widget.showPrice,
    showSpotsLeft: widget.showSpotsLeft,
    showAttendeeCount: widget.showAttendeeCount,
    showCategory: widget.showCategory,
    buttonSize: widget.buttonSize as WidgetConfig["buttonSize"],
    buttonStyle: widget.buttonStyle as WidgetConfig["buttonStyle"],
    cardStyle: widget.cardStyle as WidgetConfig["cardStyle"],
    spacing: widget.spacing as WidgetConfig["spacing"],
    showPast: widget.showPast,
    registrationMode: widget.registrationMode as WidgetConfig["registrationMode"],
    maxEvents: widget.maxEvents,
    // Free widgets always credit Udyaibase; Pro removes it.
    showPoweredBy: !effectiveHostPlan(widget.organizer).removeBranding,
    organizer: { id: widget.organizer.id, name: widget.organizer.name, company: widget.organizer.company, avatar: widget.organizer.avatar },
  };

  const serialize = (e: (typeof upcoming)[number]): EmbedEvent => ({
    ...e,
    category: String(e.category),
    format: String(e.format),
    address: e.address ? e.address.split("|||")[0] : null,
    startAt: e.startAt.toISOString(),
    endAt: e.endAt.toISOString(),
    registrationDeadline: e.registrationDeadline?.toISOString() ?? null,
    customQuestions: e.customQuestions.map((q) => ({ ...q, questionType: String(q.questionType) })),
    ticketTiers: e.ticketTiers.map((t) => ({
      ...t,
      tierType: String(t.tierType),
      saleStart: t.saleStart?.toISOString() ?? null,
      saleEnd: t.saleEnd?.toISOString() ?? null,
    })),
  } as EmbedEvent);

  return (
    <EmbedWidgetView
      config={config}
      events={upcoming.map(serialize)}
      pastEvents={past.map(serialize)}
    />
  );
}
