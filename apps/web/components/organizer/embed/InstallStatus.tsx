"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Laptop, Lock, LifeBuoy, PauseCircle, Radio, Search, Loader2, AlertTriangle } from "lucide-react";
import type { PortalWidget, WidgetStats } from "@/lib/embed/portal-data";
import { btnPrimary, btnSecondary, displayHost, input, timeAgo } from "./ui";
import { apiJson, isLocalHostClient } from "./helpers";

type StatusWidget = Pick<PortalWidget, "id" | "status" | "firstSeenHost" | "lastSeenHost" | "lastSeenAt" | "allowedDomains" | "markedInstalledAt">;

/** Wording and endpoints that differ between the events and careers widgets. */
export interface InstallCopy {
  noun: string;
  statLabels: [string, string];
  referrersTitle: string;
  supportHref: string;
  verifyUrl: string;
  verifyPlaceholder: string;
}

const EVENTS_COPY: InstallCopy = {
  noun: "events",
  statLabels: ["Views · 30 days", "Registrations"],
  referrersTitle: "Registrations by page",
  supportHref: "/organizer/support",
  verifyUrl: "",
  verifyPlaceholder: "example.com/events",
};

interface Props {
  widget: StatusWidget;
  copy?: Partial<InstallCopy>;
  stats?: WidgetStats;
  referrers: { url: string; count: number }[];
  canManage: boolean;
  codeCopied: boolean;
  onMarkInstalled: () => void;
  onLockDomain: (host: string) => void;
  onResume: () => void;
  onVerified: (widget: any) => void;
}

export default function InstallStatus(props: Props) {
  const s = props.widget.status;
  const copy: InstallCopy = { ...EVENTS_COPY, verifyUrl: `/api/organizer/widgets/${props.widget.id}/verify`, ...props.copy };
  if (s === "live" || s === "paused") return <StatusPanel {...props} c={copy} />;
  return (
    <div className="space-y-4">
      <StatusPanel {...props} c={copy} />
      <CheckInstall verifyUrl={copy.verifyUrl} placeholder={copy.verifyPlaceholder} onVerified={props.onVerified} />
    </div>
  );
}

function StatusPanel({
  widget, stats, referrers, canManage, codeCopied, onMarkInstalled, onLockDomain, onResume, c,
}: Props & { c: InstallCopy }) {
  const status = widget.status;

  if (status === "paused") {
    return (
      <Panel tone="neutral" icon={<PauseCircle className="w-5 h-5" />} title="Paused"
        body={`Your widget is hidden on every site. Visitors see nothing, not a broken box. Resume it to show your ${c.noun} again.`}>
        {canManage && <button onClick={onResume} className={btnPrimary}>Resume widget</button>}
      </Panel>
    );
  }

  if (status === "live") {
    const host = displayHost(widget.firstSeenHost);
    const lastHost = widget.lastSeenHost && !isLocalHostClient(widget.lastSeenHost) ? displayHost(widget.lastSeenHost) : host;
    const views = stats?.views ?? 0;
    const regs = stats?.registrations ?? 0;
    const canLock = canManage && widget.allowedDomains.length === 0 && widget.firstSeenHost;
    return (
      <div className="space-y-4">
        <Panel tone="success" icon={<CheckCircle2 className="w-5 h-5" />} title={`Live on ${host}`}
          body={`Last loaded on ${lastHost} ${timeAgo(widget.lastSeenAt)}. New ${c.noun} you publish appear there automatically.`} />

        <dl className="grid grid-cols-3 gap-2">
          {[
            { label: c.statLabels[0], value: views.toLocaleString("en-IN") },
            { label: c.statLabels[1], value: regs.toLocaleString("en-IN") },
            { label: "Conversion", value: views > 0 ? `${((regs / views) * 100).toFixed(1)}%` : "—" },
          ].map((s) => (
            <div key={s.label} className="rounded-[12px] bg-[#F7F7F9] dark:bg-gray-800/60 px-3 py-3">
              <dt className="text-xs text-gray-600 dark:text-gray-400">{s.label}</dt>
              <dd className="text-lg font-bold text-gray-900 dark:text-white mt-0.5">{s.value}</dd>
            </div>
          ))}
        </dl>

        {referrers.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">{c.referrersTitle}</p>
            <ul className="divide-y divide-gray-100 dark:divide-gray-800 rounded-[12px] border border-gray-200 dark:border-gray-800">
              {referrers.map((r) => (
                <li key={r.url} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                  <span className="truncate text-gray-700 dark:text-gray-300">{r.url.replace(/^https?:\/\/(www\.)?/, "")}</span>
                  <span className="font-semibold text-gray-900 dark:text-white">{r.count}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {canLock && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-[12px] border border-gray-200 dark:border-gray-800 px-4 py-3">
            <Lock className="hidden sm:block w-5 h-5 text-gray-500 shrink-0" aria-hidden />
            <p className="flex-1 text-sm text-gray-700 dark:text-gray-300">
              <span className="font-semibold text-gray-900 dark:text-white">Only show on {host}?</span>{" "}
              Stops other sites from copying your widget. Testing on localhost still works.
            </p>
            <button onClick={() => onLockDomain(widget.firstSeenHost!.split(":")[0])} className={btnSecondary}>
              Lock to {host}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (status === "testing") {
    return (
      <Panel tone="info" icon={<Laptop className="w-5 h-5" />} title="Working on localhost"
        body={`We saw your widget load on ${widget.lastSeenHost} ${timeAgo(widget.lastSeenAt)}. Publish your site and open the live page once to finish.`} />
    );
  }

  if (status === "stale") {
    return (
      <Panel tone="warn" icon={<LifeBuoy className="w-5 h-5" />} title="We haven't seen your widget yet"
        body="It's been over a day since you copied the code. These fix almost every case:">
        <ul className="mt-1 mb-4 space-y-1.5 text-sm text-gray-700 dark:text-gray-300 list-disc pl-5">
          <li>Publish the page after pasting. Webflow and Framer don't run embeds in the editor.</li>
          <li>Paste both lines, the <code className="text-[13px]">&lt;div&gt;</code> and the <code className="text-[13px]">&lt;script&gt;</code>, in the same block.</li>
          <li>If you set allowed sites, make sure this site's domain is on the list.</li>
          <li>If your site uses a Content Security Policy, allow <code className="text-[13px]">udyaibase.com</code> in script-src, connect-src and frame-src.</li>
          <li>Open the page yourself once. Status updates on the first real visit.</li>
        </ul>
        <div className="flex flex-wrap gap-2">
          <button onClick={onMarkInstalled} className={btnPrimary}>Check again</button>
          <Link href={c.supportHref} className={btnSecondary}>Contact support</Link>
        </div>
      </Panel>
    );
  }

  const checking = !!widget.markedInstalledAt;
  return (
    <Panel
      tone="neutral"
      icon={<Radio className={`w-5 h-5 ${checking ? "motion-safe:animate-pulse text-[#A50F15]" : ""}`} />}
      title={checking ? "Checking for your widget…" : "Waiting for first visit"}
      body={
        checking
          ? "Open the page where you added the code in any browser. This updates within a few seconds, or check the page directly below."
          : "Once the code is on your website, open that page once. This turns green automatically and we'll email you."
      }
    >
      {!checking && (
        <button onClick={onMarkInstalled} className={codeCopied ? btnPrimary : btnSecondary}>
          I&apos;ve added it
        </button>
      )}
    </Panel>
  );
}

function Panel({
  tone, icon, title, body, children,
}: {
  tone: "success" | "info" | "warn" | "neutral";
  icon: React.ReactNode;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  const tones = {
    success: "border-green-200 bg-green-50 text-green-800 dark:bg-green-900/20 dark:border-green-900/40 dark:text-green-300",
    info: "border-sky-200 bg-sky-50 text-sky-800 dark:bg-sky-900/20 dark:border-sky-900/40 dark:text-sky-300",
    warn: "border-amber-200 bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:border-amber-900/40 dark:text-amber-300",
    neutral: "border-gray-200 bg-[#F7F7F9] text-gray-700 dark:bg-gray-800/50 dark:border-gray-800 dark:text-gray-300",
  };
  return (
    <div role="status" aria-live="polite" className={`rounded-[12px] border px-4 py-4 ${tones[tone]}`}>
      <div className="flex gap-3">
        <span aria-hidden className="shrink-0 mt-0.5">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-bold text-gray-900 dark:text-white">{title}</p>
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">{body}</p>
          {children && <div className="mt-3">{children}</div>}
        </div>
      </div>
    </div>
  );
}

const VERIFY_COPY: Record<string, { tone: "success" | "warn" | "info"; title: string; body: string }> = {
  installed: { tone: "success", title: "Installed", body: "We found your widget code on this page. Your widget is now marked as live." },
  script_missing: { tone: "warn", title: "Script missing", body: "We found the widget container but not the <script> line. Paste both lines from step 2, then publish the page again." },
  container_missing: { tone: "warn", title: "Container missing", body: "We found the Udyaibase script but not this widget's <div>. Check that the widget ID in the <div> matches step 2." },
  not_found: { tone: "warn", title: "Code not found", body: "We couldn't find the widget code on this page. Make sure the page is published. If your site is built with React, Next.js or Vue, open the page in a browser instead, because the code is added after the page loads." },
  local: { tone: "info", title: "Localhost can't be checked", body: "Our servers can't reach pages on your computer. Open the page in your browser instead and this panel shows “Testing on localhost” within a few seconds." },
  unreachable: { tone: "warn", title: "Page unreachable", body: "We couldn't load this page. Check the address, and make sure the page is public, not password-protected and served over HTTPS." },
  invalid_url: { tone: "warn", title: "Invalid address", body: "Enter a full page address, such as example.com/events." },
};

function CheckInstall({ verifyUrl, placeholder, onVerified }: { verifyUrl: string; placeholder: string; onVerified: (w: any) => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ key: string; host: string | null } | null>(null);
  const [error, setError] = useState("");

  async function check(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setError("");
    setResult(null);
    const d = await apiJson<{ result: string; host: string | null; widget: any }>(
      verifyUrl,
      { method: "POST", body: JSON.stringify({ url }) },
    );
    setBusy(false);
    if (!d.success || !d.data) {
      setError(d.error || "Couldn't check this page. Try again.");
      return;
    }
    setResult({ key: d.data.result, host: d.data.host });
    if (d.data.widget) onVerified(d.data.widget);
  }

  const copy = result ? VERIFY_COPY[result.key] : null;
  const tones = {
    success: "border-green-200 bg-green-50 text-green-900 dark:bg-green-900/20 dark:border-green-900/40 dark:text-green-200",
    warn: "border-amber-200 bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:border-amber-900/40 dark:text-amber-200",
    info: "border-sky-200 bg-sky-50 text-sky-900 dark:bg-sky-900/20 dark:border-sky-900/40 dark:text-sky-200",
  };

  return (
    <form onSubmit={check} className="rounded-[12px] border border-gray-200 dark:border-gray-800 p-4" noValidate>
      <label htmlFor="verify-url" className="block text-sm font-semibold text-gray-900 dark:text-white">Check installation</label>
      <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 mb-2">Enter the page where you added the code and we'll check it right away.</p>
      <div className="flex flex-col sm:flex-row gap-2">
        <input id="verify-url" type="url" inputMode="url" className={input} placeholder={placeholder} value={url}
          onChange={(e) => setUrl(e.target.value)} />
        <button type="submit" disabled={busy || !url.trim()} className={btnSecondary}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Search className="w-4 h-4" aria-hidden />}
          {busy ? "Checking…" : "Check page"}
        </button>
      </div>
      <div role="status" aria-live="polite">
        {error && <p className="mt-2 text-[13px] text-red-700">{error}</p>}
        {copy && (
          <div className={`mt-3 flex gap-2.5 rounded-[10px] border px-3 py-2.5 text-sm ${tones[copy.tone]}`}>
            {copy.tone === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />}
            <p><span className="font-semibold">{copy.title}{result?.host ? ` · ${result.host}` : ""}.</span> {copy.body}</p>
          </div>
        )}
      </div>
    </form>
  );
}
