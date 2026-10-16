'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Briefcase, Loader2 } from 'lucide-react';
import StartupSearchCombobox from '@/components/shared/StartupSearchCombobox';
import { getJobByIdAction, updateJobAction } from '../../actions';

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

export default function EditJobPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedStartup, setSelectedStartup] = useState<StartupOption | null>(null);
  const [customDepts, setCustomDepts] = useState<string[]>([]);
  const [showCustomDept, setShowCustomDept] = useState(false);
  const [customDeptInput, setCustomDeptInput] = useState('');

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

  useEffect(() => { setCustomDepts(getCustomDepartments()); }, []);

  useEffect(() => {
    (async () => {
      const res = await getJobByIdAction(jobId);
      if (!res.success || !res.job) {
        setError(res.error || 'Job not found');
        setLoading(false);
        return;
      }
      const j = res.job as any;
      setForm({
        title: j.title || '',
        description: j.description || '',
        category: j.category || 'AI_ENGINEER',
        department: j.department || '',
        workType: j.workType || 'REMOTE',
        employmentType: j.employmentType || 'FULL_TIME',
        location: j.location || '',
        city: j.city || '',
        country: j.country || 'India',
        visaSponsorship: j.visaSponsorship || false,
        salaryMin: j.salaryMin?.toString() || '',
        salaryMax: j.salaryMax?.toString() || '',
        salaryCurrency: j.salaryCurrency || 'INR',
        showSalary: j.showSalary ?? true,
        experienceMin: j.experienceMin?.toString() || '',
        experienceMax: j.experienceMax?.toString() || '',
        skills: Array.isArray(j.skills) ? j.skills.join(', ') : '',
        applicationType: j.applicationType || 'EXTERNAL',
        applicationUrl: j.applicationUrl || '',
        applicationEmail: j.applicationEmail || '',
        listingTier: j.listingTier || 'FREE',
        isFeatured: j.isFeatured || false,
        isActive: j.isActive || false,
      });
      if (j.department && !DEPARTMENTS.includes(j.department)) {
        saveCustomDepartment(j.department);
        setCustomDepts(getCustomDepartments());
      }
      if (j.startupId && j.startupName) {
        setSelectedStartup({
          id: j.startupId,
          name: j.startupName,
          slug: j.startupSlug || '',
          logoUrl: j.startupLogoUrl || null,
          websiteUrl: j.startupWebsiteUrl || null,
          headquartersCity: j.city || null,
        });
      }
      setLoading(false);
    })();
  }, [jobId]);

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

    const result = await updateJobAction(jobId, {
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
      setError(result.error || 'Failed to update job');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-brand" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/jobs-board" className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="font-sora font-bold text-2xl text-navy dark:text-white">Edit Job</h1>
          <p className="text-sm text-gray-500 font-jakarta mt-1">{form.title || 'Untitled'}</p>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Startup Selector */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6">
          <h2 className="font-sora font-bold text-lg text-navy dark:text-white mb-4 flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-brand" /> Company / Startup
          </h2>
          <StartupSearchCombobox value={selectedStartup} onChange={setSelectedStartup} />
        </div>

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

        {/* Listing Settings */}
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
              <span className="text-sm text-gray-700 dark:text-gray-300 font-jakarta">Active</span>
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
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : 'Update Job'}
          </button>
        </div>
      </form>
    </div>
  );
}
