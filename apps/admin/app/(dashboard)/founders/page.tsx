'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle } from 'lucide-react';
import { getFoundersAction } from './actions';
import DataTable, { type Column, type TableFilter } from '@/components/ui/DataTable';
import { notify } from '@/components/Toast';

interface Founder {
  id: string;
  name: string;
  email: string;
  company: string | null;
  companyDomain: string | null;
  role: string | null;
  phone: string | null;
  authProvider: string;
  emailVerified: boolean;
  status: string;
  onboardingCompleted: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  _count: { startups: number; tools: number };
}

const STATUS_LABEL: Record<string, string> = { ACTIVE: 'Active', PENDING_VERIFICATION: 'Pending', SUSPENDED: 'Suspended' };
const STATUS_STYLE: Record<string, string> = {
  ACTIVE: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
  PENDING_VERIFICATION: 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300',
};
const OTHER_STATUS = 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300';
const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

export default function FoundersPage() {
  const [founders, setFounders] = useState<Founder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const result = await getFoundersAction();
        if (result?.success) setFounders(result.data as Founder[]);
        else notify(result?.error || "Couldn't load founders. Refresh to try again.", 'error');
      } catch {
        notify("Couldn't load founders. Check your connection and refresh.", 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const columns = useMemo<Column<Founder>[]>(() => [
    {
      key: 'founder', header: 'Founder', sortValue: (f) => f.name, searchValue: (f) => `${f.name} ${f.email} ${f.role ?? ''}`,
      cell: (f) => (
        <div className="min-w-0">
          <Link href={`/founders/${f.id}`} className="font-semibold text-gray-900 dark:text-white hover:text-brand hover:underline">{f.name}</Link>
          <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{f.email}{f.role ? ` · ${f.role}` : ''}</p>
        </div>
      ),
    },
    {
      key: 'company', header: 'Company', sortValue: (f) => f.company, searchValue: (f) => `${f.company ?? ''} ${f.companyDomain ?? ''}`,
      cell: (f) => f.company ? (
        <div className="min-w-0">
          <p className="text-gray-900 dark:text-white truncate">{f.company}</p>
          {f.companyDomain && <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{f.companyDomain}</p>}
        </div>
      ) : '–',
    },
    {
      key: 'signin', header: 'Sign-in', sortValue: (f) => f.authProvider,
      cell: (f) => (
        <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap">
          {f.authProvider === 'google' ? 'Google' : 'Email'}
          {f.emailVerified && <CheckCircle className="w-3.5 h-3.5 text-green-600" aria-label="Email verified" />}
        </span>
      ),
    },
    { key: 'startups', header: 'Startups', align: 'right', sortValue: (f) => f._count.startups, cell: (f) => f._count.startups },
    { key: 'tools', header: 'Tools', align: 'right', sortValue: (f) => f._count.tools, cell: (f) => f._count.tools },
    {
      key: 'status', header: 'Status', sortValue: (f) => f.status,
      cell: (f) => <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLE[f.status] ?? OTHER_STATUS}`}>{STATUS_LABEL[f.status] ?? f.status}</span>,
    },
    { key: 'joined', header: 'Joined', sortValue: (f) => new Date(f.createdAt), cell: (f) => <span className="text-xs whitespace-nowrap">{day(f.createdAt)}</span> },
    {
      key: 'lastLogin', header: 'Last sign-in', sortValue: (f) => (f.lastLoginAt ? new Date(f.lastLoginAt) : null),
      cell: (f) => <span className="text-xs whitespace-nowrap">{f.lastLoginAt ? day(f.lastLoginAt) : 'Never'}</span>,
    },
  ], []);

  const filters = useMemo<TableFilter<Founder>[]>(() => [
    { key: 'status', label: 'Status', options: [...new Set(founders.map((f) => f.status))].sort().map((s) => ({ value: s, label: STATUS_LABEL[s] ?? s })), matches: (f, v) => f.status === v },
    {
      key: 'submissions', label: 'Submissions',
      options: [{ value: 'some', label: 'Has a startup or tool' }, { value: 'none', label: 'Nothing submitted' }],
      matches: (f, v) => (f._count.startups + f._count.tools > 0) === (v === 'some'),
    },
    { key: 'signin', label: 'Sign-in', options: [{ value: 'google', label: 'Google' }, { value: 'email', label: 'Email' }], matches: (f, v) => (f.authProvider === 'google') === (v === 'google') },
  ], [founders]);

  const stats = [
    ['Founders', founders.length],
    ['Active', founders.filter((f) => f.status === 'ACTIVE').length],
    ['Pending', founders.filter((f) => f.status === 'PENDING_VERIFICATION').length],
    ['With a startup or tool', founders.filter((f) => f._count.startups + f._count.tools > 0).length],
  ] as const;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="portal-title">Founders</h1>
        <p className="portal-subtitle">Everyone registered on the founder portal, and what they have submitted.</p>
      </div>

      {!loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stats.map(([label, n]) => (
            <div key={label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">{label}</p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">{n.toLocaleString('en-IN')}</p>
            </div>
          ))}
        </div>
      )}

      <DataTable
        tableId="founders"
        noun="founders"
        rows={founders}
        rowKey={(f) => f.id}
        columns={columns}
        filters={filters}
        loading={loading}
        pageSize={20}
        searchPlaceholder="Search name, email or company"
        empty={{ title: 'No founders yet', description: 'Founders who register on the founder portal appear here.' }}
      />
    </div>
  );
}
