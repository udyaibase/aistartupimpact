'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { cameFromHistory } from '@/lib/nav-intent';

/**
 * Site-wide scroll memory. Going Back/Forward (or refreshing) returns to where the page was left; following a
 * link always starts at the top. Positions are kept per URL including its filters (?…), since a filtered list is
 * a different page to come back to. Long lists also restore how much they had loaded (hooks/useListRestore).
 */

const STORAGE_KEY = 'scroll-positions';
const MAX_RESTORE_TIME = 3000;
const RETRY_INTERVAL = 100;

function getScrollMap(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveScroll(key: string, y: number) {
  try {
    const map = getScrollMap();
    map[key] = y;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch { /* storage blocked or full: nothing to restore */ }
}

const currentKey = () => window.location.pathname + window.location.search;

export default function ScrollRestoration() {
  const pathname = usePathname();
  const restoringUntil = useRef(0);

  useEffect(() => {
    if (!cameFromHistory()) return;

    const saved = getScrollMap()[currentKey()];
    if (!saved || saved < 10) return;

    restoringUntil.current = Date.now() + MAX_RESTORE_TIME;
    let timer: ReturnType<typeof setTimeout>;

    function tryRestore() {
      if (Date.now() > restoringUntil.current) {
        restoringUntil.current = 0;
        return;
      }

      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;

      if (maxScroll >= saved) {
        window.scrollTo(0, saved);
        restoringUntil.current = 0;
        return;
      }

      timer = setTimeout(tryRestore, RETRY_INTERVAL);
    }

    tryRestore();

    return () => {
      clearTimeout(timer);
      restoringUntil.current = 0;
    };
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => {
      if (restoringUntil.current > 0) return;
      saveScroll(currentKey(), window.scrollY);
    };
    // Also save the moment a link is followed, so a quick scroll-and-tap is never lost.
    const onClick = (e: MouseEvent) => { if ((e.target as Element | null)?.closest?.('a[href]')) onScroll(); };
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('click', onClick, true);
    return () => { window.removeEventListener('scroll', onScroll); document.removeEventListener('click', onClick, true); };
  }, [pathname]);

  return null;
}
