'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Package, CheckCircle, AlertCircle, IndianRupee, Gift, Search, Filter,
  ChevronDown, ChevronUp, Loader2, X, Eye, MapPin, MessageSquare,
  CreditCard, ExternalLink, Crown, Zap, Star, BookOpen, Users, Mail,
  Newspaper, TrendingUp, BarChart3,
} from 'lucide-react';
import { getAdvStatsAction, getAdvPackagesAction, getAdvPackageDetailAction, cancelAdvPackageAction, updateSocialPostAction } from './actions';

const tierStyle: Record<string, string> = {
  FREE: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
  STARTER: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  GROWTH: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
  PREMIUM: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
};

const statusStyle: Record<string, string> = {
  ACTIVE: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  EXPIRED: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
  UPGRADED: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
  CANCELLED: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
};

const zoneStatusStyle: Record<string, string> = {
  SCHEDULED: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
  ACTIVE: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  COMPLETED: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
  CANCELLED: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
};

const socialStatusStyle: Record<string, string> = {
  PENDING_PAYMENT: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
  PAID: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  SCHEDULED: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
  PUBLISHED: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  CANCELLED: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
};

const ZONE_LABELS: Record<string, string> = {
  PROMO_BADGE_HEADER: 'Promo Badge Header',
  HOMEPAGE_HERO: 'Homepage Hero',
  POWERED_BY_SECTION: 'Powered-by Section',
  FOUNDER_SPOTLIGHT: 'Founder Spotlight',
  FEATURED_PARTNER: 'Featured Partner',
  WEBSITE_NEWSLETTER_FEATURED: 'Website Newsletter',
  LINKEDIN_NEWSLETTER_FEATURED: 'LinkedIn Newsletter',
  LATEST_STORIES_CARD_1: 'Latest Stories Card #1',
  AI_TOOL_PICKS: 'AI Tool Picks',
  STORIES_PAGE_FEATURED: 'Stories Page Featured',
  AI_TOOLS_PAGE_FEATURED: 'AI Tools Page Featured',
  STARTUP_DIRECTORY_FEATURED: 'Startup Directory Featured',
};

const fmt = (d: string) => d ? new Date(d).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const fmtAmount = (paise: number) => paise ? `₹${(paise / 100).toLocaleString('en-IN')}` : '₹0';

interface Stats { total: number; active: number; free: number; revenue: number }
interface Pkg {
  id: string; tier: string; status: string; purchasedAt: string; expiresAt: string;
  upgradedFromId: string | null; upgradedToId: string | null; cancelledAt: string | null;
  founderId: string; founderName: string; founderEmail: string;
  zoneCount: number; socialPostCount: number; totalPaid: number;
}
interface PkgDetail {
  zones: any[]; socialPosts: any[]; payments: any[];
}

export default function AdvPackagesPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, PkgDetail>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterTier, setFilterTier] = useState('ALL');
  const [search, setSearch] = useState('');

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const [statsRes, pkgRes] = await Promise.all([getAdvStatsAction(), getAdvPackagesAction()]);
    if (statsRes.success) setStats(statsRes.data as Stats);
    if (pkgRes.success) setPackages(pkgRes.data as Pkg[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = async (id: string) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!detail[id]) {
      setDetailLoading(id);
      const res = await getAdvPackageDetailAction(id);
      if (res.success && res.data) setDetail((prev) => ({ ...prev, [id]: res.data as PkgDetail }));
      setDetailLoading(null);
    }
  };

  const handleCancel = async (id: string) => {
    setSaving(true);
    const res = await cancelAdvPackageAction(id);
    setSaving(false);
    setCancelConfirm(null);
    if (res.success) { showToast('Package cancelled', true); load(); }
    else showToast(res.error || 'Failed', false);
  };

  const handleUpdatePost = async (postId: string, data: { status?: string; publishedUrl?: string }) => {
    setSaving(true);
    const res = await updateSocialPostAction(postId, data);
    setSaving(false);
    if (res.success) {
      showToast('Social post updated', true);
      if (expanded) {
        setDetailLoading(expanded);
        const detailRes = await getAdvPackageDetailAction(expanded);
        if (detailRes.success && detailRes.data) setDetail((prev) => ({ ...prev, [expanded!]: detailRes.data as PkgDetail }));
        setDetailLoading(null);
      }
    } else showToast(res.error || 'Failed', false);
  };

  const filtered = packages.filter((p) => {
    if (filterStatus !== 'ALL' && p.status !== filterStatus) return false;
    if (filterTier !== 'ALL' && p.tier !== filterTier) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!p.founderName?.toLowerCase().includes(q) && !p.founderEmail?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin text-brand" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded-xl shadow-lg text-sm font-jakarta font-medium flex items-center gap-2 ${toast.ok ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
          {toast.ok ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />} {toast.msg}
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="portal-title">Advertise Packages</h1>
        <p className="portal-subtitle">Manage founder advertising packages, zone activations, and social posts</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Packages', value: stats.total, icon: Package, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30' },
            { label: 'Active', value: stats.active, icon: CheckCircle, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30' },
            { label: 'Revenue', value: fmtAmount(stats.revenue), icon: IndianRupee, color: 'text-brand', bg: 'bg-red-100 dark:bg-red-900/30' },
            { label: 'Free Tier', value: stats.free, icon: Gift, color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-gray-800' },
          ].map((s) => (
            <div key={s.label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-jakarta">{s.label}</p>
                  <p className={`text-2xl font-bold font-sora mt-1 ${s.color}`}>{s.value}</p>
                </div>
                <div className={`w-12 h-12 rounded-xl ${s.bg} flex items-center justify-center`}>
                  <s.icon className={`w-6 h-6 ${s.color}`} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search founder name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field text-sm pl-10 w-full"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input-field text-sm">
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active</option>
              <option value="EXPIRED">Expired</option>
              <option value="UPGRADED">Upgraded</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            <select value={filterTier} onChange={(e) => setFilterTier(e.target.value)} className="input-field text-sm">
              <option value="ALL">All Tiers</option>
              <option value="FREE">Free</option>
              <option value="STARTER">Starter</option>
              <option value="GROWTH">Growth</option>
              <option value="PREMIUM">Premium</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/50 text-left">
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide font-jakarta">Founder</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide font-jakarta">Tier</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide font-jakarta">Status</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide font-jakarta hidden md:table-cell">Purchased</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide font-jakarta hidden lg:table-cell">Expires</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide font-jakarta hidden md:table-cell">Zones</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide font-jakarta hidden lg:table-cell">Paid</th>
                <th className="px-6 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-400 font-jakarta">
                    <Package className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    No packages found
                  </td>
                </tr>
              )}
              {filtered.map((pkg) => (
                <>
                  <tr
                    key={pkg.id}
                    onClick={() => toggleExpand(pkg.id)}
                    className="border-t border-gray-50 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-4">
                      <div className="font-sora font-semibold text-sm text-navy dark:text-white">{pkg.founderName || '—'}</div>
                      <div className="text-xs text-gray-400 font-jakarta">{pkg.founderEmail}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${tierStyle[pkg.tier] || ''}`}>
                        {pkg.tier}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${statusStyle[pkg.status] || ''}`}>
                        {pkg.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 font-jakarta hidden md:table-cell">{fmt(pkg.purchasedAt)}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 font-jakarta hidden lg:table-cell">{fmt(pkg.expiresAt)}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 font-jakarta hidden md:table-cell">{pkg.zoneCount}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-gray-700 dark:text-gray-300 font-jakarta hidden lg:table-cell">{fmtAmount(pkg.totalPaid)}</td>
                    <td className="px-6 py-4">
                      {expanded === pkg.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </td>
                  </tr>

                  {/* Expanded Detail */}
                  {expanded === pkg.id && (
                    <tr key={`${pkg.id}-detail`}>
                      <td colSpan={8} className="bg-gray-50/50 dark:bg-gray-800/20 px-6 py-5 border-t border-gray-100 dark:border-gray-800">
                        {detailLoading === pkg.id ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-5 h-5 animate-spin text-brand" />
                          </div>
                        ) : detail[pkg.id] ? (
                          <div className="space-y-6">
                            {/* Actions */}
                            <div className="flex items-center gap-3">
                              <a href={`/founders/${pkg.founderId}`} className="text-xs text-brand hover:underline font-jakarta font-semibold flex items-center gap-1">
                                <ExternalLink className="w-3 h-3" /> View Founder
                              </a>
                              {pkg.status === 'ACTIVE' && (
                                <button onClick={(e) => { e.stopPropagation(); setCancelConfirm(pkg.id); }} className="text-xs text-red-500 hover:underline font-jakarta font-semibold flex items-center gap-1">
                                  <X className="w-3 h-3" /> Cancel Package
                                </button>
                              )}
                            </div>

                            {/* Zone Activations */}
                            <div>
                              <h4 className="font-sora font-bold text-sm text-navy dark:text-white flex items-center gap-2 mb-3">
                                <MapPin className="w-4 h-4 text-brand" /> Zone Activations ({detail[pkg.id].zones.length})
                              </h4>
                              {detail[pkg.id].zones.length === 0 ? (
                                <p className="text-sm text-gray-400 font-jakarta">No zones activated</p>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="text-left border-b border-gray-200 dark:border-gray-700">
                                        <th className="py-2 pr-4 text-xs font-semibold text-gray-500 font-jakarta">Zone</th>
                                        <th className="py-2 px-3 text-xs font-semibold text-gray-500 font-jakarta">Tier</th>
                                        <th className="py-2 px-3 text-xs font-semibold text-gray-500 font-jakarta">Status</th>
                                        <th className="py-2 px-3 text-xs font-semibold text-gray-500 font-jakarta hidden sm:table-cell">Period</th>
                                        <th className="py-2 px-3 text-xs font-semibold text-gray-500 font-jakarta hidden md:table-cell">Free Days</th>
                                        <th className="py-2 px-3 text-xs font-semibold text-gray-500 font-jakarta hidden md:table-cell">Ext. Days</th>
                                        <th className="py-2 pl-3 text-xs font-semibold text-gray-500 font-jakarta hidden lg:table-cell">Ext. Total</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {detail[pkg.id].zones.map((z: any) => (
                                        <tr key={z.id} className="border-b border-gray-100 dark:border-gray-800">
                                          <td className="py-2 pr-4 font-medium text-navy dark:text-white font-jakarta">{ZONE_LABELS[z.zone] || z.zone}</td>
                                          <td className="py-2 px-3 text-gray-500 font-jakarta">{z.zoneTier}</td>
                                          <td className="py-2 px-3">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${zoneStatusStyle[z.status] || ''}`}>
                                              {z.status}
                                            </span>
                                          </td>
                                          <td className="py-2 px-3 text-gray-500 font-jakarta hidden sm:table-cell">{fmt(z.startsAt)} → {fmt(z.endsAt)}</td>
                                          <td className="py-2 px-3 text-gray-500 font-jakarta hidden md:table-cell">{z.freeDaysUsed}</td>
                                          <td className="py-2 px-3 text-gray-500 font-jakarta hidden md:table-cell">{z.extensionDays}</td>
                                          <td className="py-2 pl-3 text-gray-500 font-jakarta hidden lg:table-cell">{fmtAmount(z.extensionTotal)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>

                            {/* Social Posts */}
                            <div>
                              <h4 className="font-sora font-bold text-sm text-navy dark:text-white flex items-center gap-2 mb-3">
                                <MessageSquare className="w-4 h-4 text-brand" /> Social Post Orders ({detail[pkg.id].socialPosts.length})
                              </h4>
                              {detail[pkg.id].socialPosts.length === 0 ? (
                                <p className="text-sm text-gray-400 font-jakarta">No social posts ordered</p>
                              ) : (
                                <div className="space-y-2">
                                  {detail[pkg.id].socialPosts.map((sp: any) => (
                                    <div key={sp.id} className="flex items-center justify-between bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                                      <div className="flex items-center gap-3">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${socialStatusStyle[sp.status] || ''}`}>
                                          {sp.status}
                                        </span>
                                        <span className="text-sm font-semibold text-navy dark:text-white font-jakarta">{sp.postType}</span>
                                        <span className="text-sm text-gray-500 font-jakarta">{fmtAmount(sp.amountPaise)}</span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        {sp.publishedUrl && (
                                          <a href={sp.publishedUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-brand hover:underline flex items-center gap-1">
                                            <ExternalLink className="w-3 h-3" /> View
                                          </a>
                                        )}
                                        {sp.status === 'PAID' && (
                                          <button
                                            onClick={(e) => { e.stopPropagation(); handleUpdatePost(sp.id, { status: 'SCHEDULED' }); }}
                                            className="text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-600 px-2 py-1 rounded-lg font-semibold"
                                            disabled={saving}
                                          >
                                            Mark Scheduled
                                          </button>
                                        )}
                                        {sp.status === 'SCHEDULED' && (
                                          <button
                                            onClick={(e) => { e.stopPropagation(); handleUpdatePost(sp.id, { status: 'PUBLISHED' }); }}
                                            className="text-xs bg-green-100 dark:bg-green-900/30 text-green-600 px-2 py-1 rounded-lg font-semibold"
                                            disabled={saving}
                                          >
                                            Mark Published
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Package Payments */}
                            <div>
                              <h4 className="font-sora font-bold text-sm text-navy dark:text-white flex items-center gap-2 mb-3">
                                <CreditCard className="w-4 h-4 text-brand" /> Payments ({detail[pkg.id].payments.length})
                              </h4>
                              {detail[pkg.id].payments.length === 0 ? (
                                <p className="text-sm text-gray-400 font-jakarta">No payments</p>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="text-left border-b border-gray-200 dark:border-gray-700">
                                        <th className="py-2 pr-4 text-xs font-semibold text-gray-500 font-jakarta">Purpose</th>
                                        <th className="py-2 px-3 text-xs font-semibold text-gray-500 font-jakarta">Amount</th>
                                        <th className="py-2 px-3 text-xs font-semibold text-gray-500 font-jakarta">GST</th>
                                        <th className="py-2 px-3 text-xs font-semibold text-gray-500 font-jakarta">Total</th>
                                        <th className="py-2 px-3 text-xs font-semibold text-gray-500 font-jakarta">Status</th>
                                        <th className="py-2 pl-3 text-xs font-semibold text-gray-500 font-jakarta hidden sm:table-cell">Date</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {detail[pkg.id].payments.map((pay: any) => (
                                        <tr key={pay.id} className="border-b border-gray-100 dark:border-gray-800">
                                          <td className="py-2 pr-4 text-navy dark:text-white font-jakarta font-medium">{pay.purpose.replace(/_/g, ' ')}</td>
                                          <td className="py-2 px-3 text-gray-500 font-jakarta">{fmtAmount(pay.amountPaise)}</td>
                                          <td className="py-2 px-3 text-gray-500 font-jakarta">{fmtAmount(pay.gstPaise)}</td>
                                          <td className="py-2 px-3 font-semibold text-navy dark:text-white font-jakarta">{fmtAmount(pay.totalPaise)}</td>
                                          <td className="py-2 px-3">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusStyle[pay.status] || 'bg-yellow-100 text-yellow-700'}`}>
                                              {pay.status}
                                            </span>
                                          </td>
                                          <td className="py-2 pl-3 text-gray-500 font-jakarta hidden sm:table-cell">{fmt(pay.paidAt || pay.createdAt)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cancel Confirmation Modal */}
      {cancelConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm shadow-2xl border border-gray-200 dark:border-gray-800 p-6 text-center">
            <X className="w-10 h-10 text-red-500 mx-auto mb-3" />
            <h3 className="font-sora font-bold text-lg text-navy dark:text-white">Cancel Package?</h3>
            <p className="text-sm text-gray-500 font-jakarta mt-2">This will set the package status to CANCELLED. The founder will lose access to their zones.</p>
            <div className="flex items-center justify-center gap-3 mt-5">
              <button onClick={() => setCancelConfirm(null)} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
                Keep Active
              </button>
              <button
                onClick={() => handleCancel(cancelConfirm)}
                disabled={saving}
                className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg font-semibold hover:bg-red-600 disabled:opacity-50 flex items-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Cancel Package
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
