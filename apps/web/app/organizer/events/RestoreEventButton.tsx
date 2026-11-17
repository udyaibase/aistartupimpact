"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Loader2 } from "lucide-react";

export default function RestoreEventButton({ eventId, title }: { eventId: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function restore() {
    if (!window.confirm(`Restore “${title}”? It comes back as a draft.`)) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/restore`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.success) { setMsg(d.error || "Couldn’t restore the event."); setBusy(false); return; }
      window.alert(d.message || "Restored.");
      router.refresh();
    } catch {
      setMsg("You seem to be offline.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={restore} disabled={busy} className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-semibold font-jakarta hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />} Restore
      </button>
      {msg && <p role="alert" className="text-xs text-red-700 dark:text-red-400">{msg}</p>}
    </div>
  );
}
