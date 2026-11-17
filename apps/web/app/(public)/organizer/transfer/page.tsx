"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, Crown } from "lucide-react";

interface Info { workspace: string; toEmail: string; expiresAt: string; hasPayouts: boolean; signedIn: boolean; isRecipient: boolean }

function AcceptTransfer() {
  const token = useSearchParams().get("token") ?? "";
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");

  useEffect(() => {
    fetch(`/api/organizer/team/transfer/accept?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => (d.success ? setInfo(d) : setError(d.error || "This link isn’t valid.")))
      .catch(() => setError("You seem to be offline."));
  }, [token]);

  async function accept() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/organizer/team/transfer/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.success) { setError(d.error || "Couldn’t complete the transfer."); setBusy(false); return; }
      setDone(d.workspace);
      setTimeout(() => window.location.assign("/organizer"), 2500);
    } catch {
      setError("You seem to be offline.");
      setBusy(false);
    }
  }

  const next = `/organizer/transfer?token=${encodeURIComponent(token)}`;

  return (
    <main className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm font-jakarta">
        <div className="w-11 h-11 rounded-full bg-brand/10 flex items-center justify-center mb-4"><Crown className="w-5 h-5 text-brand" /></div>
        {done ? (
          <>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">You now own {done}</h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">Opening the workspace…</p>
          </>
        ) : !info ? (
          error ? (
            <>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">Ownership transfer</h1>
              <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">{error}</p>
            </>
          ) : <Loader2 className="w-5 h-5 animate-spin text-gray-400" aria-label="Loading" />
        ) : (
          <>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">Take over {info.workspace}?</h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">The owner wants to hand this workspace to <strong>{info.toEmail}</strong>. When you accept:</p>
            <ul className="mt-3 space-y-1.5 text-sm text-gray-600 dark:text-gray-300 list-disc pl-5">
              <li>You become the owner: events, plan, team, billing and payouts.</li>
              <li>You sign in to it with your usual email and password.</li>
              <li>The current owner stays on the team as an Admin, with their own sign-in. You can change or remove them.</li>
              {info.hasPayouts && <li>Payouts are switched off until you add your own bank details (they were verified for the current owner).</li>}
              <li>Your own empty workspace is replaced by this one. Teams you’re on elsewhere stay.</li>
            </ul>
            {error && <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-400">{error}</p>}
            {info.isRecipient ? (
              <button onClick={accept} disabled={busy} className="mt-5 w-full min-h-[48px] rounded-lg bg-brand hover:bg-brand-600 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Accept and become owner
              </button>
            ) : (
              <div className="mt-5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 p-3 text-sm text-amber-900 dark:text-amber-200">
                {info.signedIn ? <>You’re signed in with a different account. Sign out, then sign in as <strong>{info.toEmail}</strong>.</> : <>Sign in as <strong>{info.toEmail}</strong> to accept.</>}
                <Link href={`/organizer/login?email=${encodeURIComponent(info.toEmail)}&next=${encodeURIComponent(next)}`} className="mt-2 block font-semibold underline">Sign in</Link>
              </div>
            )}
            <p className="mt-4 text-xs text-gray-500">This link works until {new Date(info.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "long" })}. Not expecting it? Ignore it: nothing changes unless you accept.</p>
          </>
        )}
      </div>
    </main>
  );
}

export default function TransferPage() {
  return <Suspense fallback={null}><AcceptTransfer /></Suspense>;
}
