"use client";

import { useEffect, useState } from "react";
import { Loader2, Monitor } from "lucide-react";

interface Device { id: string; device: string; ipAddress: string | null; signedInAt: string; lastSeenAt: string; current: boolean }

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Devices signed in to this organizer account, with sign-out for one or all others. */
export default function SignedInDevices() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [busy, setBusy] = useState<string>("");
  const [error, setError] = useState("");

  const load = () =>
    fetch("/api/organizer/settings/sessions")
      .then((r) => r.json())
      .then((d) => (d.success ? setDevices(d.sessions) : setError(d.error || "Couldn’t load your devices.")))
      .catch(() => setError("You seem to be offline."));
  useEffect(() => { load(); }, []);

  async function signOut(body: { id?: string; all?: boolean }) {
    setBusy(body.id || "all");
    setError("");
    try {
      const res = await fetch("/api/organizer/settings/sessions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setError(d.error || "Couldn’t sign out that device.");
      await load();
    } catch { setError("You seem to be offline."); }
    setBusy("");
  }

  const others = devices?.filter((d) => !d.current) ?? [];

  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between gap-3">
        <h2 className="portal-eyebrow flex items-center gap-2"><Monitor className="w-4 h-4" /> Signed-in devices</h2>
        {others.length > 0 && (
          <button onClick={() => signOut({ all: true })} disabled={!!busy} className="min-h-[36px] px-3 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50">
            {busy === "all" ? "Signing out…" : "Sign out all other devices"}
          </button>
        )}
      </div>
      <div className="p-4 bg-white dark:bg-gray-950">
        {error && <p role="alert" className="mb-3 text-sm text-red-700 dark:text-red-400">{error}</p>}
        {!devices ? (
          !error && <Loader2 className="w-5 h-5 animate-spin text-gray-400" aria-label="Loading" />
        ) : devices.length === 0 ? (
          <p className="text-sm text-gray-500">No devices are signed in with a password or Google sign-in. (Signing in through the main site isn’t listed here.)</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {devices.map((d) => (
              <li key={d.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                    {d.device}{d.current && <span className="ml-2 text-xs font-semibold text-green-700 dark:text-green-400">This device</span>}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {d.ipAddress ? `${d.ipAddress} · ` : ""}Signed in {when(d.signedInAt)} · Last active {when(d.lastSeenAt)}
                  </p>
                </div>
                {!d.current && (
                  <button onClick={() => signOut({ id: d.id })} disabled={!!busy} className="shrink-0 min-h-[36px] px-3 text-xs font-medium rounded-lg text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50">
                    {busy === d.id ? "Signing out…" : "Sign out"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
