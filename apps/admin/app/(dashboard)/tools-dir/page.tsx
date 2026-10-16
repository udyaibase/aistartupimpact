'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Search, Wrench, Edit3, Trash2, Crown, CheckCircle, XCircle, Calendar, X, Clock, Camera,
} from 'lucide-react';
import { ConfirmModal } from '@/components/ConfirmModal';
import { Pagination } from '@/components/Pagination';
import { TableEmptyState } from '@/components/EmptyState';
import {
  getToolsAction,
  getCategoriesAction,
  deleteToolAction,
  approveToolAction,
  rejectToolAction,
  setListingTierAction,
  scheduleToolFeaturedCampaignAction,
  cancelToolFeaturedCampaignAction,
  bulkApproveToolsAction,
  bulkArchiveToolsAction,
  bulkDeleteToolsAction,
  toggleToolContentReviewedAction,
} from './actions';

interface Tool {
  id: string;
  name: string;
  slug: string;
  tagline: string;
  description: string;
  logoUrl?: string;
  websiteUrl: string;
  pricingModel: string;
  pricingUrl?: string;
  startingPrice?: number | null;
  avgRating: number;
  listingTier: string;
  status: string;
  contentReviewed: boolean;
  claimStatus?: string;
  categoryId: string;
  categoryName?: string;
  hasApi?: boolean;
  hasMobileApp?: boolean;
  founderNames?: string[];
  headquartersCountry?: string;
  ownerName?: string;
  ownerEmail?: string;
  createdAt: string;
  updatedAt: string;
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

const listingTiers = ['STANDARD', 'PRIORITY', 'FEATURED'];

const PAGE_SIZE = 20;

export default function ToolsDirPage() {
  const router = useRouter();
  const [tools, setTools] = useState<Tool[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleteTyped, setDeleteTyped] = useState('');
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkDeleteTyped, setBulkDeleteTyped] = useState('');
  const [loading, setLoading] = useState(true);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [featureModal, setFeatureModal] = useState<Tool | null>(null);
  const [featureTier, setFeatureTier] = useState<'FEATURED' | 'PRIORITY' | 'FREE'>('PRIORITY');
  const [featureStart, setFeatureStart] = useState('');
  const [featureEnd, setFeatureEnd] = useState('');
  const [featureNotes, setFeatureNotes] = useState('');
  const [featurePrice, setFeaturePrice] = useState('');
  const [featureError, setFeatureError] = useState('');
  const [featureSubmitting, setFeatureSubmitting] = useState(false);
  const [bulkAction, setBulkAction] = useState<'approve' | 'archive' | null>(null);
  const [filterReview, setFilterReview] = useState<'all' | 'reviewed' | 'under_review'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'PENDING' | 'APPROVED' | 'ARCHIVED'>('all');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [toolsData, catsData] = await Promise.all([
        getToolsAction(),
        getCategoriesAction(),
      ]);
      setTools(toolsData as Tool[]);
      setCategories(catsData as Category[]);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filtered = tools.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.tagline || '').toLowerCase().includes(search.toLowerCase()) ||
    (t.categoryName || '').toLowerCase().includes(search.toLowerCase())
  ).filter(t => {
    if (filterReview === 'reviewed') return t.contentReviewed;
    if (filterReview === 'under_review') return !t.contentReviewed;
    return true;
  }).filter(t => {
    if (filterStatus !== 'all') return t.status === filterStatus;
    return true;
  });

  const totalFiltered = filtered.length;
  const totalPages = Math.ceil(totalFiltered / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const pendingCount = tools.filter(t => t.status === 'PENDING').length;
  const featuredCount = tools.filter(t => t.listingTier === 'FEATURED').length;
  const underReviewCount = tools.filter(t => !t.contentReviewed).length;

  const openCreate = () => {
    router.push('/tools-dir/new');
  };

  const openEdit = (tool: Tool) => {
    router.push(`/tools-dir/${tool.id}/edit`);
  };

  const handleDelete = async (id: string) => {
    try {
      const result = await deleteToolAction(id);
      if (result.success) {
        await loadData();
      } else if (result.error) {
        setPermissionError(result.error);
      }
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting tool:', error);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      const result = await approveToolAction(id);
      if (result.success) {
        await loadData();
      }
    } catch (error) {
      console.error('Error approving tool:', error);
    }
  };

  const handleReject = async (id: string) => {
    try {
      const result = await rejectToolAction(id);
      if (result.success) {
        await loadData();
      }
    } catch (error) {
      console.error('Error rejecting tool:', error);
    }
  };

  const handleTierChange = async (id: string, tier: string) => {
    try {
      const result = await setListingTierAction(id, tier);
      if (result.success) {
        await loadData();
      }
    } catch (error) {
      console.error('Error changing tier:', error);
    }
  };

  const handleToggleReview = async (id: string, current: boolean) => {
    try {
      const result = await toggleToolContentReviewedAction(id, current);
      if (result.success) {
        await loadData();
      }
    } catch (error) {
      console.error('Error toggling review:', error);
    }
  };

  const openFeatureModal = (tool: Tool) => {
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    setFeatureModal(tool);
    setFeatureTier('PRIORITY');
    setFeatureStart(today);
    setFeatureEnd(thirtyDaysLater);
    setFeatureNotes('');
    setFeaturePrice('');
    setFeatureError('');
  };

  const handleScheduleFeatured = async () => {
    if (!featureModal) return;
    setFeatureSubmitting(true);
    setFeatureError('');
    try {
      const result = await scheduleToolFeaturedCampaignAction({
        toolId: featureModal.id,
        tier: featureTier,
        startDate: featureStart,
        endDate: featureEnd,
        notes: featureNotes || undefined,
        pricePaid: featurePrice ? parseInt(featurePrice) : undefined,
      });
      if (result.success) {
        setFeatureModal(null);
        await loadData();
      } else {
        let errMsg = result.error || 'Failed to schedule';
        if ((result as any).nextAvailableDate) {
          errMsg += ` Next available: ${(result as any).nextAvailableDate}`;
        }
        setFeatureError(errMsg);
      }
    } catch (error) {
      setFeatureError('Unexpected error');
    } finally {
      setFeatureSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-sora font-extrabold text-2xl text-navy dark:text-white">AI Tools Directory</h1>
          <p className="text-gray-400 dark:text-gray-500 text-sm font-jakarta mt-1">
            Manage AI tools • {pendingCount > 0 ? <span className="text-amber-500 font-semibold">{pendingCount} pending</span> : 'All approved'} • {featuredCount} featured • {underReviewCount > 0 ? <span className="text-orange-400 font-semibold">{underReviewCount} under review</span> : 'All reviewed'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => router.push('/tools-dir/bulk-screenshots')} className="btn-outline text-xs flex items-center gap-1.5 px-3 py-2">
            <Camera className="w-3.5 h-3.5" /> Screenshots
          </button>
          <button onClick={() => router.push('/tools-dir/collections')} className="btn-outline text-xs flex items-center gap-1.5 px-3 py-2">
            Collections
          </button>
          <button onClick={() => router.push('/tools-dir/categories')} className="btn-outline text-xs flex items-center gap-1.5 px-3 py-2">
            Categories
          </button>
          <button onClick={() => router.push('/tools-dir/tags')} className="btn-outline text-xs flex items-center gap-1.5 px-3 py-2">
            Tags
          </button>
          <button onClick={openCreate} className="btn-brand text-sm flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Tool
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search tools..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="input-field pl-10" />
        </div>
        <select
          value={filterReview}
          onChange={(e) => { setFilterReview(e.target.value as any); setPage(1); }}
          className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-jakarta text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <option value="all">All Reviews</option>
          <option value="under_review">Under Review</option>
          <option value="reviewed">Reviewed</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value as any); setPage(1); }}
          className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-jakarta text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <option value="all">All Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="ARCHIVED">Archived</option>
        </select>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800/50 text-left">
              <th className="px-3 py-3 w-10">
                <input
                  type="checkbox"
                  checked={selectedIds.size === filtered.length && filtered.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedIds(new Set(filtered.map(t => t.id)));
                    else setSelectedIds(new Set());
                  }}
                  className="w-4 h-4 text-brand border-gray-300 rounded focus:ring-brand"
                />
              </th>
              <th className="px-4 py-3 font-jakarta font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Tool</th>
              <th className="px-4 py-3 font-jakarta font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden md:table-cell">Category</th>
              <th className="px-4 py-3 font-jakarta font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden lg:table-cell">Pricing</th>
              <th className="px-4 py-3 font-jakarta font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Review</th>
              <th className="px-4 py-3 font-jakarta font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</th>
              <th className="px-4 py-3 font-jakarta font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Tier</th>
              <th className="px-4 py-3 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((tool) => (
              <tr key={tool.id} className="border-t border-gray-50 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                <td className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(tool.id)}
                    onChange={(e) => {
                      const next = new Set(selectedIds);
                      if (e.target.checked) next.add(tool.id);
                      else next.delete(tool.id);
                      setSelectedIds(next);
                    }}
                    className="w-4 h-4 text-brand border-gray-300 rounded focus:ring-brand"
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center overflow-hidden shrink-0">
                      {tool.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={tool.logoUrl} alt={tool.name} className="w-full h-full object-contain p-0.5" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <Wrench className="w-3.5 h-3.5 text-brand" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h4 className="font-sora font-semibold text-xs text-navy dark:text-white">{tool.name}</h4>
                        {tool.listingTier === 'FEATURED' && <Crown className="w-3 h-3 text-yellow-500" />}
                      </div>
                      <p className="text-[10px] text-gray-400 font-jakarta line-clamp-1 max-w-[160px]">{tool.tagline}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 hidden md:table-cell whitespace-nowrap">
                  <span className="badge-category text-[9px] px-2 py-0.5">{tool.categoryName || '—'}</span>
                </td>
                <td className="px-4 py-3 hidden lg:table-cell whitespace-nowrap">
                  <span className="text-xs text-gray-600 dark:text-gray-400 font-jakarta">{tool.pricingModel}</span>
                </td>
                {/* Content Review chip */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <button
                    onClick={() => handleToggleReview(tool.id, tool.contentReviewed)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide cursor-pointer transition-colors ${
                      tool.contentReviewed
                        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                        : 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400'
                    }`}
                    title={tool.contentReviewed ? 'Mark as Under Review' : 'Mark as Reviewed'}
                  >
                    {tool.contentReviewed
                      ? <><CheckCircle className="w-2.5 h-2.5" /> Reviewed</>
                      : <><Clock className="w-2.5 h-2.5" /> Under Review</>
                    }
                  </button>
                </td>
                {/* Status */}
                <td className="px-4 py-3 whitespace-nowrap">
                  {tool.status === 'PENDING' ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleApprove(tool.id)}
                        className="p-1 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20"
                        title="Approve"
                      >
                        <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                      </button>
                      <button
                        onClick={() => handleReject(tool.id)}
                        className="p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                        title="Reject"
                      >
                        <XCircle className="w-3.5 h-3.5 text-red-500" />
                      </button>
                      <span className="text-[9px] text-orange-500 font-bold ml-0.5">PENDING</span>
                    </div>
                  ) : (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold ${
                      tool.status === 'APPROVED'
                        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                    }`}>
                      {tool.status === 'APPROVED' && <CheckCircle className="w-2.5 h-2.5" />}
                      {tool.status}
                    </span>
                  )}
                </td>
                {/* Tier */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <button
                    onClick={() => openFeatureModal(tool)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold cursor-pointer transition-colors ${
                      tool.listingTier === 'FEATURED'
                        ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                        : tool.listingTier === 'PRIORITY'
                        ? 'bg-brand/10 dark:bg-brand/20 text-brand'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-yellow-50'
                    }`}
                  >
                    {tool.listingTier === 'FEATURED' ? (
                      <><Crown className="w-2.5 h-2.5 fill-current" /> Featured</>
                    ) : tool.listingTier === 'PRIORITY' ? (
                      <><Crown className="w-2.5 h-2.5" /> Priority</>
                    ) : (
                      <><Calendar className="w-2.5 h-2.5" /> Schedule</>
                    )}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(tool)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                      <Edit3 className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                    <button onClick={() => setDeleteConfirm(tool.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">
                      <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {paginated.length === 0 && (
              <TableEmptyState colSpan={8} icon={Wrench} title="No tools found" description="Try adjusting your search or filters" />
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={totalPages} total={totalFiltered} pageSize={PAGE_SIZE} onPageChange={setPage} />

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-gray-900 dark:bg-gray-800 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-4 border border-gray-700">
          <span className="text-sm font-semibold font-jakarta">{selectedIds.size} selected</span>
          <div className="w-px h-6 bg-gray-700" />
          <button
            onClick={() => setBulkAction('approve')}
            className="px-3 py-1.5 text-xs font-semibold bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
          >
            Approve All
          </button>
          <button
            onClick={() => setBulkAction('archive')}
            className="px-3 py-1.5 text-xs font-semibold bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors"
          >
            Archive All
          </button>
          <button
            onClick={() => setBulkDeleteConfirm(true)}
            className="px-3 py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
          >
            Delete All
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="p-1.5 text-gray-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm shadow-2xl border border-gray-200 dark:border-gray-800 p-6 text-center">
            <Trash2 className="w-10 h-10 text-red-500 mx-auto mb-3" />
            <h3 className="font-sora font-bold text-lg text-navy dark:text-white">Delete Tool?</h3>
            <p className="text-sm text-gray-500 font-jakarta mt-2">This action is permanent and cannot be undone.</p>
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

      {/* Bulk Delete Confirmation */}
      {bulkDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm shadow-2xl border border-gray-200 dark:border-gray-800 p-6 text-center">
            <Trash2 className="w-10 h-10 text-red-500 mx-auto mb-3" />
            <h3 className="font-sora font-bold text-lg text-navy dark:text-white">Delete {selectedIds.size} Tools?</h3>
            <p className="text-sm text-gray-500 font-jakarta mt-2">This will permanently delete all selected tools. Only Super Admins can perform this action.</p>
            <p className="text-xs text-gray-400 font-jakarta mt-3">Type <span className="font-bold text-red-500">DELETE</span> to confirm:</p>
            <input
              type="text"
              value={bulkDeleteTyped}
              onChange={(e) => setBulkDeleteTyped(e.target.value)}
              placeholder="Type DELETE"
              className="w-full mt-2 px-4 py-2 text-center text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent font-mono tracking-widest"
              autoFocus
            />
            <div className="flex gap-3 mt-4">
              <button onClick={() => { setBulkDeleteConfirm(false); setBulkDeleteTyped(''); }} className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300">Cancel</button>
              <button
                onClick={async () => {
                  const result = await bulkDeleteToolsAction([...selectedIds]);
                  if (!result.success) setPermissionError(result.error || 'Permission denied');
                  else { setSelectedIds(new Set()); await loadData(); }
                  setBulkDeleteConfirm(false);
                  setBulkDeleteTyped('');
                }}
                disabled={bulkDeleteTyped !== 'DELETE'}
                className="flex-1 px-4 py-2.5 text-sm font-medium bg-red-500 hover:bg-red-600 text-white rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >
                Delete All
              </button>
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

      {/* Bulk Approve/Archive Confirm Modal */}
      <ConfirmModal
        open={bulkAction === 'approve'}
        onClose={() => setBulkAction(null)}
        onConfirm={async () => {
          setBulkAction(null);
          await bulkApproveToolsAction([...selectedIds]);
          setSelectedIds(new Set());
          await loadData();
        }}
        title="Approve Tools"
        message={`Approve ${selectedIds.size} tools?`}
        confirmLabel="Approve"
        variant="warning"
      />
      <ConfirmModal
        open={bulkAction === 'archive'}
        onClose={() => setBulkAction(null)}
        onConfirm={async () => {
          setBulkAction(null);
          await bulkArchiveToolsAction([...selectedIds]);
          setSelectedIds(new Set());
          await loadData();
        }}
        title="Archive Tools"
        message={`Archive ${selectedIds.size} tools?`}
        confirmLabel="Archive"
        variant="warning"
      />

      {/* Tool Featured Campaign Scheduling Modal */}
      {featureModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md shadow-2xl border border-gray-200 dark:border-gray-800 p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-sora font-bold text-lg text-navy dark:text-white">Schedule Featured</h3>
                <p className="text-xs text-gray-500 font-jakarta mt-0.5">{featureModal.name}</p>
              </div>
              <button onClick={() => setFeatureModal(null)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Tier Selection */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 font-jakarta mb-1.5">
                  Tier <span className="text-gray-400 font-normal">(UTC dates)</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['FEATURED', 'PRIORITY', 'FREE'] as const).map(tier => (
                    <button
                      key={tier}
                      onClick={() => setFeatureTier(tier)}
                      className={`px-3 py-2 rounded-lg text-xs font-bold font-jakarta transition-all border ${
                        featureTier === tier
                          ? tier === 'FEATURED'
                            ? 'bg-yellow-50 border-yellow-300 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-600 dark:text-yellow-300'
                            : tier === 'PRIORITY'
                            ? 'bg-brand/10 border-brand/30 text-brand'
                            : 'bg-gray-100 border-gray-300 text-gray-700 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300'
                          : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      <div>{tier}</div>
                      <div className="text-[10px] font-normal mt-0.5 opacity-70">
                        {tier === 'FEATURED' ? '1 slot' : tier === 'PRIORITY' ? '4 slots' : '6 slots'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Date Range */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 font-jakarta mb-1.5">Start Date (UTC)</label>
                  <input
                    type="date"
                    value={featureStart}
                    onChange={e => setFeatureStart(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-jakarta text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-brand focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 font-jakarta mb-1.5">End Date (UTC)</label>
                  <input
                    type="date"
                    value={featureEnd}
                    onChange={e => setFeatureEnd(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-jakarta text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-brand focus:border-transparent"
                  />
                </div>
              </div>

              {/* Quick presets */}
              <div className="flex gap-2">
                {[7, 14, 30, 60].map(days => (
                  <button
                    key={days}
                    onClick={() => {
                      const today = new Date().toISOString().split('T')[0];
                      const end = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                      setFeatureStart(today);
                      setFeatureEnd(end);
                    }}
                    className="px-2.5 py-1 rounded-md text-[10px] font-semibold font-jakarta bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-brand/10 hover:text-brand transition-colors"
                  >
                    {days}d
                  </button>
                ))}
              </div>

              {/* Optional Fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 font-jakarta mb-1.5">Price Paid (INR)</label>
                  <input
                    type="number"
                    value={featurePrice}
                    onChange={e => setFeaturePrice(e.target.value)}
                    placeholder="Optional"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-jakarta text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:ring-2 focus:ring-brand focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 font-jakarta mb-1.5">Notes</label>
                  <input
                    type="text"
                    value={featureNotes}
                    onChange={e => setFeatureNotes(e.target.value)}
                    placeholder="Optional"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-jakarta text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:ring-2 focus:ring-brand focus:border-transparent"
                  />
                </div>
              </div>

              {/* Error */}
              {featureError && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <p className="text-xs text-red-700 dark:text-red-300 font-jakarta">{featureError}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setFeatureModal(null)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleScheduleFeatured}
                  disabled={featureSubmitting || !featureStart || !featureEnd}
                  className="flex-1 px-4 py-2.5 text-sm font-bold bg-brand hover:bg-brand/90 text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {featureSubmitting ? 'Scheduling...' : 'Schedule Campaign'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
