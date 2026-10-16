'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Briefcase, Loader2, Globe, CheckCircle, XCircle } from 'lucide-react';
import StartupSearchCombobox from '@/components/shared/StartupSearchCombobox';
import CareerScraperModal from '@/components/shared/CareerScraperModal';
import { createJobAction, getStartupByIdForSelectAction } from '../actions';

const DEPARTMENTS = [
  'Engineering',
  'Product',
  'Design',
  'Data Science',
  'Machine Learning',
  'AI Research',
  'Platform',
  'Infrastructure',
  'DevOps',
  'QA & Testing',
  'Security',
  'Sales',
  'Marketing',
  'Growth',
  'Business Development',
  'Customer Success',
  'Operations',
  'Human Resources',
  'Finance',
  'Legal',
  'Content',
  'Analytics',
  'Support',
];

const CUSTOM_DEPTS_KEY = 'udyaibase_custom_departments';

function getCustomDepartments(): string[] {
  try {
    const stored = localStorage.getItem(CUSTOM_DEPTS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

function saveCustomDepartment(dept: string) {
  try {
    const existing = getCustomDepartments();
    if (!existing.includes(dept)) {
      existing.push(dept);
      existing.sort();
      localStorage.setItem(CUSTOM_DEPTS_KEY, JSON.stringify(existing));
    }
  } catch {}
}

const JOB_CATEGORIES = [
  { value: 'AI_ENGINEER', label: 'AI Engineer' },
  { value: 'ML_ENGINEER', label: 'ML Engineer' },
  { value: 'LLM_ENGINEER', label: 'LLM Engineer' },
  { value: 'AI_RESEARCH_SCIENTIST', label: 'AI Research Scientist' },
  { value: 'DATA_SCIENTIST', label: 'Data Scientist' },
  { value: 'DATA_ENGINEER', label: 'Data Engineer' },
  { value: 'PROMPT_ENGINEER', label: 'Prompt Engineer' },
  { value: 'AI_PRODUCT_MANAGER', label: 'AI Product Manager' },
  { value: 'AI_DESIGNER', label: 'AI Designer' },
  { value: 'AI_SALES', label: 'AI Sales' },
  { value: 'AI_MARKETING', label: 'AI Marketing' },
  { value: 'AI_DEVREL', label: 'AI DevRel' },
  { value: 'AI_SOLUTIONS_ARCHITECT', label: 'AI Solutions Architect' },
  { value: 'AI_ETHICS', label: 'AI Ethics' },
  { value: 'ROBOTICS_ENGINEER', label: 'Robotics Engineer' },
  { value: 'COMPUTER_VISION', label: 'Computer Vision' },
  { value: 'NLP_ENGINEER', label: 'NLP Engineer' },
  { value: 'AI_INFRASTRUCTURE', label: 'AI Infrastructure' },
  { value: 'OTHER', label: 'Other' },
];

interface StartupOption {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  headquartersCity: string | null;
}

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

  const [form, setForm] = useState({
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

  const normalizeWorkType = (wt: any): string => {
    if (!wt) return '';
    const upper = String(wt).toUpperCase().trim();
    if (upper.includes('REMOTE') || upper.includes('TELECOMMUTE') || upper.includes('WORK FROM HOME') || upper.includes('WFH')) return 'REMOTE';
    if (upper.includes('HYBRID') || upper.includes('FLEXIBLE')) return 'HYBRID';
    if (upper.includes('ONSITE') || upper.includes('ON-SITE') || upper.includes('ON SITE') || upper.includes('IN-OFFICE') || upper.includes('OFFICE')) return 'ONSITE';
    return '';
  };

  const normalizeCategory = (cat: any): string => {
    if (!cat) return '';
    const upper = String(cat).toUpperCase().replace(/[\s-]+/g, '_').trim();
    const validCategories = [
      'AI_ENGINEER', 'ML_ENGINEER', 'LLM_ENGINEER', 'AI_RESEARCH_SCIENTIST',
      'DATA_SCIENTIST', 'DATA_ENGINEER', 'PROMPT_ENGINEER', 'AI_PRODUCT_MANAGER',
      'AI_DESIGNER', 'AI_SALES', 'AI_MARKETING', 'AI_DEVREL',
      'AI_SOLUTIONS_ARCHITECT', 'AI_ETHICS', 'ROBOTICS_ENGINEER',
      'COMPUTER_VISION', 'NLP_ENGINEER', 'AI_INFRASTRUCTURE', 'OTHER',
    ];
    if (validCategories.includes(upper)) return upper;
    if (upper.includes('MACHINE_LEARNING') || upper.includes('ML')) return 'ML_ENGINEER';
    if (upper.includes('DATA_SCIEN')) return 'DATA_SCIENTIST';
    if (upper.includes('DATA_ENG')) return 'DATA_ENGINEER';
    if (upper.includes('LLM') || upper.includes('LARGE_LANGUAGE')) return 'LLM_ENGINEER';
    if (upper.includes('NLP') || upper.includes('NATURAL_LANGUAGE')) return 'NLP_ENGINEER';
    if (upper.includes('COMPUTER_VISION') || upper.includes('CV_ENG')) return 'COMPUTER_VISION';
    if (upper.includes('PRODUCT')) return 'AI_PRODUCT_MANAGER';
    if (upper.includes('RESEARCH')) return 'AI_RESEARCH_SCIENTIST';
    if (upper.includes('ROBOT')) return 'ROBOTICS_ENGINEER';
    if (upper.includes('INFRA')) return 'AI_INFRASTRUCTURE';
    if (upper.includes('PROMPT')) return 'PROMPT_ENGINEER';
    if (upper.includes('DESIGN')) return 'AI_DESIGNER';
    if (upper.includes('MARKET')) return 'AI_MARKETING';
    if (upper.includes('SALES')) return 'AI_SALES';
    if (upper.includes('DEVREL') || upper.includes('DEVELOPER_REL')) return 'AI_DEVREL';
    if (upper.includes('SOLUTION')) return 'AI_SOLUTIONS_ARCHITECT';
    if (upper.includes('ETHICS')) return 'AI_ETHICS';
    if (upper.includes('AI') || upper.includes('ARTIFICIAL')) return 'AI_ENGINEER';
    return 'OTHER';
  };

  const normalizeEmploymentType = (et: any): string => {
    if (!et) return '';
    const upper = String(et).toUpperCase().replace(/[\s-]+/g, '_').trim();
    if (upper.includes('FULL')) return 'FULL_TIME';
    if (upper.includes('PART')) return 'PART_TIME';
    if (upper.includes('CONTRACT') || upper.includes('TEMPORARY') || upper.includes('TEMP')) return 'CONTRACT';
    if (upper.includes('INTERN')) return 'INTERNSHIP';
    if (upper.includes('FREELAN') || upper.includes('CONSULT')) return 'FREELANCE';
    return '';
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
    const str = (v: any) => v != null && v !== '' ? String(v) : '';
    const workType = normalizeWorkType(job.workType);
    const category = normalizeCategory(job.category);
    const employmentType = normalizeEmploymentType(job.employmentType);

    setForm(prev => ({
      ...prev,
      title: job.title || prev.title,
      description: job.description || prev.description,
      category: category || prev.category,
      department: job.department || prev.department,
      workType: workType || prev.workType,
      employmentType: employmentType || prev.employmentType,
      city: job.location || prev.city,
      skills: Array.isArray(job.skills) && job.skills.length > 0
        ? job.skills.join(', ')
        : prev.skills,
      experienceMin: str(job.experienceMin) || prev.experienceMin,
      experienceMax: str(job.experienceMax) || prev.experienceMax,
      salaryMin: str(job.salaryMin) || prev.salaryMin,
      salaryMax: str(job.salaryMax) || prev.salaryMax,
      salaryCurrency: job.salaryCurrency || prev.salaryCurrency,
      showSalary: job.salaryMin != null || job.salaryMax != null ? true : prev.showSalary,
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

    for (let i = 0; i < detailedJobs.length; i++) {
      const job = detailedJobs[i];
      setBulkImport({ active: true, current: i + 1, total: detailedJobs.length, title: job.title || `Job ${i + 1}`, results });

      try {
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
          <h1 className="font-sora font-bold text-2xl text-navy dark:text-white">Post New Job</h1>
          <p className="text-sm text-gray-500 font-jakarta mt-1">Create a job listing linked to a startup</p>
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

        {/* Job Details */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6 space-y-4">
          <h2 className="font-sora font-bold text-lg text-navy dark:text-white mb-2">Job Details</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 font-jakarta">Title *</label>
            <input type="text" required value={form.title} onChange={e => updateField('title', e.target.value)}
              className="input-field" placeholder="e.g. Senior ML Engineer" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 font-jakarta">Description *</label>
            <textarea required value={form.description} onChange={e => updateField('description', e.target.value)}
              rows={8} className="input-field" placeholder="Full job description..." />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 font-jakarta">Category</label>
              <select value={form.category} onChange={e => updateField('category', e.target.value)} className="input-field">
                {JOB_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 font-jakarta">Department</label>
              {showCustomDept ? (
                <div className="flex gap-2">
                  <input type="text" value={customDeptInput} onChange={e => setCustomDeptInput(e.target.value)}
                    className="input-field flex-1" placeholder="Enter custom department" autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (customDeptInput.trim()) {
                          saveCustomDepartment(customDeptInput.trim());
                          setCustomDepts(getCustomDepartments());
                          updateField('department', customDeptInput.trim());
                          setCustomDeptInput('');
                          setShowCustomDept(false);
                        }
                      }
                    }} />
                  <button type="button" onClick={() => {
                    if (customDeptInput.trim()) {
                      saveCustomDepartment(customDeptInput.trim());
                      setCustomDepts(getCustomDepartments());
                      updateField('department', customDeptInput.trim());
                    }
                    setCustomDeptInput('');
                    setShowCustomDept(false);
                  }} className="px-3 py-2 text-xs font-semibold bg-brand text-white rounded-lg hover:bg-brand/90 transition-colors">
                    Add
                  </button>
                  <button type="button" onClick={() => { setShowCustomDept(false); setCustomDeptInput(''); }}
                    className="px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                    Cancel
                  </button>
                </div>
              ) : (
                <select value={form.department} onChange={e => {
                  if (e.target.value === '__custom__') {
                    setShowCustomDept(true);
                  } else {
                    updateField('department', e.target.value);
                  }
                }} className="input-field">
                  <option value="">Select department</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                  {customDepts.length > 0 && (
                    <optgroup label="Custom">
                      {customDepts.map(d => <option key={`c-${d}`} value={d}>{d}</option>)}
                    </optgroup>
                  )}
                  <option value="__custom__">+ Add custom department</option>
                </select>
              )}
            </div>
          </div>
        </div>

        {/* Location */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6 space-y-4">
          <h2 className="font-sora font-bold text-lg text-navy dark:text-white mb-2">Location</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 font-jakarta">Work Type</label>
            <div className="flex gap-2">
              {['REMOTE', 'HYBRID', 'ONSITE'].map(t => (
                <button key={t} type="button" onClick={() => updateField('workType', t)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    form.workType === t
                      ? 'bg-brand text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}>
                  {t.charAt(0) + t.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 font-jakarta">Employment Type</label>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'FULL_TIME', label: 'Full Time' },
                { value: 'PART_TIME', label: 'Part Time' },
                { value: 'CONTRACT', label: 'Contract' },
                { value: 'INTERNSHIP', label: 'Internship' },
                { value: 'FREELANCE', label: 'Freelance' },
              ].map(t => (
                <button key={t.value} type="button" onClick={() => updateField('employmentType', t.value)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    form.employmentType === t.value
                      ? 'bg-brand text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {form.workType !== 'REMOTE' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 font-jakarta">City</label>
                <input type="text" value={form.city} onChange={e => updateField('city', e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 font-jakarta">Country</label>
                <input type="text" value={form.country} onChange={e => updateField('country', e.target.value)} className="input-field" />
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.visaSponsorship} onChange={e => updateField('visaSponsorship', e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-brand focus:ring-brand" />
            <span className="text-sm text-gray-700 dark:text-gray-300 font-jakarta">Visa sponsorship available</span>
          </label>
        </div>

        {/* Compensation */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6 space-y-4">
          <h2 className="font-sora font-bold text-lg text-navy dark:text-white mb-2">Compensation</h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 font-jakarta">Min Salary</label>
              <input type="number" value={form.salaryMin} onChange={e => updateField('salaryMin', e.target.value)}
                className="input-field" placeholder="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 font-jakarta">Max Salary</label>
              <input type="number" value={form.salaryMax} onChange={e => updateField('salaryMax', e.target.value)}
                className="input-field" placeholder="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 font-jakarta">Currency</label>
              <select value={form.salaryCurrency} onChange={e => updateField('salaryCurrency', e.target.value)} className="input-field">
                <option value="INR">INR</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.showSalary} onChange={e => updateField('showSalary', e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-brand focus:ring-brand" />
                <span className="text-sm text-gray-700 dark:text-gray-300 font-jakarta">Show salary</span>
              </label>
            </div>
          </div>
        </div>

        {/* Requirements */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6 space-y-4">
          <h2 className="font-sora font-bold text-lg text-navy dark:text-white mb-2">Requirements</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 font-jakarta">Min Experience (years)</label>
              <input type="number" value={form.experienceMin} onChange={e => updateField('experienceMin', e.target.value)}
                className="input-field" min="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 font-jakarta">Max Experience (years)</label>
              <input type="number" value={form.experienceMax} onChange={e => updateField('experienceMax', e.target.value)}
                className="input-field" min="0" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 font-jakarta">Skills (comma-separated)</label>
            <input type="text" value={form.skills} onChange={e => updateField('skills', e.target.value)}
              className="input-field" placeholder="Python, TensorFlow, PyTorch, NLP" />
          </div>
        </div>

        {/* Application Method */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6 space-y-4">
          <h2 className="font-sora font-bold text-lg text-navy dark:text-white mb-2">Application Method</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 font-jakarta">How should candidates apply?</label>
            <div className="flex gap-2">
              {[{ v: 'EXTERNAL', l: 'External URL' }, { v: 'INTERNAL', l: 'On Udyaibase' }].map(t => (
                <button key={t.v} type="button" onClick={() => updateField('applicationType', t.v)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    form.applicationType === t.v
                      ? 'bg-brand text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}>
                  {t.l}
                </button>
              ))}
            </div>
          </div>

          {form.applicationType === 'EXTERNAL' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 font-jakarta">Application URL</label>
              <input type="url" value={form.applicationUrl} onChange={e => updateField('applicationUrl', e.target.value)}
                className="input-field" placeholder="https://careers.example.com/apply" />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 font-jakarta">Application Email (optional)</label>
            <input type="email" value={form.applicationEmail} onChange={e => updateField('applicationEmail', e.target.value)}
              className="input-field" placeholder="hr@example.com" />
          </div>
        </div>

        {/* Listing Settings (admin-only) */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6 space-y-4">
          <h2 className="font-sora font-bold text-lg text-navy dark:text-white mb-2">Listing Settings</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 font-jakarta">Listing Tier</label>
              <select value={form.listingTier} onChange={e => updateField('listingTier', e.target.value)} className="input-field">
                <option value="FREE">Free</option>
                <option value="FEATURED">Featured</option>
                <option value="PREMIUM">Premium</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isFeatured} onChange={e => updateField('isFeatured', e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-brand focus:ring-brand" />
              <span className="text-sm text-gray-700 dark:text-gray-300 font-jakarta">Featured</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isActive} onChange={e => updateField('isActive', e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-brand focus:ring-brand" />
              <span className="text-sm text-gray-700 dark:text-gray-300 font-jakarta">Publish immediately</span>
            </label>
          </div>
        </div>

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
