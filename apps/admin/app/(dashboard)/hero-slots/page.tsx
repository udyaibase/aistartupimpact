'use client';

import { notify } from '@/components/Toast';
import { useState, useEffect, useMemo } from 'react';
import { Plus, Edit3, Trash2, X, Save, Calendar, Eye, EyeOff, GripVertical, Layers, Search, FileText, ChevronDown } from 'lucide-react';
import {
  getHeroSlotsAction, createHeroSlotAction,
  updateHeroSlotAction, deleteHeroSlotAction,
  getPublishedArticlesForHeroAction,
} from './actions';

interface HeroSlot {
  id: string;
  title: string;
  excerpt?: string;
  coverImage?: string;
  ctaUrl: string;
  ctaLabel: string;
  badgeText: string;
  authorName?: string;
  readTimeMinutes?: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

interface Article {
  id: string;
  title: string;
  slug: string;
  type: string;
  excerpt?: string;
  coverImage?: string;
  thumbnailImage?: string;
  readTimeMinutes?: number;
  publishedAt?: string;
  authorName?: string;
  categoryName?: string;
}

const empty: Omit<HeroSlot, 'id' | 'createdAt'> = {
  title: '', excerpt: '', coverImage: '', ctaUrl: '', ctaLabel: 'Read Story',
  badgeText: 'Featured', authorName: '', readTimeMinutes: undefined,
  startDate: '', endDate: '', isActive: true, sortOrder: 0,
};

function statusBadge(slot: HeroSlot) {
  const now = new Date();
  const start = new Date(slot.startDate);
  const end = new Date(slot.endDate);
  if (!slot.isActive) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-500">Inactive</span>;
  if (now < start) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">Scheduled</span>;
  if (now > end) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 dark:bg-red-900/30 text-red-500">Expired</span>;
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400">● Live</span>;
}

function toDatetimeLocal(iso: string) {
  if (!iso) return '';
  return iso.slice(0, 16);
}

function typeToPath(type: string) {
  if (type === 'STORY') return 'stories';
  return 'news';
}

function typeToBadge(type: string) {
  if (type === 'STORY') return 'Founder Story';
  if (type === 'INTERVIEW') return 'Interview';
  return 'Featured';
}

export default function HeroSlotsPage() {
  const [slots, setSlots] = useState<HeroSlot[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<HeroSlot | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  // Article picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const [slotsData, articlesData] = await Promise.all([
      getHeroSlotsAction(),
      getPublishedArticlesForHeroAction(),
    ]);
    setSlots(slotsData as HeroSlot[]);
    setArticles(articlesData as Article[]);
    setLoading(false);
  };

  const filteredArticles = useMemo(() =>
    articles.filter(a =>
      a.title.toLowerCase().includes(pickerSearch.toLowerCase()) ||
      (a.categoryName || '').toLowerCase().includes(pickerSearch.toLowerCase()) ||
      (a.authorName || '').toLowerCase().includes(pickerSearch.toLowerCase())
    ), [articles, pickerSearch]);

  const openCreate = () => {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 86400000);
    setEditing({
      ...empty, id: '', createdAt: '',
      startDate: now.toISOString().slice(0, 16),
      endDate: tomorrow.toISOString().slice(0, 16),
    } as HeroSlot);
    setPickerOpen(false);
    setPickerSearch('');
    setModalOpen(true);
  };

  const openEdit = (s: HeroSlot) => {
    setEditing({ ...s, startDate: toDatetimeLocal(s.startDate), endDate: toDatetimeLocal(s.endDate) });
    setPickerOpen(false);
    setPickerSearch('');
    setModalOpen(true);
  };

  // When an article is picked, auto-fill all fields
  const pickArticle = (article: Article) => {
    if (!editing) return;
    const path = typeToPath(article.type);
    setEditing({
      ...editing,
      title: article.title,
      excerpt: article.excerpt || '',
      coverImage: article.coverImage || article.thumbnailImage || '',
      ctaUrl: `/${path}/${article.slug}`,
      ctaLabel: 'Read Story',
      badgeText: typeToBadge(article.type),
      authorName: article.authorName || '',
      readTimeMinutes: article.readTimeMinutes || undefined,
    });
    setPickerOpen(false);
    setPickerSearch('');
  };

  const handleSave = async () => {
    if (!editing) return;
    const payload = {
      title: editing.title,
      excerpt: editing.excerpt,
      coverImage: editing.coverImage,
      ctaUrl: editing.ctaUrl,
      ctaLabel: editing.ctaLabel,
      badgeText: editing.badgeText,
      authorName: editing.authorName,
      readTimeMinutes: editing.readTimeMinutes,
      startDate: new Date(editing.startDate).toISOString(),
      endDate: new Date(editing.endDate).toISOString(),
      isActive: editing.isActive,
      sortOrder: editing.sortOrder,
    };
    let result;
    if (editing.id && slots.find(s => s.id === editing.id)) {
      result = await updateHeroSlotAction(editing.id, payload);
    } else {
      result = await createHeroSlotAction(payload);
    }
    if (result && !result.success) {
      notify('Save failed: ' + (result.error || 'Unknown error'));
      return;
    }
    setModalOpen(false);
    setEditing(null);
    await load();
  };

  const handleDelete = async (id: string) => {
    await deleteHeroSlotAction(id);
    setDeleteConfirm(null);
    await load();
  };

  const liveCount = slots.filter(s => {
    const now = new Date();
    return s.isActive && new Date(s.startDate) <= now && new Date(s.endDate) >= now;
  }).length;

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="portal-title flex items-center gap-2">
            <Layers className="w-6 h-6 text-brand" /> Hero Slots
          </h1>
          <p className="portal-subtitle">
            Schedule up to 5 stories/brands for the homepage hero · {liveCount} live now
          </p>
        </div>
        <button onClick={openCreate} className="btn-brand text-sm flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Slot
        </button>
      </div>

      {/* Slots list */}
      <div className="space-y-3">
        {slots.length === 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-12 text-center text-gray-400 font-jakarta text-sm">
            No hero slots yet. Add one to start scheduling.
          </div>
        )}
        {slots.map((slot) => (
          <div key={slot.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4 flex items-start gap-4">
            <GripVertical className="w-4 h-4 text-gray-300 mt-1 shrink-0" />
            <div className="w-20 h-14 rounded-lg bg-gray-100 dark:bg-gray-800 overflow-hidden shrink-0">
              {slot.coverImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={slot.coverImage} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-300">
                  <Layers className="w-5 h-5" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {statusBadge(slot)}
                <span className="text-[10px] font-bold uppercase tracking-wider text-brand bg-brand/10 px-2 py-0.5 rounded-full">{slot.badgeText}</span>
                <span className="text-[10px] text-gray-400 font-jakarta">Order: {slot.sortOrder}</span>
              </div>
              <h3 className="font-sora font-semibold text-sm text-navy dark:text-white line-clamp-1">{slot.title}</h3>
              {slot.excerpt && <p className="text-xs text-gray-400 font-jakarta line-clamp-1 mt-0.5">{slot.excerpt}</p>}
              <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-400 font-jakarta">
                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {new Date(slot.startDate).toLocaleDateString()} → {new Date(slot.endDate).toLocaleDateString()}</span>
                {slot.authorName && <span>By {slot.authorName}</span>}
                {slot.readTimeMinutes && <span>{slot.readTimeMinutes} min read</span>}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => openEdit(slot)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                <Edit3 className="w-3.5 h-3.5 text-gray-400" />
              </button>
              <button onClick={() => setDeleteConfirm(slot.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">
                <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Create / Edit Modal ── */}
      {modalOpen && editing && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg shadow-2xl border border-gray-200 dark:border-gray-800 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
              <h2 className="font-sora font-bold text-lg text-navy dark:text-white">
                {editing.id && slots.find(s => s.id === editing.id) ? 'Edit Hero Slot' : 'New Hero Slot'}
              </h2>
              <button onClick={() => { setModalOpen(false); setEditing(null); setPickerOpen(false); }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">

              {/* ── Article Picker ── */}
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
                  Load from existing article
                </label>
                <button
                  type="button"
                  onClick={() => setPickerOpen(v => !v)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 font-jakarta transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-brand" />
                    {pickerOpen ? 'Close article picker' : 'Pick an article to auto-fill fields'}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
                </button>

                {pickerOpen && (
                  <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                    {/* Search */}
                    <div className="relative border-b border-gray-100 dark:border-gray-800">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input
                        autoFocus
                        type="text"
                        placeholder="Search articles..."
                        value={pickerSearch}
                        onChange={e => setPickerSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200 placeholder-gray-400 outline-none font-jakarta"
                      />
                    </div>
                    {/* Article list */}
                    <div className="max-h-52 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
                      {filteredArticles.length === 0 && (
                        <p className="px-4 py-6 text-center text-xs text-gray-400 font-jakarta">No articles found</p>
                      )}
                      {filteredArticles.map(article => (
                        <button
                          key={article.id}
                          type="button"
                          onClick={() => pickArticle(article)}
                          className="w-full flex items-start gap-3 px-4 py-3 hover:bg-brand/5 dark:hover:bg-brand/10 text-left transition-colors group"
                        >
                          {/* Thumbnail */}
                          <div className="w-12 h-9 rounded-md bg-gray-100 dark:bg-gray-700 overflow-hidden shrink-0 mt-0.5">
                            {(article.thumbnailImage || article.coverImage) ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={article.thumbnailImage || article.coverImage} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <FileText className="w-3.5 h-3.5 text-gray-300" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-navy dark:text-white font-sora line-clamp-2 group-hover:text-brand transition-colors">
                              {article.title}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {article.categoryName && (
                                <span className="text-[10px] font-bold uppercase text-brand">{article.categoryName}</span>
                              )}
                              {article.authorName && (
                                <span className="text-[10px] text-gray-400 font-jakarta">· {article.authorName}</span>
                              )}
                              {article.readTimeMinutes && (
                                <span className="text-[10px] text-gray-400 font-jakarta">· {article.readTimeMinutes}m</span>
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-dashed border-gray-200 dark:border-gray-700 pt-4">
                <p className="text-[10px] text-gray-400 font-jakarta mb-4 uppercase tracking-wider">Or fill manually</p>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">Title *</label>
                    <input className="input-field text-sm" value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} placeholder="Story or brand headline" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">Excerpt</label>
                    <textarea className="input-field text-sm" rows={2} value={editing.excerpt || ''} onChange={e => setEditing({ ...editing, excerpt: e.target.value })} placeholder="Short description shown under the title" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">Cover Image URL</label>
                    <div className="flex gap-2 items-center">
                      <input className="input-field text-sm flex-1" value={editing.coverImage || ''} onChange={e => setEditing({ ...editing, coverImage: e.target.value })} placeholder="https://..." />
                      {editing.coverImage && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={editing.coverImage} alt="" className="w-12 h-9 rounded-lg object-cover border border-gray-200 dark:border-gray-700 shrink-0" onError={e => (e.currentTarget.style.display = 'none')} />
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">CTA URL *</label>
                      <input className="input-field text-sm" value={editing.ctaUrl} onChange={e => setEditing({ ...editing, ctaUrl: e.target.value })} placeholder="/news/slug or https://..." />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">CTA Label</label>
                      <input className="input-field text-sm" value={editing.ctaLabel} onChange={e => setEditing({ ...editing, ctaLabel: e.target.value })} placeholder="Read Story" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">Badge Text</label>
                      <input className="input-field text-sm" value={editing.badgeText} onChange={e => setEditing({ ...editing, badgeText: e.target.value })} placeholder="Featured / Interview / Sponsored" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">Sort Order</label>
                      <input type="number" className="input-field text-sm" value={editing.sortOrder} onChange={e => setEditing({ ...editing, sortOrder: parseInt(e.target.value) || 0 })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">Author Name</label>
                      <input className="input-field text-sm" value={editing.authorName || ''} onChange={e => setEditing({ ...editing, authorName: e.target.value })} placeholder="e.g. Venkatesh Lahori" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">Read Time (min)</label>
                      <input type="number" className="input-field text-sm" value={editing.readTimeMinutes || ''} onChange={e => setEditing({ ...editing, readTimeMinutes: parseInt(e.target.value) || undefined })} placeholder="8" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">Start Date & Time *</label>
                      <input type="datetime-local" className="input-field text-sm" value={editing.startDate} onChange={e => setEditing({ ...editing, startDate: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">End Date & Time *</label>
                      <input type="datetime-local" className="input-field text-sm" value={editing.endDate} onChange={e => setEditing({ ...editing, endDate: e.target.value })} />
                    </div>
                  </div>
                  <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={editing.isActive} onChange={e => setEditing({ ...editing, isActive: e.target.checked })}
                        className="w-4 h-4 text-brand bg-gray-100 border-gray-300 rounded focus:ring-brand" />
                      <span className="text-sm font-medium text-navy dark:text-white font-jakarta flex items-center gap-2">
                        {editing.isActive ? <Eye className="w-4 h-4 text-green-500" /> : <EyeOff className="w-4 h-4 text-gray-400" />}
                        Active (visible when within date range)
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800 shrink-0">
              <button onClick={() => { setModalOpen(false); setEditing(null); setPickerOpen(false); }} className="px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Cancel</button>
              <button onClick={handleSave} disabled={!editing.title || !editing.ctaUrl || !editing.startDate || !editing.endDate}
                className="btn-brand text-sm flex items-center gap-2 disabled:opacity-50">
                <Save className="w-4 h-4" /> Save Slot
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm shadow-2xl border border-gray-200 dark:border-gray-800 p-6 text-center">
            <Trash2 className="w-10 h-10 text-red-500 mx-auto mb-3" />
            <h3 className="font-sora font-bold text-lg text-navy dark:text-white">Delete Hero Slot?</h3>
            <p className="text-sm text-gray-500 font-jakarta mt-1">This cannot be undone.</p>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300">Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 px-4 py-2.5 text-sm font-medium bg-red-500 hover:bg-red-600 text-white rounded-xl">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
