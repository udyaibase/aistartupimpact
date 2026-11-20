'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { X } from 'lucide-react';

/**
 * A card the viewer can hide for good on this browser (e.g. a setup checklist whose remaining steps are optional).
 * Wrap the card in <Dismissible> and put <DismissButton> where the close control belongs.
 */
const Ctx = createContext<(() => void) | null>(null);

export default function Dismissible({ storageKey, children }: { storageKey: string; children: React.ReactNode }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try { if (localStorage.getItem(storageKey) === '1') setHidden(true); } catch { /* storage blocked: keep showing */ }
  }, [storageKey]);
  if (hidden) return null;
  const hide = () => {
    setHidden(true);
    try { localStorage.setItem(storageKey, '1'); } catch { /* fine: hidden for this visit */ }
  };
  return <Ctx.Provider value={hide}>{children}</Ctx.Provider>;
}

export function DismissButton({ label }: { label: string }) {
  const hide = useContext(Ctx);
  if (!hide) return null;
  return (
    <button type="button" onClick={hide} aria-label={label} title={label}
      className="w-8 h-8 -mr-1 flex items-center justify-center rounded-[8px] text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-white">
      <X className="w-4 h-4" aria-hidden />
    </button>
  );
}
