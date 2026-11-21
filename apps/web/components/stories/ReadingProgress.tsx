'use client';

import { useEffect, useState } from 'react';

/** A thin line at the top of the screen showing how far through the story the reader is. */
export default function ReadingProgress({ targetId }: { targetId: string }) {
  const [p, setP] = useState(0);
  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      const done = total <= 0 ? (r.top < 0 ? 1 : 0) : Math.min(1, Math.max(0, -r.top / total));
      setP(done);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [targetId]);
  return (
    <div aria-hidden className="fixed left-0 right-0 top-0 z-[260] h-[3px] pointer-events-none">
      <div className="h-full bg-brand origin-left transition-transform duration-100" style={{ transform: `scaleX(${p})` }} />
    </div>
  );
}
