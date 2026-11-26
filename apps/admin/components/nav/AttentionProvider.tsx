'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { attentionTotal, type AttentionCounts } from '@/lib/attention-queues';

const Ctx = createContext<{ counts: AttentionCounts; total: number; loaded: boolean; refresh: () => void }>({ counts: {}, total: 0, loaded: false, refresh: () => {} });

export const useAttention = () => useContext(Ctx);

const EVERY_MS = 60_000;
const MIN_GAP_MS = 15_000;

/**
 * Counts of waiting work, shared by the menu badges, the dashboard panel and the search palette. Refreshed every
 * minute while the tab is visible and when moving between pages (a queue usually changes because you just cleared
 * something), never more often than every 15 seconds.
 */
export function AttentionProvider({ children }: { children: React.ReactNode }) {
  const [counts, setCounts] = useState<AttentionCounts>({});
  const [loaded, setLoaded] = useState(false);
  const last = useRef(0);
  const pathname = usePathname();

  const load = useCallback(async (force = false) => {
    if (!force && Date.now() - last.current < MIN_GAP_MS) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    last.current = Date.now();
    try {
      const res = await fetch('/api/admin/attention', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (data && typeof data.counts === 'object') setCounts(data.counts);
    } catch { /* keep the last counts */ } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { load(); }, [pathname, load]);
  useEffect(() => {
    const timer = setInterval(() => load(), EVERY_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [load]);

  return <Ctx.Provider value={{ counts, total: attentionTotal(counts), loaded, refresh: () => load(true) }}>{children}</Ctx.Provider>;
}
