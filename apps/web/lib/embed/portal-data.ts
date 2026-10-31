import { prisma } from "@udyaibase/database";
import type { EmbedWidget } from "@prisma/client";
import {
  ensureDefaultWidget, getTopReferrers, getWidgetRegistrations, getWidgetViews, widgetStatus,
  type WidgetStatus,
} from "./widgets";

export type PortalWidget = Omit<
  EmbedWidget,
  "createdAt" | "updatedAt" | "setupStartedAt" | "codeCopiedAt" | "markedInstalledAt" | "firstSeenAt" | "lastSeenAt"
> & {
  createdAt: string;
  updatedAt: string;
  setupStartedAt: string | null;
  codeCopiedAt: string | null;
  markedInstalledAt: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  status: WidgetStatus;
};

export interface PortalEventOption {
  id: string;
  title: string;
  category: string;
  startAt: string;
  isUpcoming: boolean;
  isPublic: boolean;
}

export interface WidgetStats {
  views: number;
  registrations: number;
}

export function toPortalWidget(w: EmbedWidget): PortalWidget {
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  return {
    ...w,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
    setupStartedAt: iso(w.setupStartedAt),
    codeCopiedAt: iso(w.codeCopiedAt),
    markedInstalledAt: iso(w.markedInstalledAt),
    firstSeenAt: iso(w.firstSeenAt),
    lastSeenAt: iso(w.lastSeenAt),
    status: widgetStatus(w),
  };
}

export async function loadPortalWidgets(organizerId: string) {
  const widgets = await ensureDefaultWidget(organizerId);
  const ids = widgets.map((w) => w.id);
  const [views, regs] = await Promise.all([getWidgetViews(ids), getWidgetRegistrations(ids)]);
  const stats: Record<string, WidgetStats> = Object.fromEntries(
    ids.map((id) => [id, { views: views[id] ?? 0, registrations: regs[id] ?? 0 }]),
  );
  return { widgets: widgets.map(toPortalWidget), stats };
}

export async function loadEventOptions(organizerId: string): Promise<PortalEventOption[]> {
  const now = new Date();
  const events = await prisma.event.findMany({
    where: { organizerId, deletedAt: null, status: "PUBLISHED" },
    orderBy: { startAt: "desc" },
    take: 200,
    select: { id: true, title: true, category: true, startAt: true, endAt: true, visibility: true },
  });
  return events.map((e) => ({
    id: e.id,
    title: e.title,
    category: String(e.category),
    startAt: e.startAt.toISOString(),
    isUpcoming: e.endAt >= now,
    isPublic: String(e.visibility) === "PUBLIC",
  }));
}

export { getTopReferrers };
