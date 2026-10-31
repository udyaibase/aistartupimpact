import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/organizer-auth/require-permission";
import { hasPermission } from "@/lib/organizer-auth/permissions";
import { loadEventOptions, loadPortalWidgets, getTopReferrers } from "@/lib/embed/portal-data";
import { siteOrigin } from "@/lib/embed/platforms";
import WidgetSetup from "@/components/organizer/embed/WidgetSetup";
import WidgetList from "@/components/organizer/embed/WidgetList";
import EventWidgetRedirect from "@/components/organizer/embed/EventWidgetRedirect";
import NoAccess from "@/components/organizer/embed/NoAccess";

export const dynamic = "force-dynamic";
export const metadata = { title: "Website widget" };

export default async function EmbedPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; customize?: string }>;
}) {
  const session = await requirePermission("embed.view");
  if (session instanceof NextResponse) return <NoAccess />;
  const canManage = hasPermission(session.role, "embed.manage");
  const sp = await searchParams;

  if (sp.event && canManage) return <EventWidgetRedirect eventId={sp.event} />;

  const [{ widgets, stats }, events] = await Promise.all([
    loadPortalWidgets(session.organizerId),
    loadEventOptions(session.organizerId),
  ]);

  if (widgets.length > 1) {
    const referrers = await getTopReferrers(session.organizerId);
    return <WidgetList widgets={widgets} stats={stats} referrers={referrers} canManage={canManage} />;
  }

  const widget = widgets[0];
  const referrers = widget.status === "live" ? await getTopReferrers(session.organizerId, widget.id) : [];
  return (
    <WidgetSetup
      widget={widget}
      stats={stats[widget.id]}
      referrers={referrers}
      events={events}
      canManage={canManage}
      origin={siteOrigin()}
      hasOtherWidgets={false}
      openCustomize={sp.customize === "1"}
    />
  );
}
