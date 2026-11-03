'use client';

import { CityPicker } from '@udyaibase/utils/src/LocationPickers';
import { useExtraCities } from '@/components/shared/useExtraCities';
import { CITY_REQUEST } from '@/lib/city-request';

/**
 * A startup's headquarters city, chosen from the standard city list (shared list + cities admins add). Only a
 * listed city can be picked; the saved value is its plain name ("Bengaluru").
 */
export default function CityCombobox({ value, onChange, placeholder = 'Search and select a city', id, name }: {
  value: string;
  onChange: (city: string) => void;
  placeholder?: string;
  /** Kept for existing callers; the picker has its own field style. */
  className?: string;
  id?: string;
  /** Mirrors the value into a hidden input for forms read with FormData. */
  name?: string;
}) {
  const extraCities = useExtraCities();
  return (
    <>
      <CityPicker id={id} value={value} placeholder={placeholder} extraCities={extraCities} requestHref={CITY_REQUEST}
        onChange={(c) => onChange(c?.city ?? '')} />
      {name && <input type="hidden" name={name} value={value} />}
    </>
  );
}
