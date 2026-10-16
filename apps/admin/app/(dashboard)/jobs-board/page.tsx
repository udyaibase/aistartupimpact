'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Briefcase, Search, Eye, Users, Trash2, ExternalLink, CheckCircle, XCircle, Loader2, Plus, Pencil } from 'lucide-react';
import { getJobsAction, toggleJobActiveAction, deleteJobAction } from './actions';
import { Pagination } from '@/components/Pagination';

const PAGE_SIZE = 20;

interface Job {
  id: string;
  slug: string;
  title: string;
  category: string;
  workType: string;
  listingTier: string;
  isActive: boolean;
  isFeatured: boolean;
  applicationsCount: number;
  viewsCount: number;
  publishedAt: string | null;
  createdAt: string;
  companyName: string;
}

export default function AdminJobsBoardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [search, setSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleteTyped, setDeleteTyped] = useState('');
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    setLoading(true);
    const res = await getJobsAction();
    if (res.success) {
      setJobs((res.data || []) as Job[]);
    } else {
      setError(res.error || 'Failed to load');
    }
    setLoading(false);
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    const res = await toggleJobActiveAction(id, !isActive);
    if (res.success) {
      setJobs(prev => prev.map(j => j.id === id ? { ...j, isActive: !isActive } : j));
    }
  };

  const handleDelete = async (id: string) => {
    const res = await deleteJobAction(id);
    if (res.success) {
      setJobs(prev => prev.filter(j => j.id !== id));
    } else if (res.error) {
      setPermissionError(res.error);
    }
    setDeleteConfirm(null);
    setDeleteTyped('');
  };

  const filtered = jobs
    .filter(j => {
      if (filter === 'active') return j.isActive;
      if (filter === 'inactive') return !j.isActive;
      return true;
    })
    .filter(j =>
      j.title.toLowerCase().includes(search.toLowerCase()) ||
      j.companyName.toLowerCase().includes(search.toLowerCase())
    );

  // Reset page when filters change
  useMemo(() => { setPage(1); }, [filter, search]);

  const totalFiltered = filtered.length;
  const totalPages = Math.ceil(totalFiltered / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const activeCount = jobs.filter(j => j.isActive).length;
  const inactiveCount = jobs.filter(j => !j.isActive).length;

  const filterTabs = [
    { label: 'All', value: 'all' as const, count: jobs.length },
    { label: 'Active', value: 'active' as const, count: activeCount },
    { label: 'Inactive', value: 'inactive' as const, count: inactiveCount },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-sora font-extrabold text-2xl text-navy dark:text-white flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-brand" /> Job Board
          </h1>
          <p className="text-gray-400 dark:text-gray-500 text-sm font-jakarta mt-1">
            {jobs.length} total listings &bull; {activeCount} active
          </p>
        </div>
        <Link href="/jobs-board/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand hover:bg-brand/90 text-white text-sm font-semibold rounded-xl transition-colors">
          <Plus className="w-4 h-4" /> Post Job
        </Link>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
        {filterTabs.map(tab => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`px-4 py-2 rounded-md text-sm font-jakarta font-medium whitespace-nowrap transition-all ${
              tab.value === filter
                ? 'bg-white dark:bg-gray-700 text-navy dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-navy dark:hover:text-white'
            }`}
          >
            {tab.label}
            <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search by job title or company..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field pl-10"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="px-6 py-3 bg-red-50 dark:bg-red-900/20 text-sm text-red-600 dark:text-red-400 font-jakarta border border-red-100 dark:border-red-800 rounded-xl">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800/50 text-left">
              <th className="px-6 py-3 font-jakarta font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Job</th>
              <th className="px-6 py-3 font-jakarta font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden md:table-cell">Company</th>
              <th className="px-6 py-3 font-jakarta font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden lg:table-cell">Category</th>
              <th className="px-6 py-3 font-jakarta font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden sm:table-cell">Views</th>
              <th className="px-6 py-3 font-jakarta font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden sm:table-cell">Apps</th>
              <th className="px-6 py-3 font-jakarta font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</th>
              <th className="px-6 py-3 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-6 py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-brand mx-auto" /></td></tr>
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center">
                  <Briefcase className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-400 font-jakarta">No job listings {filter !== 'all' ? `(${filter})` : ''} found</p>
                </td>
              </tr>
            ) : paginated.map((job) => (
              <tr key={job.id} className="border-t border-gray-50 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                <td className="px-6 py-4">
                  <div>
                    <h4 className="font-sora font-semibold text-sm text-navy dark:text-white line-clamp-1">{job.title}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-jakarta ${
                        job.listingTier === 'FEATURED' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                        : job.listingTier === 'PREMIUM' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                      }`}>
                        {job.listingTier}
                      </span>
                      <span className="text-xs text-gray-400 font-jakarta">{job.workType?.replace(/_/g, ' ')}</span>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 hidden md:table-cell">
                  <span className="text-sm text-gray-600 dark:text-gray-400 font-jakarta">{job.companyName}</span>
                </td>
                <td className="px-6 py-4 hidden lg:table-cell">
                  <span className="badge-category text-[10px]">{job.category?.replace(/_/g, ' ') || '—'}</span>
                </td>
                <td className="px-6 py-4 hidden sm:table-cell">
                  <span className="text-sm text-gray-600 dark:text-gray-400 font-jakarta font-medium flex items-center gap-1">
                    <Eye className="w-3 h-3" />{job.viewsCount || 0}
                  </span>
                </td>
                <td className="px-6 py-4 hidden sm:table-cell">
                  <span className="text-sm text-gray-600 dark:text-gray-400 font-jakarta font-medium flex items-center gap-1">
                    <Users className="w-3 h-3" />{job.applicationsCount || 0}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => toggleActive(job.id, job.isActive)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer transition-colors ${
                      job.isActive
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                    title={job.isActive ? 'Click to deactivate' : 'Click to activate'}
                  >
                    {job.isActive ? <><CheckCircle className="w-3 h-3" /> Active</> : <><XCircle className="w-3 h-3" /> Inactive</>}
                  </button>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1">
                    <Link href={`/jobs-board/${job.id}/edit`}
                      className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" title="Edit">
                      <Pencil className="w-3.5 h-3.5 text-gray-400" />
                    </Link>
                    <a href={`/jobs/${job.slug}`} target="_blank" rel="noopener noreferrer"
                      className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" title="View">
                      <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
                    </a>
                    <button onClick={() => setDeleteConfirm(job.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">
                      <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
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

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm shadow-2xl border border-gray-200 dark:border-gray-800 p-6 text-center">
            <Trash2 className="w-10 h-10 text-red-500 mx-auto mb-3" />
            <h3 className="font-sora font-bold text-lg text-navy dark:text-white">Delete Job Listing?</h3>
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
              <button onClick={() => { setDeleteConfirm(null); setDeleteTyped(''); }}
                className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300">
                Cancel
              </button>
              <button onClick={() => handleDelete(deleteConfirm)} disabled={deleteTyped !== 'DELETE'}
                className="flex-1 px-4 py-2.5 text-sm font-medium bg-red-500 hover:bg-red-600 text-white rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-opacity">
                Delete
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
            <button onClick={() => setPermissionError(null)}
              className="mt-5 w-full px-4 py-2.5 text-sm font-medium bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 text-white dark:text-gray-900 rounded-xl transition-colors">
              Understood
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
