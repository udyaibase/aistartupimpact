"use client";

import { useState } from "react";

interface Workspace { id: string; name: string; role: string }

const ROLE_LABEL: Record<string, string> = { OWNER: "Owner", ADMIN: "Admin", MANAGER: "Manager", STAFF: "Staff", CHECK_IN: "Check-in only" };

/**
 * Shown only to people who are on another host's team as well as having their own workspace:
 * says which workspace they are working in and lets them change it.
 */
export default function WorkspaceSwitcher({ workspaces, active }: { workspaces: Workspace[]; active: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (workspaces.length < 2) return null;
  const current = workspaces.find((w) => w.id === active) ?? workspaces[0];

  const choose = async (id: string) => {
    if (id === active || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/organizer/workspace", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspace: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || "Couldn’t switch workspace. Try again.");
      // Every page reads the workspace on the server, so start again from the events list.
      window.location.assign("/organizer/events");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t switch workspace. Try again.");
      setBusy(false);
    }
  };

  const leave = async () => {
    if (busy || current.id === "own") return;
    if (!window.confirm(`Leave the ${current.name} team? You’ll lose access to its events until someone invites you again.`)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/organizer/workspace", {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspace: current.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || "Couldn’t leave the team. Try again.");
      window.location.assign("/organizer/events");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t leave the team. Try again.");
      setBusy(false);
    }
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm dark:border-gray-800 dark:bg-gray-900">
      <span className="text-gray-600 dark:text-gray-300">
        Working in <strong className="font-semibold text-gray-900 dark:text-white">{current.name}</strong>
        {current.id !== "own" && <> as {ROLE_LABEL[current.role] ?? current.role}</>}
      </span>
      <label className="ml-auto flex items-center gap-2">
        <span className="sr-only">Switch workspace</span>
        <select
          value={active}
          disabled={busy}
          onChange={(e) => choose(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
        >
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.id === "own" ? `${w.name} (your own workspace)` : `${w.name} (${ROLE_LABEL[w.role] ?? w.role})`}
            </option>
          ))}
        </select>
      </label>
      {current.id !== "own" && (
        <button type="button" onClick={leave} disabled={busy} className="text-sm font-medium text-red-700 hover:underline disabled:opacity-60 dark:text-red-400">
          Leave team
        </button>
      )}
      {current.id === "own" && (
        <p className="w-full text-xs text-gray-500 dark:text-gray-400">
          This is your own, separate workspace: its events, plan and billing are yours alone, and nobody else&apos;s data is here.
          To work on a team&apos;s events, switch to that team above.
        </p>
      )}
      {error && <p role="alert" className="w-full text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
