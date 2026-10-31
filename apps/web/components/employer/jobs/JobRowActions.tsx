'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, Loader2 } from 'lucide-react';

type Status = 'DRAFT' | 'OPEN' | 'PAUSED' | 'CLOSED';

interface Item { key: string; label: string; danger?: boolean; confirm?: string }

function itemsFor(status: Status, renewable: boolean): Item[] {
  const items: Item[] = [];
  if (status === 'DRAFT') items.push({ key: 'publish', label: 'Publish' });
  if (status === 'OPEN') items.push({ key: 'pause', label: 'Pause — hide without closing' });
  if (status === 'PAUSED') items.push({ key: 'resume', label: 'Resume' });
  if (status === 'CLOSED') items.push({ key: 'renew', label: 'Reopen for 30 days' });
  if (renewable && status !== 'CLOSED' && status !== 'DRAFT') items.push({ key: 'renew', label: 'Renew for 30 days' });
  items.push({ key: 'duplicate', label: 'Duplicate' });
  if (status === 'OPEN' || status === 'PAUSED') {
    items.push({ key: 'close-filled', label: 'Close — position filled', confirm: 'Close this job as filled? It stops accepting applications.' });
    items.push({ key: 'close', label: 'Close — no longer hiring', confirm: 'Close this job? It stops accepting applications.' });
  }
  if (status === 'DRAFT' || status === 'CLOSED') items.push({ key: 'delete', label: 'Delete', danger: true, confirm: 'Delete this job permanently from your list? Candidates who applied stay in your records.' });
  return items;
}

export default function JobRowActions({ jobId, title, status, renewable }: { jobId: string; title: string; status: Status; renewable: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState<Item | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);

  async function run(item: Item) {
    setOpen(false);
    setConfirming(null);
    setBusy(true);
    setError('');
    try {
      let res: Response;
      if (item.key === 'duplicate') {
        res = await fetch('/api/employer/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ duplicateOf: jobId }) });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.job?.id) { router.push(`/employer/jobs/${data.job.id}/edit`); return; }
        setError(data.error || 'Couldn’t duplicate.');
      } else if (item.key === 'delete') {
        res = await fetch(`/api/employer/jobs/${jobId}`, { method: 'DELETE' });
        if (res.ok) router.refresh(); else setError('Couldn’t delete.');
      } else {
        const action = item.key.startsWith('close') ? 'close' : item.key;
        res = await fetch(`/api/employer/jobs/${jobId}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, reason: item.key === 'close-filled' ? 'FILLED' : undefined }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) router.refresh();
        else if (data.field && item.key === 'publish') router.push(`/employer/jobs/${jobId}/edit`);
        else setError(data.error || 'Something went wrong.');
      }
    } catch {
      setError('You seem to be offline.');
    }
    setBusy(false);
  }

  const items = itemsFor(status, renewable);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={`Actions for ${title}`}
        className="w-10 h-10 flex items-center justify-center rounded-[10px] text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <MoreHorizontal className="w-5 h-5" aria-hidden />}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1 w-60 z-30 py-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[12px] shadow-lg">
          {items.map((it) => (
            <button key={it.key} role="menuitem" type="button" onClick={() => (it.confirm ? (setOpen(false), setConfirming(it)) : run(it))}
              className={`w-full text-left px-3.5 min-h-[40px] text-sm hover:bg-gray-50 dark:hover:bg-gray-800 ${it.danger ? 'text-red-700 dark:text-red-400' : 'text-gray-800 dark:text-gray-200'}`}>
              {it.label}
            </button>
          ))}
        </div>
      )}
      {confirming && (
        <div className="fixed inset-0 z-modal flex items-end sm:items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby={`confirm-${jobId}`}>
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirming(null)} aria-hidden />
          <div className="relative w-full max-w-sm bg-white dark:bg-gray-900 rounded-[14px] p-5 shadow-xl">
            <p id={`confirm-${jobId}`} className="text-[15px] font-semibold text-gray-900 dark:text-white">{confirming.confirm}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 truncate">{title}</p>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" autoFocus onClick={() => setConfirming(null)} className="min-h-[44px] px-4 rounded-[10px] text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
              <button type="button" onClick={() => run(confirming)} className={`min-h-[44px] px-4 rounded-[10px] text-sm font-bold text-white ${confirming.danger ? 'bg-red-700 hover:bg-red-800' : 'bg-brand hover:bg-brand-600'}`}>
                {confirming.label.split(' — ')[0]}
              </button>
            </div>
          </div>
        </div>
      )}
      {error && <p role="alert" className="absolute right-0 top-full mt-1 w-56 text-right text-xs text-red-700 dark:text-red-400">{error}</p>}
    </div>
  );
}
