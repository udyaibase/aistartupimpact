'use client';

import { useRef, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';

const field = 'w-full min-h-[44px] px-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand';
const label = 'block text-sm font-semibold text-gray-900 dark:text-white mb-1.5';
type V = { name: string; title: string; company: string; headshotUrl: string | null; linkedinUrl: string; talkTitle: string; slidesUrl: string };

export default function SpeakerPortalForm({ token, initial }: { token: string; initial: V }) {
  const [v, setV] = useState<V>(initial);
  const [busy, setBusy] = useState<'' | 'save' | 'photo'>('');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof V) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });

  async function upload(file: File) {
    setBusy('photo');
    try {
      const fd = new FormData();
      fd.append('t', token);
      fd.append('file', file);
      const r = await fetch('/api/speaker/portal/photo', { method: 'POST', body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.url) setNote({ ok: false, text: d.error || 'Upload failed.' });
      else setV((x) => ({ ...x, headshotUrl: d.url }));
    } catch { setNote({ ok: false, text: 'You seem to be offline.' }); }
    finally { setBusy(''); if (fileRef.current) fileRef.current.value = ''; }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy('save');
    setNote(null);
    try {
      const r = await fetch('/api/speaker/portal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: token, ...v }) });
      const d = await r.json().catch(() => ({}));
      setNote(r.ok && d.success ? { ok: true, text: 'Saved. Your details are updated on the event page.' } : { ok: false, text: d.error || 'Couldn’t save.' });
    } catch { setNote({ ok: false, text: 'You seem to be offline.' }); }
    finally { setBusy(''); }
  }

  return (
    <form onSubmit={save} noValidate className="mt-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 sm:p-6 space-y-5">
      <div className="flex items-center gap-4">
        <span className="w-16 h-16 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {v.headshotUrl && <img src={v.headshotUrl} alt="" className="w-full h-full object-cover" />}
        </span>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy === 'photo'} className="inline-flex items-center gap-2 min-h-[40px] px-3.5 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-semibold">
          {busy === 'photo' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Upload className="w-4 h-4" aria-hidden />} {v.headshotUrl ? 'Change photo' : 'Add a photo'}
        </button>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div><label htmlFor="pp-name" className={label}>Name</label><input id="pp-name" value={v.name} onChange={set('name')} maxLength={100} className={field} /></div>
        <div><label htmlFor="pp-title" className={label}>Job title</label><input id="pp-title" value={v.title} onChange={set('title')} maxLength={100} className={field} /></div>
        <div><label htmlFor="pp-co" className={label}>Company</label><input id="pp-co" value={v.company} onChange={set('company')} maxLength={100} className={field} /></div>
        <div><label htmlFor="pp-li" className={label}>LinkedIn</label><input id="pp-li" type="url" value={v.linkedinUrl} onChange={set('linkedinUrl')} className={field} placeholder="https://linkedin.com/in/…" /></div>
      </div>
      <div><label htmlFor="pp-talk" className={label}>Talk title</label><input id="pp-talk" value={v.talkTitle} onChange={set('talkTitle')} maxLength={200} className={field} /></div>
      <div><label htmlFor="pp-slides" className={label}>Slides link <span className="font-normal text-gray-500">(optional)</span></label><input id="pp-slides" type="url" value={v.slidesUrl} onChange={set('slidesUrl')} className={field} placeholder="https://…" /></div>
      {note && <p role={note.ok ? 'status' : 'alert'} className={`text-sm ${note.ok ? 'text-green-700' : 'text-red-600'}`}>{note.text}</p>}
      <button type="submit" disabled={busy === 'save'} className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 hover:bg-gray-800 dark:bg-white dark:text-gray-900 text-white font-medium text-[15px] disabled:opacity-60">
        {busy === 'save' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Save
      </button>
      <p className="text-xs text-center text-gray-500">Keep this link private: anyone with it can edit your speaker details.</p>
    </form>
  );
}
