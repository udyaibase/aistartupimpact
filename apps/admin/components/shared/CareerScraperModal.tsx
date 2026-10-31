'use client';

import { useState } from 'react';
import { X, Globe, Loader2, Search, Check, AlertCircle, Briefcase, MapPin, Download } from 'lucide-react';

interface ScrapedJob {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
  workType: string | null;
  description: string | null;
  jobPageUrl: string | null;
  applicationUrl: string | null;
  category: string;
  employmentType: string | null;
  _kekaDetail?: {
    id: number;
    fullDescription: string | null;
    experience: string | null;
    experienceMin: number | null;
    experienceMax: number | null;
    salaryRange: any;
    skills: string[];
    publishedOn: string | null;
  };
}

interface DetailedJob {
  title: string;
  shortDescription: string | null;
  description: string | null;
  department: string | null;
  location: string | null;
  workType: string | null;
  category: string;
  skills: string[];
  experienceMin: number | null;
  experienceMax: number | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  applicationUrl: string | null;
  applicationEmail: string | null;
  employmentType: string | null;
}

interface CareerScraperModalProps {
  isOpen: boolean;
  onClose: () => void;
  websiteUrl?: string;
  onImportSingle: (job: DetailedJob) => void;
  onImportMultiple?: (jobs: ScrapedJob[]) => void;
  onBulkCreate?: (jobs: DetailedJob[]) => void;
}

export default function CareerScraperModal({
  isOpen, onClose, websiteUrl, onImportSingle, onImportMultiple, onBulkCreate,
}: CareerScraperModalProps) {
  const [url, setUrl] = useState(websiteUrl ? `${websiteUrl.replace(/\/$/, '')}/careers` : '');
  const [loading, setLoading] = useState(false);
  const [fetchingDetail, setFetchingDetail] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [jobs, setJobs] = useState<ScrapedJob[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scraped, setScraped] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number; title: string } | null>(null);

  if (!isOpen) return null;

  const handleScrape = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError('');
    setJobs([]);
    setSelected(new Set());
    setScraped(false);

    try {
      const res = await fetch('/api/admin/scrape-careers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Scraping failed');
      } else if (data.jobs.length === 0) {
        setError('No job listings found on this page. Try the direct careers or jobs page URL.');
      } else {
        setJobs(data.jobs);
        setScraped(true);
      }
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  };

  const buildListData = (job: ScrapedJob): DetailedJob => ({
    title: job.title,
    shortDescription: null,
    description: job.description,
    department: job.department,
    location: job.location,
    workType: job.workType,
    category: job.category,
    skills: [],
    experienceMin: null,
    experienceMax: null,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    applicationUrl: job.applicationUrl || job.jobPageUrl,
    applicationEmail: null,
    employmentType: job.employmentType || null,
  });

  const mergeDetail = (listData: DetailedJob, detail: any, preserveListTitle = false): DetailedJob => ({
    title: preserveListTitle ? listData.title : (detail.title || listData.title),
    shortDescription: detail.shortDescription || listData.shortDescription,
    description: detail.description || listData.description,
    department: detail.department || listData.department,
    location: detail.location || listData.location,
    workType: detail.workType || listData.workType,
    category: detail.category || listData.category,
    skills: Array.isArray(detail.skills) && detail.skills.length > 0 ? detail.skills : listData.skills,
    experienceMin: detail.experienceMin ?? listData.experienceMin,
    experienceMax: detail.experienceMax ?? listData.experienceMax,
    salaryMin: detail.salaryMin ?? listData.salaryMin,
    salaryMax: detail.salaryMax ?? listData.salaryMax,
    salaryCurrency: detail.salaryCurrency || listData.salaryCurrency,
    applicationUrl: detail.applicationUrl || listData.applicationUrl,
    applicationEmail: detail.applicationEmail || listData.applicationEmail,
    employmentType: detail.employmentType || listData.employmentType,
  });

  const fetchJobDetail = async (job: ScrapedJob, isBulk = false): Promise<DetailedJob> => {
    const listData = buildListData(job);

    // Keka HR: we already have full detail from the API — no need to re-fetch
    if (job._kekaDetail) {
      const kd = job._kekaDetail;
      // fullDescription is already structured text (converted from HTML server-side)
      const cleanDesc = kd.fullDescription || listData.description;
      return {
        ...listData,
        description: cleanDesc,
        experienceMin: kd.experienceMin,
        experienceMax: kd.experienceMax,
        salaryMin: kd.salaryRange?.minSalary || null,
        salaryMax: kd.salaryRange?.maxSalary || null,
        salaryCurrency: kd.salaryRange?.currency || null,
        skills: Array.isArray(kd.skills) ? kd.skills : [],
      };
    }

    if (!job.jobPageUrl) return listData;
    try {
      const res = await fetch('/api/admin/scrape-careers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: job.jobPageUrl, mode: 'detail' }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.job) {
        if (data.partial) {
          return {
            ...listData,
            applicationUrl: data.job.applicationUrl || job.jobPageUrl,
          };
        }
        // In bulk mode, always keep the list title — the user selected these specific jobs
        return mergeDetail(listData, data.job, isBulk);
      }
    } catch {}
    return listData;
  };

  const handleFillForm = async (job: ScrapedJob) => {
    setFetchingDetail(job.id);
    setError('');
    const detailed = await fetchJobDetail(job);
    setFetchingDetail(null);
    onImportSingle(detailed);
    onClose();
  };

  const handleBulkImport = async () => {
    const selectedJobs = jobs.filter(j => selected.has(j.id));
    if (selectedJobs.length === 0) return;

    setError('');
    const detailedJobs: DetailedJob[] = [];

    for (let i = 0; i < selectedJobs.length; i++) {
      setBulkProgress({ current: i + 1, total: selectedJobs.length, title: selectedJobs[i].title });
      const detailed = await fetchJobDetail(selectedJobs[i], true);
      detailedJobs.push(detailed);
    }

    setBulkProgress(null);

    if (onBulkCreate) {
      onBulkCreate(detailedJobs);
    }
    onClose();
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === jobs.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(jobs.map(j => j.id)));
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl border border-gray-200 dark:border-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center">
              <Globe className="w-5 h-5 text-brand" />
            </div>
            <div>
              <h2 className="font-sora font-bold text-lg text-navy dark:text-white">Import from Career Page</h2>
              <p className="text-xs text-gray-500 font-jakarta">AI-powered job extraction — scrapes full details</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* URL Input */}
        <div className="p-5 border-b border-gray-100 dark:border-gray-800">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://company.com/careers"
                className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand/30 focus:border-brand"
                onKeyDown={e => e.key === 'Enter' && handleScrape()}
              />
            </div>
            <button
              onClick={handleScrape}
              disabled={loading || !url.trim()}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand hover:bg-brand/90 disabled:bg-brand/50 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Scanning...</> : <><Search className="w-4 h-4" /> Scrape</>}
            </button>
          </div>
          {error && (
            <div className="flex items-center gap-2 mt-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-400 font-jakarta">{error}</p>
            </div>
          )}
        </div>

        {/* Results */}
        {scraped && jobs.length > 0 && (
          <>
            <div className="flex items-center justify-between px-5 py-3 bg-gray-50 dark:bg-gray-800/50">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 font-jakarta">
                Found {jobs.length} job{jobs.length !== 1 ? 's' : ''} — click a job to fetch full details
              </span>
              {(onImportMultiple || onBulkCreate) && (
                <button onClick={toggleAll} className="text-xs text-brand hover:underline font-jakarta">
                  {selected.size === jobs.length ? 'Deselect all' : 'Select all'}
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {jobs.map(job => (
                <div
                  key={job.id}
                  className={`w-full text-left p-3.5 rounded-xl border transition-colors ${
                    selected.has(job.id)
                      ? 'border-brand bg-brand/5 dark:bg-brand/10'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {(onImportMultiple || onBulkCreate) && (
                      <button type="button" onClick={() => toggleSelect(job.id)}
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                          selected.has(job.id)
                            ? 'bg-brand border-brand'
                            : 'border-gray-300 dark:border-gray-600'
                        }`}>
                        {selected.has(job.id) && <Check className="w-3 h-3 text-white" />}
                      </button>
                    )}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-sora font-semibold text-sm text-navy dark:text-white">{job.title}</h4>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        {job.department && (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500 font-jakarta">
                            <Briefcase className="w-3 h-3" /> {job.department}
                          </span>
                        )}
                        {job.location && (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500 font-jakarta">
                            <MapPin className="w-3 h-3" /> {job.location}
                          </span>
                        )}
                        {job.workType && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 font-jakarta">
                            {job.workType}
                          </span>
                        )}
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-jakarta">
                          {job.category.replace(/_/g, ' ')}
                        </span>
                      </div>
                      {job.description && (
                        <p className="text-xs text-gray-400 font-jakarta mt-1.5 line-clamp-2">{job.description}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleFillForm(job)}
                      disabled={fetchingDetail === job.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-brand/10 text-brand hover:bg-brand/20 disabled:opacity-50 rounded-lg transition-colors shrink-0"
                    >
                      {fetchingDetail === job.id
                        ? <><Loader2 className="w-3 h-3 animate-spin" /> Fetching...</>
                        : <><Download className="w-3 h-3" /> Fill Form</>
                      }
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Bulk import actions */}
            {bulkProgress && (
              <div className="p-4 border-t border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-3">
                  <Loader2 className="w-4 h-4 animate-spin text-brand shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-navy dark:text-white font-jakarta">
                      Fetching details {bulkProgress.current}/{bulkProgress.total}
                    </p>
                    <p className="text-xs text-gray-400 font-jakarta truncate">{bulkProgress.title}</p>
                  </div>
                </div>
                <div className="mt-2 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-brand rounded-full transition-all duration-300"
                    style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }} />
                </div>
              </div>
            )}

            {!bulkProgress && onBulkCreate && selected.size > 0 && (
              <div className="flex items-center justify-between p-4 border-t border-gray-100 dark:border-gray-800">
                <span className="text-xs text-gray-400 font-jakarta">{selected.size} selected</span>
                <button
                  onClick={handleBulkImport}
                  className="px-4 py-2 bg-navy dark:bg-white hover:bg-navy/90 dark:hover:bg-gray-100 text-white dark:text-navy text-sm font-semibold rounded-lg transition-colors"
                >
                  Import {selected.size} as Draft{selected.size !== 1 ? 's' : ''}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
