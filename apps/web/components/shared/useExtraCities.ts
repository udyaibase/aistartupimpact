'use client';

import { useEffect, useState } from 'react';
import type { CityEntry } from '@udyaibase/utils/src/cities';

let loaded: Promise<Partial<CityEntry>[]> | null = null;

/** Admin-added cities for CityPicker, fetched once per page load and shared by every picker on the page. */
export function useExtraCities(): Partial<CityEntry>[] | undefined {
  const [extra, setExtra] = useState<Partial<CityEntry>[]>();
  useEffect(() => {
    loaded ??= fetch('/api/locations/cities').then((r) => r.json()).then((d) => (Array.isArray(d.cities) ? d.cities : [])).catch(() => { loaded = null; return []; });
    let alive = true;
    loaded.then((c) => { if (alive) setExtra(c); });
    return () => { alive = false; };
  }, []);
  return extra;
}
