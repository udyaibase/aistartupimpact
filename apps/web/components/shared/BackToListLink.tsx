'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { lastListUrl } from '@/hooks/useListRestore';
import { markReturn } from '@/lib/nav-intent';

/**
 * A link back to a directory list (breadcrumbs on profile pages). Returns to the list as the visitor left it in
 * this tab: same filters, same results loaded, same scroll position. Falls back to the plain list.
 */
export default function BackToListLink({ scope, href, className, children }: { scope: 'startups' | 'tools'; href: string; className?: string; children: ReactNode }) {
  const [target, setTarget] = useState(href);
  // Read after mount: the server doesn't know this tab's last list.
  useEffect(() => { setTarget(lastListUrl(scope) || href); }, [scope, href]);
  return (
    <Link href={target} className={className} onClick={() => { if (target !== href) markReturn(); }}>
      {children}
    </Link>
  );
}
