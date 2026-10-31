"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check, MoreHorizontal, Pause, Play, Plus, SlidersHorizontal, X, PartyPopper,
} from "lucide-react";
import type { JobsPortalWidget } from "@/lib/jobs/careers";
import { getPlatform, type PlatformId } from "@/lib/embed/platforms";
import WidgetPreview, { type PreviewHandle } from "@/components/organizer/embed/WidgetPreview";
import { PlatformPicker, CodeStep } from "@/components/organizer/embed/InstallSteps";
import InstallStatus from "@/components/organizer/embed/InstallStatus";
import ConfirmDialog from "@/components/organizer/embed/ConfirmDialog";
import InfoTip from "@/components/organizer/embed/InfoTip";
import { StatusPill, btnPrimary, btnSecondary, btnGhost, card, displayHost } from "@/components/organizer/embed/ui";
import { apiJson } from "@/components/organizer/embed/helpers";
import type { SaveState } from "@/components/organizer/embed/CustomizePanel";
import JobsCustomizePanel from "./JobsCustomizePanel";

interface Props {
  widget: JobsPortalWidget;
  stats: { views: number; registrations: number };
  referrers: { url: string; count: number }[];
  origin: string;
  openJobs: number;
  departments: string[];
}

const API = "/api/employer/careers/widget";
const RELOAD_KEYS: (keyof JobsPortalWidget)[] = ["departments"];
const DETECTION_KEYS: (keyof JobsPortalWidget)[] = [
  "status", "firstSeenAt", "firstSeenHost", "lastSeenAt", "lastSeenHost", "codeCopiedAt", "markedInstalledAt", "active",
];

/** Careers widget setup: the same flow and layout as the events widget page. */
export default function JobsWidgetSetup({ widget: initial, stats, referrers, origin, openJobs, departments }: Props) {
  const router = useRouter();
  const previewRef = useRef<PreviewHandle>(null);
  const [widget, setWidget] = useState(initial);
  const [customizing, setCustomizing] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const [justWentLive, setJustWentLive] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmPause, setConfirmPause] = useState(false);
  const [actionError, setActionError] = useState("");
  const pending = useRef<Partial<JobsPortalWidget>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevStatus = useRef(initial.status);

  const platformId = (widget.platform as PlatformId | null) ?? null;
  const platform = getPlatform(platformId);
  const codeCopied = !!widget.codeCopiedAt;

  useEffect(() => {
    if (!initial.setupStartedAt) apiJson(`${API}/funnel`, { method: "POST", body: JSON.stringify({ step: "setup_started" }) });
  }, [initial.setupStartedAt]);

  const mergeDetection = useCallback((fresh: JobsPortalWidget) => {
    setWidget((w) => {
      const next = { ...w };
      for (const k of DETECTION_KEYS) (next as any)[k] = (fresh as any)[k];
      return next;
    });
  }, []);

  // Poll for install detection; fast once the employer says they've added it.
  useEffect(() => {
    if (widget.status === "live" || widget.status === "paused") return;
    const fast = !!widget.markedInstalledAt || codeCopied;
    const id = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const d = await apiJson<JobsPortalWidget>(API);
      if (d.success && d.data) mergeDetection(d.data);
    }, fast ? 5000 : 30000);
    return () => clearInterval(id);
  }, [widget.status, widget.markedInstalledAt, codeCopied, mergeDetection]);

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
    const d = await apiJson<JobsPortalWidget>(API, { method: "PUT", body: JSON.stringify(patch) });
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
  }, [mergeDetection]);

  const update = useCallback((patch: Partial<JobsPortalWidget>) => {
    setWidget((w) => ({ ...w, ...patch }));
    previewRef.current?.pushConfig(patch as Record<string, unknown>);
    pending.current = { ...pending.current, ...patch };
    setSaveState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 600);
  }, [flush]);

  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length > 0) e.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  async function funnel(step: string, extra: Record<string, unknown> = {}) {
    const d = await apiJson<JobsPortalWidget>(`${API}/funnel`, { method: "POST", body: JSON.stringify({ step, ...extra }) });
    if (d.success && d.data) {
      mergeDetection(d.data);
      if (d.data.platform) setWidget((w) => ({ ...w, platform: d.data!.platform }));
    }
  }

  async function setActive(active: boolean) {
    setConfirmPause(false);
    const d = await apiJson<JobsPortalWidget>(API, { method: "PUT", body: JSON.stringify({ active }) });
    if (d.success && d.data) {
      mergeDetection(d.data);
      router.refresh();
    } else setActionError(d.error || "Couldn't update the widget.");
  }

  const liveHost = displayHost(widget.firstSeenHost);
  const steps = [
    {
      done: !!platformId, title: "Where is your website built?", desc: "We'll show the exact steps for your platform.",
      info: "We only use this to show the right instructions. The widget code works the same on every platform.",
    },
    {
      done: codeCopied,
      title: platform?.mode === "link" ? "Add the link to your page" : "Add the code to your site",
      desc: "Paste it once. New jobs and style changes show up automatically, so you never touch it again.",
      info: "The code adds a small frame that loads only when visitors scroll to it, so it won't slow your page down. All styling is managed here, not in the code.",
    },
    {
      done: widget.status === "live", title: "Check it's working", desc: "We detect your widget the first time someone opens the page.",
      info: "Detection happens when the widget loads on a public website. Pages on localhost show as “Testing”, and this page's preview never counts as an install.",
    },
  ];

  return (
    <div className="relative max-w-5xl mx-auto font-jakarta pb-12">
      <header className="flex flex-col md:flex-row md:items-start gap-4 mb-6">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="portal-title">Show your jobs on your website</h1>
            <StatusPill status={widget.status} host={liveHost} />
          </div>
          <p className="portal-subtitle">One snippet. Visitors browse your open roles without leaving your site.</p>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <button onClick={() => setCustomizing(true)} className={`${btnSecondary} flex-1 md:flex-none`}>
            <SlidersHorizontal className="w-4 h-4" aria-hidden /> Customize look
          </button>
          <div className="relative">
            <button onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen} aria-haspopup="menu" aria-label="More widget actions" className={btnSecondary}>
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-dropdown" onClick={() => setMenuOpen(false)} aria-hidden />
                <div role="menu" className="absolute right-0 mt-1 w-56 z-dropdown bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[12px] shadow-lg py-1">
                  {widget.active ? (
                    <MenuItem icon={Pause} onClick={() => { setMenuOpen(false); setConfirmPause(true); }}>Pause widget</MenuItem>
                  ) : (
                    <MenuItem icon={Play} onClick={() => { setMenuOpen(false); setActive(true); }}>Resume widget</MenuItem>
                  )}
                </div>
              </>
            )}
          </div>
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
            <p className="font-bold text-gray-900 dark:text-white">Your jobs are live on {liveHost}</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">Candidates who apply from your site land in Candidates, tagged with the page they came from.</p>
          </div>
          <button onClick={() => setJustWentLive(false)} aria-label="Dismiss" className={btnGhost}><X className="w-4 h-4" /></button>
        </div>
      )}

      <WidgetPreview
        ref={previewRef}
        widget={widget}
        hasEvents={openJobs > 0}
        canManage
        onResume={() => setActive(true)}
        src={`/embed/jobs/${widget.id}`}
        pagePath="/careers"
        itemsLabel="with your real jobs"
        emptyNotice={
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3 rounded-[12px] border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-900/40 px-4 py-3">
            <p className="flex-1 text-sm text-amber-900 dark:text-amber-200">
              <strong className="font-semibold">You don't have any open jobs for your website yet.</strong>{" "}
              You can install the widget now. Jobs appear on your site the moment you publish them.
            </p>
            <Link href="/employer/jobs/new" className={btnPrimary}><Plus className="w-4 h-4" aria-hidden /> Post a job</Link>
          </div>
        }
      />

      <ol className="mt-6 space-y-4" aria-label="Setup steps">
        <Step n={1} {...steps[0]}>
          <PlatformPicker value={platformId}
            onChange={(p) => { setWidget((w) => ({ ...w, platform: p })); funnel("platform_selected", { platform: p }); }} />
        </Step>
        <Step n={2} {...steps[1]}>
          <CodeStep kind="jobs" widgetId={widget.id} origin={origin} platformId={platformId} canSend sendUrl={`${API}/send`}
            onCopied={() => { if (!codeCopied) { setWidget((w) => ({ ...w, codeCopiedAt: new Date().toISOString() })); funnel("code_copied"); } }} />
        </Step>
        <Step n={3} {...steps[2]}>
          <InstallStatus
            widget={widget}
            stats={stats}
            referrers={referrers}
            canManage
            codeCopied={codeCopied}
            copy={{
              noun: "jobs",
              statLabels: ["Views · 30 days", "Applications"],
              referrersTitle: "Applications by page",
              supportHref: "/employer/support",
              verifyUrl: `${API}/verify`,
              verifyPlaceholder: "example.com/careers",
            }}
            onMarkInstalled={() => funnel("marked_installed")}
            onLockDomain={(h) => update({ allowedDomains: [h] })}
            onResume={() => setActive(true)}
            onVerified={mergeDetection}
          />
        </Step>
      </ol>

      {customizing && (
        <JobsCustomizePanel
          widget={widget}
          departments={departments}
          saveState={saveState}
          saveError={saveError}
          onChange={update}
          onRetry={flush}
          onClose={() => setCustomizing(false)}
        />
      )}

      {confirmPause && (
        <ConfirmDialog
          title="Pause this widget?"
          body={widget.status === "live"
            ? `Your jobs disappear from ${liveHost} until you resume. Nothing breaks on your site; the space just stays empty.`
            : "The widget will show nothing anywhere it's installed until you resume it."}
          confirmLabel="Pause widget"
          onConfirm={() => setActive(false)}
          onCancel={() => setConfirmPause(false)}
        />
      )}
    </div>
  );
}

function Step({ n, done, title, desc, info, children }: {
  n: number; done: boolean; title: string; desc: string; info?: string; children: React.ReactNode;
}) {
  return (
    <li className={`${card} p-5 sm:p-6`}>
      <div className="flex gap-4">
        <span aria-hidden className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${done ? "bg-green-600 text-white" : "bg-gray-900 dark:bg-white text-white dark:text-gray-900"}`}>
          {done ? <Check className="w-4 h-4" /> : n}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <h2 className="portal-section-title"><span className="sr-only">Step {n}{done ? ", done" : ""}: </span>{title}</h2>
            {info && <InfoTip label={title} align="start">{info}</InfoTip>}
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5 mb-4">{desc}</p>
          {children}
        </div>
      </div>
    </li>
  );
}

function MenuItem({ icon: Icon, children, onClick }: { icon: React.ElementType; children: React.ReactNode; onClick: () => void }) {
  return (
    <button role="menuitem" onClick={onClick}
      className="w-full flex items-center gap-2.5 px-4 min-h-[44px] text-sm text-left text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 focus:outline-none focus-visible:bg-gray-100">
      <Icon className="w-4 h-4" aria-hidden /> {children}
    </button>
  );
}
