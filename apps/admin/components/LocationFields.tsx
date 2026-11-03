'use client';

import { useEffect, useState } from 'react';
import type { CityEntry } from '@udyaibase/utils/src/cities';
import { CityPicker as BaseCityPicker, CountryPicker, CountryMultiPicker } from '@udyaibase/utils/src/LocationPickers';
import type { PlaceCity } from '@udyaibase/utils/src/locations';
import { getExtraCitiesAction } from '@/lib/location-actions';

export { CountryPicker, CountryMultiPicker };

let loaded: Promise<Partial<CityEntry>[]> | null = null;

/** The shared city picker with the Cities-page cities loaded in; missing cities are added on the Cities page. */
export function CityPicker(props: { value: string; onChange: (city: PlaceCity | null) => void; country?: string | null; id?: string; placeholder?: string }) {
  const [extra, setExtra] = useState<Partial<CityEntry>[]>();
  useEffect(() => {
    loaded ??= getExtraCitiesAction().catch(() => { loaded = null; return []; });
    let alive = true;
    loaded.then((c) => { if (alive) setExtra(c); });
    return () => { alive = false; };
  }, []);
  return <BaseCityPicker {...props} extraCities={extra} requestHref="/cities/new" />;
}
