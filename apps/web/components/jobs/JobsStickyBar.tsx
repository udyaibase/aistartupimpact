'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useHeadroomBar } from '@/hooks/useHeadroomBar';

/**
 * Search (and, on mobile, the filter row) for /jobs, stuck under the site header like the startups and tools bars:
 * always visible on desktop; on smaller screens it slides away while scrolling down and returns on scroll up.
 * Publishes where it ends as --jobs-filter-top so the desktop filter sidebar sticks just below it.
 */
export default function JobsStickyBar({ children }: { children: ReactNode }) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const bar = useHeadroomBar(anchorRef, false);

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty('--jobs-filter-top', `${bar.headerOffset + el.offsetHeight + 16}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => { ro.disconnect(); root.style.removeProperty('--jobs-filter-top'); };
  }, [bar.headerOffset]);

  return (
    <>
      <div ref={anchorRef} aria-hidden className="h-0" />
      <div
        ref={barRef}
        style={{
          top: bar.headerOffset,
          transform: bar.hidden ? `translate3d(0, calc(-100% - ${bar.headerOffset}px), 0)` : 'translate3d(0, 0, 0)',
          transition: 'transform 360ms cubic-bezier(0.32, 0.72, 0, 1)',
        }}
        className="sticky z-30 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 py-2 sm:py-3 space-y-2 sm:space-y-3 will-change-transform motion-reduce:!transition-none"
      >
        {/* Full-bleed backdrop so the bar reads as one strip edge to edge */}
        <div
          aria-hidden
          className={`absolute inset-y-0 -left-[100vw] -right-[100vw] -z-10 bg-gray-50 dark:bg-gray-950 sm:bg-gray-50/95 sm:dark:bg-gray-950/95 sm:backdrop-blur-md transition-shadow duration-300 ${
            bar.stuck ? 'shadow-[0_8px_16px_-12px_rgba(0,0,0,0.25)] border-b border-gray-200/70 dark:border-gray-800' : ''
          }`}
        />
        {children}
      </div>
    </>
  );
}
