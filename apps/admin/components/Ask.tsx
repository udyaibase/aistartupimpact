'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Questions asked from anywhere in the admin, in place of the browser's confirm() and prompt():
 *
 *   if (!(await ask({ title: 'Delete announcement', message: '…', danger: true }))) return;
 *   const reason = await askText({ title: 'Suspend host', message: '…', label: 'Reason', required: true });
 *
 * They match the admin's look, name what will happen on the button, trap focus, and close on Escape.
 * <AskHost /> is mounted once in the root layout.
 */
interface AskOptions {
  title: string;
  message?: string;
  /** What the confirm button says: the action, not "OK". */
  confirmLabel?: string;
  /** Red confirm button, for deleting or anything that can't be undone. */
  danger?: boolean;
}
interface AskTextOptions extends AskOptions {
  label: string;
  placeholder?: string;
  /** Empty text can't be submitted. */
  required?: boolean;
  multiline?: boolean;
}
type Pending =
  | ({ kind: 'confirm'; resolve: (v: boolean) => void } & AskOptions)
  | ({ kind: 'text'; resolve: (v: string | null) => void } & AskTextOptions);

let open: ((p: Pending) => void) | null = null;

/** Resolves true when confirmed, false when cancelled or dismissed. */
export function ask(options: AskOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (open) open({ kind: 'confirm', resolve, ...options });
    else resolve(typeof window !== 'undefined' ? window.confirm(options.message ?? options.title) : false); // no host mounted
  });
}

/** Resolves the text typed (trimmed, possibly empty when not required), or null when cancelled. */
export function askText(options: AskTextOptions): Promise<string | null> {
  return new Promise((resolve) => {
    if (open) open({ kind: 'text', resolve, ...options });
    else resolve(typeof window !== 'undefined' ? window.prompt(options.message ?? options.title) : null);
  });
}

export function AskHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [text, setText] = useState('');
  const boxRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    open = (p) => { setText(''); setPending(p); };
    return () => { open = null; };
  }, []);

  useEffect(() => {
    if (!pending) return;
    const previous = document.activeElement as HTMLElement | null;
    const first = boxRef.current?.querySelector<HTMLElement>('[data-autofocus]');
    first?.focus();
    return () => previous?.focus?.();
  }, [pending]);

  if (!pending) return null;

  const finish = (confirmed: boolean) => {
    if (pending.kind === 'confirm') pending.resolve(confirmed);
    else pending.resolve(confirmed ? text.trim() : null);
    setPending(null);
  };
  const needsText = pending.kind === 'text' && pending.required && !text.trim();

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    if (e.key !== 'Tab') return;
    const items = Array.from(boxRef.current?.querySelectorAll<HTMLElement>('button, input, textarea') ?? []).filter((el) => !el.hasAttribute('disabled'));
    if (items.length === 0) return;
    const firstEl = items[0], lastEl = items[items.length - 1];
    if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
    else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
  };

  const field = 'mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-white outline-none focus:border-brand focus:ring-1 focus:ring-brand';
  return (
    <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="ask-title" onKeyDown={onKeyDown}>
      <div className="absolute inset-0 bg-black/40" onClick={() => finish(false)} aria-hidden />
      <form ref={boxRef} onSubmit={(e) => { e.preventDefault(); if (!needsText) finish(true); }}
        className="relative w-full max-w-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-xl">
        <h2 id="ask-title" className="text-base font-semibold text-gray-900 dark:text-white">{pending.title}</h2>
        {pending.message && <p className="mt-1.5 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{pending.message}</p>}
        {pending.kind === 'text' && (
          <label className="block mt-3 text-sm font-medium text-gray-900 dark:text-white">
            {pending.label}{!pending.required && <span className="font-normal text-gray-600 dark:text-gray-400"> (optional)</span>}
            {pending.multiline
              ? <textarea data-autofocus rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={pending.placeholder} maxLength={1000} className={`${field} resize-none`} />
              : <input data-autofocus value={text} onChange={(e) => setText(e.target.value)} placeholder={pending.placeholder} maxLength={500} className={field} />}
          </label>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => finish(false)} {...(pending.kind === 'confirm' && pending.danger ? { 'data-autofocus': true } : {})}
            className="min-h-[38px] px-4 rounded-lg text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
          <button type="submit" disabled={needsText} {...(pending.kind === 'confirm' && !pending.danger ? { 'data-autofocus': true } : {})}
            className={`min-h-[38px] px-4 rounded-lg text-sm font-semibold disabled:opacity-50 ${pending.danger ? 'bg-red-700 hover:bg-red-800 text-white' : 'btn-brand'}`}>
            {pending.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </form>
    </div>
  );
}
