'use client';

import { useEffect, useState } from 'react';
import { applyCatalog, validateCatalog } from '@udyaibase/utils/catalog';

/**
 * For browser components that show a plan's price or limit from PLANS, HOST_PLANS, EVENT_BOOST or PACKS.
 * The copies in the browser bundle are the built-in values; this fetches the catalog in force and applies it, then
 * re-renders. Returns a number that changes when that happens (use it as a dependency or ignore it).
 */
let loaded: Promise<boolean> | null = null;

export function useCatalog(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    loaded ??= fetch('/api/catalog')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const checked = j?.version ? validateCatalog(j.catalog) : null;
        if (!checked?.ok) return false;
        applyCatalog(checked.data);
        return true;
      })
      .catch(() => false);
    loaded.then((changed) => { if (live && changed) setTick((n) => n + 1); });
    return () => { live = false; };
  }, []);
  return tick;
}
