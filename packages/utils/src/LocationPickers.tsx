'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CityEntry } from './cities';
import { cityList, COUNTRIES, searchCityList, type PlaceCity } from './locations';

/**
 * Country and city pickers shared by the website, the portals and admin. Search-as-you-type, but only a listed
 * option can be chosen: anything typed and not picked is dropped when the field loses focus. Keyboard: arrows,
 * Enter, Escape. Uses the apps' `input-field` style.
 */

interface ComboProps<T> {
  id?: string;
  value: string;
  options: (query: string) => T[];
  label: (o: T) => string;
  hint?: (o: T) => string | null;
  onPick: (o: T | null) => void;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  empty?: ReactNode;
  ariaLabel?: string;
}

function Combo<T>({ id, value, options, label, hint, onPick, placeholder, disabled, clearable = true, empty, ariaLabel }: ComboProps<T>) {
  const autoId = useId();
  const inputId = id ?? `loc-${autoId}`;
  const listId = `${inputId}-list`;
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => { if (!open) setQuery(value); }, [value, open]);
  const results = useMemo(() => (open ? options(query === value ? '' : query) : []), [open, query, value, options]);
  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => { list.current?.children[active]?.scrollIntoView({ block: 'nearest' }); }, [active]);

  // Leaving the field without picking keeps the last saved value.
  const close = () => { setOpen(false); setQuery(value); };
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) close(); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  });

  const pick = (o: T) => { onPick(o); setQuery(label(o)); setOpen(false); };

  return (
    <div ref={wrap} className="relative">
      <input
        id={inputId}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        disabled={disabled}
        value={query}
        placeholder={placeholder}
        onFocus={(e) => { setOpen(true); e.currentTarget.select(); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, Math.max(results.length - 1, 0))); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter' && open) { e.preventDefault(); if (results[active]) pick(results[active]); }
          else if (e.key === 'Escape') close();
          else if (e.key === 'Tab') close();
        }}
        className="input-field w-full pr-9 text-base sm:text-sm"
      />
      {clearable && value && !disabled ? (
        <button type="button" aria-label="Clear" onClick={() => { onPick(null); setQuery(''); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800">×</button>
      ) : (
        <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▾</span>
      )}
      {open && (
        <ul ref={list} id={listId} role="listbox"
          className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg py-1 text-sm">
          {results.map((o, i) => (
            <li key={`${label(o)}-${hint?.(o) ?? ''}-${i}`} id={`${listId}-${i}`} role="option" aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(o); }} onMouseEnter={() => setActive(i)}
              className={`px-3 py-2 cursor-pointer flex items-baseline justify-between gap-3 ${i === active ? 'bg-gray-100 dark:bg-gray-800' : ''}`}>
              <span className="text-gray-900 dark:text-white truncate">{label(o)}</span>
              {hint?.(o) && <span className="text-xs text-gray-400 shrink-0">{hint(o)}</span>}
            </li>
          ))}
          {!results.length && <li className="px-3 py-2 text-gray-500">{empty ?? 'No matches'}</li>}
        </ul>
      )}
    </div>
  );
}

const searchCountries = (q: string) => {
  const s = q.trim().toLowerCase();
  if (!s) return [...COUNTRIES];
  return COUNTRIES.filter((c) => c.toLowerCase().startsWith(s)).concat(COUNTRIES.filter((c) => !c.toLowerCase().startsWith(s) && c.toLowerCase().includes(s)));
};

export function CountryPicker({ value, onChange, id, placeholder = 'Choose a country', disabled, clearable = false }: {
  value: string; onChange: (country: string | null) => void; id?: string; placeholder?: string; disabled?: boolean; clearable?: boolean;
}) {
  return (
    <Combo id={id} value={value} options={searchCountries} label={(c: string) => c} onPick={onChange}
      placeholder={placeholder} disabled={disabled} clearable={clearable} ariaLabel={id ? undefined : 'Country'} />
  );
}

/** Several countries (e.g. where a tool is available), shown as removable chips. */
export function CountryMultiPicker({ value, onChange, id, placeholder = 'Add a country' }: {
  value: string[]; onChange: (countries: string[]) => void; id?: string; placeholder?: string;
}) {
  const options = (q: string) => searchCountries(q).filter((c) => !value.includes(c));
  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((c) => (
            <span key={c} className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-800 px-2.5 py-1 text-xs text-gray-700 dark:text-gray-300">
              {c}
              <button type="button" aria-label={`Remove ${c}`} onClick={() => onChange(value.filter((x) => x !== c))} className="text-gray-400 hover:text-red-500">×</button>
            </span>
          ))}
        </div>
      )}
      <Combo id={id} value="" options={options} label={(c: string) => c} onPick={(c) => c && onChange([...value, c])}
        placeholder={placeholder} clearable={false} ariaLabel={id ? undefined : 'Add a country'} />
    </div>
  );
}

/**
 * City from the standard list (shared list + admin-added `extraCities`). With `country`, only that country's
 * cities are offered. Reports the whole city (name, state, country) so forms can fill the country too.
 */
export function CityPicker({ value, onChange, country, extraCities, id, placeholder, disabled, requestHref }: {
  value: string; onChange: (city: PlaceCity | null) => void; country?: string | null; extraCities?: Partial<CityEntry>[];
  id?: string; placeholder?: string; disabled?: boolean;
  /** Where "Can't find your city?" points (e.g. a support mailto). */
  requestHref?: string;
}) {
  const all = useMemo(() => cityList(extraCities), [extraCities]);
  const options = useMemo(() => (q: string) => searchCityList(all, q, country || null), [all, country]);
  const empty = (
    <span>
      No city found{country ? ` in ${country}` : ''}.{' '}
      {requestHref && <a href={requestHref} className="text-brand underline" onMouseDown={(e) => e.stopPropagation()}>Ask us to add it</a>}
    </span>
  );
  return (
    <Combo id={id} value={value} options={options} label={(c: PlaceCity) => c.city}
      hint={(c: PlaceCity) => [c.state, country ? null : c.country].filter(Boolean).join(', ') || null}
      onPick={onChange} placeholder={placeholder ?? (country ? `Search cities in ${country}` : 'Search a city')}
      disabled={disabled} empty={empty} ariaLabel={id ? undefined : 'City'} />
  );
}
