'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Star } from 'lucide-react';
import { ToolCTAButton } from './ToolCTAButton';

/**
 * Phones: once the header's buttons scroll out of view, a slim bar keeps "Visit site" one tap away. It sits above the
 * bottom navigation and slides in and out with transform only, so it stays smooth.
 */
export default function ToolStickyCta({ toolId, name, logoUrl, rating, anchorId }: {
  toolId: string; name: string; logoUrl: string | null; rating: number | null; anchorId: string;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const anchor = document.getElementById(anchorId);
    if (!anchor) return;
    // Shown only after scrolling past the buttons, not before reaching them.
    const io = new IntersectionObserver(([e]) => setShow(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(anchor);
    return () => io.disconnect();
  }, [anchorId]);

  return (
    <div
      aria-hidden={!show}
      inert={!show}
      className="lg:hidden fixed inset-x-0 bottom-[var(--bottom-nav-h)] z-sticky px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pointer-events-none"
      style={{
        // Fully below the bottom navigation when hidden, and faded, so no edge peeks out under it.
        transform: show ? 'translate3d(0,0,0)' : 'translate3d(0,calc(100% + 5rem),0)',
        opacity: show ? 1 : 0,
        // `bottom` follows the tab bar as it slides away, at the same speed.
        transition: 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1), opacity 200ms ease, bottom 300ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 shadow-lg pl-2.5 pr-2 py-2 motion-reduce:transition-none">
        <span className="w-9 h-9 shrink-0 rounded-lg overflow-hidden border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800 flex items-center justify-center">
          {logoUrl
            ? <Image src={logoUrl} alt="" width={36} height={36} sizes="36px" className="w-full h-full object-cover" />
            : <span className="text-sm font-bold text-brand">{name.charAt(0).toUpperCase()}</span>}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-navy dark:text-white truncate font-jakarta">{name}</span>
          {rating != null && rating > 0 && (
            <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 font-jakarta">
              <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" aria-hidden /> {rating.toFixed(1)}
            </span>
          )}
        </span>
        <ToolCTAButton toolId={toolId} toolName={name} source="TOOL_DETAIL" className="shrink-0 h-10 !px-4 text-sm">
          Visit site
        </ToolCTAButton>
      </div>
    </div>
  );
}
