'use client';

import { useEffect, useRef, useState } from 'react';
import { FileUp, Loader2, Plus, UserPlus, X } from 'lucide-react';
import { SOURCING_CHANNELS } from '@/lib/employer/stages';

const input = 'w-full min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-sm text-gray-900 dark:text-white';
const label = 'block text-[13px] font-semibold text-gray-800 dark:text-gray-200 mb-1';
const btn = 'inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50';
const ghost = 'inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200';

interface Draft { key: string; file: File | null; fullName: string; email: string; phone: string; linkedinUrl: string; currentTitle: string; currentCompany: string; city: string; experienceYears: string; note: string; status: 'reading' | 'ready' | 'saving' | 'saved' | 'error'; error: string; usedAi: boolean; duplicates: number }
const blank = (file: File | null = null): Draft => ({ key: Math.random().toString(36).slice(2), file, fullName: '', email: '', phone: '', linkedinUrl: '', currentTitle: '', currentCompany: '', city: '', experienceYears: '', note: '', status: file ? 'reading' : 'ready', error: '', usedAi: false, duplicates: 0 });

/**
 * Add people the team found: drop resumes (each is read to fill the form; AI when the workspace allows it) or type
 * someone in by hand. They land in the job's sourcing lane, not the pipeline, until they're interested.
 */
export default function AddCandidates({ jobId, jobTitle, onClose, onAdded }: { jobId: string; jobTitle: string; onClose: () => void; onAdded: (n: number) => void }) {
  const [rows, setRows] = useState<Draft[]>([]);
  const [channel, setChannel] = useState<string>('LinkedIn');
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titleRef.current?.focus(); }, []);
  const set = (key: string, patch: Partial<Draft>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function addFiles(files: FileList | null) {
    const list = Array.from(files ?? []).slice(0, 25);
    const drafts = list.map((f) => blank(f));
    setRows((rs) => [...rs, ...drafts]);
    for (const d of drafts) {
      if (d.file!.size > 5 * 1024 * 1024) { set(d.key, { status: 'error', error: 'Over 5 MB' }); continue; }
      try {
        const res = await fetch(`/api/employer/jobs/${jobId}/sourced/read`, { method: 'POST', body: d.file });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { set(d.key, { status: 'ready', error: data.error || 'Couldn’t read it; fill in by hand.' }); continue; }
        const f = data.fields ?? {};
        set(d.key, {
          status: 'ready', usedAi: !!data.usedAi, fullName: f.fullName ?? '', email: f.email ?? '', phone: f.phone ?? '', linkedinUrl: f.linkedinUrl ?? '',
          currentTitle: f.currentTitle ?? '', currentCompany: f.currentCompany ?? '', city: f.city ?? '', experienceYears: f.experienceYears != null ? String(f.experienceYears) : '',
        });
      } catch { set(d.key, { status: 'ready', error: 'Couldn’t read it; fill in by hand.' }); }
    }
  }

  async function saveAll() {
    setBusy(true);
    let added = 0;
    for (const r of rows) {
      if (r.status === 'saved' || r.status === 'reading') continue;
      set(r.key, { status: 'saving', error: '' });
      const body = { fullName: r.fullName, email: r.email, phone: r.phone, linkedinUrl: r.linkedinUrl, currentTitle: r.currentTitle, currentCompany: r.currentCompany, city: r.city, experienceYears: r.experienceYears, note: r.note, channel, channelOther: other };
      let res: Response | null = null;
      if (r.file) {
        const form = new FormData();
        form.append('data', JSON.stringify(body));
        form.append('resume', r.file);
        res = await fetch(`/api/employer/jobs/${jobId}/sourced`, { method: 'POST', body: form }).catch(() => null);
      } else {
        res = await fetch(`/api/employer/jobs/${jobId}/sourced`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
      }
      const data = res ? await res.json().catch(() => ({})) : { error: 'You seem to be offline.' };
      if (res?.ok) { added++; set(r.key, { status: 'saved', duplicates: data.duplicates?.length ?? 0 }); }
      else set(r.key, { status: 'error', error: data.error || 'Couldn’t add.' });
    }
    setBusy(false);
    if (added) onAdded(added);
  }

  const pending = rows.filter((r) => r.status !== 'saved');
  return (
    <div className="fixed inset-0 z-dialog flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
      <div role="dialog" aria-modal="true" aria-labelledby="add-title" className="w-full sm:max-w-2xl max-h-[92dvh] overflow-y-auto rounded-t-[16px] sm:rounded-[16px] bg-white dark:bg-gray-900 p-4 sm:p-6 shadow-xl font-jakarta space-y-4">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <h2 id="add-title" ref={titleRef} tabIndex={-1} className="portal-dialog-title">Add candidates to {jobTitle}</h2>
            <p className="text-[13px] text-gray-600 dark:text-gray-400">People you found yourself. They wait in the sourcing lane until you contact them and they’re interested; they don’t count as applicants before that.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 flex items-center justify-center rounded-[8px] hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-4 h-4" aria-hidden /></button>
        </div>

        <div className="grid sm:grid-cols-2 gap-2">
          <div>
            <label htmlFor="add-ch" className={label}>Where you found them</label>
            <select id="add-ch" value={channel} onChange={(e) => setChannel(e.target.value)} className={input}>{SOURCING_CHANNELS.map((c) => <option key={c}>{c}</option>)}</select>
          </div>
          {channel === 'Other' && <div><label htmlFor="add-oth" className={label}>Name it</label><input id="add-oth" value={other} onChange={(e) => setOther(e.target.value)} className={input} maxLength={40} placeholder="e.g. Hackathon" /></div>}
        </div>

        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" multiple accept=".pdf,.docx" className="hidden" onChange={(e) => { void addFiles(e.target.files); e.target.value = ''; }} />
          <button type="button" className={ghost} onClick={() => fileRef.current?.click()}><FileUp className="w-4 h-4" aria-hidden /> Upload resumes</button>
          <button type="button" className={ghost} onClick={() => setRows((rs) => [...rs, blank()])}><Plus className="w-4 h-4" aria-hidden /> Add by hand</button>
        </div>
        {rows.length === 0 && <p className="text-[13px] text-gray-500">Upload up to 25 PDF or Word resumes at once (we fill the details for you to check), or add someone by hand.</p>}

        <ul className="space-y-3">
          {rows.map((r, i) => (
            <li key={r.key} className="rounded-[12px] border border-gray-200 dark:border-gray-800 p-3 space-y-2">
              <div className="flex items-center gap-2 text-[13px]">
                <span className="font-semibold text-gray-900 dark:text-white flex-1 truncate">{r.file ? r.file.name : `Person ${i + 1}`}</span>
                {r.status === 'reading' && <span className="inline-flex items-center gap-1 text-gray-500"><Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> Reading…</span>}
                {r.usedAi && r.status === 'ready' && <span className="text-xs text-violet-700">Filled by AI: check it</span>}
                {r.status === 'saved' && <span className="text-xs font-semibold text-green-700">Added{r.duplicates ? ` · ${r.duplicates} possible duplicate${r.duplicates === 1 ? '' : 's'}` : ''}</span>}
                {r.status !== 'saved' && <button type="button" aria-label="Remove row" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-3.5 h-3.5" aria-hidden /></button>}
              </div>
              {r.status !== 'saved' && r.status !== 'reading' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {([['fullName', 'Name *'], ['email', 'Email *'], ['phone', 'Phone'], ['linkedinUrl', 'LinkedIn or profile link'], ['currentTitle', 'Current role'], ['currentCompany', 'Current company'], ['city', 'City'], ['experienceYears', 'Years of experience']] as const).map(([k, l]) => (
                    <div key={k}>
                      <label htmlFor={`${r.key}-${k}`} className="block text-xs text-gray-600 dark:text-gray-400 mb-0.5">{l}</label>
                      <input id={`${r.key}-${k}`} value={r[k]} onChange={(e) => set(r.key, { [k]: e.target.value } as Partial<Draft>)} className={input} />
                    </div>
                  ))}
                  <div className="sm:col-span-2"><label htmlFor={`${r.key}-note`} className="block text-xs text-gray-600 dark:text-gray-400 mb-0.5">Note for your team</label><input id={`${r.key}-note`} value={r.note} onChange={(e) => set(r.key, { note: e.target.value })} className={input} /></div>
                </div>
              )}
              {r.error && <p role="alert" className="text-[13px] text-red-700">{r.error}</p>}
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap justify-end gap-2 sticky bottom-0 bg-white dark:bg-gray-900 pt-2">
          <button type="button" className={ghost} onClick={onClose}>{rows.some((r) => r.status === 'saved') ? 'Done' : 'Cancel'}</button>
          <button type="button" className={btn} disabled={busy || !pending.length || pending.some((r) => r.status === 'reading')} onClick={saveAll}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <UserPlus className="w-4 h-4" aria-hidden />} Add {pending.length || ''} to sourcing
          </button>
        </div>
      </div>
    </div>
  );
}
