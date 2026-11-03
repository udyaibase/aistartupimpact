'use client';

import { useState, useEffect, useMemo } from 'react';
import { Building2, Globe, Briefcase, CheckCircle, XCircle, Crown, Search, Loader2 } from 'lucide-react';
import { getEmployersAction, toggleEmployerVerifyAction, toggleEmployerActiveAction } from './actions';
import { Pagination } from '@/components/Pagination';
import { TableEmptyState } from '@/components/EmptyState';

const PAGE_SIZE = 20;

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

export default function AdminEmployersPage() {
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const res = await getEmployersAction();
    if (res.success) {
      setEmployers((res.data || []) as Employer[]);
    }
    setLoading(false);
  };

  const toggleVerify = async (id: string, isVerified: boolean) => {
    const res = await toggleEmployerVerifyAction(id, !isVerified);
    if (res.success) {
      setEmployers(prev => prev.map(e => e.id === id ? { ...e, isVerified: !isVerified } : e));
    }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    const res = await toggleEmployerActiveAction(id, !isActive);
    if (res.success) {
      setEmployers(prev => prev.map(e => e.id === id ? { ...e, isActive: !isActive } : e));
    }
  };

  const filtered = employers.filter(e =>
    e.companyName.toLowerCase().includes(search.toLowerCase()) ||
    e.email.toLowerCase().includes(search.toLowerCase())
  );

  // Reset page when search changes
  useMemo(() => { setPage(1); }, [search]);

  const totalFiltered = filtered.length;
  const totalPages = Math.ceil(totalFiltered / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const verifiedCount = employers.filter(e => e.isVerified).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-sora font-extrabold text-2xl text-navy dark:text-white flex items-center gap-2">
            <Building2 className="w-6 h-6 text-brand" /> Employer Accounts
          </h1>
          <p className="text-gray-400 dark:text-gray-500 text-sm font-jakarta mt-1">
            {employers.length} registered employers &bull; {verifiedCount} verified
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search by company name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field pl-10"
        />
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800/50 text-left">
              <th className="px-6 py-3 font-jakarta font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Company</th>
              <th className="px-6 py-3 font-jakarta font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden md:table-cell">Email</th>
              <th className="px-6 py-3 font-jakarta font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden lg:table-cell">Plan</th>
              <th className="px-6 py-3 font-jakarta font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden sm:table-cell">Jobs</th>
              <th className="px-6 py-3 font-jakarta font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</th>
              <th className="px-6 py-3 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-6 py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-brand mx-auto" /></td></tr>
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center">
                  <Building2 className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-400 font-jakarta">No employer accounts found</p>
                </td>
              </tr>
            ) : paginated.map((emp) => (
              <tr key={emp.id} className="border-t border-gray-50 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center overflow-hidden shrink-0">
                      {emp.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={emp.logoUrl} alt={emp.companyName} className="w-full h-full object-contain p-1" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <Building2 className="w-4 h-4 text-brand" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h4 className="font-sora font-semibold text-sm text-navy dark:text-white">{emp.companyName}</h4>
                        {emp.isVerified && <Crown className="w-3 h-3 text-blue-500" />}
                      </div>
                      {emp.websiteUrl && (
                        <a href={emp.websiteUrl} target="_blank" rel="noopener noreferrer"
                          className="text-[10px] text-brand hover:underline flex items-center gap-0.5 font-jakarta">
                          <Globe className="w-2.5 h-2.5" /> Website
                        </a>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 hidden md:table-cell">
                  <span className="text-sm text-gray-500 dark:text-gray-400 font-jakarta">{emp.email}</span>
                </td>
                <td className="px-6 py-4 hidden lg:table-cell">
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded font-jakarta ${
                    emp.plan === 'SCALE' || emp.plan === 'PREMIUM' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                    : emp.plan === 'PRO' || emp.plan === 'FEATURED' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                    : emp.plan === 'GROWTH' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                  }`}>
                    {emp.plan}
                  </span>
                </td>
                <td className="px-6 py-4 hidden sm:table-cell">
                  <span className="text-sm text-gray-600 dark:text-gray-400 font-jakarta font-medium flex items-center gap-1">
                    <Briefcase className="w-3 h-3" />{emp.jobCount}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                    emp.deactivatedAt
                      ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                      : emp.isActive
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                  }`}>
                    {emp.deactivatedAt ? 'Deactivated' : emp.isActive ? <><CheckCircle className="w-3 h-3" /> Active</> : 'Suspended'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1">
                    <button onClick={() => toggleVerify(emp.id, emp.isVerified)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                      title={emp.isVerified ? 'Remove verification' : 'Verify'}>
                      <Crown className={`w-3.5 h-3.5 ${emp.isVerified ? 'text-blue-500' : 'text-gray-300 dark:text-gray-600'}`} />
                    </button>
                    <button onClick={() => toggleActive(emp.id, emp.isActive)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                      title={emp.isActive ? 'Suspend' : 'Activate'}>
                      {emp.isActive
                        ? <XCircle className="w-3.5 h-3.5 text-orange-500" />
                        : <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                      }
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination
          page={page}
          totalPages={totalPages}
          total={totalFiltered}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
