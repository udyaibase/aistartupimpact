'use client';

import { notify } from '@/components/Toast';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Plus, Search, RefreshCw, Trash2, Edit3, X, Save,
  ChevronDown, ChevronRight, Tag, Hash, Loader2, Eye, EyeOff,
} from 'lucide-react';
import {
  getTagGroupsWithTagsAction,
  createTagAction,
  createTagsBulkAction,
  updateTagAction,
  deleteTagAction,
  refreshTagCountsAction,
} from './actions';
import { ConfirmModal } from '@/components/ConfirmModal';

interface TagItem {
  id: string;
  name: string;
  slug: string;
  emoji: string | null;
  groupId: string;
  sortOrder: number;
  isActive: boolean;
  tagCount: number;
}

interface TagGroupItem {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  description: string | null;
  sortOrder: number;
  displayMode: string;
  maxVisibleDefault: number;
  isAdminOnly: boolean;
  isActive: boolean;
  tags: TagItem[];
}

export default function TagsManagementPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<TagGroupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Add tag modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addGroupId, setAddGroupId] = useState('');
  const [addName, setAddName] = useState('');
  const [addEmoji, setAddEmoji] = useState('');
  const [addSubmitting, setAddSubmitting] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Edit tag inline
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmoji, setEditEmoji] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const data = await getTagGroupsWithTagsAction();
    setGroups(data as TagGroupItem[]);
    // Expand all groups by default
    setExpandedGroups(new Set((data as TagGroupItem[]).map(g => g.id)));
    setLoading(false);
  };

  const handleRefreshCounts = async () => {
    setRefreshing(true);
    await refreshTagCountsAction();
    await loadData();
    setRefreshing(false);
  };

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const parsedTags = addName
    .split(',')
    .map(t => t.trim())
    .filter(t => t.length > 0);

  const handleAddTag = async () => {
    if (parsedTags.length === 0 || !addGroupId) return;
    setAddSubmitting(true);

    if (parsedTags.length === 1) {
      const result = await createTagAction({
        name: parsedTags[0],
        groupId: addGroupId,
        emoji: addEmoji.trim() || undefined,
      });
      if (result.success) {
        setShowAddModal(false);
        setAddName('');
        setAddEmoji('');
        setAddGroupId('');
        await loadData();
      } else {
        notify(result.error || 'Failed to create tag');
      }
    } else {
      const result = await createTagsBulkAction({
        names: parsedTags,
        groupId: addGroupId,
      });
      if (result.success) {
        const msg = `Created ${result.created} tag${result.created !== 1 ? 's' : ''}` +
          (result.failed && result.failed.length > 0
            ? `. Skipped: ${result.failed.map((f: any) => `${f.name} (${f.error})`).join(', ')}`
            : '');
        notify(msg);
        setShowAddModal(false);
        setAddName('');
        setAddEmoji('');
        setAddGroupId('');
        await loadData();
      } else {
        notify(result.error || 'Failed to create tags');
      }
    }
    setAddSubmitting(false);
  };

  const handleToggleActive = async (tag: TagItem) => {
    await updateTagAction(tag.id, { isActive: !tag.isActive });
    await loadData();
  };

  const handleDeleteTag = async (tagId: string) => {
    await deleteTagAction(tagId);
    await loadData();
  };

  const startEdit = (tag: TagItem) => {
    setEditingTag(tag.id);
    setEditName(tag.name);
    setEditEmoji(tag.emoji || '');
  };

  const saveEdit = async (tagId: string) => {
    await updateTagAction(tagId, { name: editName, emoji: editEmoji || undefined });
    setEditingTag(null);
    await loadData();
  };

  // Filter groups/tags by search
  const filteredGroups = groups.map(g => ({
    ...g,
    tags: search
      ? g.tags.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
      : g.tags,
  })).filter(g => !search || g.tags.length > 0);

  const totalTags = groups.reduce((sum, g) => sum + g.tags.length, 0);
  const activeTags = groups.reduce((sum, g) => sum + g.tags.filter(t => t.isActive).length, 0);

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
            <h1 className="portal-title">Tag System</h1>
            <p className="portal-subtitle">
              {groups.length} groups • {totalTags} total tags • {activeTags} active
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefreshCounts}
            disabled={refreshing}
            className="btn-outline text-xs flex items-center gap-1.5 px-3 py-2"
            title="Recalculate tag usage counts"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh Counts
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-brand text-sm flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add Tag
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search tags across all groups..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field pl-10"
        />
      </div>

      {/* Groups */}
      <div className="space-y-4">
        {filteredGroups.map((group) => (
          <div key={group.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
            {/* Group Header */}
            <button
              onClick={() => toggleGroup(group.id)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                {expandedGroups.has(group.id)
                  ? <ChevronDown className="w-4 h-4 text-gray-400" />
                  : <ChevronRight className="w-4 h-4 text-gray-400" />
                }
                <div className="text-left">
                  <h3 className="font-sora font-bold text-sm text-navy dark:text-white">
                    {group.name}
                    {group.isAdminOnly && (
                      <span className="ml-2 text-[10px] bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full font-jakarta">
                        Admin Only
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-gray-400 font-jakarta">
                    {group.tags.length} tags • {group.displayMode} • show {group.maxVisibleDefault} by default
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 font-jakarta bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                  {group.tags.filter(t => t.isActive).length} active
                </span>
              </div>
            </button>

            {/* Tags List */}
            {expandedGroups.has(group.id) && (
              <div className="border-t border-gray-100 dark:border-gray-800 px-5 py-3">
                <div className="flex flex-wrap gap-2">
                  {group.tags.map((tag) => (
                    <div
                      key={tag.id}
                      className={`group relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-jakarta transition-all ${
                        tag.isActive
                          ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                          : 'bg-gray-50 dark:bg-gray-900 border-gray-100 dark:border-gray-800 text-gray-400 dark:text-gray-600 line-through'
                      }`}
                    >
                      {editingTag === tag.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="bg-gray-100 dark:bg-gray-700 rounded px-2 py-0.5 text-xs w-40"
                            onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(tag.id); if (e.key === 'Escape') setEditingTag(null); }}
                            autoFocus
                          />
                          <button onClick={() => saveEdit(tag.id)} className="p-0.5 text-green-500 hover:text-green-600">
                            <Save className="w-3 h-3" />
                          </button>
                          <button onClick={() => setEditingTag(null)} className="p-0.5 text-gray-400 hover:text-gray-600">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <span>{tag.name}</span>
                          {tag.tagCount > 0 && (
                            <span className="text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-full ml-1">
                              {tag.tagCount}
                            </span>
                          )}
                          {/* Hover actions */}
                          <div className="hidden group-hover:flex items-center gap-0.5 ml-1">
                            <button
                              onClick={() => startEdit(tag)}
                              className="p-0.5 text-gray-400 hover:text-brand"
                              title="Edit tag"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleToggleActive(tag)}
                              className="p-0.5 text-gray-400 hover:text-orange-500"
                              title={tag.isActive ? 'Deactivate' : 'Activate'}
                            >
                              {tag.isActive ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            </button>
                            <button
                              onClick={() => setConfirmDelete(tag.id)}
                              className="p-0.5 text-gray-400 hover:text-red-500"
                              title="Delete tag"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                  {/* Quick add inline */}
                  <button
                    onClick={() => { setAddGroupId(group.id); setShowAddModal(true); }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 text-xs text-gray-400 hover:border-brand hover:text-brand transition-colors"
                  >
                    <Plus className="w-3 h-3" /> Add
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add Tag Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm shadow-2xl border border-gray-200 dark:border-gray-800 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-sora font-bold text-lg text-navy dark:text-white">Add Tag{parsedTags.length > 1 ? 's' : ''}</h3>
              <button onClick={() => setShowAddModal(false)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Group Select */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 font-jakarta mb-1.5">Group</label>
                <select
                  value={addGroupId}
                  onChange={(e) => setAddGroupId(e.target.value)}
                  className="input-field text-sm"
                >
                  <option value="">Select group</option>
                  {groups.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>

              {/* Tag Names */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 font-jakarta mb-1.5">
                  Tag Name{parsedTags.length > 1 ? 's' : ''}
                </label>
                <input
                  type="text"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="e.g. Web App, Mobile App, Desktop App"
                  className="input-field text-sm"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddTag(); }}
                />
                <p className="text-[10px] text-gray-400 font-jakarta mt-1">
                  Separate multiple tags with commas
                </p>
              </div>

              {/* Preview chips */}
              {parsedTags.length > 1 && (
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 font-jakarta mb-1.5 uppercase tracking-wide">
                    {parsedTags.length} tags to add
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {parsedTags.map((tag, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand/10 text-brand text-xs font-jakarta"
                      >
                        <Tag className="w-2.5 h-2.5" />
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddTag}
                  disabled={addSubmitting || parsedTags.length === 0 || !addGroupId}
                  className="flex-1 px-4 py-2.5 text-sm font-bold bg-brand hover:bg-brand/90 text-white rounded-xl disabled:opacity-50 transition-colors"
                >
                  {addSubmitting ? 'Adding...' : parsedTags.length > 1 ? `Add ${parsedTags.length} Tags` : 'Add Tag'}
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
            handleDeleteTag(confirmDelete);
            setConfirmDelete(null);
          }
        }}
        title="Delete Tag"
        message="Delete this tag? All tool mappings for this tag will be removed."
        confirmLabel="Delete Tag"
        variant="danger"
        requireTyping={true}
      />
    </div>
  );
}
