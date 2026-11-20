'use client';

import { useEffect, useRef } from 'react';

/**
 * A one-time code as separate boxes (6 by default). Typing moves to the next box, Backspace goes back, arrows move,
 * and pasting or the phone's "from Messages/Mail" autofill fills every box at once. When all boxes are filled they
 * turn green with a small pop; `invalid` turns them red with a shake (e.g. after a wrong code).
 * `onComplete` fires once the last digit is entered (for auto-submit).
 * Standard square boxes, the same size everywhere: 40px on phones, 44px from `sm` up (the height of other inputs).
 */
export default function CodeInput({
  value, onChange, onComplete, length = 6, autoFocus = false, disabled = false, invalid = false, id, label = 'Verification code', align = 'center',
}: {
  /** Centered by default; 'start' lines the boxes up with left-aligned fields. */
  align?: 'start' | 'center';
  value: string; onChange: (v: string) => void; onComplete?: (v: string) => void;
  length?: number; autoFocus?: boolean; disabled?: boolean; invalid?: boolean; id?: string; label?: string;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');
  const complete = value.length === length && !invalid;
  const lastFired = useRef('');

  useEffect(() => { if (autoFocus) refs.current[0]?.focus(); }, [autoFocus]);
  // Fire onComplete once per finished code (not again on re-renders with the same code).
  useEffect(() => {
    if (value.length === length && value !== lastFired.current) { lastFired.current = value; onComplete?.(value); }
    if (value.length < length) lastFired.current = '';
  }, [value, length, onComplete]);
  // A wrong code: clear focus to the first box so they can type it again.
  useEffect(() => { if (invalid) refs.current[0]?.focus(); }, [invalid]);

  // Moving to a box selects its digit (typing replaces it); at the end of a finished code the cursor just sits after it.
  const focusBox = (i: number, select = true) => {
    const el = refs.current[Math.max(0, Math.min(length - 1, i))];
    if (!el) return;
    el.focus();
    if (select) el.select(); else requestAnimationFrame(() => el.setSelectionRange(el.value.length, el.value.length));
  };

  // Put `text` (one or more digits) into the boxes starting at `from`.
  const fill = (from: number, text: string) => {
    const clean = text.replace(/\D/g, '');
    if (!clean) return;
    const next = digits.slice();
    let i = from;
    for (const ch of clean) { if (i >= length) break; next[i++] = ch; }
    onChange(next.join('').slice(0, length));
    if (i >= length) focusBox(length - 1, false); else focusBox(i);
  };

  return (
    <div role="group" aria-label={label} className={`flex gap-2 ${align === 'center' ? 'justify-center' : 'justify-start'} ${invalid ? 'code-row-error' : ''}`}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          id={i === 0 ? id : undefined}
          aria-label={`Digit ${i + 1} of ${length}`}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          pattern="[0-9]*"
          maxLength={i === 0 ? length : 1}
          disabled={disabled}
          value={d}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) { const next = digits.slice(); next[i] = ''; onChange(next.join('')); return; }
            fill(i, v.length > 1 ? v : v.slice(-1));
          }}
          onPaste={(e) => { e.preventDefault(); fill(i, e.clipboardData.getData('text')); }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !digits[i] && i > 0) {
              e.preventDefault();
              const next = digits.slice(); next[i - 1] = ''; onChange(next.join(''));
              focusBox(i - 1);
            } else if (e.key === 'ArrowLeft') { e.preventDefault(); focusBox(i - 1); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); focusBox(i + 1); }
          }}
          style={complete ? { animationDelay: `${i * 45}ms` } : undefined}
          className={`shrink-0 w-10 h-10 sm:w-11 sm:h-11 p-0 text-center text-lg font-semibold tabular-nums rounded-md border outline-none transition-colors duration-200 ${complete ? '' : 'disabled:opacity-60'}
            ${invalid
              ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
              : complete
                ? 'code-box-done border-green-600 bg-green-50 text-green-800 dark:border-green-500 dark:bg-green-950/40 dark:text-green-300 focus:ring-2 focus:ring-green-600/20'
                : `${d ? 'border-gray-400 dark:border-gray-500' : 'border-gray-300 dark:border-gray-700'} bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-gray-900 dark:focus:border-white focus:ring-2 focus:ring-gray-900/10 dark:focus:ring-white/20`}`}
        />
      ))}
    </div>
  );
}
