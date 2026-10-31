'use client';

import { useId, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

export const inputCls =
  'w-full min-h-[44px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand aria-[invalid=true]:border-red-600 disabled:bg-gray-50 disabled:text-gray-500 dark:disabled:bg-gray-800';

export function Card({ id, title, hint, children }: { id?: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] p-4 sm:p-5 scroll-mt-4">
      <h2 id={id ? `${id}-title` : undefined} className="portal-section-title">{title}</h2>
      {hint && <p className="text-[13px] text-gray-600 dark:text-gray-400 mt-0.5">{hint}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export function Field({
  label, hint, error, optional, htmlFor, children,
}: { label: string; hint?: string; error?: string; optional?: boolean; htmlFor: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-gray-900 dark:text-white mb-1.5">
        {label}{optional && <span className="font-normal text-gray-500"> (optional)</span>}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="mt-1.5 text-[13px] text-red-700 dark:text-red-400">{error}</p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="mt-1.5 text-[13px] text-gray-500 dark:text-gray-400">{hint}</p>
      ) : null}
    </div>
  );
}

/** Accessible single-choice button group (radio semantics). */
export function Segmented<T extends string>({
  label, value, options, onChange,
}: { label: string; value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void }) {
  const name = useId();
  return (
    <fieldset>
      <legend className="block text-sm font-semibold text-gray-900 dark:text-white mb-1.5">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value}
            className={`inline-flex items-center min-h-[40px] px-3.5 rounded-[10px] border text-sm font-medium cursor-pointer transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40 ${
              value === o.value
                ? 'border-brand bg-brand/5 text-brand'
                : 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-400'
            }`}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Toggle({ id, label, hint, checked, disabled, onChange }: {
  id: string; label: ReactNode; hint?: ReactNode; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label htmlFor={id} className={`flex items-start gap-3 ${disabled ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}>
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-5 h-5 rounded border-gray-300 text-brand focus:ring-brand/30 shrink-0" />
      <span>
        <span className="block text-sm font-medium text-gray-900 dark:text-white">{label}</span>
        {hint && <span className="block text-[13px] text-gray-500 dark:text-gray-400">{hint}</span>}
      </span>
    </label>
  );
}

/** Tag input: Enter or comma adds, Backspace on empty removes the last tag. */
export function TagInput({ id, tags, max, placeholder, onChange, suggestions = [] }: {
  id: string; tags: string[]; max: number; placeholder?: string; onChange: (t: string[]) => void; suggestions?: string[];
}) {
  const [text, setText] = useState('');
  const add = (raw: string) => {
    const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
    const next = [...tags];
    for (const p of parts) if (next.length < max && !next.some((t) => t.toLowerCase() === p.toLowerCase())) next.push(p.slice(0, 40));
    onChange(next);
    setText('');
  };
  const unused = suggestions.filter((s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase())).slice(0, 6);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 p-1.5 min-h-[44px] rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 focus-within:ring-2 focus-within:ring-brand/25 focus-within:border-brand">
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 pl-2.5 pr-1 h-8 rounded-[8px] bg-gray-100 dark:bg-gray-800 text-[13px] font-medium text-gray-800 dark:text-gray-200">
            {t}
            <button type="button" onClick={() => onChange(tags.filter((x) => x !== t))} aria-label={`Remove ${t}`}
              className="w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:text-gray-900 hover:bg-gray-200 dark:hover:bg-gray-700">
              <X className="w-3.5 h-3.5" aria-hidden />
            </button>
          </span>
        ))}
        {tags.length < max && (
          <input id={id} value={text} placeholder={tags.length ? '' : placeholder}
            onChange={(e) => (e.target.value.includes(',') ? add(e.target.value) : setText(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); if (text.trim()) add(text); }
              else if (e.key === 'Backspace' && !text && tags.length) onChange(tags.slice(0, -1));
            }}
            onBlur={() => text.trim() && add(text)}
            enterKeyHint="done"
            className="flex-1 min-w-[120px] h-8 px-1.5 bg-transparent text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none" />
        )}
      </div>
      {unused.length > 0 && tags.length < max && (
        <div className="flex flex-wrap gap-1.5 mt-2" aria-label="Suggested skills">
          {unused.map((s) => (
            <button key={s} type="button" onClick={() => add(s)}
              className="h-8 px-2.5 rounded-[8px] border border-dashed border-gray-300 dark:border-gray-700 text-[13px] text-gray-700 dark:text-gray-300 hover:border-brand hover:text-brand">
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
