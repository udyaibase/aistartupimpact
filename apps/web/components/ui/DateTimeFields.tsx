'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from 'lucide-react';

/**
 * A date picker and a time picker for forms. They replace the browser's own date and time boxes, which look
 * different in every browser and are slow to use: here a date is one tap on a calendar (with shortcuts such as
 * "Tomorrow" and "This Saturday"), and a time is one tap in a list or a few typed characters ("6:30 pm").
 *
 * Values are the same strings the old boxes used, so nothing else in a form changes: dates "YYYY-MM-DD", times
 * "HH:MM" on a 24-hour clock. Both work with the keyboard alone and announce themselves to screen readers.
 */

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** A calendar date at local midnight; null for anything that isn't YYYY-MM-DD. */
export function parseDate(value: string | undefined | null): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getMonth() === Number(m[2]) - 1 ? d : null;
}
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const sameDay = (a: Date | null, b: Date | null) => !!a && !!b && iso(a) === iso(b);

/** "Sat, 28 Nov 2026" */
export function formatDateLabel(value: string): string {
  const d = parseDate(value);
  return d ? d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

/** "6:30 PM" from "18:30"; "" when not a time. */
export function formatTimeLabel(value: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value ?? '');
  if (!m) return '';
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

/** What someone types into a time box, as "HH:MM": "6", "6pm", "6:30 pm", "18.30", "1830", "noon". Null if unclear. */
export function parseTimeInput(input: string): string | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return null;
  if (s === 'noon') return '12:00';
  if (s === 'midnight') return '00:00';
  const m = /^(\d{1,2})(?:[:.]?(\d{2}))?(a|am|p|pm)?$/.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const half = m[3]?.[0];
  if (min > 59) return null;
  if (half) {
    if (h < 1 || h > 12) return null;
    if (half === 'p' && h < 12) h += 12;
    if (half === 'a' && h === 12) h = 0;
  } else if (h > 23) return null;
  return `${pad(h)}:${pad(min)}`;
}

/** "3 hours", "1 hour 30 minutes", "2 days". Empty when the end isn't after the start. */
export function durationLabel(startDate: string, startTime: string, endDate: string, endTime: string): string {
  const a = parseDate(startDate), b = parseDate(endDate || startDate);
  const t1 = /^(\d{2}):(\d{2})$/.exec(startTime), t2 = /^(\d{2}):(\d{2})$/.exec(endTime);
  if (!a || !b || !t1 || !t2) return '';
  const minutes = Math.round((b.getTime() - a.getTime()) / 60000) + (Number(t2[1]) * 60 + Number(t2[2])) - (Number(t1[1]) * 60 + Number(t1[2]));
  if (minutes <= 0) return '';
  const days = Math.floor(minutes / 1440), hours = Math.floor((minutes % 1440) / 60), mins = minutes % 60;
  const part = (n: number, unit: string) => (n ? `${n} ${unit}${n === 1 ? '' : 's'}` : '');
  return [part(days, 'day'), part(hours, 'hour'), part(mins, 'minute')].filter(Boolean).join(' ');
}

/** Add minutes to a time on the same day; null if it would pass midnight. */
export function addMinutes(time: string, minutes: number): string | null {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) return null;
  const total = Number(m[1]) * 60 + Number(m[2]) + minutes;
  return total >= 0 && total < 1440 ? `${pad(Math.floor(total / 60))}:${pad(total % 60)}` : null;
}

const field = 'w-full min-h-[44px] px-3.5 rounded-md border bg-white dark:bg-gray-900 text-sm font-jakarta text-left flex items-center gap-2.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30';
const popover = 'absolute z-30 mt-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl shadow-gray-900/10';

/** Closes a popover on a click outside it or on Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, close]);
  return ref;
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export function DateField({ value, onChange, min, label, invalid, placeholder = 'Choose a date' }: {
  value: string;
  onChange: (value: string) => void;
  /** Earliest date allowed, "YYYY-MM-DD". Earlier days are shown but can't be chosen. */
  min?: string;
  label: string;
  invalid?: boolean;
  placeholder?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const selected = parseDate(value);
  const minDate = parseDate(min);
  const today = useMemo(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }, []);
  const [cursor, setCursor] = useState<Date>(selected ?? today); // the day the keyboard is on; its month is shown
  const ref = useDismiss(open, () => setOpen(false));
  const gridRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { if (open) setCursor(selected ?? (minDate && minDate > today ? minDate : today)); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) gridRef.current?.querySelector<HTMLButtonElement>('[data-cursor="true"]')?.focus(); }, [open, cursor]);

  const tooEarly = (d: Date) => !!minDate && d < minDate;
  const choose = (d: Date) => { if (tooEarly(d)) return; onChange(iso(d)); setOpen(false); buttonRef.current?.focus(); };

  // Six weeks, Monday first, covering the cursor's month.
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = addDays(first, -((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  const nextSaturday = addDays(today, ((6 - today.getDay() + 7) % 7) || 7);
  const shortcuts: [string, Date][] = [['Today', today], ['Tomorrow', addDays(today, 1)], ['This Saturday', nextSaturday], ['In a week', addDays(today, 7)], ['In a month', new Date(today.getFullYear(), today.getMonth() + 1, today.getDate())]];

  const onGridKey = (e: React.KeyboardEvent) => {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in step) { e.preventDefault(); setCursor((c) => addDays(c, step[e.key])); }
    else if (e.key === 'PageUp') { e.preventDefault(); setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, c.getDate())); }
    else if (e.key === 'PageDown') { e.preventDefault(); setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, c.getDate())); }
    else if (e.key === 'Home') { e.preventDefault(); setCursor((c) => addDays(c, -((c.getDay() + 6) % 7))); }
    else if (e.key === 'End') { e.preventDefault(); setCursor((c) => addDays(c, 6 - ((c.getDay() + 6) % 7))); }
  };

  return (
    <div ref={ref} className="relative">
      <button ref={buttonRef} type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls={`${id}-cal`}
        aria-label={`${label}: ${selected ? formatDateLabel(value) : 'not set'}${invalid ? ', needs fixing' : ''}. Choose a date`}
        onClick={() => setOpen((o) => !o)}
        className={`${field} ${invalid ? 'border-red-400' : open ? 'border-brand ring-2 ring-brand/20' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}>
        <CalendarDays className="w-4 h-4 text-brand shrink-0" aria-hidden />
        <span className={selected ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-400'}>{selected ? formatDateLabel(value) : placeholder}</span>
      </button>

      {open && (
        <div id={`${id}-cal`} role="dialog" aria-label={`${label}: choose a date`} className={`${popover} left-0 w-[19.5rem] max-w-[calc(100vw-2rem)] p-3`}>
          <div className="flex items-center justify-between mb-2">
            <button type="button" aria-label="Previous month" onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))} className="w-9 h-9 grid place-items-center rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"><ChevronLeft className="w-4 h-4" aria-hidden /></button>
            <p aria-live="polite" className="text-sm font-semibold text-gray-900 dark:text-white font-jakarta">{cursor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</p>
            <button type="button" aria-label="Next month" onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))} className="w-9 h-9 grid place-items-center rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"><ChevronRight className="w-4 h-4" aria-hidden /></button>
          </div>
          <div className="grid grid-cols-7 text-center" aria-hidden>
            {WEEKDAYS.map((d) => <span key={d} className="h-7 text-[11px] font-semibold text-gray-400 font-jakarta">{d}</span>)}
          </div>
          <div ref={gridRef} role="grid" aria-label={cursor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} onKeyDown={onGridKey} className="grid grid-cols-7 gap-y-0.5">
            {days.map((d) => {
              const inMonth = d.getMonth() === cursor.getMonth();
              const isSelected = sameDay(d, selected);
              const isToday = sameDay(d, today);
              const off = tooEarly(d);
              return (
                <button key={iso(d)} type="button" role="gridcell" tabIndex={sameDay(d, cursor) ? 0 : -1} data-cursor={sameDay(d, cursor)} disabled={off}
                  aria-selected={isSelected} aria-current={isToday ? 'date' : undefined}
                  aria-label={d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  onClick={() => choose(d)}
                  className={`h-9 w-9 mx-auto rounded-full text-sm font-jakarta transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${
                    isSelected ? 'bg-brand text-white font-semibold'
                      : off ? 'text-gray-300 dark:text-gray-700 cursor-not-allowed'
                      : `${inMonth ? 'text-gray-800 dark:text-gray-100' : 'text-gray-400 dark:text-gray-600'} hover:bg-gray-100 dark:hover:bg-gray-800 ${isToday ? 'ring-1 ring-inset ring-brand/50 font-semibold' : ''}`}`}>
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800 flex flex-wrap gap-1.5">
            {shortcuts.filter(([, d]) => !tooEarly(d)).map(([name, d]) => (
              <button key={name} type="button" onClick={() => choose(d)} className="h-8 px-2.5 rounded-full border border-gray-200 dark:border-gray-700 text-xs font-medium font-jakarta text-gray-700 dark:text-gray-200 hover:border-brand hover:text-brand">{name}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function TimeField({ value, onChange, label, invalid, step = 15, after, placeholder = 'Choose a time' }: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  invalid?: boolean;
  /** Minutes between the times in the list. Any time can still be typed. */
  step?: number;
  /** A start time, "HH:MM": each later time in the list then shows how long after it is ("2 hours"). */
  after?: string;
  placeholder?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [unclear, setUnclear] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const times = useMemo(() => Array.from({ length: Math.floor(1440 / step) }, (_, i) => `${pad(Math.floor((i * step) / 60))}:${pad((i * step) % 60)}`), [step]);

  useEffect(() => {
    if (!open) return;
    setTyped(''); setUnclear(false);
    inputRef.current?.focus();
    // Bring the chosen time (or a sensible morning hour) into view, not midnight.
    const target = listRef.current?.querySelector<HTMLElement>(`[data-time="${value || '10:00'}"]`) ?? listRef.current?.querySelector<HTMLElement>(`[data-time="${(value || '10:00').slice(0, 2)}:00"]`);
    if (target && listRef.current) listRef.current.scrollTop = target.offsetTop - listRef.current.clientHeight / 2 + target.clientHeight / 2;
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (t: string) => { onChange(t); setOpen(false); buttonRef.current?.focus(); };
  const gap = (t: string) => {
    if (!after) return '';
    const a = /^(\d{2}):(\d{2})$/.exec(after), b = /^(\d{2}):(\d{2})$/.exec(t);
    if (!a || !b) return '';
    const minutes = Number(b[1]) * 60 + Number(b[2]) - (Number(a[1]) * 60 + Number(a[2]));
    if (minutes <= 0) return '';
    return minutes < 60 ? `${minutes} min` : `${minutes % 60 ? (minutes / 60).toFixed(1).replace(/\.0$/, '') : minutes / 60} hr${minutes === 60 ? '' : 's'}`;
  };

  return (
    <div ref={ref} className="relative">
      <button ref={buttonRef} type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls={`${id}-times`}
        aria-label={`${label}: ${value ? formatTimeLabel(value) : 'not set'}${invalid ? ', needs fixing' : ''}. Choose a time`}
        onClick={() => setOpen((o) => !o)}
        className={`${field} ${invalid ? 'border-red-400' : open ? 'border-brand ring-2 ring-brand/20' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}>
        <Clock className="w-4 h-4 text-brand shrink-0" aria-hidden />
        <span className={value ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-400'}>{value ? formatTimeLabel(value) : placeholder}</span>
      </button>

      {open && (
        <div id={`${id}-times`} role="dialog" aria-label={`${label}: choose a time`} className={`${popover} left-0 w-56 max-w-[calc(100vw-2rem)] p-2`}>
          {/* Not a <form>: this sits inside other forms, and Enter here must choose a time, not submit them. */}
          <div>
            <label htmlFor={`${id}-type`} className="sr-only">Type a time, for example 6:30 pm</label>
            <input ref={inputRef} id={`${id}-type`} value={typed} onChange={(e) => { setTyped(e.target.value); setUnclear(false); }} inputMode="text" autoComplete="off" placeholder="Type, e.g. 6:30 pm"
              onKeyDown={(e) => { if (e.key !== 'Enter') return; e.preventDefault(); e.stopPropagation(); const t = parseTimeInput(typed); if (t) choose(t); else setUnclear(true); }}
              aria-invalid={unclear || undefined} aria-describedby={unclear ? `${id}-unclear` : undefined}
              className={`w-full h-10 px-3 rounded-lg border text-sm font-jakarta bg-white dark:bg-gray-950 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand/30 ${unclear ? 'border-red-400' : 'border-gray-200 dark:border-gray-700'}`} />
            {unclear && <p id={`${id}-unclear`} role="alert" className="mt-1 px-1 text-xs text-red-600">Try a time like 6:30 pm or 18:30.</p>}
          </div>
          <ul ref={listRef} role="listbox" aria-label={label} className="relative mt-2 max-h-56 overflow-y-auto overscroll-contain pr-1">
            {times.filter((t) => !typed.trim() || formatTimeLabel(t).toLowerCase().replace(/\s/g, '').startsWith(typed.trim().toLowerCase().replace(/\s/g, '')) || t.startsWith(typed.trim())).map((t) => (
              <li key={t} role="option" aria-selected={t === value}>
                <button type="button" data-time={t} onClick={() => choose(t)}
                  className={`w-full h-9 px-3 rounded-lg flex items-center justify-between text-sm font-jakarta focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${t === value ? 'bg-brand text-white font-semibold' : 'text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                  <span>{formatTimeLabel(t)}</span>
                  {gap(t) && <span className={`text-xs ${t === value ? 'text-white/80' : 'text-gray-400'}`}>{gap(t)}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
