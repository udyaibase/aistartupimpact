'use client';

import { notify } from '@/components/Toast';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2, Eye, EyeOff, Edit3, X, Save, Loader2 } from 'lucide-react';
import { getCollectionsAction, createCollectionAction, updateCollectionAction, deleteCollectionAction } from './actions';
import { ConfirmModal } from '@/components/ConfirmModal';

export default function CollectionsPage() {
  const router = useRouter();
  const [collections, setCollections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addTitle, setAddTitle] = useState('');
  const [addDesc, setAddDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const data = await getCollectionsAction();
    setCollections(data as any[]);
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!addTitle.trim()) return;
    setSubmitting(true);
    const result = await createCollectionAction({ title: addTitle.trim(), description: addDesc.trim() || undefined });
    if (result.success) { setShowAdd(false); setAddTitle(''); setAddDesc(''); await loadData(); }
    else notify(result.error);
    setSubmitting(false);
  };

  const handleTogglePublish = async (id: string, current: boolean) => {
    await updateCollectionAction(id, { isPublished: !current });
    await loadData();
  };

  const handleDelete = async (id: string) => {
    await deleteCollectionAction(id);
    await loadData();
  };

  const handleRename = async (id: string) => {
    if (!editTitle.trim()) return;
    await updateCollectionAction(id, { title: editTitle.trim() });
    setEditingId(null);
    await loadData();
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-brand" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/tools-dir')} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"><ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" /></button>
          <div>
            <h1 className="portal-title">Curated Collections</h1>
            <p className="portal-subtitle">{collections.length} collections</p>
          </div>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-brand text-sm flex items-center gap-2"><Plus className="w-4 h-4" /> New Collection</button>
      </div>

      <div className="space-y-3">
        {collections.map((col: any) => (
          <div key={col.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                {editingId === col.id ? (
                  <div className="flex items-center gap-2">
                    <input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="bg-gray-100 dark:bg-gray-700 rounded px-2 py-1 text-sm font-bold w-56" onKeyDown={e => { if (e.key === 'Enter') handleRename(col.id); }} autoFocus />
                    <button onClick={() => handleRename(col.id)} className="text-green-500"><Save className="w-4 h-4" /></button>
                    <button onClick={() => setEditingId(null)} className="text-gray-400"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <h3 className="font-sora font-bold text-sm text-navy dark:text-white">{col.title}</h3>
                )}
                <p className="text-xs text-gray-400 font-jakarta mt-0.5">
                  {col.itemCount} tools · {col.isPublished ? '🟢 Published' : '⚪ Draft'} · /{col.slug}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => { setEditingId(col.id); setEditTitle(col.title); }} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"><Edit3 className="w-3.5 h-3.5 text-gray-400" /></button>
              <button onClick={() => handleTogglePublish(col.id, col.isPublished)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg" title={col.isPublished ? 'Unpublish' : 'Publish'}>
                {col.isPublished ? <EyeOff className="w-3.5 h-3.5 text-gray-400" /> : <Eye className="w-3.5 h-3.5 text-gray-400" />}
              </button>
              <button onClick={() => setConfirmDelete(col.id)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" /></button>
            </div>
          </div>
        ))}
        {collections.length === 0 && <div className="text-center py-12 text-gray-400 font-jakarta text-sm">No collections yet. Create one to curate tools.</div>}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm shadow-2xl border border-gray-200 dark:border-gray-800 p-6">
            <h3 className="font-sora font-bold text-lg text-navy dark:text-white mb-4">New Collection</h3>
            <div className="space-y-3">
              <input value={addTitle} onChange={e => setAddTitle(e.target.value)} placeholder="e.g. Best Free AI Writing Tools" className="input-field text-sm" onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }} autoFocus />
              <input value={addDesc} onChange={e => setAddDesc(e.target.value)} placeholder="Description (optional)" className="input-field text-sm" />
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowAdd(false)} className="flex-1 px-4 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600">Cancel</button>
                <button onClick={handleCreate} disabled={submitting || !addTitle.trim()} className="flex-1 px-4 py-2.5 text-sm font-bold bg-brand text-white rounded-xl disabled:opacity-50">{submitting ? 'Creating...' : 'Create'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) {
            handleDelete(confirmDelete);
            setConfirmDelete(null);
          }
        }}
        title="Delete Collection"
        message="Delete this collection and all its items? This action cannot be undone."
        confirmLabel="Delete Collection"
        variant="danger"
        requireTyping={true}
      />
    </div>
  );
}
