'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Building2, Edit3, Trash2, Crown, ShieldCheck, X } from 'lucide-react';
import DataTable, { type BulkAction, type Column, type TableFilter } from '@/components/ui/DataTable';
import { ask, askText } from '@/components/Ask';
import { getStartupsAction, deleteStartupAction, approveStartupAction, takeDownStartupAction, toggleContentReviewedAction, bulkApproveStartupsAction, bulkArchiveStartupsAction, bulkDeleteStartupsAction } from './actions';
import { toggleFeaturedAction, getFeaturedCampaignsAction, scheduleFeaturedCampaignAction, cancelFeaturedCampaignAction } from './startup-featured-actions';
import { notify } from '@/components/Toast';

interface Startup {
  id: string;
  name: string;
  tagline: string;
  description: string;
  logoUrl?: string;
  websiteUrl?: string;
  linkedinUrl?: string;
  twitterUrl?: string;
  stage: string;
  headquartersCity?: string;
  isFeatured: boolean;
  isApproved: boolean;
  contentReviewed: boolean;
  isVerified: boolean;
  claimStatus: string;
  approvedAt?: string;
  featuredUntil?: string;
  foundedYear?: number | null;
  employeeCount?: number | null;
  impactScore?: number | null;
  ownerId?: string | null;
  createdAt: string;
  updatedAt: string;
}


export default function StartupsDirPage() {
  const router = useRouter();
  const [startups, setStartups] = useState<Startup[]>([]);
  const [loading, setLoading] = useState(true);
  const [featureModal, setFeatureModal] = useState<Startup | null>(null);
  const [featureTier, setFeatureTier] = useState<'PREMIUM' | 'STANDARD' | 'BASIC'>('STANDARD');
  const [featureStart, setFeatureStart] = useState('');
  const [featureEnd, setFeatureEnd] = useState('');
  const [featureNotes, setFeatureNotes] = useState('');
  const [featurePrice, setFeaturePrice] = useState('');
  const [featureError, setFeatureError] = useState('');
  const [featureSubmitting, setFeatureSubmitting] = useState(false);

  useEffect(() => {
    loadStartups();
  }, []);

  const loadStartups = async () => {
    setLoading(true);
    try {
      const data = await getStartupsAction();
      setStartups(data as Startup[]);
    } catch (error) {
      console.error('Error loading startups:', error);
      notify("Couldn't load this. Check your connection and refresh.", 'error');
    } finally {
      setLoading(false);
    }
  };

  const featuredCount = startups.filter(s => s.isFeatured).length;
  const pendingCount = startups.filter(s => !s.isApproved).length;
  const underReviewCount = startups.filter(s => !s.contentReviewed).length;

  /** Runs one change, says what happened, and reloads the list. */
  const run = async (work: () => Promise<{ success: boolean; error?: string }>, done: string, failed: string) => {
    try {
      const result = await work();
      if (!result.success) { notify(result.error || failed, 'error'); return false; }
      notify(done, 'success');
      await loadStartups();
      return true;
    } catch {
      notify(`${failed} Check your connection and try again.`, 'error');
      return false;
    }
  };

  const handleDelete = async (st: Startup) => {
    if (!(await ask({ title: 'Delete startup', message: `Delete ${st.name}? Its page, funding rounds and milestones are removed for good.${st.isApproved ? ' It is live on the website now.' : ''}`, confirmLabel: 'Delete', danger: true }))) return;
    await run(() => deleteStartupAction(st.id), `${st.name} deleted.`, `Couldn't delete ${st.name}.`);
  };

  const openFeatureModal = (startup: Startup) => {
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    setFeatureModal(startup);
    setFeatureTier('STANDARD');
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
      const result = await scheduleFeaturedCampaignAction({
        startupId: featureModal.id,
        tier: featureTier,
        startDate: featureStart,
        endDate: featureEnd,
        notes: featureNotes || undefined,
        pricePaid: featurePrice ? parseInt(featurePrice) : undefined,
      });
      if (result.success) {
        setFeatureModal(null);
        await loadStartups();
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

  /** Remove a live startup from the site. The founder is told why and can fix it and send it for review again. */
  const handleTakeDown = async (st: Startup) => {
    const reason = await askText({
      title: `Take down ${st.name}`, label: 'Reason (sent to the founder)', required: true, multiline: true, danger: true, confirmLabel: 'Take down',
      message: 'It disappears from the directory, search and its own page straight away. Nothing is deleted, and it can be approved again from Submissions.',
      placeholder: 'For example: Udyaibase lists companies whose product is built on AI, and we could not see how AI is used in yours.',
    });
    if (!reason) return;
    await run(() => takeDownStartupAction(st.id, 'OTHER', reason), `${st.name} was taken down.`, `Couldn't take down ${st.name}.`);
  };

  const handleApprove = (st: Startup) => run(() => approveStartupAction(st.id), `${st.name} approved and live.`, `Couldn't approve ${st.name}.`);
  const handleToggleReview = (st: Startup) => run(() => toggleContentReviewedAction(st.id, st.contentReviewed), st.contentReviewed ? `${st.name} is back under review.` : `${st.name} marked as reviewed.`, `Couldn't change the review status.`);

  const label = (v: string | null | undefined) => (v ? v.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : '–');
  const good = 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300';
  const warn = 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300';
  const neutral = 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300';
  const pill = 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap';
  const claimOf = (st: Startup) => st.claimStatus || 'UNCLAIMED';
  /** PENDING (ours to approve), FOUNDER (submitted by a founder: approved from Founders) or APPROVED. */
  const approvalOf = (st: Startup) => (st.isApproved ? 'APPROVED' : st.ownerId ? 'FOUNDER' : 'PENDING');

  const columns = useMemo<Column<Startup>[]>(() => [
    {
      key: 'startup', header: 'Startup', sortValue: (st) => st.name, searchValue: (st) => `${st.name} ${st.tagline ?? ''} ${st.headquartersCity ?? ''}`,
      cell: (st) => (
        <div className="flex items-center gap-2.5 min-w-[200px] max-w-xs">
          <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden shrink-0">
            {st.logoUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={st.logoUrl} alt="" className="w-full h-full object-contain p-0.5" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              : <Building2 className="w-3.5 h-3.5 text-gray-500" aria-hidden />}
          </div>
          <div className="min-w-0">
            <Link href={`/startups-dir/${st.id}/edit`} className="font-semibold text-gray-900 dark:text-white hover:underline flex items-center gap-1.5">
              <span className="truncate">{st.name}</span>
              {st.isFeatured && <Crown className="w-3 h-3 text-amber-500 shrink-0" aria-label="Featured" />}
            </Link>
            <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-1">{st.tagline}</p>
          </div>
        </div>
      ),
    },
    { key: 'stage', header: 'Stage', sortValue: (st) => st.stage, cell: (st) => <span className="whitespace-nowrap">{label(st.stage)}</span> },
    { key: 'city', header: 'City', sortValue: (st) => st.headquartersCity, cell: (st) => st.headquartersCity || '–' },
    {
      key: 'review', header: 'Content review', sortValue: (st) => (st.contentReviewed ? 1 : 0),
      cell: (st) => (
        <button onClick={() => handleToggleReview(st)} title={st.contentReviewed ? 'Put back under review' : 'Mark as reviewed'} aria-label={`${st.name}: ${st.contentReviewed ? 'reviewed. Put back under review' : 'under review. Mark as reviewed'}`}
          className={`${pill} hover:ring-2 hover:ring-gray-300 dark:hover:ring-gray-600 ${st.contentReviewed ? good : warn}`}>{st.contentReviewed ? 'Reviewed' : 'Under review'}</button>
      ),
    },
    {
      key: 'claim', header: 'Claim', sortValue: (st) => claimOf(st),
      cell: (st) => <span className={`${pill} ${claimOf(st) === 'CLAIMED' ? good : claimOf(st) === 'PENDING' ? warn : neutral}`}>{label(claimOf(st))}</span>,
    },
    {
      key: 'verified', header: 'Verified', sortValue: (st) => (st.isVerified ? 0 : 1),
      cell: (st) => (st.isVerified ? <span className={`${pill} ${good}`}><ShieldCheck className="w-3 h-3" aria-hidden /> Verified</span> : '–'),
    },
    {
      key: 'approval', header: 'Approval', sortValue: (st) => approvalOf(st),
      cell: (st) => approvalOf(st) === 'APPROVED'
        ? <span className="inline-flex items-center gap-1.5"><span className={`${pill} ${good}`}>Approved</span><button type="button" onClick={() => handleTakeDown(st)} aria-label={`Take down ${st.name}`} className="text-xs text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:underline">Take down</button></span>
        : approvalOf(st) === 'FOUNDER'
          ? <Link href="/startups-dir/review" className={`${pill} ${neutral} hover:ring-2 hover:ring-gray-300`} title="Submitted by a founder. Review it in Submissions.">Founder submission · review</Link>
          : <button onClick={() => handleApprove(st)} aria-label={`Approve ${st.name}`} className={`${pill} ${warn} hover:ring-2 hover:ring-amber-300`}>Pending · approve</button>,
    },
    {
      key: 'featured', header: 'Featured', sortValue: (st) => (st.isFeatured ? 0 : 1),
      cell: (st) => (
        <button onClick={() => openFeatureModal(st)} aria-label={`${st.name}: ${st.isFeatured ? 'featured' : 'not featured'}. Schedule featuring`} title="Schedule featuring"
          className={`${pill} hover:ring-2 hover:ring-gray-300 dark:hover:ring-gray-600 ${st.isFeatured ? warn : neutral}`}>{st.isFeatured ? 'Featured' : 'Schedule'}</button>
      ),
    },
    {
      key: 'actions', header: 'Actions', align: 'right',
      cell: (st) => (
        <div className="flex items-center justify-end gap-1">
          <Link href={`/startups-dir/${st.id}/edit`} aria-label={`Edit ${st.name}`} title="Edit" className="p-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"><Edit3 className="w-4 h-4" aria-hidden /></Link>
          <button onClick={() => handleDelete(st)} aria-label={`Delete ${st.name}`} title="Delete" className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-4 h-4" aria-hidden /></button>
        </div>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps -- cells call the latest handlers
  ], []);

  const filters = useMemo<TableFilter<Startup>[]>(() => [
    { key: 'approval', label: 'Approval', options: [{ value: 'PENDING', label: 'Pending' }, { value: 'FOUNDER', label: 'Founder submission' }, { value: 'APPROVED', label: 'Approved' }], matches: (st, v) => approvalOf(st) === v },
    { key: 'review', label: 'Content review', options: [{ value: 'under_review', label: 'Under review' }, { value: 'reviewed', label: 'Reviewed' }], matches: (st, v) => st.contentReviewed === (v === 'reviewed') },
    { key: 'claim', label: 'Claim', options: ['UNCLAIMED', 'PENDING', 'CLAIMED'].map((v) => ({ value: v, label: label(v) })), matches: (st, v) => claimOf(st) === v },
    { key: 'stage', label: 'Stage', options: [...new Set(startups.map((st) => st.stage).filter(Boolean))].sort().map((v) => ({ value: v, label: label(v) })), matches: (st, v) => st.stage === v },
    { key: 'featured', label: 'Featured', options: [{ value: 'yes', label: 'Featured' }, { value: 'no', label: 'Not featured' }], matches: (st, v) => st.isFeatured === (v === 'yes') },
    { key: 'verified', label: 'Verified', options: [{ value: 'yes', label: 'Verified' }, { value: 'no', label: 'Not verified' }], matches: (st, v) => st.isVerified === (v === 'yes') },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [startups]);

  const bulk = (work: (ids: string[]) => Promise<{ success: boolean; error?: string }>, done: string) => async (rows: Startup[]) => {
    await run(() => work(rows.map((r) => r.id)), `${rows.length} startup${rows.length === 1 ? '' : 's'} ${done}.`, `Couldn't update the selected startups.`);
  };
  const bulkActions = useMemo<BulkAction<Startup>[]>(() => [
    { label: 'Approve', run: bulk(bulkApproveStartupsAction, 'approved'), confirm: (n) => `Approve ${n} startup${n === 1 ? '' : 's'}? They go live on the website.` },
    { label: 'Archive', run: bulk(bulkArchiveStartupsAction, 'archived'), confirm: (n) => `Archive ${n} startup${n === 1 ? '' : 's'}? They leave the website but are kept here.` },
    { label: 'Delete', danger: true, run: bulk(bulkDeleteStartupsAction, 'deleted'), confirm: (n) => `Delete ${n} startup${n === 1 ? '' : 's'} for good? Only super admins can do this. This can't be undone.` },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="portal-title">Startups directory</h1>
          <p className="portal-subtitle">
            Manage startup profiles • {featuredCount} featured • {pendingCount > 0 ? <span className="text-amber-500 font-semibold">{pendingCount} pending approval</span> : 'All approved'} • {underReviewCount > 0 ? <span className="text-orange-400 font-semibold">{underReviewCount} under review</span> : 'All reviewed'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => router.push('/startups-dir/manage')} className="btn-outline text-xs flex items-center gap-1.5 px-3 py-2">
            Categories & Types
          </button>
          <Link href="/startups-dir/new" className="btn-brand text-sm gap-2"><Plus className="w-4 h-4" aria-hidden /> Add startup</Link>
        </div>
      </div>

      <DataTable
        tableId="startups-dir"
        noun="startups"
        rows={startups}
        rowKey={(st) => st.id}
        columns={columns}
        filters={filters}
        bulkActions={bulkActions}
        loading={loading}
        pageSize={20}
        searchPlaceholder="Search startup, tagline or city"
        empty={{ title: 'No startups yet', description: 'Startups submitted by founders, or added by you, appear here.' }}
      />

      {/* Featured Campaign Scheduling Modal */}
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
                  {(['PREMIUM', 'STANDARD', 'BASIC'] as const).map(tier => (
                    <button
                      key={tier}
                      onClick={() => setFeatureTier(tier)}
                      className={`px-3 py-2 rounded-lg text-xs font-bold font-jakarta transition-all border ${
                        featureTier === tier
                          ? tier === 'PREMIUM'
                            ? 'bg-yellow-50 border-yellow-300 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-600 dark:text-yellow-300'
                            : tier === 'STANDARD'
                            ? 'bg-brand/10 border-brand/30 text-brand'
                            : 'bg-gray-100 border-gray-300 text-gray-700 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300'
                          : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      <div>{tier}</div>
                      <div className="text-[10px] font-normal mt-0.5 opacity-70">
                        {tier === 'PREMIUM' ? '1 slot' : tier === 'STANDARD' ? '4 slots' : '6 slots'}
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
