"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";

/**
 * The app's own "are you sure?" (instead of the browser's confirm box): a sheet from the bottom on phones,
 * a small dialog on bigger screens. The confirm button shows progress while `onConfirm` runs and the sheet
 * closes when it finishes; an error it returns is shown in place.
 */
export default function ConfirmSheet({
  open, title, message, confirmLabel, cancelLabel = "Keep it", danger = true, onConfirm, onClose,
}: {
  open: boolean;
  title: string;
  message?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Return an error message to keep the sheet open and show it, or nothing when done. */
  onConfirm: () => Promise<string | void> | string | void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { if (open) { setBusy(false); setError(""); } }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, busy, onClose]);

  if (!open || typeof document === "undefined") return null;

  const confirm = async () => {
    setBusy(true); setError("");
    try {
      const problem = await onConfirm();
      if (problem) { setError(problem); setBusy(false); return; }
      onClose();
    } catch {
      setError("Something went wrong. Try again.");
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-modal flex items-end sm:items-center justify-center sm:p-4 bg-black/50 animate-fade-in"
      onClick={() => !busy && onClose()}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-sheet-title" onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-sm bg-white dark:bg-gray-900 rounded-t-[20px] sm:rounded-2xl px-4 pt-3 sm:p-6 pb-[calc(env(safe-area-inset-bottom)+16px)] shadow-2xl animate-slide-up sm:animate-none font-jakarta">
        <div className="sm:hidden mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-700" aria-hidden />
        <h2 id="confirm-sheet-title" className="text-base font-bold text-gray-900 dark:text-white">{title}</h2>
        {message && <div className="mt-1.5 text-sm text-gray-600 dark:text-gray-300">{message}</div>}
        {error && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy}
            className="min-h-[44px] px-4 rounded-[10px] border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-200 disabled:opacity-50">
            {cancelLabel}
          </button>
          <button type="button" onClick={confirm} disabled={busy} autoFocus
            className={`min-h-[44px] px-4 rounded-[10px] text-sm font-semibold text-white inline-flex items-center justify-center gap-2 disabled:opacity-70 ${danger ? "bg-red-600 hover:bg-red-700" : "bg-gray-900 dark:bg-white dark:text-gray-900"}`}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
