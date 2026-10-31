'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles, Link2, Copy, LayoutTemplate, ClipboardPaste } from 'lucide-react';
import { JOB_TEMPLATES, type JobDraft } from '@/lib/jobs/composer';
import { inputCls } from './fields';

type Tab = 'paste' | 'link' | 'copy' | 'template';

export default function StartFaster({
  previousJobs, onFill, onDuplicate,
}: {
  previousJobs: { id: string; title: string }[];
  onFill: (draft: Partial<JobDraft>, note: string) => void;
  onDuplicate: (jobId: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<Tab>('paste');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [copyId, setCopyId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [focusPaste, setFocusPaste] = useState(false);

  useEffect(() => {
    if (focusPaste && tab === 'paste' && !busy) { textRef.current?.focus(); setFocusPaste(false); }
  }, [focusPaste, tab, busy]);

  const tabs: { key: Tab; label: string; icon: typeof Sparkles; hidden?: boolean }[] = [
    { key: 'paste', label: 'Paste description', icon: ClipboardPaste },
    { key: 'link', label: 'From a link', icon: Link2 },
    { key: 'copy', label: 'Copy a previous job', icon: Copy, hidden: previousJobs.length === 0 },
    { key: 'template', label: 'Template', icon: LayoutTemplate },
  ];

  async function parse(payload: { text?: string; url?: string }) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/employer/jobs/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.draft) {
        const n = (data.filled as string[] | undefined)?.length ?? 0;
        onFill(
          data.draft,
          data.aiUnavailable
            ? 'Autofill isn’t available right now, so we put your text in the description. Fill the other fields below.'
            : `We filled ${n} field${n === 1 ? '' : 's'} from your description. Check them before publishing.`,
        );
        setText('');
        setUrl('');
      } else if (data.fallback) {
        // Never a dead end: switch to paste with the box focused.
        setTab('paste');
        setError(data.error || 'Couldn’t read that link — paste the text instead.');
        setFocusPaste(true);
      } else {
        setError(data.error || 'Couldn’t fill the form. Try again or fill it in below.');
      }
    } catch {
      setError('You seem to be offline. Check your connection and try again.');
    }
    setBusy(false);
  }

  return (
    <section aria-labelledby="start-title" className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-brand" aria-hidden />
        <h2 id="start-title" className="portal-section-title">Start faster</h2>
      </div>
      <p className="text-[13px] text-gray-600 dark:text-gray-400 mt-0.5">Paste a job description you already have and we’ll fill in the form. Nothing goes live until you publish.</p>

      <div role="tablist" aria-label="How to start" className="flex gap-1 mt-4 overflow-x-auto -mx-1 px-1 pb-1">
        {tabs.filter((t) => !t.hidden).map((t) => (
          <button key={t.key} role="tab" type="button" aria-selected={tab === t.key} aria-controls={`start-${t.key}`} id={`start-tab-${t.key}`}
            onClick={() => { setTab(t.key); setError(''); }}
            className={`inline-flex items-center gap-1.5 shrink-0 min-h-[40px] px-3 rounded-[10px] text-[13px] font-semibold transition-colors ${
              tab === t.key ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}>
            <t.icon className="w-4 h-4" aria-hidden /> {t.label}
          </button>
        ))}
      </div>

      <div className="mt-3" id={`start-${tab}`} role="tabpanel" aria-labelledby={`start-tab-${tab}`}>
        {tab === 'paste' && (
          <form onSubmit={(e) => { e.preventDefault(); parse({ text }); }}>
            <label htmlFor="jd-text" className="sr-only">Job description</label>
            <textarea id="jd-text" ref={textRef} value={text} onChange={(e) => setText(e.target.value)} rows={5}
              placeholder="Paste the full job description here…" className={`${inputCls} py-2.5 resize-y`} />
            <button type="submit" disabled={busy || text.trim().length < 80} className="btn-brand gap-2 mt-2 disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Sparkles className="w-4 h-4" aria-hidden />}
              {busy ? 'Reading…' : 'Fill the form'}
            </button>
          </form>
        )}
        {tab === 'link' && (
          <form onSubmit={(e) => { e.preventDefault(); parse({ url }); }} className="flex flex-col sm:flex-row gap-2">
            <label htmlFor="jd-url" className="sr-only">Job post link</label>
            <input id="jd-url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="https://yourcompany.com/careers/backend-engineer" className={inputCls} />
            <button type="submit" disabled={busy || !url.trim()} className="btn-brand gap-2 shrink-0 disabled:opacity-50">
              {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
              {busy ? 'Reading…' : 'Fill the form'}
            </button>
          </form>
        )}
        {tab === 'copy' && (
          <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); setError(''); try { await onDuplicate(copyId); } catch (err) { setError(err instanceof Error ? err.message : 'Couldn’t copy that job.'); } setBusy(false); }}
            className="flex flex-col sm:flex-row gap-2">
            <label htmlFor="jd-copy" className="sr-only">Job to copy</label>
            <select id="jd-copy" value={copyId} onChange={(e) => setCopyId(e.target.value)} className={inputCls}>
              <option value="">Choose a job…</option>
              {previousJobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
            </select>
            <button type="submit" disabled={busy || !copyId} className="btn-brand gap-2 shrink-0 disabled:opacity-50">
              {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Copy as new draft
            </button>
          </form>
        )}
        {tab === 'template' && (
          <div className="flex flex-wrap gap-2">
            {JOB_TEMPLATES.map((t) => (
              <button key={t.key} type="button" onClick={() => onFill(t.draft, `Started from the ${t.label} template. Edit it to match your role.`)}
                className="min-h-[40px] px-3.5 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-medium text-gray-800 dark:text-gray-200 hover:border-brand hover:text-brand">
                {t.label}
              </button>
            ))}
          </div>
        )}
        {error && <p role="alert" className="mt-2 text-[13px] text-red-700 dark:text-red-400">{error}</p>}
      </div>
    </section>
  );
}
