'use client';

import { useEffect, useRef } from 'react';
import { cameFromHistory } from '@/lib/nav-intent';

/**
 * Brings a long list back to where the visitor left it: how much was loaded (pages / items) and the scroll
 * position. Restores only when the visitor returns with Back/Forward or refreshes the page; arriving from a link
 * starts at the top as usual. Saved per URL (the lists keep their filters in the URL), in sessionStorage, for
 * 30 minutes.
 */

const MAX_AGE = 30 * 60_000;
type Saved = { amount: number; y: number; at: number };

const storageKey = (scope: string) => `list-restore:${scope}:${window.location.pathname}${window.location.search}`;

function read(scope: string): Saved | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(storageKey(scope)) || 'null') as Saved | null;
    return v && Date.now() - v.at < MAX_AGE ? v : null;
  } catch { return null; }
}

/**
 * @param scope    Names the list ("startups", "tools").
 * @param filters  The list's current filters; saving follows them (the URL mirrors them).
 * @param amount   How much is loaded now (items shown or pages fetched).
 * @param restore  Called once with the saved amount; resolve when that much is rendered, then the scroll is restored.
 */
export function useListRestore(scope: string, filters: string, amount: number, restore: (amount: number) => Promise<void> | void) {
  const restoring = useRef(false);
  const latestAmount = useRef(amount);
  latestAmount.current = amount;

  // Restore once, on arrival.
  useEffect(() => {
    if (!cameFromHistory()) return;
    const saved = read(scope);
    if (!saved) return;
    restoring.current = true;
    Promise.resolve(restore(saved.amount)).then(() => {
      // Let the restored items render and lay out before scrolling (timers, not animation frames, which
      // browsers pause in background tabs).
      setTimeout(() => {
        window.scrollTo({ top: saved.y, behavior: 'instant' as ScrollBehavior });
        restoring.current = false;
      }, 60);
    }).catch(() => { restoring.current = false; });
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the saved state current while the visitor scrolls and loads more.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = () => {
      timer = undefined;
      if (restoring.current) return;
      try {
        sessionStorage.setItem(storageKey(scope), JSON.stringify({ amount: latestAmount.current, y: Math.round(window.scrollY), at: Date.now() }));
      } catch { /* storage full or blocked: nothing to restore later */ }
    };
    const onScroll = () => { timer ??= setTimeout(save, 150); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', save);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('pagehide', save); clearTimeout(timer); };
  }, [scope, filters, amount]);
}
