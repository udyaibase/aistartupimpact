/**
 * For pages that are pre-rendered at build time: when the database can't be reached *during the build*
 * (CI has none), use a fallback so the build still succeeds; the page fills in on its next revalidation.
 * At runtime the error is rethrown, so a database blip keeps the last good page instead of caching empty data.
 */
export const isBuildPhase = () => process.env.NEXT_PHASE === 'phase-production-build';

export function buildFallback<T>(fallback: T, label: string) {
  return (err: unknown): T => {
    if (!isBuildPhase()) throw err;
    console.warn(`[build] ${label}: database unavailable, using fallback`);
    return fallback;
  };
}
