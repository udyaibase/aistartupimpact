"use client";

import { useState } from "react";
import { Check, Copy, Mail, Send, X } from "lucide-react";
import { PLATFORMS, buildDirectLink, buildSnippet, getPlatform, type PlatformId } from "@/lib/embed/platforms";
import { btnPrimary, btnSecondary, btnGhost, input } from "./ui";

export function PlatformPicker({
  value, onChange, disabled,
}: {
  value: PlatformId | null;
  onChange: (p: PlatformId) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="Website platform" className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {PLATFORMS.map((p) => {
        const active = value === p.id;
        return (
          <button
            key={p.id}
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(p.id)}
            className={`relative min-h-[52px] px-3 rounded-[10px] border text-sm font-semibold text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A50F15] focus-visible:ring-offset-1 ${
              active
                ? "border-[#A50F15] bg-[#A50F15]/[0.04] text-gray-900 dark:text-white ring-1 ring-[#A50F15]"
                : "border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            {p.label}
            {p.mode === "link" && <span className="block text-[11px] font-medium text-gray-500">Uses a link</span>}
            {active && <Check aria-hidden className="absolute top-2 right-2 w-4 h-4 text-[#A50F15]" />}
          </button>
        );
      })}
    </div>
  );
}

export function CodeStep({
  widgetId, origin, platformId, onCopied, canSend, kind = "events", sendUrl,
}: {
  widgetId: string;
  origin: string;
  platformId: PlatformId | null;
  onCopied: () => void;
  canSend: boolean;
  /** "jobs" installs the careers widget (data-udyaibase-jobs, /embed/jobs/…). */
  kind?: "events" | "jobs";
  sendUrl?: string;
}) {
  const platform = getPlatform(platformId) ?? PLATFORMS[0];
  const isLink = platform.mode === "link";
  const attr = kind === "jobs" ? "data-udyaibase-jobs" : "data-udyaibase-widget";
  const text = isLink
    ? (kind === "jobs" ? `${origin}/embed/jobs/${widgetId}` : buildDirectLink(widgetId, origin))
    : (kind === "jobs" ? buildSnippet(widgetId, origin).replace("data-udyaibase-widget", attr) : buildSnippet(widgetId, origin));
  const noun = (t: string) => (kind === "jobs" ? t.replace(/\bevents\b/g, "jobs").replace(/\bEvents\b/g, "Careers") : t);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    onCopied();
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <pre
          aria-label={isLink ? "Widget link" : "Widget code"}
          className="m-0 p-4 pr-4 rounded-[12px] bg-[#111827] text-[#f3f4f6] text-[13px] leading-relaxed font-mono whitespace-pre-wrap break-all"
        >
          {isLink ? text : (
            <>
              <span className="text-[#93c5fd]">&lt;div</span> <span className="text-[#fca5a5]">{attr}</span>=<span className="text-[#86efac]">&quot;{widgetId}&quot;</span><span className="text-[#93c5fd]">&gt;&lt;/div&gt;</span>
              {"\n"}
              <span className="text-[#93c5fd]">&lt;script</span> <span className="text-[#fca5a5]">src</span>=<span className="text-[#86efac]">&quot;{origin}/embed/loader.js&quot;</span> <span className="text-[#fca5a5]">async</span><span className="text-[#93c5fd]">&gt;&lt;/script&gt;</span>
            </>
          )}
        </pre>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <button onClick={copy} className={`${btnPrimary} sm:min-w-[160px] min-h-[48px] text-[15px]`}>
          {copied ? <Check className="w-4 h-4" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />}
          {copied ? "Copied" : isLink ? "Copy link" : "Copy code"}
        </button>
        {canSend && (
          <button onClick={() => setSending((s) => !s)} aria-expanded={sending} className={btnSecondary}>
            <Mail className="w-4 h-4" aria-hidden /> Send to my developer
          </button>
        )}
        <span role="status" aria-live="polite" className="sr-only">{copied ? "Copied to clipboard" : ""}</span>
      </div>

      {sending && <SendToDeveloper sendUrl={sendUrl ?? `/api/organizer/widgets/${widgetId}/send`} placeholderNote={noun("Please add this to the Events page")} platformId={platform.id} onClose={() => setSending(false)} />}

      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">On {platform.label}</p>
        <ol className="space-y-2">
          {platform.steps.map((s, i) => (
            <li key={i} className="flex gap-3 text-sm text-gray-700 dark:text-gray-300">
              <span aria-hidden className="shrink-0 w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <span className="pt-0.5">{noun(s)}</span>
            </li>
          ))}
        </ol>
        {platform.note && <p className="mt-3 text-[13px] text-gray-600 dark:text-gray-400">{noun(platform.note).replace("<udyaibase-widget widget-id", kind === "jobs" ? "<udyaibase-widget kind=\"jobs\" widget-id" : "<udyaibase-widget widget-id")}</p>}
      </div>
    </div>
  );
}

function SendToDeveloper({ sendUrl, platformId, onClose, placeholderNote }: { sendUrl: string; platformId: PlatformId; onClose: () => void; placeholderNote: string }) {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    setState("sending");
    try {
      const res = await fetch(sendUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), platform: platformId, note }),
      });
      const d = await res.json();
      if (!d.success) {
        setError(d.error || "We couldn't send the email.");
        setState("idle");
        return;
      }
      setState("sent");
    } catch {
      setError("You seem to be offline. Try again.");
      setState("idle");
    }
  }

  if (state === "sent") {
    return (
      <div role="status" className="flex items-start gap-3 rounded-[12px] border border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-900/40 px-4 py-3">
        <Check className="w-5 h-5 text-green-700 shrink-0 mt-0.5" aria-hidden />
        <div className="flex-1 text-sm text-green-900 dark:text-green-200">
          <p className="font-semibold">Sent to {email.trim()}</p>
          <p>They get the code and steps, no account needed. Replies come to your email. We'll tell you when it goes live.</p>
        </div>
        <button onClick={onClose} className={btnGhost} aria-label="Close"><X className="w-4 h-4" /></button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-[12px] border border-gray-200 dark:border-gray-700 p-4 space-y-3" noValidate>
      <div>
        <label htmlFor="dev-email" className="block text-sm font-semibold text-gray-900 dark:text-white mb-1.5">Developer's email</label>
        <input id="dev-email" type="email" autoComplete="email" className={input} value={email}
          onChange={(e) => setEmail(e.target.value)} placeholder="dev@yourcompany.com"
          aria-invalid={!!error} aria-describedby={error ? "dev-email-err" : undefined} />
        {error && <p id="dev-email-err" className="mt-1 text-[13px] text-red-700">{error}</p>}
      </div>
      <div>
        <label htmlFor="dev-note" className="block text-sm font-semibold text-gray-900 dark:text-white mb-1.5">
          Note <span className="font-normal text-gray-500">(optional)</span>
        </label>
        <input id="dev-note" className={input} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)}
          placeholder={placeholderNote} />
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={state === "sending"} className={btnPrimary}>
          <Send className="w-4 h-4" aria-hidden /> {state === "sending" ? "Sending…" : "Send instructions"}
        </button>
        <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
      </div>
    </form>
  );
}
