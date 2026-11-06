'use client';

import { useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';

type Option = { value: string; label: string };

export type FilterRow =
  /** Choose one. `value` of '' (or `defaultValue`) means nothing is filtered. */
  | { kind?: 'single'; key: string; label: string; options: Option[]; value: string; onChange: (v: string) => void; emptyLabel?: string; defaultValue?: string }
  /** Choose several: stays open while ticking. */
  | { kind: 'multi'; key: string; label: string; options: Option[]; values: string[]; onToggle: (v: string) => void }
  /** On or off, right in the list. */
  | { kind: 'toggle'; key: string; label: string; checked: boolean; onChange: (v: boolean) => void };

const SLIDE = 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)';
const ROW_PRESS = 'active:bg-gray-100 dark:active:bg-gray-800 transition-colors duration-150';

function summary(row: Exclude<FilterRow, { kind: 'toggle' }>): { text: string; on: boolean } {
  if (row.kind === 'multi') {
    if (row.values.length === 0) return { text: 'Any', on: false };
    if (row.values.length === 1) return { text: row.options.find(o => o.value === row.values[0])?.label ?? '1 selected', on: true };
    return { text: `${row.values.length} selected`, on: true };
  }
  const isDefault = row.value === (row.defaultValue ?? '');
  const chosen = row.options.find(o => o.value === row.value);
  if (isDefault) return { text: row.emptyLabel ?? (chosen?.value ? chosen.label : 'Any'), on: false };
  return { text: chosen?.label ?? 'Any', on: true };
}

/**
 * Phone filters, the way settings screens work: a short list of rows showing what's chosen. Tapping one slides in its
 * options; choosing one slides back. Only `transform` animates, so it stays smooth. Goes inside a `flush` BottomSheet.
 */
export default function FilterList({ rows, sheetOpen }: { rows: FilterRow[]; sheetOpen: boolean }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  // Kept while sliding back, so the options don't vanish halfway through the animation.
  const [shownKey, setShownKey] = useState<string | null>(null);
  useEffect(() => { if (!sheetOpen) { setOpenKey(null); setShownKey(null); } }, [sheetOpen]);
  const open = (key: string) => { setShownKey(key); setOpenKey(key); };
  const detail = rows.find(r => r.key === shownKey);

  return (
    <div className="relative h-[min(56dvh,460px)] overflow-hidden font-jakarta">
      <ul inert={!!openKey} className="absolute inset-0 overflow-y-auto overscroll-contain motion-reduce:!transition-none" style={{ transform: openKey ? 'translate3d(-28%, 0, 0)' : 'translate3d(0, 0, 0)', transition: SLIDE }}>
        {rows.map(row => (
          <li key={row.key} className="border-b border-gray-100 dark:border-gray-800 last:border-b-0">
            {row.kind === 'toggle' ? (
              <button type="button" role="switch" aria-checked={row.checked} onClick={() => row.onChange(!row.checked)} className={`w-full min-h-[52px] pl-4 pr-4 flex items-center justify-between gap-3 text-left ${ROW_PRESS}`}>
                <span className="text-[15px] text-gray-900 dark:text-white">{row.label}</span>
                <span aria-hidden className={`relative shrink-0 w-11 h-[26px] rounded-full transition-colors duration-200 ${row.checked ? 'bg-brand' : 'bg-gray-300 dark:bg-gray-600'}`}>
                  <span className={`absolute top-[3px] left-[3px] w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 motion-reduce:transition-none ${row.checked ? 'translate-x-[18px]' : ''}`} />
                </span>
              </button>
            ) : (() => {
              const s = summary(row);
              return (
                <button type="button" onClick={() => open(row.key)} className={`w-full min-h-[52px] pl-4 pr-3 flex items-center gap-3 text-left ${ROW_PRESS}`}>
                  <span className="shrink-0 text-[15px] text-gray-900 dark:text-white">{row.label}</span>
                  <span className={`flex-1 min-w-0 text-right text-sm truncate ${s.on ? 'font-medium text-brand' : 'text-gray-500 dark:text-gray-400'}`}>{s.text}</span>
                  <ChevronRight className="shrink-0 w-4 h-4 text-gray-400" aria-hidden />
                </button>
              );
            })()}
          </li>
        ))}
      </ul>

      <div inert={!openKey} onTransitionEnd={(e) => { if (!openKey && e.target === e.currentTarget) setShownKey(null); }}
        className="absolute inset-0 flex flex-col bg-white dark:bg-gray-900 motion-reduce:!transition-none"
        style={{ transform: openKey ? 'translate3d(0, 0, 0)' : 'translate3d(100%, 0, 0)', transition: SLIDE }}>
        {detail && detail.kind !== 'toggle' && (
          <>
            <button type="button" onClick={() => setOpenKey(null)} className={`shrink-0 w-full min-h-[48px] px-2 flex items-center gap-1 border-b border-gray-100 dark:border-gray-800 text-[15px] font-semibold text-gray-900 dark:text-white ${ROW_PRESS}`}>
              <ChevronLeft className="w-5 h-5 text-gray-500" aria-hidden /> {detail.label}
            </button>
            <div role={detail.kind === 'multi' ? 'group' : 'radiogroup'} aria-label={detail.label} className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
              {detail.options.map(o => {
                const on = detail.kind === 'multi' ? detail.values.includes(o.value) : detail.value === o.value;
                return (
                  <button key={o.value || 'any'} type="button"
                    {...(detail.kind === 'multi' ? { role: 'checkbox' } : { role: 'radio' })} aria-checked={on}
                    onClick={() => {
                      if (detail.kind === 'multi') { detail.onToggle(o.value); return; }
                      detail.onChange(o.value);
                      setOpenKey(null);
                    }}
                    className={`w-full min-h-[48px] px-4 flex items-center justify-between gap-3 text-left text-[15px] border-b border-gray-100 dark:border-gray-800 last:border-b-0 ${ROW_PRESS} ${on ? 'font-medium text-brand' : 'text-gray-800 dark:text-gray-200'}`}>
                    <span className="min-w-0 truncate">{o.label}</span>
                    {on && <Check className="shrink-0 w-[18px] h-[18px]" aria-hidden />}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
