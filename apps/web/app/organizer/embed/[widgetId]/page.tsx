import { NextResponse } from "next/server";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/organizer-auth/require-permission";
import { hasPermission } from "@/lib/organizer-auth/permissions";
import { loadEventOptions, loadPortalWidgets, getTopReferrers } from "@/lib/embed/portal-data";
import { siteOrigin } from "@/lib/embed/platforms";
import WidgetSetup from "@/components/organizer/embed/WidgetSetup";
import NoAccess from "@/components/organizer/embed/NoAccess";

export const dynamic = "force-dynamic";
export const metadata = { title: "Website widget" };

export default async function WidgetPage({
  params,
  searchParams,
}: {
  params: Promise<{ widgetId: string }>;
  searchParams: Promise<{ customize?: string }>;
}) {
  const session = await requirePermission("embed.view");
  if (session instanceof NextResponse) return <NoAccess />;
  const { widgetId } = await params;
  const sp = await searchParams;

  const [{ widgets, stats }, events] = await Promise.all([
    loadPortalWidgets(session.organizerId),
    loadEventOptions(session.organizerId),
  ]);
  const widget = widgets.find((w) => w.id === widgetId);
  if (!widget) notFound();

  const referrers = widget.status === "live" ? await getTopReferrers(session.organizerId, widget.id) : [];

  return (
    <WidgetSetup
      widget={widget}
      stats={stats[widget.id]}
      referrers={referrers}
      events={events}
      canManage={hasPermission(session.role, "embed.manage")}
      origin={siteOrigin()}
      hasOtherWidgets={widgets.length > 1}
      openCustomize={sp.customize === "1"}
    />
  );
}
