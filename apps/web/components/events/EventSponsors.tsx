'use client';

import { useEffect, useRef } from 'react';
import { tierLabel } from '@/lib/events/sponsor-tiers';

export type PublicSponsor = { id: string; name: string; tier: string; logoUrl: string | null; hasLink: boolean };

/**
 * Sponsors on an event page, grouped by tier. Counts one page view per visitor session once the section is seen,
 * and logo clicks go through a counting redirect.
 */
export default function EventSponsors({ eventId, sponsors }: { eventId: string; sponsors: PublicSponsor[] }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !sponsors.length) return;
    const key = `sponsor-view:${eventId}`;
    try { if (sessionStorage.getItem(key)) return; } catch { /* storage blocked */ }
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      try { sessionStorage.setItem(key, '1'); } catch { /* ignore */ }
      fetch('/api/events/sponsors/impressions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId }), keepalive: true }).catch(() => {});
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [eventId, sponsors.length]);

  if (!sponsors.length) return null;
  const tiers = Array.from(new Set(sponsors.map((s) => s.tier)));

  return (
    <section ref={ref} aria-labelledby="sponsors-title">
      <h2 id="sponsors-title" className="font-sora font-bold text-lg text-navy dark:text-white mb-4">Sponsors</h2>
      <div className="space-y-5">
        {tiers.map((tier) => {
          const big = tier === 'GOLD';
          return (
            <div key={tier}>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{tierLabel(tier)}</p>
              <ul className={`grid gap-3 ${big ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-3 sm:grid-cols-5'}`}>
                {sponsors.filter((s) => s.tier === tier).map((s) => {
                  const inner = s.logoUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={s.logoUrl} alt={s.name} loading="lazy" className="max-h-full max-w-full object-contain" />
                    : <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 text-center">{s.name}</span>;
                  const box = `flex items-center justify-center rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 ${big ? 'h-24 p-4' : 'h-16 p-3'}`;
                  return (
                    <li key={s.id}>
                      {s.hasLink
                        ? <a href={`/api/events/sponsors/${s.id}/click`} target="_blank" rel="noopener sponsored" title={s.name} className={`${box} hover:border-gray-300 dark:hover:border-gray-700 transition-colors`}>{inner}</a>
                        : <div title={s.name} className={box}>{inner}</div>}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
