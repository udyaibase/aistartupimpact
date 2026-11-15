'use client';

import Link from 'next/link';

export const TOOLS_CATEGORY_EVENT = 'tools:category';

/**
 * A category tile on /tools. A plain click filters the list below, the same as the category pills, and jumps to
 * the results, so categories work one way on this page. The link still points at the category page, so search
 * engines, new tabs (Cmd/Ctrl-click, middle-click) and no-JavaScript visits keep working.
 */
export default function CategoryTileLink({ slug, href, className, children }: {
  slug: string; href: string; className?: string; children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={(e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        // Handled only when the list is on the page to receive it.
        const handled = !window.dispatchEvent(new CustomEvent(TOOLS_CATEGORY_EVENT, { detail: slug, cancelable: true }));
        if (handled) e.preventDefault();
      }}
    >
      {children}
    </Link>
  );
}
