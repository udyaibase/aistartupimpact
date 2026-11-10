'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, type ComponentProps } from 'react';

/**
 * A Link for long lists: never prefetched just for scrolling into view (a list would fire dozens of requests), but
 * prefetched as soon as the visitor shows intent (hover, touch, keyboard focus), so the click opens without a
 * loading skeleton.
 */
export default function IntentLink({ href, onMouseEnter, onTouchStart, onFocus, ...rest }: ComponentProps<typeof Link>) {
  const router = useRouter();
  const prefetched = useRef(false);
  const prefetch = () => {
    if (prefetched.current || typeof href !== 'string') return;
    prefetched.current = true;
    router.prefetch(href);
  };

  return (
    <Link
      {...rest}
      href={href}
      prefetch={false}
      onMouseEnter={(e) => { prefetch(); onMouseEnter?.(e); }}
      onTouchStart={(e) => { prefetch(); onTouchStart?.(e); }}
      onFocus={(e) => { prefetch(); onFocus?.(e); }}
    />
  );
}
