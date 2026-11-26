'use client';

import { notify } from '@/components/Toast';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Plus, Search, RefreshCw, Trash2, Edit3, X, Save,
  ChevronDown, ChevronRight, Loader2, Eye, EyeOff, FolderTree,
} from 'lucide-react';
import {
  getCategoryTreeAction,
  createParentCategoryAction,
  createSubcategoryAction,
  updateParentCategoryAction,
  updateSubcategoryAction,
  deleteParentCategoryAction,
  deleteSubcategoryAction,
  refreshCategoryCountsAction,
} from './actions';
import { ConfirmModal } from '@/components/ConfirmModal';

interface Subcategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string;
  toolCount: number;
  sortOrder: number;
  isActive: boolean;
}

interface ParentCategory {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  description: string | null;
  toolCount: number;
  sortOrder: number;
  isActive: boolean;
  subcategories: Subcategory[];
}

export default function CategoriesManagementPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<ParentCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

  // Add modals
  const [showAddParent, setShowAddParent] = useState(false);
  const [showAddSub, setShowAddSub] = useState(false);
  const [addParentId, setAddParentId] = useState('');
  const [addName, setAddName] = useState('');
  const [addDescription, setAddDescription] = useState('');
  const [addSubmitting, setAddSubmitting] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<{ id: string; level: 'parent' | 'sub' } | null>(null);

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const data = await getCategoryTreeAction();
    setCategories(data as ParentCategory[]);
    if (expandedParents.size === 0) {
      setExpandedParents(new Set((data as ParentCategory[]).slice(0, 5).map(c => c.id)));
    }
    setLoading(false);
  };

  const handleRefreshCounts = async () => {
    setRefreshing(true);
    await refreshCategoryCountsAction();
    await loadData();
    setRefreshing(false);
  };

  const toggleParent = (id: string) => {
    setExpandedParents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddParent = async () => {
    if (!addName.trim()) return;
    setAddSubmitting(true);
    const result = await createParentCategoryAction({
      name: addName.trim(),
      description: addDescription.trim() || undefined,
    });
    if (result.success) {
      setShowAddParent(false);
      setAddName('');
      setAddDescription('');
      await loadData();
    } else {
      notify(result.error || 'Failed');
    }
    setAddSubmitting(false);
  };

  const handleAddSub = async () => {
    if (!addName.trim() || !addParentId) return;
    setAddSubmitting(true);
    const result = await createSubcategoryAction({
      name: addName.trim(),
      parentId: addParentId,
      description: addDescription.trim() || undefined,
    });
    if (result.success) {
      setShowAddSub(false);
      setAddName('');
      setAddDescription('');
      setAddParentId('');
      await loadData();
    } else {
      notify(result.error || 'Failed');
    }
    setAddSubmitting(false);
  };

  const handleToggleActive = async (id: string, level: 'parent' | 'sub', currentActive: boolean) => {
    if (level === 'parent') {
      await updateParentCategoryAction(id, { isActive: !currentActive });
    } else {
      await updateSubcategoryAction(id, { isActive: !currentActive });
    }
    await loadData();
  };

  const handleDelete = async (id: string, level: 'parent' | 'sub') => {
    const result = level === 'parent'
      ? await deleteParentCategoryAction(id)
      : await deleteSubcategoryAction(id);

    if (result.success) {
      await loadData();
    } else {
      notify(result.error || 'Failed to delete');
    }
  };

  const startEdit = (id: string, name: string, description: string) => {
    setEditingId(id);
    setEditName(name);
    setEditDescription(description || '');
  };

  const saveEdit = async (id: string, level: 'parent' | 'sub') => {
    if (level === 'parent') {
      await updateParentCategoryAction(id, { name: editName, description: editDescription || undefined });
    } else {
      await updateSubcategoryAction(id, { name: editName, description: editDescription || undefined });
    }
    setEditingId(null);
    await loadData();
  };

  // Filter
  const filteredCategories = categories.map(c => ({
    ...c,
    subcategories: search
      ? c.subcategories.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))
      : c.subcategories,
  })).filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.subcategories.length > 0);

  const totalParents = categories.length;
  const totalSubs = categories.reduce((sum, c) => sum + c.subcategories.length, 0);
  const activeSubs = categories.reduce((sum, c) => sum + c.subcategories.filter(s => s.isActive).length, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-brand" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/tools-dir')}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
          <div>
            <h1 className="portal-title">Tool Categories</h1>
            <p className="portal-subtitle">
              {totalParents} parents • {totalSubs} subcategories • {activeSubs} active
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefreshCounts}
            disabled={refreshing}
            className="btn-outline text-xs flex items-center gap-1.5 px-3 py-2"
            title="Recalculate tool counts per category"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh Counts
          </button>
          <button
            onClick={() => setShowAddSub(true)}
            className="btn-outline text-xs flex items-center gap-1.5 px-3 py-2"
          >
            <Plus className="w-3.5 h-3.5" /> Subcategory
          </button>
          <button
            onClick={() => setShowAddParent(true)}
            className="btn-brand text-sm flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Parent Category
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search categories..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field pl-10"
        />
      </div>

      {/* Category Tree */}
      <div className="space-y-3">
        {filteredCategories.map((parent) => (
          <div key={parent.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
            {/* Parent Header */}
            <div className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
              <button
                onClick={() => toggleParent(parent.id)}
                className="flex items-center gap-3 flex-1 text-left"
              >
                {expandedParents.has(parent.id)
                  ? <ChevronDown className="w-4 h-4 text-gray-400" />
                  : <ChevronRight className="w-4 h-4 text-gray-400" />
                }
                {editingId === parent.id ? (
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="bg-gray-100 dark:bg-gray-700 rounded px-2 py-1 text-sm font-sora font-bold w-48"
                      onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(parent.id, 'parent'); if (e.key === 'Escape') setEditingId(null); }}
                      autoFocus
                    />
                    <input
                      type="text"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className="bg-gray-100 dark:bg-gray-700 rounded px-2 py-1 text-xs w-56"
                      placeholder="Description (optional)"
                    />
                    <button onClick={() => saveEdit(parent.id, 'parent')} className="p-1 text-green-500 hover:text-green-600">
                      <Save className="w-4 h-4" />
                    </button>
                    <button onClick={() => setEditingId(null)} className="p-1 text-gray-400 hover:text-gray-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div>
                    <span className={`font-sora font-bold text-sm ${parent.isActive ? 'text-navy dark:text-white' : 'text-gray-400 line-through'}`}>
                      {parent.name}
                    </span>
                    <span className="text-xs text-gray-400 font-jakarta ml-2">
                      {parent.subcategories.length} subs • {parent.toolCount} tools
                    </span>
                  </div>
                )}
              </button>

              {editingId !== parent.id && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => startEdit(parent.id, parent.name, parent.description || '')}
                    className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                    title="Edit"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                  <button
                    onClick={() => handleToggleActive(parent.id, 'parent', parent.isActive)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                    title={parent.isActive ? 'Deactivate' : 'Activate'}
                  >
                    {parent.isActive ? <EyeOff className="w-3.5 h-3.5 text-gray-400" /> : <Eye className="w-3.5 h-3.5 text-gray-400" />}
                  </button>
                  <button
                    onClick={() => setConfirmDelete({ id: parent.id, level: 'parent' })}
                    className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                  </button>
                  <button
                    onClick={() => { setAddParentId(parent.id); setShowAddSub(true); }}
                    className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                    title="Add subcategory"
                  >
                    <Plus className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                </div>
              )}
            </div>

            {/* Subcategories */}
            {expandedParents.has(parent.id) && parent.subcategories.length > 0 && (
              <div className="border-t border-gray-100 dark:border-gray-800 px-5 py-3">
                <div className="flex flex-wrap gap-2">
                  {parent.subcategories.map((sub) => (
                    <div
                      key={sub.id}
                      className={`group relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-jakarta transition-all ${
                        sub.isActive
                          ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                          : 'bg-gray-50 dark:bg-gray-900 border-gray-100 dark:border-gray-800 text-gray-400 dark:text-gray-600 line-through'
                      }`}
                    >
                      {editingId === sub.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="bg-gray-100 dark:bg-gray-700 rounded px-2 py-0.5 text-xs w-40"
                            onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(sub.id, 'sub'); if (e.key === 'Escape') setEditingId(null); }}
                            autoFocus
                          />
                          <button onClick={() => saveEdit(sub.id, 'sub')} className="p-0.5 text-green-500 hover:text-green-600">
                            <Save className="w-3 h-3" />
                          </button>
                          <button onClick={() => setEditingId(null)} className="p-0.5 text-gray-400 hover:text-gray-600">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <span>{sub.name}</span>
                          {sub.toolCount > 0 && (
                            <span className="text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">
                              {sub.toolCount}
                            </span>
                          )}
                          <div className="hidden group-hover:flex items-center gap-0.5 ml-1">
                            <button
                              onClick={() => startEdit(sub.id, sub.name, sub.description || '')}
                              className="p-0.5 text-gray-400 hover:text-brand"
                              title="Edit"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleToggleActive(sub.id, 'sub', sub.isActive)}
                              className="p-0.5 text-gray-400 hover:text-orange-500"
                              title={sub.isActive ? 'Deactivate' : 'Activate'}
                            >
                              {sub.isActive ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            </button>
                            <button
                              onClick={() => setConfirmDelete({ id: sub.id, level: 'sub' })}
                              className="p-0.5 text-gray-400 hover:text-red-500"
                              title="Delete"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {expandedParents.has(parent.id) && parent.subcategories.length === 0 && (
              <div className="border-t border-gray-100 dark:border-gray-800 px-5 py-4 text-center">
                <p className="text-xs text-gray-400 font-jakarta">No subcategories yet</p>
                <button
                  onClick={() => { setAddParentId(parent.id); setShowAddSub(true); }}
                  className="text-xs text-brand font-semibold font-jakarta mt-1 hover:underline"
                >
                  + Add first subcategory
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add Parent Category Modal */}
      {showAddParent && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm shadow-2xl border border-gray-200 dark:border-gray-800 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-sora font-bold text-lg text-navy dark:text-white">Add Parent Category</h3>
              <button onClick={() => setShowAddParent(false)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 font-jakarta mb-1.5">Name</label>
                <input
                  type="text"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="e.g. AI Agents"
                  className="input-field text-sm"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddParent(); }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 font-jakarta mb-1.5">Description (optional)</label>
                <input
                  type="text"
                  value={addDescription}
                  onChange={(e) => setAddDescription(e.target.value)}
                  placeholder="Brief description"
                  className="input-field text-sm"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowAddParent(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddParent}
                  disabled={addSubmitting || !addName.trim()}
                  className="flex-1 px-4 py-2.5 text-sm font-bold bg-brand hover:bg-brand/90 text-white rounded-xl disabled:opacity-50 transition-colors"
                >
                  {addSubmitting ? 'Adding...' : 'Add Category'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Subcategory Modal */}
      {showAddSub && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm shadow-2xl border border-gray-200 dark:border-gray-800 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-sora font-bold text-lg text-navy dark:text-white">Add Subcategory</h3>
              <button onClick={() => setShowAddSub(false)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 font-jakarta mb-1.5">Parent Category</label>
                <select
                  value={addParentId}
                  onChange={(e) => setAddParentId(e.target.value)}
                  className="input-field text-sm"
                >
                  <option value="">Select parent</option>
                  {categories.filter(c => c.isActive).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 font-jakarta mb-1.5">Subcategory Name</label>
                <input
                  type="text"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="e.g. RAG Pipelines"
                  className="input-field text-sm"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddSub(); }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 font-jakarta mb-1.5">Description (optional)</label>
                <input
                  type="text"
                  value={addDescription}
                  onChange={(e) => setAddDescription(e.target.value)}
                  placeholder="Brief description"
                  className="input-field text-sm"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowAddSub(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddSub}
                  disabled={addSubmitting || !addName.trim() || !addParentId}
                  className="flex-1 px-4 py-2.5 text-sm font-bold bg-brand hover:bg-brand/90 text-white rounded-xl disabled:opacity-50 transition-colors"
                >
                  {addSubmitting ? 'Adding...' : 'Add Subcategory'}
                </button>
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
            handleDelete(confirmDelete.id, confirmDelete.level);
            setConfirmDelete(null);
          }
        }}
        title={confirmDelete?.level === 'parent' ? 'Delete Parent Category' : 'Delete Subcategory'}
        message={
          confirmDelete?.level === 'parent'
            ? 'Delete this parent category? It must have no subcategories.'
            : 'Delete this subcategory? It must have no tools assigned.'
        }
        confirmLabel={confirmDelete?.level === 'parent' ? 'Delete Category' : 'Delete Subcategory'}
        variant="danger"
        requireTyping={true}
      />
    </div>
  );
}
