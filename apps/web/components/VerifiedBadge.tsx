'use client';

import { useState } from 'react';

interface VerifiedBadgeProps {
  /** sm: cards and lists · md: section headings · lg: a startup's own page title */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  tooltipText?: string;
}

const SIZES = { sm: 'w-3.5 h-3.5', md: 'w-4 h-4', lg: 'w-5 h-5' } as const;

const DEFAULT_TOOLTIP = 'The owner of this company profile proved they own its website domain.';

/**
 * The "Domain verified" tick, shown right after a startup's name everywhere it appears (cards, lists, the startup
 * page). Blue, so it reads as "verified" rather than "online" or "success", and never on top of the logo. Place it
 * as a sibling after a `truncate` name with `shrink-0` behaviour built in, so a long name is cut, not the tick.
 * Hover (or tap) explains what was verified.
 */
export function VerifiedBadge({ size = 'sm', className = '', tooltipText }: VerifiedBadgeProps) {
  const [open, setOpen] = useState(false);

  return (
    <span
      role="img"
      aria-label="Domain verified"
      className={`relative inline-flex shrink-0 items-center align-middle cursor-help ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      // Cards are links: a tap on the tick explains it instead of opening the page.
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}
    >
      <svg viewBox="0 0 24 24" className={`${SIZES[size]} text-blue-500 dark:text-blue-400`} aria-hidden="true">
        <path
          fill="currentColor"
          d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"
        />
        <path d="m8.5 12 2.5 2.5 4.5-5" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {/* Only mounted while open, so the explanation isn't part of the card's text */}
      {open && (
        <span role="tooltip" className="absolute z-dropdown bottom-full left-1/2 -translate-x-1/2 mb-2 w-60 rounded-lg bg-gray-900 dark:bg-gray-800 px-3 py-2 text-left shadow-xl pointer-events-none">
          <span className="block text-xs font-bold text-white font-jakarta">Domain verified</span>
          <span className="mt-0.5 block text-xs font-normal leading-relaxed text-gray-300 font-jakarta">{tooltipText ?? DEFAULT_TOOLTIP}</span>
        </span>
      )}
    </span>
  );
}
