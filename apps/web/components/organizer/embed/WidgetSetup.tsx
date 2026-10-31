"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Copy as CopyIcon, MoreHorizontal, Pause, Play, Plus, SlidersHorizontal, Trash2, X, PartyPopper } from "lucide-react";
import type { PortalEventOption, PortalWidget, WidgetStats } from "@/lib/embed/portal-data";
import { getPlatform, type PlatformId } from "@/lib/embed/platforms";
import WidgetPreview, { type PreviewHandle } from "./WidgetPreview";
import { PlatformPicker, CodeStep } from "./InstallSteps";
import InstallStatus from "./InstallStatus";
import CustomizePanel, { type SaveState } from "./CustomizePanel";
import ConfirmDialog from "./ConfirmDialog";
import InfoTip from "./InfoTip";
import { StatusPill, btnPrimary, btnSecondary, btnGhost, card, displayHost } from "./ui";
import { apiJson } from "./helpers";

interface Props {
  widget: PortalWidget;
  stats?: WidgetStats;
  referrers: { url: string; count: number }[];
  events: PortalEventOption[];
  canManage: boolean;
  origin: string;
  hasOtherWidgets: boolean;
  openCustomize: boolean;
}

const RELOAD_KEYS: (keyof PortalWidget)[] = ["categories", "eventIds"];
const DETECTION_KEYS: (keyof PortalWidget)[] = [
  "status", "firstSeenAt", "firstSeenHost", "lastSeenAt", "lastSeenHost", "codeCopiedAt", "markedInstalledAt", "active",
];

export default function WidgetSetup({
  widget: initial, stats, referrers, events, canManage, origin, hasOtherWidgets, openCustomize,
}: Props) {
  const router = useRouter();
  const previewRef = useRef<PreviewHandle>(null);
  const [widget, setWidget] = useState(initial);
  const [customizing, setCustomizing] = useState(openCustomize);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const [justWentLive, setJustWentLive] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | "pause" | "delete">(null);
  const [actionError, setActionError] = useState("");
  const pending = useRef<Partial<PortalWidget>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevStatus = useRef(initial.status);

  const platformId = (widget.platform as PlatformId | null) ?? null;
  const platform = getPlatform(platformId);
  const codeCopied = !!widget.codeCopiedAt;
  const hasUpcoming = events.some((e) => e.isUpcoming && e.isPublic);

  useEffect(() => {
    if (!initial.setupStartedAt) apiJson(`/api/organizer/widgets/${initial.id}/funnel`, { method: "POST", body: JSON.stringify({ step: "setup_started" }) });
  }, [initial.id, initial.setupStartedAt]);

  const mergeDetection = useCallback((fresh: PortalWidget) => {
    setWidget((w) => {
      const next = { ...w };
      for (const k of DETECTION_KEYS) (next as any)[k] = (fresh as any)[k];
      return next;
    });
  }, []);

  // Poll for install detection; fast once the organizer says they've added it.
  useEffect(() => {
    if (widget.status === "live" || widget.status === "paused") return;
    const fast = !!widget.markedInstalledAt || codeCopied;
    const id = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const d = await apiJson<PortalWidget>(`/api/organizer/widgets/${widget.id}`);
      if (d.success && d.data) mergeDetection(d.data);
    }, fast ? 5000 : 30000);
    return () => clearInterval(id);
  }, [widget.id, widget.status, widget.markedInstalledAt, codeCopied, mergeDetection]);

  useEffect(() => {
    if (prevStatus.current !== "live" && widget.status === "live") {
      setJustWentLive(true);
      router.refresh();
    }
    prevStatus.current = widget.status;
  }, [widget.status, router]);

  const flush = useCallback(async () => {
    const patch = pending.current;
    if (Object.keys(patch).length === 0) return;
    pending.current = {};
    setSaveState("saving");
    const d = await apiJson<PortalWidget>(`/api/organizer/widgets/${widget.id}`, { method: "PUT", body: JSON.stringify(patch) });
    if (!d.success) {
      pending.current = { ...patch, ...pending.current };
      setSaveError(d.error || "Couldn't save");
      setSaveState("error");
      return;
    }
    setSaveState("saved");
    setSaveError("");
    if (d.data) mergeDetection(d.data);
    if (RELOAD_KEYS.some((k) => k in patch)) previewRef.current?.reload();
  }, [widget.id, mergeDetection]);

  const update = useCallback((patch: Partial<PortalWidget>) => {
    if (!canManage) return;
    setWidget((w) => ({ ...w, ...patch }));
    previewRef.current?.pushConfig(patch);
    pending.current = { ...pending.current, ...patch };
    setSaveState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 600);
  }, [canManage, flush]);

  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length > 0) e.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  async function funnel(step: string, extra: Record<string, unknown> = {}) {
    const d = await apiJson<PortalWidget>(`/api/organizer/widgets/${widget.id}/funnel`, { method: "POST", body: JSON.stringify({ step, ...extra }) });
    if (d.success && d.data) {
      mergeDetection(d.data);
      if (d.data.platform) setWidget((w) => ({ ...w, platform: d.data!.platform }));
    }
  }

  async function setActive(active: boolean) {
    setConfirm(null);
    const d = await apiJson<PortalWidget>(`/api/organizer/widgets/${widget.id}`, { method: "PUT", body: JSON.stringify({ active }) });
    if (d.success && d.data) {
      mergeDetection(d.data);
      router.refresh();
    } else setActionError(d.error || "Couldn't update the widget.");
  }

  async function duplicateOrCreate(duplicate: boolean) {
    setMenuOpen(false);
    const d = await apiJson<PortalWidget>("/api/organizer/widgets", {
      method: "POST",
      body: JSON.stringify(duplicate ? { duplicateOf: widget.id } : { name: "New widget" }),
    });
    if (d.success && d.data) router.push(`/organizer/embed/${d.data.id}${duplicate ? "" : "?customize=1"}`);
    else setActionError(d.error || "Couldn't create the widget.");
  }

  async function remove() {
    setConfirm(null);
    const d = await apiJson(`/api/organizer/widgets/${widget.id}`, { method: "DELETE" });
    if (d.success) {
      router.push("/organizer/embed");
      router.refresh();
    } else setActionError(d.error || "Couldn't delete the widget.");
  }

  const liveHost = displayHost(widget.firstSeenHost);
  const steps = [
    {
      done: !!platformId, tour: "platform", title: "Where is your website built?", desc: "We'll show the exact steps for your platform.",
      info: "We only use this to show the right instructions. The widget code works the same on every platform.",
    },
    {
      done: codeCopied, tour: "code",
      title: platform?.mode === "link" ? "Add the link to your page" : "Add the code to your site",
      desc: "Paste it once. New events and style changes show up automatically, so you never touch it again.",
      info: "The code adds a small frame that loads only when visitors scroll to it, so it won't slow your page down. All styling is managed here, not in the code.",
    },
    {
      done: widget.status === "live", tour: "status", title: "Check it's working", desc: "We detect your widget the first time someone opens the page.",
      info: "Detection happens when the widget loads on a public website. Pages on localhost show as “Testing”, and this page's preview never counts as an install.",
    },
  ];

  return (
    <div className="relative max-w-5xl mx-auto font-jakarta pb-12">
      {hasOtherWidgets && (
        <Link href="/organizer/embed" className={`${btnGhost} -ml-3 mb-1`}>
          <ArrowLeft className="w-4 h-4" aria-hidden /> All widgets
        </Link>
      )}

      <header className="flex flex-col md:flex-row md:items-start gap-4 mb-6">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="portal-title">
              {hasOtherWidgets ? widget.name : "Show your events on your website"}
            </h1>
            <StatusPill status={widget.status} host={liveHost} />
          </div>
          <p className="portal-subtitle">
            One snippet. Visitors browse and register without leaving your site.
          </p>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <button onClick={() => setCustomizing(true)} className={`${btnSecondary} flex-1 md:flex-none`} data-tour="customize">
            <SlidersHorizontal className="w-4 h-4" aria-hidden /> Customize look
          </button>
          {canManage && (
            <div className="relative">
              <button onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen} aria-haspopup="menu" aria-label="More widget actions" className={btnSecondary}>
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-dropdown" onClick={() => setMenuOpen(false)} aria-hidden />
                  <div role="menu" className="absolute right-0 mt-1 w-56 z-dropdown bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[12px] shadow-lg py-1">
                    <MenuItem icon={CopyIcon} onClick={() => duplicateOrCreate(true)}>Duplicate widget</MenuItem>
                    <MenuItem icon={Plus} onClick={() => duplicateOrCreate(false)}>New widget</MenuItem>
                    {widget.active ? (
                      <MenuItem icon={Pause} onClick={() => { setMenuOpen(false); setConfirm("pause"); }}>Pause widget</MenuItem>
                    ) : (
                      <MenuItem icon={Play} onClick={() => { setMenuOpen(false); setActive(true); }}>Resume widget</MenuItem>
                    )}
                    {!widget.isDefault && (
                      <MenuItem icon={Trash2} danger onClick={() => { setMenuOpen(false); setConfirm("delete"); }}>Delete widget</MenuItem>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      {actionError && (
        <p role="alert" className="mb-4 rounded-[10px] bg-red-50 text-red-800 px-4 py-3 text-sm flex items-center gap-3">
          <span className="flex-1">{actionError}</span>
          <button onClick={() => setActionError("")} aria-label="Dismiss" className={btnGhost}><X className="w-4 h-4" /></button>
        </p>
      )}

      {justWentLive && (
        <div role="status" className="mb-6 flex items-start gap-3 rounded-[14px] border border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-900/40 px-5 py-4">
          <PartyPopper className="w-5 h-5 text-green-700 shrink-0 mt-0.5" aria-hidden />
          <div className="flex-1">
            <p className="font-bold text-gray-900 dark:text-white">Your events are live on {liveHost}</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">Registrations from your site land in Attendees, tagged with the page they came from. We've emailed you too.</p>
          </div>
          <button onClick={() => setJustWentLive(false)} aria-label="Dismiss" className={btnGhost}><X className="w-4 h-4" /></button>
        </div>
      )}

      <div data-tour="preview">
        <WidgetPreview ref={previewRef} widget={widget} hasEvents={hasUpcoming} canManage={canManage} onResume={() => setActive(true)} />
      </div>

      <ol className="mt-6 space-y-4" aria-label="Setup steps">
        <Step n={1} {...steps[0]}>
          <PlatformPicker value={platformId} disabled={!canManage && !!platformId}
            onChange={(p) => { setWidget((w) => ({ ...w, platform: p })); funnel("platform_selected", { platform: p }); }} />
        </Step>
        <Step n={2} {...steps[1]}>
          <CodeStep widgetId={widget.id} origin={origin} platformId={platformId} canSend={canManage}
            onCopied={() => { if (!codeCopied) { setWidget((w) => ({ ...w, codeCopiedAt: new Date().toISOString() })); funnel("code_copied"); } }} />
        </Step>
        <Step n={3} {...steps[2]}>
          <InstallStatus
            widget={widget}
            stats={stats}
            referrers={referrers}
            canManage={canManage}
            codeCopied={codeCopied}
            onMarkInstalled={() => funnel("marked_installed")}
            onLockDomain={(h) => update({ allowedDomains: [h] })}
            onResume={() => setActive(true)}
            onVerified={mergeDetection}
          />
        </Step>
      </ol>

      {customizing && (
        <CustomizePanel
          widget={widget}
          events={events}
          canManage={canManage}
          saveState={saveState}
          saveError={saveError}
          onChange={update}
          onRetry={flush}
          onClose={() => setCustomizing(false)}
          showName={hasOtherWidgets || !widget.isDefault}
        />
      )}

      {confirm === "pause" && (
        <ConfirmDialog
          title="Pause this widget?"
          body={widget.status === "live"
            ? `Your events disappear from ${liveHost} until you resume. Nothing breaks on your site; the space just stays empty.`
            : "The widget will show nothing anywhere it's installed until you resume it."}
          confirmLabel="Pause widget"
          onConfirm={() => setActive(false)}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === "delete" && (
        <ConfirmDialog
          title="Delete this widget?"
          body="Sites using this code will show nothing. Registrations it brought in stay in Attendees. This can't be undone."
          confirmLabel="Delete widget"
          danger
          onConfirm={remove}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

function Step({ n, done, title, desc, info, tour, children }: {
  n: number; done: boolean; title: string; desc: string; info?: string; tour?: string; children: React.ReactNode;
}) {
  return (
    <li className={`${card} p-5 sm:p-6`} data-tour={tour}>
      <div className="flex gap-4">
        <span
          aria-hidden
          className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
            done ? "bg-green-600 text-white" : "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
          }`}
        >
          {done ? <Check className="w-4 h-4" /> : n}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <h2 className="portal-section-title">
              <span className="sr-only">Step {n}{done ? ", done" : ""}: </span>{title}
            </h2>
            {info && <InfoTip label={title} align="start">{info}</InfoTip>}
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5 mb-4">{desc}</p>
          {children}
        </div>
      </div>
    </li>
  );
}

function MenuItem({ icon: Icon, children, onClick, danger }: { icon: React.ElementType; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button role="menuitem" onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-4 min-h-[44px] text-sm text-left focus:outline-none focus-visible:bg-gray-100 ${danger ? "text-red-700 hover:bg-red-50" : "text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"}`}>
      <Icon className="w-4 h-4" aria-hidden /> {children}
    </button>
  );
}
