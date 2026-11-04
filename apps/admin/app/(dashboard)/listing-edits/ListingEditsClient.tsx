'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { listingFieldLabel, listingValueText } from '@udyaibase/utils';

type Edit = {
  id: string; entityType: 'startup' | 'tool'; entityId: string; field: string; oldValue: unknown; newValue: unknown;
  submittedByName: string | null; createdAt: string; listing: { name: string; slug: string; verified: boolean };
};
type Version = { id: string; changedFields: string[]; actorType: string; actorLabel: string; note: string | null; createdAt: string };

const when = (d: string) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com';

export default function ListingEditsClient() {
  const [edits, setEdits] = useState<Edit[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState<Edit[] | null>(null);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/listing-edits').catch(() => null);
    if (res?.ok) setEdits((await res.json()).edits);
    else setError('Couldn’t load the changes. Refresh and try again.');
  }, []);
  useEffect(() => { void load(); }, [load]);

  const groups = useMemo(() => {
    const map = new Map<string, Edit[]>();
    for (const e of edits ?? []) map.set(`${e.entityType}:${e.entityId}`, [...(map.get(`${e.entityType}:${e.entityId}`) ?? []), e]);
    return [...map.values()];
  }, [edits]);

  const decide = async (items: Edit[], action: 'approve' | 'reject', reason = '') => {
    setBusy(true); setError('');
    const res = await fetch('/api/admin/listing-edits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: items.map((e) => e.id), action, note: reason }),
    }).catch(() => null);
    if (res?.ok) { setRejecting(null); setNote(''); await load(); }
    else setError((await res?.json().catch(() => null))?.error || 'Couldn’t save that. Try again.');
    setBusy(false);
  };

  const button = 'px-3 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-50';

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Listing Edits</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Changes founders made that need approval. The live listing keeps its current value until you approve, and rejecting never takes it offline.
        </p>
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <section aria-label="Waiting for review" className="space-y-4">
        {edits === null ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">Loading…</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 text-center">Nothing waiting for review.</p>
        ) : groups.map((items) => {
          const first = items[0];
          const path = first.entityType === 'startup' ? 'startups' : 'tools';
          return (
            <article key={first.entityId} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-gray-900 dark:text-white">
                    <a href={`${SITE}/${path}/${first.listing.slug}`} target="_blank" rel="noopener noreferrer" className="hover:underline">{first.listing.name}</a>
                  </h2>
                  <p className="text-[13px] text-gray-600 dark:text-gray-400">
                    {first.entityType === 'startup' ? 'Startup' : 'AI tool'} · {first.listing.verified ? 'Verified' : 'Not verified'} · by {first.submittedByName ?? 'founder'} · {when(first.createdAt)}
                  </p>
                </div>
                {items.length > 1 && (
                  <div className="flex gap-2">
                    <button disabled={busy} onClick={() => decide(items, 'approve')} className={`${button} bg-green-600 text-white`}>Approve all</button>
                    <button disabled={busy} onClick={() => { setRejecting(items); setNote(''); }} className={`${button} border border-gray-300 dark:border-gray-700 text-gray-800 dark:text-gray-200`}>Reject all</button>
                  </div>
                )}
              </div>
              <ul className="mt-4 divide-y divide-gray-100 dark:divide-gray-800">
                {items.map((e) => (
                  <li key={e.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{listingFieldLabel(e.field)}</p>
                      <div className="flex gap-2">
                        <button disabled={busy} onClick={() => decide([e], 'approve')} className={`${button} bg-green-600 text-white`}>Approve</button>
                        <button disabled={busy} onClick={() => { setRejecting([e]); setNote(''); }} className={`${button} border border-gray-300 dark:border-gray-700 text-gray-800 dark:text-gray-200`}>Reject</button>
                      </div>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3 mt-2">
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-1">Live now</p>
                        <pre className="text-[13px] whitespace-pre-wrap break-words bg-gray-50 dark:bg-gray-800 rounded-lg p-2 text-gray-800 dark:text-gray-200 max-h-60 overflow-auto font-sans">{listingValueText(e.oldValue)}</pre>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-1">Proposed</p>
                        <pre className="text-[13px] whitespace-pre-wrap break-words bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2 text-gray-800 dark:text-gray-200 max-h-60 overflow-auto font-sans">{listingValueText(e.newValue)}</pre>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </section>

      <VersionHistory />

      {rejecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="reject-edit-title">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-6 w-full max-w-md shadow-xl">
            <h2 id="reject-edit-title" className="text-lg font-semibold text-gray-900 dark:text-white">Reject {rejecting.map((e) => listingFieldLabel(e.field)).join(', ')}</h2>
            <label htmlFor="reject-edit-note" className="block text-sm text-gray-600 dark:text-gray-400 mt-1 mb-2">Tell the founder why. We’ll email this to them. Their listing stays live as it is.</label>
            <textarea id="reject-edit-note" autoFocus rows={4} value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm p-3" />
            <div className="flex justify-end gap-2 mt-4">
              <button disabled={busy} onClick={() => setRejecting(null)} className={`${button} border border-gray-300 dark:border-gray-700 text-gray-800 dark:text-gray-200`}>Cancel</button>
              <button disabled={busy || !note.trim()} onClick={() => decide(rejecting, 'reject', note)} className={`${button} bg-red-600 text-white`}>{busy ? 'Rejecting…' : 'Reject and email founder'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VersionHistory() {
  const [type, setType] = useState<'startup' | 'tool'>('startup');
  const [slug, setSlug] = useState('');
  const [result, setResult] = useState<{ listing: { name: string }; versions: Version[] } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState<Version | null>(null);

  const search = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true); setError('');
    const res = await fetch(`/api/admin/listing-edits/versions?type=${type}&slug=${encodeURIComponent(slug.trim())}`).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (res?.ok) setResult(data);
    else { setResult(null); setError(data?.error || 'Couldn’t load the history.'); }
    setBusy(false);
  };

  const restore = async (version: Version) => {
    setBusy(true); setError('');
    const res = await fetch('/api/admin/listing-edits/versions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ versionId: version.id }),
    }).catch(() => null);
    setBusy(false); setRestoring(null);
    if (res?.ok) await search();
    else setError((await res?.json().catch(() => null))?.error || 'Couldn’t restore that version.');
  };

  return (
    <section aria-labelledby="history-title" className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
      <h2 id="history-title" className="font-semibold text-gray-900 dark:text-white">Version history</h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">See who changed a listing and when, and restore it to how it was before a change. Restoring can be undone the same way.</p>
      <form onSubmit={search} className="flex flex-wrap gap-2 mt-3">
        <select aria-label="Listing type" value={type} onChange={(e) => setType(e.target.value as 'startup' | 'tool')} className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm px-3 py-2">
          <option value="startup">Startup</option>
          <option value="tool">AI tool</option>
        </select>
        <input aria-label="Listing web address" placeholder="Web address, like acme-ai" value={slug} onChange={(e) => setSlug(e.target.value)} className="flex-1 min-w-[200px] rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm px-3 py-2" />
        <button disabled={busy || !slug.trim()} className="px-4 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50">Show history</button>
      </form>
      {error && <p role="alert" className="text-sm text-red-600 mt-3">{error}</p>}
      {result && (result.versions.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-4">No changes recorded for {result.listing.name} yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-gray-100 dark:divide-gray-800">
          {result.versions.map((v) => (
            <li key={v.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white">{v.changedFields.map(listingFieldLabel).join(', ')}</p>
                <p className="text-[13px] text-gray-600 dark:text-gray-400">{v.actorLabel} ({v.actorType === 'ADMIN' ? 'admin' : 'founder team'}) · {when(v.createdAt)}{v.note ? ` · ${v.note}` : ''}</p>
              </div>
              {restoring?.id === v.id ? (
                <span className="flex items-center gap-2">
                  <span className="text-sm text-gray-700 dark:text-gray-300">Restore to before this?</span>
                  <button disabled={busy} onClick={() => restore(v)} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-50">Yes, restore</button>
                  <button disabled={busy} onClick={() => setRestoring(null)} className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200">No</button>
                </span>
              ) : (
                <button onClick={() => setRestoring(v)} className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200">Restore to before this</button>
              )}
            </li>
          ))}
        </ul>
      ))}
    </section>
  );
}
