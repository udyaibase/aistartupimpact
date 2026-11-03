'use client';

import { CityPicker } from '@/components/LocationFields';

/**
 * A headquarters city from the standard city list (shared list + Cities page). Only a listed city can be picked;
 * the saved value is its plain name ("Bengaluru"). Missing cities are added on the Cities page.
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
  return (
    <>
      <CityPicker id={id} value={value} placeholder={placeholder} onChange={(c) => onChange(c?.city ?? '')} />
      {name && <input type="hidden" name={name} value={value} />}
    </>
  );
}
