'use client';

import { notify } from '@/components/Toast';
import { useState, useEffect, useCallback } from 'react';
import {
  Search, X, FileText, ExternalLink, Download, ChevronDown, Loader2,
  User, Mail, Phone, Linkedin, Globe, Calendar, StickyNote, Trash2,
  GraduationCap, Briefcase, CheckCircle2, Clock, AlertTriangle,
} from 'lucide-react';
import {
  listApplicationsAction, updateApplicationStatusAction,
  deleteApplicationAction, getApplicationStatsAction, getApplicationRolesAction,
} from './actions';
import { ask } from '@/components/Ask';

// ── Types ──────────────────────────────────────────────────────────────────

interface Application {
  id: string;
  type: string;
  role: string;
  fullName: string;
  email: string;
  phone: string | null;
  resumeLink: string;
  resumeUrl: string | null;
  resumeFileName: string | null;
  resumeSizeBytes: number | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
  status: string;
  notes: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

interface Stats {
  total: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  byRole: Record<string, number>;
}

const STATUSES = ['NEW', 'REVIEWED', 'SHORTLISTED', 'INTERVIEW', 'OFFERED', 'HIRED', 'REJECTED'] as const;

const STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  REVIEWED: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  SHORTLISTED: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  INTERVIEW: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  OFFERED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  HIRED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  REJECTED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

export default function ApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [roles, setRoles] = useState<string[]>([]);

  // Filters
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  // Detail panel
  const [detail, setDetail] = useState<Application | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchApps = useCallback(async (append = false) => {
    if (append) setLoadingMore(true); else setLoading(true);

    const res = await listApplicationsAction({
      search: searchDebounced || undefined,
      status: statusFilter || undefined,
      type: typeFilter || undefined,
      role: roleFilter || undefined,
      cursor: append ? nextCursor || undefined : undefined,
    });

    if (res.success) {
      setApps(prev => append ? [...prev, ...res.data] : res.data);
      setTotal(res.total);
      setNextCursor(res.nextCursor);
    }
    setLoading(false);
    setLoadingMore(false);
  }, [searchDebounced, statusFilter, typeFilter, roleFilter, nextCursor]);

  useEffect(() => { fetchApps(); }, [searchDebounced, statusFilter, typeFilter, roleFilter]);

  useEffect(() => {
    getApplicationStatsAction().then(res => { if (res.success) setStats(res.data); });
    getApplicationRolesAction().then(res => { if (res.success) setRoles(res.data); });
  }, []);

  const handleStatusChange = async (id: string, newStatus: string) => {
    setSaving(true);
    const res = await updateApplicationStatusAction(id, newStatus);
    if (res.success) {
      setApps(prev => prev.map(a => a.id === id ? { ...a, status: newStatus, reviewedAt: new Date().toISOString() } : a));
      if (detail?.id === id) setDetail(prev => prev ? { ...prev, status: newStatus, reviewedAt: new Date().toISOString() } : null);
      getApplicationStatsAction().then(res => { if (res.success) setStats(res.data); });
    }
    setSaving(false);
  };

  const handleSaveNotes = async () => {
    if (!detail) return;
    setSaving(true);
    const res = await updateApplicationStatusAction(detail.id, detail.status, editNotes);
    if (res.success) {
      setApps(prev => prev.map(a => a.id === detail.id ? { ...a, notes: editNotes } : a));
      setDetail(prev => prev ? { ...prev, notes: editNotes } : null);
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!(await ask({ title: 'Delete application', message: 'The application and its details are removed for good. This can’t be undone.', confirmLabel: 'Delete', danger: true }))) return;
    const res = await deleteApplicationAction(id);
    if (res.success) {
      setApps(prev => prev.filter(a => a.id !== id));
      setTotal(prev => prev - 1);
      if (detail?.id === id) setDetail(null);
    } else {
      notify(res.error || 'Delete failed');
    }
  };

  const getResumeUrl = (app: Application) => {
    // Uploaded resumes live in private storage and are served to signed-in staff only.
    if (app.resumeUrl?.startsWith('private:') || app.resumeLink?.startsWith('private:')) return `/api/admin/applications/${app.id}/resume`;
    if (app.resumeUrl) return app.resumeUrl;
    if (app.resumeLink && /^https?:\/\//i.test(app.resumeLink)) return app.resumeLink;
    return null;
  };

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div>
        <h1 className="portal-title">Career Applications</h1>
        <p className="portal-subtitle">
          Udyaibase internal hiring — internship and full-time applications from the <span className="text-brand font-semibold">/careers</span> page
        </p>
      </div>

      {/* ── Stats bar ───────────────────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {STATUSES.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
              className={`p-3 rounded-xl border text-center transition-all ${
                statusFilter === s
                  ? 'border-brand bg-brand/5'
                  : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-brand/50'
              }`}
            >
              <p className="text-xl font-bold text-gray-900 dark:text-white font-sora">{stats.byStatus[s] || 0}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta capitalize">{s.toLowerCase()}</p>
            </button>
          ))}
        </div>
      )}

      {/* ── Filters ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, email, or role..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-field pl-10 w-full"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
              <X className="w-3.5 h-3.5 text-gray-400" />
            </button>
          )}
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="input-field text-sm w-auto min-w-[130px]">
          <option value="">All Types</option>
          <option value="INTERNSHIP">Internship</option>
          <option value="FULL_TIME">Full-Time</option>
        </select>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="input-field text-sm w-auto min-w-[160px]">
          <option value="">All Roles</option>
          {roles.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {/* ── Table + Detail split ────────────────────────────────── */}
      <div className="flex gap-6">
        {/* Table */}
        <div className={`flex-1 min-w-0 ${detail ? 'hidden lg:block' : ''}`}>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900 dark:text-white font-jakarta">{total} applications</p>
              {statusFilter && (
                <button onClick={() => setStatusFilter('')} className="text-xs text-brand font-semibold font-jakarta flex items-center gap-1">
                  Clear filter <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-brand" />
              </div>
            ) : apps.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-jakarta">No applications found</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {apps.map(app => (
                  <button
                    key={app.id}
                    onClick={() => { setDetail(app); setEditNotes(app.notes || ''); }}
                    className={`w-full text-left px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                      detail?.id === app.id ? 'bg-brand/5' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 dark:text-gray-400 shrink-0">
                        <User className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{app.fullName}</p>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_COLORS[app.status] || 'bg-gray-100 text-gray-600'}`}>
                            {app.status}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{app.role}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block ${
                          app.type === 'INTERNSHIP'
                            ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                            : 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400'
                        }`}>
                          {app.type === 'INTERNSHIP' ? 'Intern' : 'Full-Time'}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-1">{new Date(app.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {nextCursor && (
              <div className="p-4 border-t border-gray-200 dark:border-gray-800">
                <button
                  onClick={() => fetchApps(true)}
                  disabled={loadingMore}
                  className="w-full py-2 text-sm text-brand font-semibold font-jakarta hover:bg-brand/5 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronDown className="w-4 h-4" />}
                  Load more
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Detail panel ──────────────────────────────────────── */}
        {detail && (
          <div className="w-full lg:w-[420px] shrink-0">
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden sticky top-6">
              {/* Header */}
              <div className="p-5 border-b border-gray-200 dark:border-gray-800">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-sora font-bold text-lg text-gray-900 dark:text-white">{detail.fullName}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 font-jakarta mt-0.5">{detail.role}</p>
                  </div>
                  <button
                    onClick={() => setDetail(null)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg lg:hidden"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    detail.type === 'INTERNSHIP'
                      ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                      : 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400'
                  }`}>
                    {detail.type === 'INTERNSHIP' ? 'Internship' : 'Full-Time'}
                  </span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_COLORS[detail.status]}`}>
                    {detail.status}
                  </span>
                </div>
              </div>

              {/* Contact info */}
              <div className="p-5 space-y-3 border-b border-gray-200 dark:border-gray-800">
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-4 h-4 text-gray-400 shrink-0" />
                  <a href={`mailto:${detail.email}`} className="text-brand hover:underline truncate">{detail.email}</a>
                </div>
                {detail.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                    <span className="text-gray-700 dark:text-gray-300">{detail.phone}</span>
                  </div>
                )}
                {detail.linkedinUrl && (
                  <div className="flex items-center gap-2 text-sm">
                    <Linkedin className="w-4 h-4 text-gray-400 shrink-0" />
                    <a href={detail.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline truncate">{detail.linkedinUrl}</a>
                  </div>
                )}
                {detail.portfolioUrl && (
                  <div className="flex items-center gap-2 text-sm">
                    <Globe className="w-4 h-4 text-gray-400 shrink-0" />
                    <a href={detail.portfolioUrl} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline truncate">{detail.portfolioUrl}</a>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
                  <span className="text-gray-500 dark:text-gray-400">Applied {new Date(detail.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </div>
              </div>

              {/* Resume */}
              <div className="p-5 border-b border-gray-200 dark:border-gray-800">
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Resume</p>
                {(() => {
                  const url = getResumeUrl(detail);
                  if (url) {
                    return (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        <FileText className="w-5 h-5 text-red-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                            {detail.resumeFileName || 'Resume.pdf'}
                          </p>
                          {detail.resumeSizeBytes && (
                            <p className="text-xs text-gray-400">{Math.round(detail.resumeSizeBytes / 1024)}KB</p>
                          )}
                        </div>
                        <Download className="w-4 h-4 text-gray-400" />
                      </a>
                    );
                  }
                  if (detail.resumeLink?.startsWith('data:')) {
                    return (
                      <p className="text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded-lg">
                        Legacy base64 resume (uploaded before R2 migration)
                      </p>
                    );
                  }
                  return <p className="text-xs text-gray-400">No resume uploaded</p>;
                })()}
              </div>

              {/* Status change */}
              <div className="p-5 border-b border-gray-200 dark:border-gray-800">
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Update Status</p>
                <div className="flex flex-wrap gap-1.5">
                  {STATUSES.map(s => (
                    <button
                      key={s}
                      onClick={() => handleStatusChange(detail.id, s)}
                      disabled={saving || detail.status === s}
                      className={`text-xs font-bold px-2.5 py-1 rounded-full transition-all ${
                        detail.status === s
                          ? STATUS_COLORS[s] + ' ring-2 ring-offset-1 ring-gray-300 dark:ring-gray-600'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div className="p-5 border-b border-gray-200 dark:border-gray-800">
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Notes</p>
                <textarea
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  placeholder="Add internal notes about this candidate..."
                  rows={3}
                  className="input-field w-full text-sm resize-none"
                />
                {editNotes !== (detail.notes || '') && (
                  <button
                    onClick={handleSaveNotes}
                    disabled={saving}
                    className="mt-2 px-4 py-1.5 bg-brand text-white text-xs font-bold rounded-lg hover:bg-brand/90 transition-colors disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save Notes'}
                  </button>
                )}
              </div>

              {/* Delete */}
              <div className="p-5">
                <button
                  onClick={() => handleDelete(detail.id)}
                  className="text-xs text-red-500 hover:text-red-700 font-semibold font-jakarta flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete application
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
