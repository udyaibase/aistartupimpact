import { revalidatePath } from 'next/cache';

/**
 * On-demand refresh of cached public pages. Pages are cached for hours (see each page's `revalidate`)
 * and refreshed here when their content actually changes, instead of being rebuilt on a short timer.
 * Marking pages stale is cheap: a page is only rebuilt when someone next visits it.
 */

/** Public sections and the URL prefixes they cover (every page below a prefix is refreshed). */
export const SECTIONS = {
  home: ['/'],
  news: ['/news'],
  stories: ['/stories'],
  opinions: ['/opinions', '/opinion'],
  authors: ['/authors'],
  startups: ['/startups'],
  tools: ['/tools'],
  funding: ['/funding'],
  jobs: ['/jobs'],
  events: ['/events'],
  'india-ai': ['/india-ai'],
  milestones: ['/milestones'],
} as const;

export type Section = keyof typeof SECTIONS | 'all';
export const isSection = (s: unknown): s is Section => s === 'all' || (typeof s === 'string' && s in SECTIONS);

/** revalidatePath throws outside a request (scripts, tests); a refresh must never break the save that called it. */
function safely(fn: () => void) {
  try { fn(); } catch (err) { console.warn('[revalidate] skipped:', err instanceof Error ? err.message : err); }
}

/** Refresh whole sections (e.g. after an admin edit). 'all' refreshes every page. */
export function refreshSections(sections: Section[]) {
  safely(() => refreshSectionsNow(sections));
}

function refreshSectionsNow(sections: Section[]) {
  if (sections.includes('all')) {
    revalidatePath('/', 'layout');
    return;
  }
  for (const s of new Set(sections)) {
    for (const prefix of SECTIONS[s as keyof typeof SECTIONS]) {
      if (prefix === '/') {
        revalidatePath('/');
      } else {
        // Public pages live in the (public) route group; refreshing the group path covers them too.
        revalidatePath(prefix, 'layout');
        revalidatePath(`/(public)${prefix}`, 'layout');
      }
    }
  }
}

/** Refresh specific pages (e.g. one job after an employer edits it). Paths like "/jobs/abc". */
export function refreshPaths(paths: string[]) {
  safely(() => { for (const p of new Set(paths)) if (p.startsWith('/')) revalidatePath(p); });
}
