'use client';

/**
 * Whether the page being shown was reached through browser history (Back/Forward) or a refresh, as opposed to
 * following a link. Scroll and list restoration only apply in the first case. Stays true until the next link
 * navigation (history.pushState), so a slow page load can't miss it.
 */

let fromHistory = false;

if (typeof window !== 'undefined' && !(window as unknown as { __navIntent?: boolean }).__navIntent) {
  (window as unknown as { __navIntent?: boolean }).__navIntent = true;
  const nav = performance.getEntriesByType?.('navigation')?.[0] as PerformanceNavigationTiming | undefined;
  fromHistory = nav?.type === 'back_forward' || nav?.type === 'reload';
  window.addEventListener('popstate', () => { fromHistory = true; });
  const push = history.pushState.bind(history);
  history.pushState = (...args: Parameters<History['pushState']>) => { fromHistory = false; return push(...args); };
}

export const cameFromHistory = () => fromHistory;
