'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { notify } from '@/components/Toast';
import { ask } from '@/components/Ask';
import { listArticleCategoriesAction, saveArticleCategoryAction, deleteArticleCategoryAction, type ArticleCategoryRow } from './actions';

const NAME_MAX = 60;
const DESCRIPTION_MAX = 200;
const label = 'block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5';

/** Article categories: the list writers pick from in the editor. Editors add, rename and remove them here. */
export default function ArticleCategoriesPage() {
  const [rows, setRows] = useState<ArticleCategoryRow[]>([]);
  const [uncategorised, setUncategorised] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<ArticleCategoryRow | null>(null);
  const [moveTo, setMoveTo] = useState('');

  useEffect(() => {
    (async () => {
      const res = await listArticleCategoriesAction();
      if (res.success) { setRows(res.data); setUncategorised(res.uncategorised); } else setLoadError(res.error);
      setLoading(false);
    })();
  }, []);

  const open = (row: ArticleCategoryRow | null) => {
    setEditing(row ? row.id : 'new'); setName(row?.name ?? ''); setDescription(row?.description ?? ''); setFormError(''); setRemoving(null);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setFormError('');
    const res = await saveArticleCategoryAction(editing === 'new' ? null : editing, { name, description });
    setBusy(false);
    if (!res.success) { setFormError(res.error); return; }
    setRows(res.data); setEditing(null);
    notify(editing === 'new' ? 'Category added.' : 'Category saved.', 'success');
  };

  const startRemove = async (row: ArticleCategoryRow) => {
    setEditing(null);
    if (row.articles > 0) { setRemoving(row); setMoveTo(''); return; }
    if (!(await ask({ title: 'Remove category', message: `Remove “${row.name}”? No article uses it.`, confirmLabel: 'Remove', danger: true }))) return;
    await remove(row, null);
  };

  const remove = async (row: ArticleCategoryRow, target: string | null) => {
    if (busy) return;
    setBusy(true);
    const res = await deleteArticleCategoryAction(row.id, target);
    setBusy(false);
    if (!res.success) { notify(res.error, 'error'); return; }
    setRows(res.data); setRemoving(null);
    if (!target) setUncategorised((n) => n + row.published);
    notify(res.moved > 0 ? `Category removed. ${res.moved.toLocaleString('en-IN')} article${res.moved === 1 ? '' : 's'} moved.` : 'Category removed.', 'success');
  };

  const form = (
    <form onSubmit={save} className="card p-5 space-y-4" aria-label={editing === 'new' ? 'Add category' : 'Edit category'}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="cat-name" className={label}>Name</label>
          <input id="cat-name" autoFocus className="input-field text-sm" maxLength={NAME_MAX} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Funding News" aria-invalid={!!formError} aria-describedby={formError ? 'cat-error' : undefined} />
        </div>
        <div>
          <label htmlFor="cat-description" className={label}>Description <span className="font-normal text-gray-500">(optional, shown on the category page)</span></label>
          <input id="cat-description" className="input-field text-sm" maxLength={DESCRIPTION_MAX} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="One or two sentences readers and Google will see" />
        </div>
      </div>
      {formError && <p id="cat-error" role="alert" className="text-sm text-red-600 dark:text-red-400">{formError}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy || name.trim().length < 2} className="btn-brand text-sm disabled:opacity-50">{busy ? 'Saving…' : editing === 'new' ? 'Add category' : 'Save'}</button>
        <button type="button" onClick={() => setEditing(null)} className="btn-outline text-sm">Cancel</button>
      </div>
    </form>
  );

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <Link href="/articles" className="inline-flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 hover:text-brand"><ChevronLeft className="w-4 h-4" aria-hidden /> Articles</Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-sora font-bold text-2xl text-navy dark:text-white">Article categories</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">The list writers pick from in the article editor. The name shows as a label on the published article.</p>
          </div>
          {editing !== 'new' && <button type="button" onClick={() => open(null)} className="btn-brand text-sm gap-2 shrink-0"><Plus className="w-4 h-4" aria-hidden /> Add category</button>}
        </div>
      </div>

      {editing === 'new' && form}

      {loading ? (
        <p role="status" className="card p-5 text-sm text-gray-600 dark:text-gray-400">Loading categories…</p>
      ) : loadError ? (
        <p role="alert" className="card p-5 text-sm text-red-600 dark:text-red-400">{loadError}</p>
      ) : rows.length === 0 ? (
        <p className="card p-5 text-sm text-gray-600 dark:text-gray-400">No categories yet. Add the first one so writers can file their articles.</p>
      ) : (
        <ul className="card divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map((row) => (
            <li key={row.id} className="p-4">
              {editing === row.id ? form : (
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-navy dark:text-white truncate">{row.name}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                      {row.articles === 0 ? 'No articles' : `${row.articles.toLocaleString('en-IN')} article${row.articles === 1 ? '' : 's'}, ${row.published.toLocaleString('en-IN')} published`}
                      {row.description ? ` · ${row.description}` : ''}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-mono truncate">udyaibase.com/news/category/{row.slug}{row.published === 0 ? ' (hidden from search until an article is published)' : ''}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button type="button" onClick={() => open(row)} aria-label={`Rename ${row.name}`} className="p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><Pencil className="w-4 h-4" aria-hidden /></button>
                    <button type="button" onClick={() => startRemove(row)} aria-label={`Remove ${row.name}`} className="p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"><Trash2 className="w-4 h-4" aria-hidden /></button>
                  </div>
                </div>
              )}
              {removing?.id === row.id && (
                <div className="mt-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-3">
                  <p className="text-sm text-gray-800 dark:text-gray-200">
                    {row.articles.toLocaleString('en-IN')} article{row.articles === 1 ? ' uses' : 's use'} “{row.name}”. {row.articles === 1 ? 'It is kept. Where should it go?' : 'They are kept. Where should they go?'}
                  </p>
                  <label htmlFor="cat-move" className="sr-only">Move articles to</label>
                  <select id="cat-move" className="input-field text-sm max-w-xs" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                    <option value="">No category (uncategorised)</option>
                    {rows.filter((r) => r.id !== row.id).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  <div className="flex gap-2">
                    <button type="button" disabled={busy} onClick={() => remove(row, moveTo || null)} className="btn-brand text-sm disabled:opacity-50">{busy ? 'Removing…' : 'Move articles and remove'}</button>
                    <button type="button" onClick={() => setRemoving(null)} className="btn-outline text-sm">Cancel</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {!loading && !loadError && uncategorised > 0 && (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {uncategorised.toLocaleString('en-IN')} published article{uncategorised === 1 ? ' has' : 's have'} no category. Open {uncategorised === 1 ? 'it' : 'them'} from <Link href="/articles" className="text-brand hover:underline">Articles</Link> and pick one.
        </p>
      )}
    </div>
  );
}
