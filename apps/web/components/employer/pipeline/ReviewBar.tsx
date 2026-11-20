'use client';

import { useEffect, useRef } from 'react';
import { Check, ChevronDown, Loader2, PauseCircle, SkipForward, X } from 'lucide-react';
import { EXIT_REASONS } from '@/lib/employer/exit-reasons';

export type ReviewDecision = 'SHORTLISTED' | 'ON_HOLD' | 'REJECTED';

/**
 * "Review new": one candidate at a time, the full profile below, a decision in one key, then on to the next.
 * Screening and On hold send no email; Not moving ahead asks for a reason and sends the polite email if the team uses it.
 * Keys: S Screening · P On hold · R Not moving ahead (then pick a reason) · → Skip · Esc ends the review.
 */
export default function ReviewBar({
  position, total, decided, busy, rejectOpen, setRejectOpen, rejectEmails, onDecide, onSkip, onExit,
}: {
  position: number;
  total: number;
  decided: number;
  busy: boolean;
  rejectOpen: boolean;
  setRejectOpen: (open: boolean) => void;
  rejectEmails: boolean;
  onDecide: (status: ReviewDecision, reason?: string) => void;
  onSkip: () => void;
  onExit: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  // P puts them on hold (H already means Hired in the panel). S, R and → come through the panel's own keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest('input, textarea, select, [contenteditable="true"]') || e.metaKey || e.ctrlKey || e.altKey || busy) return;
      if (e.key.toLowerCase() === 'p' && !rejectOpen) { e.preventDefault(); onDecide('ON_HOLD'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, rejectOpen, onDecide]);

  // The reason menu: first reason focused so it works from the keyboard; outside click or Esc closes it.
  useEffect(() => {
    if (!rejectOpen) return;
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const onDoc = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setRejectOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setRejectOpen(false); } };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('mousedown', onDoc); window.removeEventListener('keydown', onKey, true); };
  }, [rejectOpen, setRejectOpen]);

  const kbd = 'ml-1 text-[11px] font-semibold opacity-70';
  return (
    <div className="sticky top-0 z-10 px-4 sm:px-5 py-3 border-b border-[#A50F15]/20 bg-[#FFF7F7] dark:bg-gray-900">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[13px] text-gray-700 dark:text-gray-300" aria-live="polite">
          <span className="font-semibold text-gray-900 dark:text-white">Reviewing new candidates</span> · {position} of {total}
          {decided > 0 && <span className="text-gray-500"> · {decided} decided</span>}
        </p>
        <button type="button" onClick={onExit} className="text-[13px] font-semibold text-gray-700 dark:text-gray-300 hover:underline">End review</button>
      </div>
      <div className="h-1 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden mb-3" aria-hidden>
        <div className="h-full bg-[#A50F15] transition-[width] duration-300" style={{ width: `${Math.min(100, (decided / Math.max(1, total)) * 100)}%` }} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy} onClick={() => onDecide('SHORTLISTED')}
          className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-[10px] bg-[#A50F15] hover:bg-[#8E0D12] text-white text-sm font-semibold disabled:opacity-60">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Check className="w-4 h-4" aria-hidden />} Screening<span className={kbd}>S</span>
        </button>
        <button type="button" disabled={busy} onClick={() => onDecide('ON_HOLD')}
          className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60">
          <PauseCircle className="w-4 h-4" aria-hidden /> On hold<span className={kbd}>P</span>
        </button>
        <div ref={menuRef} className="relative">
          <button type="button" disabled={busy} onClick={() => setRejectOpen(!rejectOpen)} aria-expanded={rejectOpen} aria-haspopup="menu"
            className="inline-flex items-center gap-1 min-h-[40px] px-3 rounded-[10px] border border-red-200 dark:border-red-900 bg-white dark:bg-gray-950 text-sm font-semibold text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-60">
            <X className="w-4 h-4" aria-hidden /> Not moving ahead<span className={kbd}>R</span> <ChevronDown className="w-3.5 h-3.5" aria-hidden />
          </button>
          {rejectOpen && (
            <div role="menu" className="absolute right-0 top-full mt-1 w-64 max-w-[calc(100vw-2rem)] z-20 py-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[12px] shadow-lg">
              <p className="px-3.5 pt-1.5 pb-1 text-xs text-gray-500">Why? Only your team sees this{rejectEmails ? '. They get your polite “not moving ahead” email.' : '.'}</p>
              {EXIT_REASONS.filter((r) => r.code !== 'OTHER').map((r) => (
                <button key={r.code} role="menuitem" type="button" onClick={() => onDecide('REJECTED', r.code)}
                  className="w-full text-left px-3.5 min-h-[38px] text-sm hover:bg-gray-50 dark:hover:bg-gray-800 focus:bg-gray-50 dark:focus:bg-gray-800 focus:outline-none">{r.label}</button>
              ))}
            </div>
          )}
        </div>
        <button type="button" disabled={busy} onClick={onSkip}
          className="ml-auto inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-[10px] text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-60">
          Skip<span className={kbd}>→</span> <SkipForward className="w-4 h-4" aria-hidden />
        </button>
      </div>
      <p className="mt-2 text-xs text-gray-500">Screening and On hold send no email. Interview and other stages are in the buttons below.</p>
    </div>
  );
}
