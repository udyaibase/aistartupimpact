'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Plus, Search, Filter, Edit3, Clock, CheckCircle, AlertCircle,
  Archive, Eye, Trash2, X, Send, MoreHorizontal, ArrowUp, ArrowDown, FileText,
} from 'lucide-react';

import { getArticlesAction, updateArticleStatusAction, deleteArticleAction, duplicateArticleAction } from './actions';
import { Pagination } from '@/components/Pagination';
import { TableEmptyState } from '@/components/EmptyState';

interface Article {
  id: string; title: string; slug: string; status: string; type: string; authorId?: string;
  author: string; category: string; publishedAt: string | null; scheduledAt?: string | null; updatedAt?: string; views: number;
}

const fmtDate = (iso?: string | null, time = false) => iso
  ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}) })
  : '';

const PAGE_SIZE = 20;

const statusConfig: Record<string, { color: string; icon: typeof CheckCircle }> = {
  DRAFT: { color: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400', icon: Edit3 },
  IN_REVIEW: { color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400', icon: AlertCircle },
  SCHEDULED: { color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400', icon: Clock },
  PUBLISHED: { color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400', icon: CheckCircle },
  ARCHIVED: { color: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400', icon: Archive },
};

const types = ['NEWS', 'STORY', 'GUIDE', 'COMPARISON', 'OPINION', 'REPORT', 'SPONSORED'];

export default function ArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleteTyped, setDeleteTyped] = useState('');
  const [actionMenu, setActionMenu] = useState<string | null>(null);
  const [sortField, setSortField] = useState<'views' | 'publishedAt' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [viewer, setViewer] = useState<{ id: string; canPublish: boolean } | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const fetchArticles = async () => {
      try {
        const json = await getArticlesAction();
        if (json.success && json.data) {
          setArticles(json.data.map((a: any) => ({
            id: a.id,
            title: a.title,
            slug: a.slug,
            status: a.status,
            type: a.type,
            authorId: a.authorId,
            author: a.author?.name || 'Unknown',
            category: a.category?.name || 'Uncategorized',
            publishedAt: a.publishedAt, scheduledAt: a.scheduledAt, updatedAt: a.updatedAt,
            views: a.viewCount || 0,
          })));
          setViewer(json.viewer ?? null);
        } else {
          console.error("Failed to load articles via action:", json.error);
          setFetchError(json.error || 'Failed to load articles');
        }
      } catch (e: any) {
        console.error('Failed to fetch articles', e);
        setFetchError(e?.message || 'Unexpected error');
      } finally {
        setLoading(false);
      }
    };
    fetchArticles();
  }, []);

  // Filter articles
  let filtered = articles.filter(a => {
    if (activeTab !== 'all' && a.status !== activeTab) return false;
    if (typeFilter !== 'all' && a.type !== typeFilter) return false;

    const searchLower = search.toLowerCase();
    const titleMatch = (a.title || '').toLowerCase().includes(searchLower);
    const authorMatch = (a.author || '').toLowerCase().includes(searchLower);

    if (search && !titleMatch && !authorMatch) return false;
    return true;
  });

  // Sort
  const dateOf = (a: Article) => Date.parse(a.publishedAt || a.scheduledAt || a.updatedAt || '') || 0;
  if (sortField === 'views') filtered = [...filtered].sort((a, b) => sortDir === 'desc' ? b.views - a.views : a.views - b.views);
  if (sortField === 'publishedAt') filtered = [...filtered].sort((a, b) => sortDir === 'desc' ? dateOf(b) - dateOf(a) : dateOf(a) - dateOf(b));

  // Paginate
  const totalFiltered = filtered.length;
  const totalPages = Math.ceil(totalFiltered / PAGE_SIZE);
  const paginatedArticles = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Tab counts
  const counts: Record<string, number> = { all: articles.length };
  articles.forEach(a => { counts[a.status] = (counts[a.status] || 0) + 1; });

  // Type counts
  const typeCounts: Record<string, number> = { all: articles.length };
  articles.forEach(a => { typeCounts[a.type] = (typeCounts[a.type] || 0) + 1; });

  const statusTabs = [
    { label: 'All', value: 'all' }, { label: 'Draft', value: 'DRAFT' }, { label: 'In Review', value: 'IN_REVIEW' },
    { label: 'Published', value: 'PUBLISHED' }, { label: 'Scheduled', value: 'SCHEDULED' }, { label: 'Archived', value: 'ARCHIVED' },
  ];

  const typeTabs = [
    { label: 'All Types', value: 'all' },
    { label: 'News', value: 'NEWS' },
    { label: 'Founder Stories', value: 'STORY' },
    { label: 'Opinion', value: 'OPINION' },
    { label: 'Guide', value: 'GUIDE' },
    { label: 'Report', value: 'REPORT' },
    { label: 'Sponsored', value: 'SPONSORED' },
  ];

  // Actions
  const changeStatus = async (id: string, newStatus: string) => {
    try {
      const res = await updateArticleStatusAction(id, newStatus);
      if (!res.success) throw new Error(res.error || 'Action failed');

      setArticles(articles.map(a => a.id === id ? { ...a, status: newStatus, publishedAt: newStatus === 'PUBLISHED' ? a.publishedAt || new Date().toISOString() : a.publishedAt } : a));
    } catch (e: any) {
      alert(e?.message || 'Failed to update status. Please try again.');
    }
    setActionMenu(null);
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await deleteArticleAction(id);
      if (res.success) {
        setArticles(articles.filter(a => a.id !== id));
      } else {
        setPermissionError(res.error || 'Failed to delete');
      }
    } catch (e) {
      console.error('Failed to delete', e);
    }
    setDeleteConfirm(null);
  };

  const toggleSort = (field: 'views' | 'publishedAt') => {
    if (sortField === field) setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const duplicate = async (article: Article) => {
    setActionMenu(null);
    const res = await duplicateArticleAction(article.id);
    if (res.success && res.data) {
      setArticles([res.data as Article, ...articles]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-sora font-extrabold text-2xl text-navy dark:text-white">Articles</h1>
          <p className="text-gray-400 dark:text-gray-500 text-sm font-jakarta mt-1">Manage all editorial content across the platform.</p>
        </div>
        <Link href="/articles/new" className="btn-brand text-sm flex items-center gap-2"><Plus className="w-4 h-4" /> New Article</Link>
      </div>

      {/* Status Tabs */}
      <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 overflow-x-auto">
        {statusTabs.map((tab) => (
          <button key={tab.value} onClick={() => { setActiveTab(tab.value); setPage(1); }} className={`px-4 py-2 rounded-md text-sm font-jakarta font-medium whitespace-nowrap transition-all ${tab.value === activeTab ? 'bg-white dark:bg-gray-700 text-navy dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-navy dark:hover:text-white'}`}>
            {tab.label}<span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">{counts[tab.value] || 0}</span>
          </button>
        ))}
      </div>

      {/* Type Filter — News vs Founder Stories vs Opinion etc. */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {typeTabs.map(tab => (
          <button key={tab.value} onClick={() => { setTypeFilter(tab.value); setPage(1); }}
            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all font-jakarta ${
              typeFilter === tab.value
                ? tab.value === 'STORY' ? 'bg-brand text-white'
                  : tab.value === 'NEWS' ? 'bg-blue-600 text-white'
                  : tab.value === 'OPINION' ? 'bg-purple-600 text-white'
                  : 'bg-navy dark:bg-white text-white dark:text-navy'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}>
            {tab.label}
            <span className="ml-1 opacity-70">{typeCounts[tab.value] ?? (tab.value === 'all' ? articles.length : 0)}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
          <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search articles by title or author..." className="input-field pl-10" />
        </div>
      </div>

      {/* Article Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-visible">
        {fetchError && (
          <div className="px-6 py-4 bg-red-50 dark:bg-red-900/20 border-b border-red-100 dark:border-red-800 text-sm text-red-600 dark:text-red-400 font-jakarta">
            Error: {fetchError}. Try signing out and back in.
          </div>
        )}
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800/50 text-left">
              <th className="px-6 py-3 font-jakarta font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Article</th>
              <th className="px-6 py-3 font-jakarta font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden md:table-cell">Status</th>
              <th className="px-6 py-3 font-jakarta font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden lg:table-cell">Category</th>
              <th className="px-6 py-3 font-jakarta font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden sm:table-cell cursor-pointer select-none" onClick={() => toggleSort('views')}>
                <span className="flex items-center gap-1">Views {sortField === 'views' && (sortDir === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />)}</span>
              </th>
              <th className="px-6 py-3 font-jakarta font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden md:table-cell cursor-pointer select-none" onClick={() => toggleSort('publishedAt')}>
                <span className="flex items-center gap-1">Date {sortField === 'publishedAt' && (sortDir === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />)}</span>
              </th>
              <th className="px-6 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {paginatedArticles.length === 0 && (
              <TableEmptyState colSpan={6} icon={FileText} title="No articles found" description="Try adjusting your search or filters" />
            )}
            {paginatedArticles.map((article, idx) => {
              const config = statusConfig[article.status];
              const StatusIcon = config?.icon || Edit3;
              const isNearBottom = idx >= paginatedArticles.length - 3;
              return (
                <tr key={article.id} className="border-t border-gray-50 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                  <td className="px-6 py-4">
                    <Link href={`/articles/${article.id}`} className="group cursor-pointer block">
                      <h4 className="font-sora font-semibold text-sm text-navy dark:text-white group-hover:text-brand transition-colors line-clamp-1">{article.title}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-jakarta ${
                          article.type === 'STORY' ? 'bg-brand/10 text-brand' :
                          article.type === 'NEWS' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
                          article.type === 'OPINION' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' :
                          article.type === 'SPONSORED' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' :
                          'bg-gray-100 dark:bg-gray-800 text-gray-500'
                        }`}>
                          {article.type === 'STORY' ? 'Founder Story' : article.type}
                        </span>
                        <p className="text-xs text-gray-400 dark:text-gray-500 font-jakarta">by {article.author}</p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-6 py-4 hidden md:table-cell">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${config?.color}`}>
                      <StatusIcon className="w-3 h-3" />{article.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 hidden lg:table-cell">
                    <span className="text-sm text-gray-600 dark:text-gray-400 font-jakarta">{article.category}</span>
                  </td>
                  <td className="px-6 py-4 hidden sm:table-cell">
                    <span className="text-sm text-gray-600 dark:text-gray-400 font-jakarta font-medium">{article.views > 0 ? article.views.toLocaleString() : '—'}</span>
                  </td>
                  <td className="px-6 py-4 hidden md:table-cell">
                    <span className="text-sm text-gray-400 dark:text-gray-500 font-jakarta">
                      {article.status === 'SCHEDULED' && article.scheduledAt ? `Goes live ${fmtDate(article.scheduledAt, true)}` : article.publishedAt ? fmtDate(article.publishedAt) : `Edited ${fmtDate(article.updatedAt)}`}
                    </span>
                  </td>
                  <td className="px-6 py-4 relative">
                    <button onClick={() => setActionMenu(actionMenu === article.id ? null : article.id)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                      <MoreHorizontal className="w-4 h-4 text-gray-400" />
                    </button>
                    {actionMenu === article.id && (
                      <div className={`absolute right-6 z-20 w-48 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl py-1 ${isNearBottom ? 'bottom-10' : 'top-10'}`}>
                        <Link href={`/articles/${article.id}`} className="w-full text-left px-4 py-2 text-sm font-jakarta text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2"><Edit3 className="w-3.5 h-3.5" /> Edit Article</Link>
                        {article.status === 'DRAFT' && (viewer?.canPublish || article.authorId === viewer?.id) && <button onClick={() => changeStatus(article.id, 'IN_REVIEW')} className="w-full text-left px-4 py-2 text-sm font-jakarta text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2"><Send className="w-3.5 h-3.5" /> Submit for Review</button>}
                        {article.status === 'IN_REVIEW' && viewer?.canPublish && <button onClick={() => changeStatus(article.id, 'PUBLISHED')} className="w-full text-left px-4 py-2 text-sm font-jakarta text-green-600 dark:text-green-400 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5" /> Publish</button>}
                        {article.status === 'PUBLISHED' && viewer?.canPublish && <button onClick={() => changeStatus(article.id, 'ARCHIVED')} className="w-full text-left px-4 py-2 text-sm font-jakarta text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2"><Archive className="w-3.5 h-3.5" /> Archive</button>}
                        {article.status === 'ARCHIVED' && viewer?.canPublish && <button onClick={() => changeStatus(article.id, 'DRAFT')} className="w-full text-left px-4 py-2 text-sm font-jakarta text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2"><Edit3 className="w-3.5 h-3.5" /> Move to Draft</button>}
                        <button onClick={() => duplicate(article)} className="w-full text-left px-4 py-2 text-sm font-jakarta text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2"><Eye className="w-3.5 h-3.5" /> Duplicate</button>
                        <div className="border-t border-gray-100 dark:border-gray-800 my-1" />
                        <button onClick={() => { setDeleteConfirm(article.id); setActionMenu(null); }} className="w-full text-left px-4 py-2 text-sm font-jakarta text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <Pagination
        page={page}
        totalPages={totalPages}
        total={totalFiltered}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />

      {/* Delete Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm shadow-2xl border border-gray-200 dark:border-gray-800 p-6 text-center">
            <Trash2 className="w-10 h-10 text-red-500 mx-auto mb-3" />
            <h3 className="font-sora font-bold text-lg text-navy dark:text-white">Delete Article?</h3>
            <p className="text-sm text-gray-500 font-jakarta mt-2">This action is permanent. The article and all associated data will be removed.</p>
            <p className="text-xs text-gray-400 font-jakarta mt-3">Type <span className="font-bold text-red-500">DELETE</span> to confirm:</p>
            <input
              type="text"
              value={deleteTyped}
              onChange={(e) => setDeleteTyped(e.target.value)}
              placeholder="Type DELETE"
              className="w-full mt-2 px-4 py-2 text-center text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent font-mono tracking-widest"
              autoFocus
            />
            <div className="flex gap-3 mt-4">
              <button onClick={() => { setDeleteConfirm(null); setDeleteTyped(''); }} className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300">Cancel</button>
              <button onClick={() => { handleDelete(deleteConfirm); setDeleteTyped(''); }} disabled={deleteTyped !== 'DELETE'} className="flex-1 px-4 py-2.5 text-sm font-medium bg-red-500 hover:bg-red-600 text-white rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-opacity">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Permission Denied Modal */}
      {permissionError && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm shadow-2xl border border-gray-200 dark:border-gray-800 p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
            <h3 className="font-sora font-bold text-lg text-navy dark:text-white">Permission Denied</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-jakarta mt-2 leading-relaxed">{permissionError}</p>
            <button
              onClick={() => setPermissionError(null)}
              className="mt-5 w-full px-4 py-2.5 text-sm font-medium bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 text-white dark:text-gray-900 rounded-xl transition-colors"
            >
              Understood
            </button>
          </div>
        </div>
      )}

      {/* Close action menu on click outside */}
      {actionMenu && <div className="fixed inset-0 z-10" onClick={() => setActionMenu(null)} />}
    </div>
  );
}
