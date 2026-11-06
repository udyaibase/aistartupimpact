'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Search, X, Loader2, Sparkles, ArrowUpRight, CornerDownLeft } from 'lucide-react';
import type { SearchChip } from '@/lib/search/understand';

export interface SearchSuggestion {
  key: string;
  title: string;
  subtitle?: string | null;
  logoUrl?: string | null;
  href: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Shown in rotation as the placeholder, and as one-tap examples when the box is focused and empty. */
  examples: string[];
  /** e.g. "startups" / "AI tools" — used in labels. */
  noun: string;
  suggestions?: SearchSuggestion[];
  loading?: boolean;
  resultCount?: number | null;
  chips?: SearchChip[];
  relaxed?: boolean;
  onRemoveChip?: (chip: SearchChip) => void;
  /** Notifies the parent while the dropdown is open (e.g. so a sticky bar doesn't hide). */
  onOpenChange?: (open: boolean) => void;
}

/**
 * Search box used by the startups and AI tools directories. Accepts plain sentences; the parent does the
 * understanding and ranking and passes back suggestions + recognised filters (chips).
 */
export default function SmartSearchBox({
  value, onChange, examples, noun, suggestions = [], loading, resultCount, chips = [], relaxed, onRemoveChip, onOpenChange,
}: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const [exampleIdx, setExampleIdx] = useState(0);

  const query = value.trim();
  const showExamples = focused && !query && examples.length > 0;
  const showSuggestions = focused && !!query && suggestions.length > 0;
  const open = showExamples || showSuggestions;
  const items = showSuggestions ? suggestions : [];

  useEffect(() => { onOpenChange?.(open); }, [open, onOpenChange]);
  useEffect(() => { setActive(-1); }, [value, suggestions.length]);

  // Rotating example placeholder — teaches that full sentences work.
  useEffect(() => {
    if (focused || value || examples.length < 2) return;
    const t = setInterval(() => setExampleIdx((i) => (i + 1) % examples.length), 3500);
    return () => clearInterval(t);
  }, [focused, value, examples.length]);

  // "/" focuses search from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) && !(e.target as HTMLElement)?.isContentEditable) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && items.length) { e.preventDefault(); setActive((i) => Math.min(i + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp' && items.length) { e.preventDefault(); setActive((i) => Math.max(i - 1, -1)); }
    else if (e.key === 'Enter') {
      if (active >= 0 && items[active]) { e.preventDefault(); router.push(items[active].href); }
      else inputRef.current?.blur(); // results below are already live; close the dropdown so they're visible
    } else if (e.key === 'Escape') {
      if (value) onChange(''); else inputRef.current?.blur();
    }
  };

  return (
    <div className="relative w-full">
      <div
        className={`group flex items-center gap-2 sm:gap-2.5 h-10 sm:h-12 pl-3 sm:pl-4 pr-1.5 sm:pr-2 rounded-xl sm:rounded-2xl border bg-white dark:bg-gray-900 transition-all ${
          focused
            ? 'border-brand ring-4 ring-brand/10 shadow-md'
            : 'border-gray-200 dark:border-gray-700 shadow-sm hover:border-gray-300 dark:hover:border-gray-600'
        }`}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 sm:w-[18px] sm:h-[18px] text-brand animate-spin shrink-0" aria-hidden />
        ) : (
          <Search className={`w-4 h-4 sm:w-[18px] sm:h-[18px] shrink-0 transition-colors ${focused ? 'text-brand' : 'text-gray-400'}`} aria-hidden />
        )}
        <input
          ref={inputRef}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          onKeyDown={onKeyDown}
          placeholder={examples.length ? `Try “${examples[exampleIdx % examples.length]}”` : `Search ${noun}`}
          aria-label={`Search ${noun}`}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          spellCheck={false}
          className="flex-1 min-w-0 h-full bg-transparent text-base sm:text-[15px] text-gray-900 dark:text-white placeholder:text-[14px] sm:placeholder:text-[15px] placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none font-jakarta [&::-webkit-search-cancel-button]:hidden"
        />
        {value ? (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { onChange(''); inputRef.current?.focus(); }}
            className="w-8 h-8 inline-flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0"
            aria-label="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <kbd className="hidden sm:inline-flex items-center justify-center w-6 h-6 mr-1 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-400 text-xs font-mono shrink-0">/</kbd>
        )}
      </div>

      {open && (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl overflow-hidden animate-scale-in"
        >
          {showExamples && (
            <div className="p-3">
              <p className="flex items-center gap-1.5 px-1 mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-400 font-jakarta">
                <Sparkles className="w-3.5 h-3.5 text-brand" /> Search the way you'd ask
              </p>
              <div className="flex flex-wrap gap-1.5">
                {examples.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onChange(ex)}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold font-jakarta bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-brand/10 hover:text-brand transition-colors text-left"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {showSuggestions && (
            <>
              <ul className="py-1.5">
                {items.map((s, i) => (
                  <li key={s.key} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                    <a
                      href={s.href}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={(e) => { e.preventDefault(); router.push(s.href); }}
                      onMouseEnter={() => setActive(i)}
                      className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${i === active ? 'bg-brand/5 dark:bg-brand/10' : ''}`}
                    >
                      <span className="w-8 h-8 rounded-lg border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-center overflow-hidden shrink-0">
                        {s.logoUrl ? (
                          <Image src={s.logoUrl} alt="" width={28} height={28} className="w-7 h-7 object-contain" />
                        ) : (
                          <span className="text-xs font-bold text-brand">{s.title.charAt(0)}</span>
                        )}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-gray-900 dark:text-white truncate font-jakarta">{s.title}</span>
                        {s.subtitle && <span className="block text-xs text-gray-500 dark:text-gray-400 truncate font-jakarta">{s.subtitle}</span>}
                      </span>
                      <ArrowUpRight className={`w-4 h-4 shrink-0 ${i === active ? 'text-brand' : 'text-gray-300 dark:text-gray-600'}`} />
                    </a>
                  </li>
                ))}
              </ul>
              {resultCount != null && (
                <div className="flex items-center justify-between gap-2 px-4 py-2 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-500 dark:text-gray-400 font-jakarta">
                  <span>{resultCount} {resultCount === 1 ? 'match' : 'matches'} below</span>
                  <span className="hidden sm:inline-flex items-center gap-1"><CornerDownLeft className="w-3 h-3" /> to see all</span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {(chips.length > 0 || relaxed) && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          {chips.length > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 dark:text-gray-400 font-jakarta mr-0.5">
              <Sparkles className="w-3.5 h-3.5 text-brand" /> Understood:
            </span>
          )}
          {chips.map((chip) => (
            <span
              key={`${chip.kind}-${chip.label}`}
              className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full text-xs font-semibold font-jakarta bg-brand/5 border border-brand/20 text-brand"
            >
              {chip.label}
              {onRemoveChip && (
                <button
                  type="button"
                  onClick={() => onRemoveChip(chip)}
                  className="w-4 h-4 inline-flex items-center justify-center rounded-full hover:bg-brand/15"
                  aria-label={`Remove ${chip.label}`}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          ))}
          {relaxed && (
            <span className="text-xs text-amber-600 dark:text-amber-400 font-jakarta">
              Nothing matched every filter in your search — showing the closest {noun}.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
