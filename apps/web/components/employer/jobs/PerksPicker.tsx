'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Plus, X } from 'lucide-react';
import { MAX_PERK_LENGTH, MAX_PERKS, PERK_OPTIONS, cleanPerks } from '@/lib/jobs/perks';

/**
 * Company perks, picked with tick boxes plus your own. They belong to the company (every job and the careers page
 * show them), so changes save straight away. Teammates who can't edit the company see them read-only.
 */
export default function PerksPicker({ initial, canEdit, onChange }: {
  initial: string[];
  canEdit: boolean;
  onChange?: (perks: string[]) => void;
}) {
  const [perks, setPerks] = useState<string[]>(cleanPerks(initial));
  const [custom, setCustom] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');
  const pending = useRef<string[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Options: the common ones, then any of the company's own that aren't in that list.
  const common = PERK_OPTIONS as readonly string[];
  const own = perks.filter((p) => !common.some((c) => c.toLowerCase() === p.toLowerCase()));
  const has = (p: string) => perks.some((x) => x.toLowerCase() === p.toLowerCase());

  async function save(next: string[]) {
    setState('saving');
    setError('');
    try {
      const res = await fetch('/api/employer/company', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_perks', perks: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setState('error'); setError(data.error || 'Couldn’t save perks.'); return; }
      setState('saved');
    } catch {
      setState('error');
      setError('You seem to be offline. Your perks will save when you’re back.');
    }
  }

  // Quick ticks are batched into one save shortly after the last change.
  function commit(next: string[]) {
    const clean = cleanPerks(next);
    setPerks(clean);
    onChange?.(clean);
    pending.current = clean;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { if (pending.current) save(pending.current); pending.current = null; }, 600);
  }

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (pending.current) {
      // Leaving the page mid-batch: still send it.
      fetch('/api/employer/company', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set_perks', perks: pending.current }), keepalive: true }).catch(() => {});
    }
  }, []);

  const toggle = (p: string) => commit(has(p) ? perks.filter((x) => x.toLowerCase() !== p.toLowerCase()) : [...perks, p]);
  const addCustom = () => {
    const v = custom.trim().replace(/\s+/g, ' ');
    if (!v) return;
    if (!has(v)) commit([...perks, v]);
    setCustom('');
  };
  const atMax = perks.length >= MAX_PERKS;

  const chip = (p: string, removable = false) => {
    const on = has(p);
    return (
      <button key={p} type="button" role="checkbox" aria-checked={on} disabled={!canEdit || (!on && atMax)}
        onClick={() => toggle(p)}
        className={`inline-flex items-center gap-1.5 min-h-[36px] px-2.5 rounded-[8px] border text-[13px] sm:text-sm font-medium transition-colors disabled:cursor-default ${
          on
            ? 'border-brand bg-brand/5 text-brand'
            : 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-400 disabled:opacity-50'
        }`}>
        <span className={`inline-flex items-center justify-center w-4 h-4 rounded-[4px] border ${on ? 'bg-brand border-brand text-white' : 'border-gray-400 dark:border-gray-600'}`} aria-hidden>
          {on && <Check className="w-3 h-3" strokeWidth={3} />}
        </span>
        {p}
        {removable && canEdit && <X className="w-3.5 h-3.5 opacity-60" aria-hidden />}
      </button>
    );
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 sm:gap-2" role="group" aria-label="Perks">
        {common.map((p) => chip(p))}
        {own.map((p) => chip(p, true))}
      </div>

      {canEdit && (
        <div className="mt-3 flex gap-2 sm:max-w-md">
          <label htmlFor="perk-custom" className="sr-only">Add your own perk</label>
          <input id="perk-custom" value={custom} maxLength={MAX_PERK_LENGTH} disabled={atMax}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
            placeholder={atMax ? `Up to ${MAX_PERKS} perks` : 'Add your own, e.g. Free coworking passes'}
            className="w-full min-h-[44px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand disabled:opacity-50" />
          <button type="button" onClick={addCustom} disabled={!custom.trim() || atMax}
            className="shrink-0 inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40">
            <Plus className="w-4 h-4" aria-hidden /> Add
          </button>
        </div>
      )}

      <p className="mt-2 text-[13px] text-gray-500 dark:text-gray-400" aria-live="polite">
        {!canEdit
          ? 'Company perks are set by a workspace owner.'
          : state === 'saving' ? <span className="inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" aria-hidden /> Saving…</span>
          : state === 'error' ? <span className="text-red-700 dark:text-red-400">{error}</span>
          : state === 'saved' ? 'Saved. Shown on all your jobs and your careers page.'
          : `Shown on all your jobs and your careers page. ${perks.length}/${MAX_PERKS} selected.`}
      </p>
    </div>
  );
}
