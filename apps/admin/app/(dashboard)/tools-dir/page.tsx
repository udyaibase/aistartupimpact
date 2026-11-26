'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Wrench, Edit3, Trash2, Crown, CheckCircle, XCircle, X, Camera } from 'lucide-react';
import DataTable, { type BulkAction, type Column, type TableFilter } from '@/components/ui/DataTable';
import { ask } from '@/components/Ask';
import RejectToolDialog from '@/components/RejectToolDialog';
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
import { notify } from '@/components/Toast';

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


export default function ToolsDirPage() {
  const router = useRouter();
  const [tools, setTools] = useState<Tool[]>([]);
  const [rejecting, setRejecting] = useState<{ id: string; name: string } | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [featureModal, setFeatureModal] = useState<Tool | null>(null);
  const [featureTier, setFeatureTier] = useState<'FEATURED' | 'PRIORITY' | 'FREE'>('PRIORITY');
  const [featureStart, setFeatureStart] = useState('');
  const [featureEnd, setFeatureEnd] = useState('');
  const [featureNotes, setFeatureNotes] = useState('');
  const [featurePrice, setFeaturePrice] = useState('');
  const [featureError, setFeatureError] = useState('');
  const [featureSubmitting, setFeatureSubmitting] = useState(false);

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
      notify("Couldn't load this. Check your connection and refresh.", 'error');
    } finally {
      setLoading(false);
    }
  };

  const pendingCount = tools.filter(t => t.status === 'PENDING').length;
  const featuredCount = tools.filter(t => t.listingTier === 'FEATURED').length;
  const underReviewCount = tools.filter(t => !t.contentReviewed).length;

  /** Runs one change, says what happened, and reloads the list. */
  const run = async (work: () => Promise<{ success: boolean; error?: string }>, done: string, failed: string) => {
    try {
      const result = await work();
      if (!result.success) { notify(result.error || failed, 'error'); return false; }
      notify(done, 'success');
      await loadData();
      return true;
    } catch {
      notify(`${failed} Check your connection and try again.`, 'error');
      return false;
    }
  };

  const handleDelete = async (tool: Tool) => {
    if (!(await ask({ title: 'Delete tool', message: `Delete ${tool.name}? Its page, reviews and analytics are removed for good.${tool.status === 'APPROVED' ? ' It is live on the website now.' : ''}`, confirmLabel: 'Delete', danger: true }))) return;
    await run(() => deleteToolAction(tool.id), `${tool.name} deleted.`, `Couldn't delete ${tool.name}.`);
  };
  const handleApprove = (tool: Tool) => run(() => approveToolAction(tool.id), `${tool.name} approved and live.`, `Couldn't approve ${tool.name}.`);
  const handleToggleReview = (tool: Tool) => run(() => toggleToolContentReviewedAction(tool.id, tool.contentReviewed), tool.contentReviewed ? `${tool.name} is back under review.` : `${tool.name} marked as reviewed.`, `Couldn't change the review status.`);

  const handleReject = async (reason: string) => {
    if (!rejecting) return;
    const result = await rejectToolAction(rejecting.id, reason);
    if (!result.success) return result.error || 'Couldn’t reject this tool. Try again.';
    setRejecting(null);
    await loadData();
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

  const label = (v: string | null | undefined) => (v ? v.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : '–');
  const STATUS_STYLE: Record<string, string> = {
    APPROVED: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
    PENDING: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300',
  };
  const neutral = 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300';
  const small = 'px-2.5 py-1 text-xs font-semibold rounded-lg whitespace-nowrap';

  const columns = useMemo<Column<Tool>[]>(() => [
    {
      key: 'tool', header: 'Tool', sortValue: (t) => t.name, searchValue: (t) => `${t.name} ${t.tagline ?? ''} ${t.categoryName ?? ''} ${t.ownerEmail ?? ''}`,
      cell: (t) => (
        <div className="flex items-center gap-2.5 min-w-[200px] max-w-xs">
          <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden shrink-0">
            {t.logoUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={t.logoUrl} alt="" className="w-full h-full object-contain p-0.5" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              : <Wrench className="w-3.5 h-3.5 text-gray-500" aria-hidden />}
          </div>
          <div className="min-w-0">
            <Link href={`/tools-dir/${t.id}/edit`} className="font-semibold text-gray-900 dark:text-white hover:underline flex items-center gap-1.5">
              <span className="truncate">{t.name}</span>
              {t.listingTier === 'FEATURED' && <Crown className="w-3 h-3 text-amber-500 shrink-0" aria-label="Featured" />}
            </Link>
            <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-1">{t.tagline}</p>
          </div>
        </div>
      ),
    },
    { key: 'category', header: 'Category', sortValue: (t) => t.categoryName, cell: (t) => <span className="whitespace-nowrap">{t.categoryName || '–'}</span> },
    { key: 'pricing', header: 'Pricing', sortValue: (t) => t.pricingModel, cell: (t) => <span className="whitespace-nowrap">{label(t.pricingModel)}</span> },
    {
      key: 'review', header: 'Content review', sortValue: (t) => (t.contentReviewed ? 1 : 0),
      cell: (t) => (
        <button onClick={() => handleToggleReview(t)} title={t.contentReviewed ? 'Put back under review' : 'Mark as reviewed'} aria-label={`${t.name}: ${t.contentReviewed ? 'reviewed. Put back under review' : 'under review. Mark as reviewed'}`}
          className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap hover:ring-2 hover:ring-gray-300 dark:hover:ring-gray-600 ${t.contentReviewed ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300'}`}>
          {t.contentReviewed ? 'Reviewed' : 'Under review'}
        </button>
      ),
    },
    {
      key: 'status', header: 'Status', sortValue: (t) => t.status,
      cell: (t) => (
        <div className="flex items-center gap-1.5">
          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLE[t.status] ?? neutral}`}>{label(t.status)}</span>
          {t.status === 'PENDING' && (
            <>
              <button onClick={() => handleApprove(t)} title="Approve" aria-label={`Approve ${t.name}`} className="p-1 rounded-lg text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20"><CheckCircle className="w-4 h-4" aria-hidden /></button>
              <button onClick={() => setRejecting({ id: t.id, name: t.name })} title="Reject" aria-label={`Reject ${t.name}`} className="p-1 rounded-lg text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"><XCircle className="w-4 h-4" aria-hidden /></button>
            </>
          )}
        </div>
      ),
    },
    {
      key: 'tier', header: 'Listing', sortValue: (t) => listingTiers.indexOf(t.listingTier),
      cell: (t) => (
        <button onClick={() => openFeatureModal(t)} aria-label={`${t.name}: ${label(t.listingTier)} listing. Schedule featuring`} title="Schedule featuring"
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap hover:ring-2 hover:ring-gray-300 dark:hover:ring-gray-600 ${t.listingTier === 'FEATURED' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300' : t.listingTier === 'PRIORITY' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300' : neutral}`}>
          {t.listingTier !== 'STANDARD' && <Crown className="w-3 h-3" aria-hidden />}{t.listingTier === 'STANDARD' ? 'Standard · schedule' : label(t.listingTier)}
        </button>
      ),
    },
    { key: 'added', header: 'Added', sortValue: (t) => new Date(t.createdAt), cell: (t) => <span className="text-xs whitespace-nowrap">{new Date(t.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}</span> },
    {
      key: 'actions', header: 'Actions', align: 'right',
      cell: (t) => (
        <div className="flex items-center justify-end gap-1">
          <Link href={`/tools-dir/${t.id}/edit`} aria-label={`Edit ${t.name}`} title="Edit" className="p-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"><Edit3 className="w-4 h-4" aria-hidden /></Link>
          <button onClick={() => handleDelete(t)} aria-label={`Delete ${t.name}`} title="Delete" className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-4 h-4" aria-hidden /></button>
        </div>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps -- cells call the latest handlers
  ], []);

  const filters = useMemo<TableFilter<Tool>[]>(() => [
    { key: 'status', label: 'Status', options: ['PENDING', 'APPROVED', 'ARCHIVED'].map((v) => ({ value: v, label: label(v) })), matches: (t, v) => t.status === v },
    { key: 'review', label: 'Content review', options: [{ value: 'under_review', label: 'Under review' }, { value: 'reviewed', label: 'Reviewed' }], matches: (t, v) => t.contentReviewed === (v === 'reviewed') },
    // Built from the tools themselves, so every category in the list can be picked, whatever level it sits at.
    { key: 'category', label: 'Category', options: [...new Set(tools.map((t) => t.categoryName).filter((v): v is string => !!v))].sort().map((v) => ({ value: v, label: v })), matches: (t, v) => t.categoryName === v },
    { key: 'tier', label: 'Listing', options: listingTiers.map((v) => ({ value: v, label: label(v) })), matches: (t, v) => t.listingTier === v },
    { key: 'pricing', label: 'Pricing', options: [...new Set(tools.map((t) => t.pricingModel).filter(Boolean))].sort().map((v) => ({ value: v, label: label(v) })), matches: (t, v) => t.pricingModel === v },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [tools, categories]);

  const bulk = (work: (ids: string[]) => Promise<{ success: boolean; error?: string }>, done: string) => async (rows: Tool[]) => {
    await run(() => work(rows.map((r) => r.id)), `${rows.length} tool${rows.length === 1 ? '' : 's'} ${done}.`, `Couldn't update the selected tools.`);
  };
  const bulkActions = useMemo<BulkAction<Tool>[]>(() => [
    { label: 'Approve', run: bulk(bulkApproveToolsAction, 'approved'), confirm: (n) => `Approve ${n} tool${n === 1 ? '' : 's'}? They go live on the website.` },
    { label: 'Archive', run: bulk(bulkArchiveToolsAction, 'archived'), confirm: (n) => `Archive ${n} tool${n === 1 ? '' : 's'}? They leave the website but are kept here.` },
    { label: 'Delete', danger: true, run: bulk(bulkDeleteToolsAction, 'deleted'), confirm: (n) => `Delete ${n} tool${n === 1 ? '' : 's'} for good? Only super admins can do this. This can't be undone.` },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], []);

  return (
    <div className="space-y-6">
      {rejecting && <RejectToolDialog toolName={rejecting.name} onCancel={() => setRejecting(null)} onReject={handleReject} />}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="portal-title">AI tools directory</h1>
          <p className="portal-subtitle">
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
          <Link href="/tools-dir/new" className="btn-brand text-sm gap-2"><Plus className="w-4 h-4" aria-hidden /> Add tool</Link>
        </div>
      </div>

      <DataTable
        tableId="tools-dir"
        noun="tools"
        rows={tools}
        rowKey={(t) => t.id}
        columns={columns}
        filters={filters}
        bulkActions={bulkActions}
        loading={loading}
        pageSize={20}
        searchPlaceholder="Search tool, tagline, category or owner email"
        empty={{ title: 'No tools yet', description: 'Tools submitted by founders, or added by you, appear here.' }}
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
