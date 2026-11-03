'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Sticky bar behaviour: the bar sits right under the fixed site header. On desktop it always stays visible. On smaller
 * screens, where it takes a big share of the height, it slides away while the user scrolls down and comes back on any
 * scroll up. `keepOpen` (filters panel or typeahead open) stops it hiding.
 */
export function useHeadroomBar(anchorRef: RefObject<HTMLDivElement | null>, keepOpen: boolean) {
  const [headerOffset, setHeaderOffset] = useState(96);
  const [stuck, setStuck] = useState(false);
  const [hidden, setHidden] = useState(false);
  const keepOpenRef = useRef(keepOpen);
  keepOpenRef.current = keepOpen;
  const offsetRef = useRef(96);
  const ignoreUntil = useRef(0);

  // The site header is fixed; its height differs by breakpoint and safe-area inset, so measure it.
  useEffect(() => {
    const header = document.querySelector('header');
    if (!header) return;
    const measure = () => {
      const bottom = Math.max(0, Math.round(header.getBoundingClientRect().bottom));
      offsetRef.current = bottom;
      setHeaderOffset(bottom);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(header);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  useEffect(() => {
    let lastY = window.scrollY;
    let frame = 0;
    const desktop = window.matchMedia('(min-width: 1024px)');
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY;
        const delta = y - lastY;
        const anchor = anchorRef.current;
        const isStuck = !!anchor && anchor.getBoundingClientRect().top < offsetRef.current - 1;
        setStuck(isStuck);
        if (!isStuck || keepOpenRef.current || desktop.matches) setHidden(false);
        else if (Date.now() > ignoreUntil.current) {
          if (delta > 6) setHidden(true);
          else if (delta < -6) setHidden(false);
        }
        if (Math.abs(delta) > 6) lastY = y;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame); };
  }, [anchorRef]);

  useEffect(() => { if (keepOpen) setHidden(false); }, [keepOpen]);

  const scrollToResults = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const top = anchor.getBoundingClientRect().top;
    if (top >= offsetRef.current - 1) return; // bar not stuck — the results are already right below it
    ignoreUntil.current = Date.now() + 600;
    setHidden(false);
    window.scrollTo({ top: window.scrollY + top - offsetRef.current, behavior: 'smooth' });
  }, [anchorRef]);

  return { headerOffset, stuck, hidden, scrollToResults };
}
