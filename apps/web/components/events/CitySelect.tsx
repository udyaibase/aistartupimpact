"use client";

import { CityPicker } from "@udyaibase/utils/src/LocationPickers";
import { useExtraCities } from "@/components/shared/useExtraCities";
import { CITY_REQUEST } from "@/lib/city-request";

interface Props {
  value: string;
  onChange: (city: { name: string; state?: string; country?: string }) => void;
  placeholder?: string;
  country?: string | null;
  id?: string;
}

/**
 * City for events (venue city, attendee city) from the standard city list. Only a listed city can be chosen; the
 * saved name is the plain city ("Hyderabad"), which event promotion matches against attendees' cities.
 */
export default function CitySelect({ value, onChange, placeholder = "Search your city...", country, id }: Props) {
  const extraCities = useExtraCities();
  return (
    <CityPicker id={id} value={value} country={country} placeholder={placeholder} extraCities={extraCities} requestHref={CITY_REQUEST}
      onChange={(c) => onChange(c ? { name: c.city, state: c.state ?? undefined, country: c.country } : { name: "" })} />
  );
}
