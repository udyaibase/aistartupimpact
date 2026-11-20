'use client';

import { useEffect, useState } from 'react';
import { Megaphone, Loader2 } from 'lucide-react';
import { getPortalStatusAction, setPortalStatusAction } from './status-actions';

/** The banner every employer sees at the top of the portal while something is broken or slow. */
export default function StatusBannerCard() {
  const [form, setForm] = useState({ message: '', level: 'warning', hours: 4 });
  const [live, setLive] = useState<{ message?: string; until?: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = async () => {
    const r = await getPortalStatusAction();
    if (r.success) {
      const active = r.status?.message && (!r.status.until || Date.parse(r.status.until) > Date.now()) ? r.status : null;
      setLive(active);
      if (active) setForm((f) => ({ ...f, message: active.message ?? '', level: (r.status as any).level ?? 'warning' }));
    }
  };
  useEffect(() => { void load(); }, []);

  async function save(clear = false) {
    setBusy(true); setMsg('');
    const r = await setPortalStatusAction(clear ? { message: '', level: 'info', hours: 0 } : form);
    setBusy(false);
    setMsg(r.success ? (clear ? 'Banner removed.' : 'Banner is live on the employer portal.') : r.error || 'Failed');
    if (clear) setForm({ message: '', level: 'warning', hours: 4 });
    void load();
  }

  return (
    <section aria-labelledby="sb-h" className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Megaphone className="w-4 h-4 text-brand" />
        <h2 id="sb-h" className="font-semibold text-sm text-gray-900 dark:text-white flex-1">Status banner (employer portal)</h2>
        {live ? <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Live{live.until ? ` until ${new Date(live.until).toLocaleString('en-IN', { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' })}` : ''}</span> : <span className="text-xs text-gray-400">Off</span>}
      </div>
      <p className="text-xs text-gray-500">When something is broken or slow, tell everyone at once so they don’t each have to report it.</p>
      <div className="flex flex-col md:flex-row gap-2">
        <label className="sr-only" htmlFor="sb-msg">Message</label>
        <input id="sb-msg" className="input-field flex-1 text-sm" maxLength={300} placeholder="e.g. Emails to candidates are delayed. We’re fixing it; nothing is lost." value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
        <label className="sr-only" htmlFor="sb-level">Type</label>
        <select id="sb-level" className="input-field text-sm md:w-40" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
          <option value="info">Notice</option><option value="warning">Known issue</option><option value="outage">Service problem</option>
        </select>
        <label className="sr-only" htmlFor="sb-hours">Show for</label>
        <select id="sb-hours" className="input-field text-sm md:w-40" value={form.hours} onChange={(e) => setForm({ ...form, hours: Number(e.target.value) })}>
          <option value={1}>1 hour</option><option value={4}>4 hours</option><option value={24}>1 day</option><option value={72}>3 days</option><option value={0}>Until I remove it</option>
        </select>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" disabled={busy || !form.message.trim()} onClick={() => save()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-900 text-white dark:bg-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} {live ? 'Update banner' : 'Show banner'}
        </button>
        {live && <button type="button" disabled={busy} onClick={() => save(true)} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300">Remove</button>}
        <span role="status" className="text-xs text-gray-600 dark:text-gray-400">{msg}</span>
      </div>
    </section>
  );
}
