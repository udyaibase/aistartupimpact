"use client";

import { useEffect, useRef } from "react";
import { btnPrimary, btnSecondary } from "./ui";

export default function ConfirmDialog({
  title, body, confirmLabel, danger, onConfirm, onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancelRef.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="fixed inset-0 z-modal flex items-end sm:items-center justify-center sm:p-4 bg-black/40" onClick={onCancel}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-body"
        className="w-full sm:max-w-md bg-white dark:bg-gray-900 rounded-t-[20px] sm:rounded-[14px] p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6 font-jakarta animate-slide-up sm:animate-none" onClick={(e) => e.stopPropagation()}>
        <h2 id="confirm-title" className="text-lg font-bold text-gray-900 dark:text-white">{title}</h2>
        <p id="confirm-body" className="mt-2 text-sm text-gray-700 dark:text-gray-300">{body}</p>
        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button ref={cancelRef} onClick={onCancel} className={btnSecondary}>Cancel</button>
          <button onClick={onConfirm} className={danger ? `${btnPrimary} !bg-red-700 hover:!bg-red-800` : btnPrimary}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
