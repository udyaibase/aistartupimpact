'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, CheckCircle, Crown, Globe, XCircle } from 'lucide-react';
import { getEmployersAction, toggleEmployerVerifyAction, toggleEmployerActiveAction } from './actions';
import Link from 'next/link';
import CompanyChecks from './CompanyChecks';
import NetworkPilot from './NetworkPilot';
import DataTable, { type Column, type TableFilter } from '@/components/ui/DataTable';
import { ConfirmModal } from '@/components/ConfirmModal';
import { notify } from '@/components/Toast';

interface Employer {
  id: string;
  companyName: string;
  slug: string;
  email: string;
  logoUrl?: string;
  websiteUrl?: string;
  plan: string;
  isVerified: boolean;
  isActive: boolean;
  deactivatedAt?: string;
  companySize?: string;
  industry?: string;
  createdAt: string;
  jobCount: number;
}

const PLAN_LABEL: Record<string, string> = { FREE: 'Free', GROWTH: 'Growth', PRO: 'Pro', SCALE: 'Scale', FEATURED: 'Featured (old)', PREMIUM: 'Premium (old)' };
const PLAN_STYLE: Record<string, string> = {
  SCALE: 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300', PREMIUM: 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300',
  PRO: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300', FEATURED: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300',
  GROWTH: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
};
const stateOf = (e: Employer) => (e.deactivatedAt ? 'DEACTIVATED' : e.isActive ? 'ACTIVE' : 'SUSPENDED');
const STATE_LABEL = { ACTIVE: 'Active', SUSPENDED: 'Suspended', DEACTIVATED: 'Deactivated' } as const;
const STATE_STYLE = {
  ACTIVE: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
  SUSPENDED: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
  DEACTIVATED: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300',
} as const;

export default function AdminEmployersPage() {
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [loading, setLoading] = useState(true);
  const [suspending, setSuspending] = useState<Employer | null>(null);

  const loadData = useCallback(async () => {
    const res = await getEmployersAction();
    if (res.success) setEmployers((res.data || []) as Employer[]);
    else notify(res.error || "Couldn't load employers. Refresh to try again.", 'error');
    setLoading(false);
  }, []);
  useEffect(() => { loadData(); }, [loadData]);

  const toggleVerify = async (e: Employer) => {
    const res = await toggleEmployerVerifyAction(e.id, !e.isVerified);
    if (res.success) {
      setEmployers((prev) => prev.map((x) => (x.id === e.id ? { ...x, isVerified: !e.isVerified } : x)));
      notify(e.isVerified ? `Verified mark removed from ${e.companyName}.` : `${e.companyName} is now marked verified.`, 'success');
    } else notify(res.error || "Couldn't change verification. Try again.", 'error');
  };

  const setActive = async (e: Employer, active: boolean) => {
    const res = await toggleEmployerActiveAction(e.id, active);
    if (res.success) {
      setEmployers((prev) => prev.map((x) => (x.id === e.id ? { ...x, isActive: active } : x)));
      notify(active ? `${e.companyName} is active again.` : `${e.companyName} is suspended.`, 'success');
    } else notify(res.error || "Couldn't change the account. Try again.", 'error');
  };

  const columns = useMemo<Column<Employer>[]>(() => [
    {
      key: 'company', header: 'Company', sortValue: (e) => e.companyName, searchValue: (e) => `${e.companyName} ${e.industry ?? ''}`,
      cell: (e) => (
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden shrink-0">
            {e.logoUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={e.logoUrl} alt="" className="w-full h-full object-contain p-1" onError={(ev) => { (ev.target as HTMLImageElement).style.display = 'none'; }} />
              : <Building2 className="w-4 h-4 text-gray-500" aria-hidden />}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
              <span className="truncate">{e.companyName}</span>
              {e.isVerified && <Crown className="w-3.5 h-3.5 text-blue-600 shrink-0" aria-label="Verified" />}
            </p>
            {e.websiteUrl && (
              <a href={e.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-brand hover:underline inline-flex items-center gap-1">
                <Globe className="w-3 h-3" aria-hidden /> Website<span className="sr-only"> (opens in a new tab)</span>
              </a>
            )}
          </div>
        </div>
      ),
    },
    { key: 'email', header: 'Email', sortValue: (e) => e.email, searchValue: (e) => e.email, cell: (e) => e.email },
    {
      key: 'plan', header: 'Plan', sortValue: (e) => e.plan,
      cell: (e) => <span className={`text-xs font-semibold px-2 py-0.5 rounded ${PLAN_STYLE[e.plan] ?? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>{PLAN_LABEL[e.plan] ?? e.plan}</span>,
    },
    { key: 'jobs', header: 'Jobs', align: 'right', sortValue: (e) => e.jobCount, cell: (e) => e.jobCount.toLocaleString('en-IN') },
    { key: 'joined', header: 'Joined', sortValue: (e) => new Date(e.createdAt), cell: (e) => <span className="whitespace-nowrap">{new Date(e.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}</span> },
    {
      key: 'status', header: 'Status', sortValue: (e) => stateOf(e),
      cell: (e) => <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${STATE_STYLE[stateOf(e)]}`}>{STATE_LABEL[stateOf(e)]}</span>,
    },
    {
      key: 'actions', header: 'Actions', align: 'right',
      cell: (e) => (
        <div className="flex items-center justify-end gap-1">
          <button onClick={() => toggleVerify(e)} aria-label={e.isVerified ? `Remove the verified mark from ${e.companyName}` : `Mark ${e.companyName} as verified`} title={e.isVerified ? 'Remove verified mark' : 'Mark as verified'}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <Crown className={`w-4 h-4 ${e.isVerified ? 'text-blue-600' : 'text-gray-400'}`} aria-hidden />
          </button>
          {e.isActive ? (
            <button onClick={() => setSuspending(e)} aria-label={`Suspend ${e.companyName}`} title="Suspend" className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">
              <XCircle className="w-4 h-4 text-red-600" aria-hidden />
            </button>
          ) : (
            <button onClick={() => setActive(e, true)} aria-label={`Reactivate ${e.companyName}`} title="Reactivate" className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20">
              <CheckCircle className="w-4 h-4 text-green-600" aria-hidden />
            </button>
          )}
        </div>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps -- cells call the latest handlers
  ], []);

  const filters = useMemo<TableFilter<Employer>[]>(() => [
    { key: 'status', label: 'Status', options: (['ACTIVE', 'SUSPENDED', 'DEACTIVATED'] as const).map((v) => ({ value: v, label: STATE_LABEL[v] })), matches: (e, v) => stateOf(e) === v },
    { key: 'plan', label: 'Plan', options: [...new Set(employers.map((e) => e.plan))].sort().map((p) => ({ value: p, label: PLAN_LABEL[p] ?? p })), matches: (e, v) => e.plan === v },
    { key: 'verified', label: 'Verified', options: [{ value: 'yes', label: 'Verified' }, { value: 'no', label: 'Not verified' }], matches: (e, v) => e.isVerified === (v === 'yes') },
  ], [employers]);

  const verifiedCount = employers.filter((e) => e.isVerified).length;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="portal-title">Employer accounts</h1>
          <p className="portal-subtitle">{employers.length.toLocaleString('en-IN')} registered · {verifiedCount.toLocaleString('en-IN')} verified</p>
        </div>
        <Link href="/employers/onboarding" className="text-sm font-semibold text-brand hover:underline">Onboarding funnel</Link>
      </div>

      <CompanyChecks />
      <NetworkPilot />

      <DataTable
        tableId="employers"
        noun="employers"
        rows={employers}
        rowKey={(e) => e.id}
        columns={columns}
        filters={filters}
        loading={loading}
        pageSize={20}
        searchPlaceholder="Search company, industry or email"
        empty={{ title: 'No employer accounts yet', description: 'Companies that sign up to hire appear here.' }}
      />

      <ConfirmModal
        open={!!suspending}
        onClose={() => setSuspending(null)}
        onConfirm={async () => { const e = suspending; setSuspending(null); if (e) await setActive(e, false); }}
        title="Suspend employer"
        message={suspending ? `Suspend ${suspending.companyName}? Their team can no longer sign in to the hiring portal until you reactivate the account.` : ''}
        confirmLabel="Suspend"
      />
    </div>
  );
}
