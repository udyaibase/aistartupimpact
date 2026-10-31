"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CodeXml, Copy, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import type { PortalWidget, WidgetStats } from "@/lib/embed/portal-data";
import { StatusPill, btnPrimary, btnGhost, card, displayHost, timeAgo } from "./ui";
import { apiJson } from "./helpers";
import ConfirmDialog from "./ConfirmDialog";
import InfoTip from "./InfoTip";

interface Props {
  widgets: PortalWidget[];
  stats: Record<string, WidgetStats>;
  referrers: { url: string; count: number }[];
  canManage: boolean;
}

export default function WidgetList({ widgets: initial, stats, referrers, canManage }: Props) {
  const router = useRouter();
  const [widgets, setWidgets] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pauseTarget, setPauseTarget] = useState<PortalWidget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PortalWidget | null>(null);

  async function create(body: Record<string, unknown>, customize: boolean) {
    setBusy("new");
    const d = await apiJson<PortalWidget>("/api/organizer/widgets", { method: "POST", body: JSON.stringify(body) });
    setBusy(null);
    if (d.success && d.data) router.push(`/organizer/embed/${d.data.id}${customize ? "?customize=1" : ""}`);
    else setError(d.error || "Couldn't create the widget.");
  }

  async function setActive(w: PortalWidget, active: boolean) {
    setPauseTarget(null);
    setBusy(w.id);
    const d = await apiJson<PortalWidget>(`/api/organizer/widgets/${w.id}`, { method: "PUT", body: JSON.stringify({ active }) });
    setBusy(null);
    if (d.success && d.data) setWidgets((ws) => ws.map((x) => (x.id === w.id ? { ...x, ...d.data! } : x)));
    else setError(d.error || "Couldn't update the widget.");
  }

  async function remove(w: PortalWidget) {
    setDeleteTarget(null);
    setBusy(w.id);
    const d = await apiJson(`/api/organizer/widgets/${w.id}`, { method: "DELETE" });
    setBusy(null);
    if (!d.success) {
      setError(d.error || "Couldn't delete the widget.");
      return;
    }
    const remaining = widgets.filter((x) => x.id !== w.id);
    setWidgets(remaining);
    if (remaining.length <= 1) router.refresh();
  }

  const totals = widgets.reduce(
    (a, w) => ({ views: a.views + (stats[w.id]?.views ?? 0), regs: a.regs + (stats[w.id]?.registrations ?? 0) }),
    { views: 0, regs: 0 },
  );
  const liveCount = widgets.filter((w) => w.status === "live").length;

  return (
    <div className="relative max-w-5xl mx-auto font-jakarta pb-12">
      <header className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
        <div className="flex-1">
          <h1 className="portal-title">Website widgets</h1>
          <p className="portal-subtitle">
            {liveCount} of {widgets.length} live · {totals.views.toLocaleString("en-IN")} views and {totals.regs.toLocaleString("en-IN")} registrations in the last 30 days
          </p>
        </div>
        {canManage && (
          <button onClick={() => create({ name: "New widget" }, true)} disabled={busy === "new"} className={btnPrimary}>
            <Plus className="w-4 h-4" aria-hidden /> New widget
          </button>
        )}
      </header>

      {error && <p role="alert" className="mb-4 rounded-[10px] bg-red-50 text-red-800 px-4 py-3 text-sm">{error}</p>}

      <div className={`${card} overflow-hidden`}>
        <div className="hidden md:grid grid-cols-[1fr_96px_110px_96px_264px] gap-3 px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-100 dark:border-gray-800">
          <span>Widget</span>
          <span className="flex items-center justify-end gap-0.5">Views
            <InfoTip label="Views">Times the widget loaded on a website in the last 30 days. Preview views in this portal aren't counted.</InfoTip>
          </span>
          <span className="flex items-center justify-end gap-0.5">Registrations
            <InfoTip label="Registrations">People who registered through this widget, including those waitlisted or awaiting approval.</InfoTip>
          </span>
          <span className="flex items-center justify-end gap-0.5">Conversion
            <InfoTip label="Conversion">Registrations divided by views. A higher number means more visitors sign up after seeing your events.</InfoTip>
          </span>
          <span className="sr-only">Actions</span>
        </div>
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {widgets.map((w) => {
            const s = stats[w.id] ?? { views: 0, registrations: 0 };
            const conv = s.views > 0 ? `${((s.registrations / s.views) * 100).toFixed(1)}%` : "—";
            const scope = w.eventIds.length > 0
              ? `${w.eventIds.length} hand-picked event${w.eventIds.length === 1 ? "" : "s"}`
              : w.categories.length > 0 ? `${w.categories.length} categor${w.categories.length === 1 ? "y" : "ies"}` : "All events";
            return (
              <li key={w.id} className="grid grid-cols-1 md:grid-cols-[1fr_96px_110px_96px_264px] gap-3 items-center px-5 py-4">
                <div className="min-w-0 flex items-center gap-3">
                  <span aria-hidden className="w-9 h-9 rounded-[10px] shrink-0 border border-gray-200 dark:border-gray-700" style={{ background: w.accentColor }} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/organizer/embed/${w.id}`} className="font-semibold text-gray-900 dark:text-white hover:underline truncate">{w.name}</Link>
                      <StatusPill status={w.status} host={displayHost(w.firstSeenHost)} />
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 truncate">
                      {scope}
                      {w.lastSeenAt && w.status === "live" ? ` · last loaded ${timeAgo(w.lastSeenAt)}` : ""}
                    </p>
                  </div>
                </div>
                <Metric label="Views" value={s.views.toLocaleString("en-IN")} />
                <Metric label="Registrations" value={s.registrations.toLocaleString("en-IN")} />
                <Metric label="Conversion" value={conv} />
                <div className="flex md:justify-end gap-1 flex-wrap">
                  <Link href={`/organizer/embed/${w.id}`} className={btnGhost}><CodeXml className="w-4 h-4" aria-hidden /> Get code</Link>
                  {canManage && (
                    <>
                      <Link href={`/organizer/embed/${w.id}?customize=1`} className={btnGhost} aria-label={`Edit ${w.name}`}><Pencil className="w-4 h-4" /></Link>
                      <button onClick={() => create({ duplicateOf: w.id }, false)} className={btnGhost} aria-label={`Duplicate ${w.name}`}><Copy className="w-4 h-4" /></button>
                      <button
                        onClick={() => (w.active ? setPauseTarget(w) : setActive(w, true))}
                        disabled={busy === w.id}
                        className={btnGhost}
                        aria-label={`${w.active ? "Pause" : "Resume"} ${w.name}`}
                      >
                        {w.active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </button>
                      {!w.isDefault && (
                        <button
                          onClick={() => setDeleteTarget(w)}
                          disabled={busy === w.id}
                          className={`${btnGhost} hover:!bg-red-50 hover:!text-red-700 dark:hover:!bg-red-900/20`}
                          aria-label={`Delete ${w.name}`}
                          title="Delete widget"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <section className={`${card} mt-6 p-5`} aria-labelledby="ref-heading">
        <h2 id="ref-heading" className="portal-section-title">Where registrations come from</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5 mb-4">Pages on your sites that brought in the most registrations through a widget.</p>
        {referrers.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-gray-400 rounded-[12px] bg-[#F7F7F9] dark:bg-gray-800/50 px-4 py-6 text-center">
            No widget registrations yet. Once someone registers from your site, you'll see the page here.
          </p>
        ) : (
          <ul className="space-y-2">
            {referrers.map((r) => {
              const max = referrers[0].count;
              return (
                <li key={r.url} className="grid grid-cols-[1fr_auto] gap-3 items-center text-sm">
                  <div className="min-w-0">
                    <p className="truncate text-gray-800 dark:text-gray-200">{r.url.replace(/^https?:\/\/(www\.)?/, "")}</p>
                    <div className="mt-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                      <div className="h-full bg-[#A50F15] rounded-full" style={{ width: `${(r.count / max) * 100}%` }} />
                    </div>
                  </div>
                  <span className="font-semibold text-gray-900 dark:text-white tabular-nums">{r.count}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {pauseTarget && (
        <ConfirmDialog
          title={`Pause ${pauseTarget.name}?`}
          body="Sites using this widget will show nothing until you resume it. Nothing breaks; the space just stays empty."
          confirmLabel="Pause widget"
          onConfirm={() => setActive(pauseTarget, false)}
          onCancel={() => setPauseTarget(null)}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          title={`Delete ${deleteTarget.name}?`}
          body={deleteTarget.status === "live"
            ? `It's live on ${displayHost(deleteTarget.firstSeenHost)}. That page will show nothing once it's deleted. Registrations it brought in stay in Attendees. This can't be undone.`
            : "Sites using this code will show nothing. Registrations it brought in stay in Attendees. This can't be undone."}
          confirmLabel="Delete widget"
          danger
          onConfirm={() => remove(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <p className="md:text-right text-sm">
      <span className="md:sr-only text-gray-500 mr-1">{label}:</span>
      <span className="font-semibold text-gray-900 dark:text-white tabular-nums">{value}</span>
    </p>
  );
}
