'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, Search } from 'lucide-react';
import { DEFAULT_TEAMS, JOB_CATEGORIES } from '@/lib/jobs/composer';
import { inputCls } from './fields';

const CUSTOM_PREFIX = 'custom:';

type Option = { value: string; label: string; group?: string };

/**
 * A dropdown that opens inside the form (not the browser's native menu, which can spill past the page with long
 * lists). Opens below the field, or above when there isn't room; scrolls; type to search; arrow keys, Enter and
 * Escape work; closes on an outside click. Optional footer action ("+ Add …") at the bottom of the list.
 */
function Dropdown({ id, value, options, onSelect, placeholder = 'Select', searchPlaceholder = 'Search', action }: {
  id: string;
  value: string;
  options: Option[];
  onSelect: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  action?: { label: string; onClick: () => void };
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [up, setUp] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.value === value);
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => (q ? options.filter((o) => o.label.toLowerCase().includes(q) || (o.group ?? '').toLowerCase().includes(q)) : options), [options, q]);
  // Rows: options plus the footer action (last), for keyboard navigation.
  const rowCount = shown.length + (action ? 1 : 0);

  const close = (refocus = true) => {
    setOpen(false);
    setQuery('');
    if (refocus) buttonRef.current?.focus();
  };

  // Open above when there's more room above than below (e.g. near the bottom of the screen).
  useLayoutEffect(() => {
    if (!open || !wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    setUp(below < 340 && r.top > below);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const i = Math.max(0, shown.findIndex((o) => o.value === value));
    setActive(q ? 0 : i);
    searchRef.current?.focus();
    // Only when opening or the filter changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, q]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('touchstart', onDown); };
  }, [open]);

  // Keep the highlighted row in view.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-row="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const choose = (i: number) => {
    if (action && i === shown.length) { close(false); action.onClick(); return; }
    const o = shown[i];
    if (!o) return;
    onSelect(o.value);
    close();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(rowCount - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(rowCount - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(active); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Tab') close(false);
  };

  let lastGroup: string | undefined;

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(e) => { if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); setOpen(true); } }}
        className={`${inputCls} flex items-center justify-between gap-2 text-left`}
      >
        <span className={`truncate ${selected ? '' : 'text-gray-400'}`}>{selected?.label ?? placeholder}</span>
        <ChevronDown className={`w-4 h-4 text-gray-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {open && (
        <div
          className={`absolute z-30 left-0 right-0 ${up ? 'bottom-full mb-1.5' : 'top-full mt-1.5'} rounded-[12px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg shadow-black/10 overflow-hidden`}
          onKeyDown={onKey}
        >
          <div className="p-2 border-b border-gray-100 dark:border-gray-800">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                aria-controls={listId}
                aria-activedescendant={rowCount ? `${listId}-${active}` : undefined}
                className="w-full h-9 pl-8 pr-2 rounded-md bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand/25"
              />
            </div>
          </div>
          <ul ref={listRef} id={listId} role="listbox" aria-labelledby={id} className="max-h-[min(300px,45vh)] overflow-y-auto overscroll-contain py-1">
            {shown.length === 0 && <li className="px-3 py-2.5 text-sm text-gray-500">No matches</li>}
            {shown.map((o, i) => {
              const header = o.group && o.group !== lastGroup && !q ? o.group : null;
              lastGroup = o.group;
              const isSel = o.value === value;
              return (
                <li key={o.value} role="presentation">
                  {header && <p className="px-3 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{header}</p>}
                  <div
                    id={`${listId}-${i}`}
                    data-row={i}
                    role="option"
                    aria-selected={isSel}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(i)}
                    className={`mx-1 flex items-center justify-between gap-2 px-2.5 py-2 rounded-md text-sm cursor-pointer ${
                      i === active ? 'bg-gray-100 dark:bg-gray-800' : ''
                    } ${isSel ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}
                  >
                    <span className="truncate">{o.label}</span>
                    {isSel && <Check className="w-4 h-4 text-brand shrink-0" aria-hidden />}
                  </div>
                </li>
              );
            })}
          </ul>
          {action && (
            <div className="border-t border-gray-100 dark:border-gray-800 p-1">
              <div
                id={`${listId}-${shown.length}`}
                data-row={shown.length}
                role="option"
                aria-selected={false}
                onMouseEnter={() => setActive(shown.length)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(shown.length)}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-md text-sm font-semibold text-brand cursor-pointer ${active === shown.length ? 'bg-brand/5' : ''}`}
              >
                <Plus className="w-4 h-4" aria-hidden /> {action.label}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Inline "name it" row shown after picking "+ Add …". */
function AddRow({ id, label, placeholder, max, onAdd, onCancel }: {
  id: string; label: string; placeholder: string; max: number; onAdd: (v: string) => void; onCancel: () => void;
}) {
  const [text, setText] = useState('');
  const add = () => { const v = text.trim().replace(/\s+/g, ' '); if (v) onAdd(v); };
  return (
    <div className="mt-2 flex gap-2">
      <label htmlFor={id} className="sr-only">{label}</label>
      <input id={id} autoFocus value={text} maxLength={max} placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } if (e.key === 'Escape') onCancel(); }}
        className={inputCls} />
      <button type="button" onClick={add} disabled={!text.trim()}
        className="shrink-0 min-h-[44px] px-4 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-40">
        Add
      </button>
      <button type="button" onClick={onCancel} className="shrink-0 min-h-[44px] px-3 rounded-[10px] text-sm font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
        Cancel
      </button>
    </div>
  );
}

const dedupe = (xs: string[]) => Array.from(new Map(xs.filter((x) => x.trim()).map((x) => [x.trim().toLowerCase(), x.trim()])).values());

/**
 * Category: the standard list (grouped), the workspace's own categories from earlier jobs, and "+ Add your own".
 * A custom one is stored as category OTHER with its name in categoryLabel.
 */
export function CategorySelect({ id, category, categoryLabel, saved, onChange }: {
  id: string;
  category: string;
  categoryLabel: string;
  saved: string[];
  onChange: (category: string, categoryLabel: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [extra, setExtra] = useState<string[]>([]);
  const custom = useMemo(() => dedupe([...saved, ...extra, ...(category === 'OTHER' && categoryLabel ? [categoryLabel] : [])]), [saved, extra, category, categoryLabel]);
  const options: Option[] = useMemo(() => [
    ...JOB_CATEGORIES.filter((c) => c.value !== 'OTHER').map((c) => ({ value: c.value, label: c.label, group: c.group })),
    ...custom.map((c) => ({ value: CUSTOM_PREFIX + c, label: c, group: 'Your categories' })),
    { value: 'OTHER', label: 'Other', group: 'Other' },
  ], [custom]);
  const value = category === 'OTHER' && categoryLabel ? CUSTOM_PREFIX + categoryLabel : category;

  return (
    <div>
      <Dropdown id={id} value={value} options={options} searchPlaceholder="Search categories"
        onSelect={(v) => (v.startsWith(CUSTOM_PREFIX) ? onChange('OTHER', v.slice(CUSTOM_PREFIX.length)) : onChange(v, ''))}
        action={{ label: 'Add your own category', onClick: () => setAdding(true) }} />
      {adding && (
        <AddRow id={`${id}-new`} label="New category name" placeholder="e.g. Hardware Engineer" max={60}
          onAdd={(v) => { setExtra((x) => [...x, v]); setAdding(false); onChange('OTHER', v); }}
          onCancel={() => setAdding(false)} />
      )}
    </div>
  );
}

/** Team: common teams plus this workspace's own (from earlier jobs), "No team", and "+ Add a team". */
export function TeamSelect({ id, value, saved, onChange }: {
  id: string;
  value: string;
  saved: string[];
  onChange: (team: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [extra, setExtra] = useState<string[]>([]);
  const own = useMemo(
    () => dedupe([...saved, ...extra, ...(value ? [value] : [])]).filter((t) => !(DEFAULT_TEAMS as readonly string[]).some((d) => d.toLowerCase() === t.toLowerCase())),
    [saved, extra, value],
  );
  const options: Option[] = useMemo(() => [
    { value: '', label: 'No team' },
    ...DEFAULT_TEAMS.map((t) => ({ value: t, label: t, group: 'Common teams' })),
    ...own.map((t) => ({ value: t, label: t, group: 'Your teams' })),
  ], [own]);

  return (
    <div>
      <Dropdown id={id} value={value} options={options} placeholder="No team" searchPlaceholder="Search teams"
        onSelect={onChange} action={{ label: 'Add a team', onClick: () => setAdding(true) }} />
      {adding && (
        <AddRow id={`${id}-new`} label="New team name" placeholder="e.g. Platform" max={80}
          onAdd={(v) => { setExtra((x) => [...x, v]); setAdding(false); onChange(v); }}
          onCancel={() => setAdding(false)} />
      )}
    </div>
  );
}
