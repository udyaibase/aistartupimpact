'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Briefcase, Loader2, Globe, CheckCircle, XCircle } from 'lucide-react';
import StartupSearchCombobox from '@/components/shared/StartupSearchCombobox';
import CareerScraperModal from '@/components/shared/CareerScraperModal';
import { createJobAction, getStartupByIdForSelectAction } from '../actions';
import { getCustomDepartments, StartupOption } from './job-form';
import { normalizeWorkType, normalizeCategory, normalizeEmploymentType } from './job-form';
import type { JobForm } from './job-form';
import JobTermsSection from './JobTermsSection';
import JobLocationSection from './JobLocationSection';
import JobDetailsSection from './JobDetailsSection';

export default function NewJobPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedStartup, setSelectedStartup] = useState<StartupOption | null>(null);
  const [showScraper, setShowScraper] = useState(false);
  const [bulkImport, setBulkImport] = useState<{
    active: boolean;
    current: number;
    total: number;
    title: string;
    results: Array<{ title: string; success: boolean; error?: string }>;
  } | null>(null);
  const [customDepts, setCustomDepts] = useState<string[]>([]);
  const [showCustomDept, setShowCustomDept] = useState(false);
  const [customDeptInput, setCustomDeptInput] = useState('');
  const initialStartupId = searchParams.get('startupId');

  useEffect(() => {
    setCustomDepts(getCustomDepartments());
  }, []);

  useEffect(() => {
    if (initialStartupId && !selectedStartup) {
      getStartupByIdForSelectAction(initialStartupId).then(res => {
        if (res.success && res.startup) {
          const s = res.startup as any;
          setSelectedStartup({ id: s.id, name: s.name, slug: s.slug, logoUrl: s.logoUrl, websiteUrl: s.websiteUrl, headquartersCity: s.headquartersCity });
        }
      });
    }
  }, [initialStartupId]);

  const [descTab, setDescTab] = useState<'write' | 'preview'>('write');

  const [form, setForm] = useState<JobForm>({
    title: '',
    description: '',
    category: 'AI_ENGINEER',
    department: '',
    workType: 'REMOTE',
    employmentType: 'FULL_TIME',
    location: '',
    city: '',
    country: 'India',
    visaSponsorship: false,
    salaryMin: '',
    salaryMax: '',
    salaryCurrency: 'INR',
    showSalary: true,
    experienceMin: '',
    experienceMax: '',
    skills: '',
    applicationType: 'EXTERNAL',
    applicationUrl: '',
    applicationEmail: '',
    listingTier: 'FREE',
    isFeatured: false,
    isActive: false,
  });

  const updateField = (field: string, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStartup) {
      setError('Please select a startup');
      return;
    }
    setSaving(true);
    setError('');

    const result = await createJobAction({
      title: form.title,
      description: form.description,
      category: form.category,
      department: form.department || undefined,
      workType: form.workType,
      employmentType: form.employmentType,
      location: form.location || undefined,
      city: form.city || undefined,
      country: form.country || undefined,
      visaSponsorship: form.visaSponsorship,
      salaryMin: form.salaryMin ? parseInt(form.salaryMin) : null,
      salaryMax: form.salaryMax ? parseInt(form.salaryMax) : null,
      salaryCurrency: form.salaryCurrency,
      showSalary: form.showSalary,
      experienceMin: form.experienceMin ? parseInt(form.experienceMin) : null,
      experienceMax: form.experienceMax ? parseInt(form.experienceMax) : null,
      skills: form.skills ? form.skills.split(',').map(s => s.trim()).filter(Boolean) : [],
      applicationType: form.applicationType,
      applicationUrl: form.applicationUrl || undefined,
      applicationEmail: form.applicationEmail || undefined,
      listingTier: form.listingTier,
      isFeatured: form.isFeatured,
      isActive: form.isActive,
      startupId: selectedStartup.id,
    });

    setSaving(false);
    if (result.success) {
      router.push('/jobs-board');
    } else {
      setError(result.error || 'Failed to create job');
    }
  };

  const jobToFormData = (job: any) => ({
    title: job.title?.trim() || '',
    description: job.description?.trim() || 'No description available',
    category: normalizeCategory(job.category) || 'OTHER',
    department: job.department || undefined,
    workType: normalizeWorkType(job.workType) || 'REMOTE',
    employmentType: normalizeEmploymentType(job.employmentType) || 'FULL_TIME',
    location: job.location || undefined,
    city: job.location || undefined,
    country: undefined,
    visaSponsorship: false,
    salaryMin: job.salaryMin ? Number(job.salaryMin) : null,
    salaryMax: job.salaryMax ? Number(job.salaryMax) : null,
    salaryCurrency: job.salaryCurrency || 'INR',
    showSalary: job.salaryMin != null || job.salaryMax != null,
    experienceMin: job.experienceMin ? Number(job.experienceMin) : null,
    experienceMax: job.experienceMax ? Number(job.experienceMax) : null,
    skills: Array.isArray(job.skills) ? job.skills : [],
    applicationType: job.applicationUrl ? 'EXTERNAL' : 'EXTERNAL',
    applicationUrl: job.applicationUrl || undefined,
    applicationEmail: job.applicationEmail || undefined,
    listingTier: 'FREE',
    isFeatured: false,
    isActive: false,
    startupId: selectedStartup!.id,
  });

  const handleScrapedImport = (job: any) => {
    const str = (v: any) => v != null && v !== '' && v !== 0 ? String(v) : '';
    const workType = normalizeWorkType(job.workType);
    const category = normalizeCategory(job.category);
    const employmentType = normalizeEmploymentType(job.employmentType);

    // Parse location into city and full location
    let city = '';
    let location = '';
    if (job.location) {
      location = job.location;
      // Extract city (first part before comma)
      const parts = job.location.split(',').map((p: string) => p.trim());
      city = parts[0] || job.location;
    }

    setForm(prev => ({
      ...prev,
      title: job.title || prev.title,
      description: job.description || prev.description,
      category: category || prev.category,
      department: job.department || prev.department,
      workType: workType || prev.workType,
      employmentType: employmentType || prev.employmentType,
      location: location || prev.location,
      city: city || prev.city,
      skills: Array.isArray(job.skills) && job.skills.length > 0
        ? job.skills.join(', ')
        : prev.skills,
      experienceMin: str(job.experienceMin) || prev.experienceMin,
      experienceMax: str(job.experienceMax) || prev.experienceMax,
      salaryMin: str(job.salaryMin) || prev.salaryMin,
      salaryMax: str(job.salaryMax) || prev.salaryMax,
      salaryCurrency: job.salaryCurrency || prev.salaryCurrency,
      showSalary: (job.salaryMin != null && job.salaryMin > 0) || (job.salaryMax != null && job.salaryMax > 0) ? true : prev.showSalary,
      applicationType: job.applicationUrl ? 'EXTERNAL' : prev.applicationType,
      applicationUrl: job.applicationUrl || prev.applicationUrl,
      applicationEmail: job.applicationEmail || prev.applicationEmail,
    }));
  };

  const handleBulkCreate = async (detailedJobs: any[]) => {
    if (!selectedStartup) {
      setError('Please select a startup first before bulk importing');
      return;
    }

    const results: Array<{ title: string; success: boolean; error?: string }> = [];
    setBulkImport({ active: true, current: 0, total: detailedJobs.length, title: '', results: [] });

    // Deduplicate within this batch (skip same title within one import)
    const seenTitles = new Set<string>();

    for (let i = 0; i < detailedJobs.length; i++) {
      const job = detailedJobs[i];
      setBulkImport({ active: true, current: i + 1, total: detailedJobs.length, title: job.title || `Job ${i + 1}`, results });

      try {
        const titleKey = (job.title || '').trim().toLowerCase();
        if (seenTitles.has(titleKey)) {
          results.push({ title: job.title || `Job ${i + 1}`, success: false, error: 'Duplicate title in this batch' });
          continue;
        }
        seenTitles.add(titleKey);

        const formData = jobToFormData(job);
        const result = await createJobAction(formData);
        results.push({ title: job.title || `Job ${i + 1}`, success: result.success, error: result.error });
      } catch (err: any) {
        results.push({ title: job.title || `Job ${i + 1}`, success: false, error: err.message });
      }
    }

    setBulkImport({ active: false, current: detailedJobs.length, total: detailedJobs.length, title: '', results });
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/jobs-board" className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="portal-title">Post New Job</h1>
          <p className="portal-subtitle">Create a job listing linked to a startup</p>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {bulkImport && (
        <div className="mb-6 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6">
          {bulkImport.active ? (
            <>
              <div className="flex items-center gap-3 mb-3">
                <Loader2 className="w-5 h-5 animate-spin text-brand" />
                <div>
                  <h3 className="font-sora font-bold text-sm text-navy dark:text-white">
                    Creating draft jobs ({bulkImport.current}/{bulkImport.total})
                  </h3>
                  <p className="text-xs text-gray-500 font-jakarta">{bulkImport.title}</p>
                </div>
              </div>
              <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-brand rounded-full transition-all duration-300"
                  style={{ width: `${(bulkImport.current / bulkImport.total) * 100}%` }} />
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-sora font-bold text-sm text-navy dark:text-white">
                  Bulk Import Complete
                </h3>
                <div className="flex items-center gap-3 text-xs font-jakarta">
                  <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    {bulkImport.results.filter(r => r.success).length} created
                  </span>
                  {bulkImport.results.some(r => !r.success) && (
                    <span className="text-red-500 flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5" />
                      {bulkImport.results.filter(r => !r.success).length} failed
                    </span>
                  )}
                </div>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {bulkImport.results.map((r, i) => (
                  <div key={i} className={`flex items-center gap-2 text-xs font-jakarta px-3 py-2 rounded-lg ${
                    r.success
                      ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                      : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                  }`}>
                    {r.success ? <CheckCircle className="w-3.5 h-3.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}
                    <span className="truncate">{r.title}</span>
                    {r.error && <span className="ml-auto shrink-0 text-[10px] opacity-75">{r.error}</span>}
                  </div>
                ))}
              </div>
              <div className="flex justify-end mt-4 gap-2">
                <button type="button" onClick={() => setBulkImport(null)}
                  className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                  Dismiss
                </button>
                <Link href="/jobs-board"
                  className="px-3 py-1.5 text-xs font-semibold text-brand bg-brand/10 hover:bg-brand/20 rounded-lg transition-colors">
                  View All Jobs
                </Link>
              </div>
            </>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Startup Selector */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6">
          <h2 className="font-sora font-bold text-lg text-navy dark:text-white mb-4 flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-brand" /> Company / Startup
          </h2>
          <StartupSearchCombobox value={selectedStartup} onChange={setSelectedStartup} />
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
            <button type="button" onClick={() => setShowScraper(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-brand bg-brand/10 hover:bg-brand/20 rounded-lg transition-colors">
              <Globe className="w-4 h-4" /> Import from Career Page
            </button>
          </div>
        </div>

        <CareerScraperModal
          isOpen={showScraper}
          onClose={() => setShowScraper(false)}
          websiteUrl={selectedStartup?.websiteUrl || undefined}
          onImportSingle={handleScrapedImport}
          onBulkCreate={handleBulkCreate}
        />

        <JobDetailsSection form={form} updateField={updateField} customDeptInput={customDeptInput} setCustomDeptInput={setCustomDeptInput} showCustomDept={showCustomDept} setShowCustomDept={setShowCustomDept} customDepts={customDepts} setCustomDepts={setCustomDepts} descTab={descTab} setDescTab={setDescTab} />
        <JobLocationSection form={form} updateField={updateField} />
        <JobTermsSection form={form} updateField={updateField} />
        {/* Submit */}
        <div className="flex items-center justify-end gap-3">
          <Link href="/jobs-board" className="px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            Cancel
          </Link>
          <button type="submit" disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-brand hover:bg-brand/90 disabled:bg-brand/50 text-white text-sm font-semibold rounded-lg transition-colors">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : 'Create Job'}
          </button>
        </div>
      </form>
    </div>
  );
}
