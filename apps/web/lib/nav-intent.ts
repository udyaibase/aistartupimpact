'use client';

/**
 * Whether the page being shown is a "return" to it: reached through browser history (Back/Forward), a refresh, or
 * a "back to the list" link (markReturn). Scroll and list restoration only apply then; any other link navigation
 * starts fresh. Stays true until the next link navigation (history.pushState), so a slow load can't miss it.
 */

let fromHistory = false;
let returnPending = false;

if (typeof window !== 'undefined' && !(window as unknown as { __navIntent?: boolean }).__navIntent) {
  (window as unknown as { __navIntent?: boolean }).__navIntent = true;
  const nav = performance.getEntriesByType?.('navigation')?.[0] as PerformanceNavigationTiming | undefined;
  fromHistory = nav?.type === 'back_forward' || nav?.type === 'reload';
  window.addEventListener('popstate', () => { fromHistory = true; });
  const push = history.pushState.bind(history);
  history.pushState = (...args: Parameters<History['pushState']>) => {
    fromHistory = returnPending;
    returnPending = false;
    return push(...args);
  };
}

export const cameFromHistory = () => fromHistory;

/** Call just before following a "back to the list" link: the list then restores like it does on Back. */
export function markReturn() {
  returnPending = true;
}
