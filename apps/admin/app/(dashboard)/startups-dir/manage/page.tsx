'use client';

import { notify } from '@/components/Toast';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Plus, Search, Trash2, Edit3, X, Save,
  Loader2, Eye, EyeOff,
} from 'lucide-react';
import { ConfirmModal } from '@/components/ConfirmModal';
import {
  getCanonicalCategoriesAction,
  getCanonicalTypesAction,
  getBusinessCategoriesAction,
  getBusinessTypesAction,
  addBusinessCategoryAction,
  addBusinessTypeAction,
  updateBusinessCategoryAction,
  updateBusinessTypeAction,
  deleteBusinessCategoryAction,
  deleteBusinessTypeAction,
  toggleBusinessCategoryAction,
  toggleBusinessTypeAction,
} from './actions';

interface ListItem {
  name: string;
  sortOrder: number;
  isActive: boolean;
  count?: number;
}

export default function ManageStartupMetaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<ListItem[]>([]);
  const [businessTypes, setBusinessTypes] = useState<ListItem[]>([]);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({});

  // Add state
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showAddType, setShowAddType] = useState(false);
  const [addName, setAddName] = useState('');
  const [addSubmitting, setAddSubmitting] = useState(false);

  // Edit state
  const [editingItem, setEditingItem] = useState<{ name: string; section: 'category' | 'type' } | null>(null);
  const [editName, setEditName] = useState('');

  // Search
  const [searchCat, setSearchCat] = useState('');
  const [searchType, setSearchType] = useState('');

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{ name: string; section: 'category' | 'type' } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [cats, types, catCounts, typCountData] = await Promise.all([
      getCanonicalCategoriesAction(),
      getCanonicalTypesAction(),
      getBusinessCategoriesAction(),
      getBusinessTypesAction(),
    ]);

    setCategories(cats as ListItem[]);
    setBusinessTypes(types as ListItem[]);

    // Build count maps
    const cm: Record<string, number> = {};
    (catCounts as any[]).forEach(c => { cm[c.name] = c.count; });
    setCategoryCounts(cm);

    const tm: Record<string, number> = {};
    (typCountData as any[]).forEach(t => { tm[t.name] = t.count; });
    setTypeCounts(tm);

    setLoading(false);
  };

  const handleAddCategory = async () => {
    if (!addName.trim()) return;
    setAddSubmitting(true);
    const result = await addBusinessCategoryAction(addName.trim());
    if (result.success) {
      setShowAddCategory(false);
      setAddName('');
      await loadData();
    } else {
      notify(result.error);
    }
    setAddSubmitting(false);
  };

  const handleAddType = async () => {
    if (!addName.trim()) return;
    setAddSubmitting(true);
    const result = await addBusinessTypeAction(addName.trim());
    if (result.success) {
      setShowAddType(false);
      setAddName('');
      await loadData();
    } else {
      notify(result.error);
    }
    setAddSubmitting(false);
  };

  const handleRename = async () => {
    if (!editingItem || !editName.trim()) return;
    const { name, section } = editingItem;
    const result = section === 'category'
      ? await updateBusinessCategoryAction(name, editName.trim())
      : await updateBusinessTypeAction(name, editName.trim());
    if (result.success) {
      setEditingItem(null);
      await loadData();
    } else {
      notify(result.error);
    }
  };

  const handleDelete = (name: string, section: 'category' | 'type') => {
    setDeleteTarget({ name, section });
  };

  const executeDelete = async () => {
    if (!deleteTarget) return;
    const { name, section } = deleteTarget;
    setDeleteTarget(null);
    const result = section === 'category'
      ? await deleteBusinessCategoryAction(name)
      : await deleteBusinessTypeAction(name);
    if (result.success) {
      await loadData();
    } else {
      notify(result.error);
    }
  };

  const handleToggle = async (name: string, section: 'category' | 'type', currentActive: boolean) => {
    if (section === 'category') {
      await toggleBusinessCategoryAction(name, !currentActive);
    } else {
      await toggleBusinessTypeAction(name, !currentActive);
    }
    await loadData();
  };

  const filteredCategories = categories.filter(c =>
    !searchCat || c.name.toLowerCase().includes(searchCat.toLowerCase())
  );

  const filteredTypes = businessTypes.filter(t =>
    !searchType || t.name.toLowerCase().includes(searchType.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-brand" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push('/startups-dir')}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>
        <div>
          <h1 className="portal-title">Startup Metadata</h1>
          <p className="portal-subtitle">
            Manage business categories and types used across startups
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ─── Business Categories ─── */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <div>
              <h2 className="font-sora font-bold text-base text-navy dark:text-white">Business Categories</h2>
              <p className="text-xs text-gray-400 font-jakarta mt-0.5">{categories.length} categories</p>
            </div>
            <button
              onClick={() => { setShowAddCategory(true); setAddName(''); }}
              className="btn-brand text-xs flex items-center gap-1.5 px-3 py-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>

          {/* Search */}
          <div className="px-5 py-3 border-b border-gray-50 dark:border-gray-800">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search categories..."
                value={searchCat}
                onChange={(e) => setSearchCat(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-jakarta text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-brand focus:border-transparent"
              />
            </div>
          </div>

          {/* List */}
          <div className="max-h-[500px] overflow-y-auto">
            {filteredCategories.map((cat) => (
              <div
                key={cat.name}
                className={`group flex items-center justify-between px-5 py-2.5 border-b border-gray-50 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors ${!cat.isActive ? 'opacity-50' : ''}`}
              >
                {editingItem?.name === cat.name && editingItem.section === 'category' ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 bg-gray-100 dark:bg-gray-700 rounded px-2 py-1 text-xs font-jakarta"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setEditingItem(null); }}
                      autoFocus
                    />
                    <button onClick={handleRename} className="p-1 text-green-500 hover:text-green-600"><Save className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setEditingItem(null)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-jakarta ${cat.isActive ? 'text-gray-800 dark:text-gray-200' : 'text-gray-400 line-through'}`}>
                        {cat.name}
                      </span>
                      {categoryCounts[cat.name] ? (
                        <span className="text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-full font-jakarta">
                          {categoryCounts[cat.name]}
                        </span>
                      ) : null}
                    </div>
                    <div className="hidden group-hover:flex items-center gap-1">
                      <button
                        onClick={() => { setEditingItem({ name: cat.name, section: 'category' }); setEditName(cat.name); }}
                        className="p-1 text-gray-400 hover:text-brand" title="Rename"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleToggle(cat.name, 'category', cat.isActive)}
                        className="p-1 text-gray-400 hover:text-orange-500" title={cat.isActive ? 'Deactivate' : 'Activate'}
                      >
                        {cat.isActive ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => handleDelete(cat.name, 'category')}
                        className="p-1 text-gray-400 hover:text-red-500" title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
            {filteredCategories.length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-gray-400 font-jakarta">No categories found</div>
            )}
          </div>
        </div>

        {/* ─── Business Types ─── */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <div>
              <h2 className="font-sora font-bold text-base text-navy dark:text-white">Business Types</h2>
              <p className="text-xs text-gray-400 font-jakarta mt-0.5">{businessTypes.length} types</p>
            </div>
            <button
              onClick={() => { setShowAddType(true); setAddName(''); }}
              className="btn-brand text-xs flex items-center gap-1.5 px-3 py-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>

          {/* Search */}
          <div className="px-5 py-3 border-b border-gray-50 dark:border-gray-800">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search types..."
                value={searchType}
                onChange={(e) => setSearchType(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-jakarta text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-brand focus:border-transparent"
              />
            </div>
          </div>

          {/* List */}
          <div className="max-h-[500px] overflow-y-auto">
            {filteredTypes.map((type) => (
              <div
                key={type.name}
                className={`group flex items-center justify-between px-5 py-2.5 border-b border-gray-50 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors ${!type.isActive ? 'opacity-50' : ''}`}
              >
                {editingItem?.name === type.name && editingItem.section === 'type' ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 bg-gray-100 dark:bg-gray-700 rounded px-2 py-1 text-xs font-jakarta"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setEditingItem(null); }}
                      autoFocus
                    />
                    <button onClick={handleRename} className="p-1 text-green-500 hover:text-green-600"><Save className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setEditingItem(null)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-jakarta ${type.isActive ? 'text-gray-800 dark:text-gray-200' : 'text-gray-400 line-through'}`}>
                        {type.name}
                      </span>
                      {typeCounts[type.name] ? (
                        <span className="text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-full font-jakarta">
                          {typeCounts[type.name]}
                        </span>
                      ) : null}
                    </div>
                    <div className="hidden group-hover:flex items-center gap-1">
                      <button
                        onClick={() => { setEditingItem({ name: type.name, section: 'type' }); setEditName(type.name); }}
                        className="p-1 text-gray-400 hover:text-brand" title="Rename"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleToggle(type.name, 'type', type.isActive)}
                        className="p-1 text-gray-400 hover:text-orange-500" title={type.isActive ? 'Deactivate' : 'Activate'}
                      >
                        {type.isActive ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => handleDelete(type.name, 'type')}
                        className="p-1 text-gray-400 hover:text-red-500" title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
            {filteredTypes.length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-gray-400 font-jakarta">No types found</div>
            )}
          </div>
        </div>
      </div>

      {/* Add Category Modal */}
      {showAddCategory && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm shadow-2xl border border-gray-200 dark:border-gray-800 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-sora font-bold text-lg text-navy dark:text-white">Add Business Category</h3>
              <button onClick={() => setShowAddCategory(false)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 font-jakarta mb-1.5">Category Name</label>
                <input
                  type="text"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="e.g. SpaceTech"
                  className="input-field text-sm"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddCategory(); }}
                  autoFocus
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowAddCategory(false)} className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300">Cancel</button>
                <button onClick={handleAddCategory} disabled={addSubmitting || !addName.trim()} className="flex-1 px-4 py-2.5 text-sm font-bold bg-brand hover:bg-brand/90 text-white rounded-xl disabled:opacity-50 transition-colors">
                  {addSubmitting ? 'Adding...' : 'Add'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={executeDelete}
        title={`Delete ${deleteTarget?.section === 'category' ? 'Category' : 'Type'}`}
        message={`Delete "${deleteTarget?.name}"? Only works if no startups use it.`}
        confirmLabel="Delete"
        variant="danger"
        requireTyping
      />

      {/* Add Type Modal */}
      {showAddType && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm shadow-2xl border border-gray-200 dark:border-gray-800 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-sora font-bold text-lg text-navy dark:text-white">Add Business Type</h3>
              <button onClick={() => setShowAddType(false)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 font-jakarta mb-1.5">Type Name</label>
                <input
                  type="text"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="e.g. SaaS"
                  className="input-field text-sm"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddType(); }}
                  autoFocus
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowAddType(false)} className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300">Cancel</button>
                <button onClick={handleAddType} disabled={addSubmitting || !addName.trim()} className="flex-1 px-4 py-2.5 text-sm font-bold bg-brand hover:bg-brand/90 text-white rounded-xl disabled:opacity-50 transition-colors">
                  {addSubmitting ? 'Adding...' : 'Add'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
