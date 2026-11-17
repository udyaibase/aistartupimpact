"use client";

import { useEffect, useState } from "react";
import { Crown, Loader2 } from "lucide-react";

interface Pending { toEmail: string; expiresAt: string }

/** Owner only: hand the workspace to one of its Admins (they accept from an emailed link). */
export default function TransferOwnership({ admins }: { admins: { id: string; email: string }[] }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [password, setPassword] = useState("");
  const [codeToken, setCodeToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () =>
    fetch("/api/organizer/team/transfer").then((r) => r.json()).then((d) => {
      if (d.success) { setPending(d.pending); setBlocked(d.blocked); }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  useEffect(() => { load(); }, []);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/organizer/team/transfer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, password: password || undefined, codeToken: codeToken || undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (d.success) {
        setPending(d.pending); setOpen(false); setPassword(""); setCodeToken("");
        setMsg({ ok: true, text: `We emailed ${d.pending.toEmail}. Nothing changes until they accept.` });
      } else {
        if (d.codeToken) setCodeToken(d.codeToken);
        setMsg({ ok: false, text: d.error || "Couldn’t start the transfer." });
      }
    } catch { setMsg({ ok: false, text: "You seem to be offline." }); }
    setBusy(false);
  }

  async function cancel() {
    setBusy(true); setMsg(null);
    await fetch("/api/organizer/team/transfer", { method: "DELETE" }).catch(() => null);
    setPending(null); setBusy(false);
    setMsg({ ok: true, text: "Transfer cancelled. The link no longer works." });
  }

  if (!loaded) return null;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="portal-section-title flex items-center gap-2"><Crown className="w-4 h-4 text-brand" /> Transfer ownership</h2>
          <p className="mt-1 text-xs text-gray-500 font-jakarta max-w-xl">
            Hand this workspace to one of its Admins. They become the owner of its events, plan, team and billing; you stay on as an Admin with your own sign-in. Payout bank details are cleared, so the new owner adds their own.
          </p>
        </div>
        {!pending && !open && (
          <button onClick={() => { setOpen(true); setMemberId(admins[0]?.id ?? ""); }} disabled={!!blocked || admins.length === 0}
            className="min-h-[40px] px-3.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-semibold font-jakarta disabled:opacity-50">
            Choose new owner
          </button>
        )}
      </div>

      {blocked && <p className="text-xs text-amber-800 dark:text-amber-300 font-jakarta">{blocked}</p>}
      {!blocked && admins.length === 0 && !pending && <p className="text-xs text-gray-500 font-jakarta">Only an active Admin can take over. Make someone an Admin first.</p>}

      {pending && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 px-3 py-2">
          <p className="text-sm text-amber-900 dark:text-amber-200 font-jakarta">
            Waiting for <strong>{pending.toEmail}</strong> to accept (link works until {new Date(pending.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}).
          </p>
          <button onClick={cancel} disabled={busy} className="min-h-[36px] px-3 text-sm font-semibold text-red-700 dark:text-red-400 disabled:opacity-50">Cancel transfer</button>
        </div>
      )}

      {open && !pending && (
        <form onSubmit={start} className="space-y-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3 sm:p-4">
          <label className="block">
            <span className="block text-xs font-bold text-gray-400 uppercase mb-1 font-jakarta">New owner</span>
            <select value={memberId} onChange={(e) => setMemberId(e.target.value)} className="w-full min-h-[44px] px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-jakarta">
              {admins.map((a) => <option key={a.id} value={a.id}>{a.email}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-bold text-gray-400 uppercase mb-1 font-jakarta">{codeToken ? "Code we emailed you" : "Your password (Google sign-in only? Leave empty for an emailed code)"}</span>
            <input type={codeToken ? "text" : "password"} inputMode={codeToken ? "numeric" : undefined} autoComplete={codeToken ? "one-time-code" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-jakarta" />
          </label>
          <div className="flex flex-col-reverse min-[420px]:flex-row gap-2 min-[420px]:justify-end">
            <button type="button" onClick={() => { setOpen(false); setCodeToken(""); setPassword(""); }} className="min-h-[44px] px-4 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-semibold font-jakarta">Cancel</button>
            <button type="submit" disabled={busy || !memberId || (!!codeToken && !password)} className="min-h-[44px] px-5 bg-brand hover:bg-brand-600 text-white text-sm font-bold font-jakarta rounded-lg disabled:opacity-40 inline-flex items-center justify-center gap-2">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Send transfer request
            </button>
          </div>
        </form>
      )}

      {msg && <p role="status" className={`text-xs font-jakarta ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>}
    </div>
  );
}
