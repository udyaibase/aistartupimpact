'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Upload, Loader2, Save, Crown, Briefcase, Plus, CheckCircle, XCircle } from 'lucide-react';
import Link from 'next/link';
import { getStartupsAction, getStartupFAQsAction, getStartupFundingRoundsAction, updateStartupAction } from '../../actions';
import { uploadLogoAction } from '../../../media/actions';
import { FAQManager, type FAQ } from '@/components/shared/FAQManager';
import FundingRoundsManager, { FundingRound, convertToSaveFormat, convertFromDbFormat } from '@/components/shared/FundingRoundsManager';
import FoundersDetailsManager, { FounderDetail } from '@/components/shared/FoundersDetailsManager';
import SocialLinksManager, { SocialLink } from '@/components/shared/SocialLinksManager';
import CityCombobox from '@/components/shared/CityCombobox';
import { getCanonicalCategoriesAction, getCanonicalTypesAction } from '../../manage/actions';
import SlugEditor from '@/components/shared/SlugEditor';
import { getStartupJobsAction } from '@/app/(dashboard)/jobs-board/actions';


const stages = ['BOOTSTRAPPED', 'IDEA', 'PRE_SEED', 'SEED', 'PRE_SERIES_A', 'SERIES_A', 'PRE_SERIES_B', 'SERIES_B', 'PRE_SERIES_C', 'SERIES_C', 'PRE_SERIES_D', 'SERIES_D', 'SERIES_E', 'SERIES_F', 'SERIES_G', 'SERIES_I', 'SERIES_J', 'GROWTH', 'PUBLIC'];

interface Startup {
  id: string;
  name: string;
  slug: string;
  slugChangedAt?: string | null;
  tagline: string;
  description: string;
  logoUrl?: string;
  websiteUrl?: string;
  linkedinUrl?: string;
  twitterUrl?: string;
  stage: string;
  status: string;
  headquartersCity?: string;
  isFeatured: boolean;
  foundedYear?: number | null;
  employeeCount?: number | null;
  impactScore?: number | null;
  category?: string;
  businessType?: string;
  founders?: string[];
  foundersData?: any[] | null;
  socialLinks?: any[] | null;
}


export default function EditStartupPage() {
  const router = useRouter();
  const params = useParams();
  const startupId = params.id as string;
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoPreviewError, setLogoPreviewError] = useState(false);
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [loadingFaqs, setLoadingFaqs] = useState(false);
  const [fundingRounds, setFundingRounds] = useState<FundingRound[]>([]);
  const [foundersDetails, setFoundersDetails] = useState<FounderDetail[]>([]);
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [loadingFundingRounds, setLoadingFundingRounds] = useState(false);
  const [startupCategories, setStartupCategories] = useState<string[]>([]);
  const [businessTypes, setBusinessTypes] = useState<string[]>([]);
  
  const [formData, setFormData] = useState<Startup | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [startupJobs, setStartupJobs] = useState<any[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);

  // Load canonical categories and types
  useEffect(() => {
    Promise.all([
      getCanonicalCategoriesAction(),
      getCanonicalTypesAction(),
    ]).then(([cats, types]) => {
      setStartupCategories((cats as any[]).filter(c => c.isActive).map(c => c.name));
      setBusinessTypes((types as any[]).filter(t => t.isActive).map(t => t.name));
    });
  }, []);


  useEffect(() => {
    loadStartup();
  }, [startupId]);

  const loadStartup = async () => {
    setLoading(true);
    try {
      const result = await getStartupsAction();
      if (!Array.isArray(result)) return;
      const startup = result.find((s: any) => s.id === startupId);
      
      if (!startup) {
        alert('Startup not found');
        router.push('/startups-dir');
        return;
      }
      
      setFormData(startup as Startup);
      
      // Load Founders Details
      if (startup.foundersData && Array.isArray(startup.foundersData)) {
        setFoundersDetails(startup.foundersData);
      } else {
        setFoundersDetails([]);
      }

      // Load Social Links
      if (startup.socialLinks && Array.isArray(startup.socialLinks)) {
        setSocialLinks(startup.socialLinks);
      } else {
        setSocialLinks([]);
      }

      // Load FAQs
      setLoadingFaqs(true);
      try {
        const startupFaqs = await getStartupFAQsAction(startupId);
        console.log('Loaded FAQs:', startupFaqs); // Debug log
        setFaqs(startupFaqs as FAQ[]);
      } catch (faqError) {
        console.error('Error loading FAQs:', faqError);
        // If table doesn't exist, just set empty array
        setFaqs([]);
      }

      // Load Funding Rounds
      setLoadingFundingRounds(true);
      try {
        const dbRounds = await getStartupFundingRoundsAction(startupId);
        if (Array.isArray(dbRounds)) setFundingRounds(convertFromDbFormat(dbRounds));
      } catch (roundError) {
        console.error('Error loading funding rounds:', roundError);
        setFundingRounds([]);
      } finally {
        setLoadingFundingRounds(false);
      }

      // Load linked jobs
      setLoadingJobs(true);
      try {
        const jobsRes = await getStartupJobsAction(startupId);
        if (jobsRes.success && jobsRes.jobs) setStartupJobs(jobsRes.jobs as any[]);
      } catch { setStartupJobs([]); }
      finally { setLoadingJobs(false); }

      // Check for drafts after database load finishes successfully
      const draftKey = `draft_admin_edit_startup_${startupId}`;
      const draft = localStorage.getItem(draftKey);
      if (draft) {
        try {
          const { formData: dForm, faqs: dFaqs, fundingRounds: dRounds, foundersDetails: dFounders, socialLinks: dSocialLinks } = JSON.parse(draft);
          if (dForm) setFormData(dForm);
          if (dFaqs) setFaqs(dFaqs);
          if (dRounds) setFundingRounds(dRounds);
          if (dFounders) setFoundersDetails(dFounders);
          if (dSocialLinks) setSocialLinks(dSocialLinks);
        } catch (e) {
          console.error('Failed to restore startup draft:', e);
        }
      }
      setDraftLoaded(true);
    } catch (error) {
      console.error('Error loading startup:', error);
      alert('Error loading startup');
    } finally {
      setLoading(false);
      setLoadingFaqs(false);
    }
  };


  // Save draft on changes
  useEffect(() => {
    if (!draftLoaded) return;
    const draftKey = `draft_admin_edit_startup_${startupId}`;
    localStorage.setItem(draftKey, JSON.stringify({ formData, faqs, fundingRounds, foundersDetails, socialLinks }));
  }, [formData, faqs, fundingRounds, foundersDetails, socialLinks, draftLoaded, startupId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    if (!formData) return;
    
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      setFormData(prev => prev ? { ...prev, [name]: (e.target as HTMLInputElement).checked } : null);
    } else if (name === 'foundedYear' || name === 'employeeCount') {
      setFormData(prev => prev ? { ...prev, [name]: value ? parseInt(value) : null } : null);
    } else {
      setFormData(prev => prev ? { ...prev, [name]: value } : null);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !formData) return;
    
    setLogoUploading(true);
    setLogoPreviewError(false);
    
    try {
      const fd = new FormData();
      fd.append('file', file);
      const result = await uploadLogoAction(fd);
      
      if (result.success && result.url) {
        setFormData(prev => prev ? { ...prev, logoUrl: result.url! } : null);
      } else {
        alert('Upload failed: ' + (result.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Upload error: ' + err.message);
    } finally {
      setLogoUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData || !formData.name || !formData.tagline) {
      alert('Name and tagline are required');
      return;
    }
    
    setSaving(true);
    
    try {
      const result = await updateStartupAction(startupId, {
        name: formData.name,
        tagline: formData.tagline,
        description: formData.description,
        logoUrl: formData.logoUrl,
        websiteUrl: formData.websiteUrl,
        linkedinUrl: formData.linkedinUrl,
        twitterUrl: formData.twitterUrl,
        stage: formData.stage,
        status: formData.status,
        headquartersCity: formData.headquartersCity,
        foundedYear: formData.foundedYear,
        employeeCount: formData.employeeCount,
        category: formData.category,
        businessType: formData.businessType,
        faqs: faqs.length > 0 ? faqs : [],
        fundingRounds: fundingRounds.length > 0 ? convertToSaveFormat(fundingRounds) : [],
        foundersData: foundersDetails.filter(f => f.name.trim()).length > 0
          ? foundersDetails.filter(f => f.name.trim())
          : [],
        socialLinks: socialLinks.length > 0 ? socialLinks : [],
      });
      
      if (result.success) {
        localStorage.removeItem(`draft_admin_edit_startup_${startupId}`);
        router.push('/startups-dir');
        router.refresh();
      } else {
        alert('Error: ' + (result.error || 'Failed to update startup'));
      }
    } catch (error: any) {
      alert('Error: ' + error.message);
    } finally {
      setSaving(false);
    }
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-brand" />
      </div>
    );
  }

  if (!formData) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Startup not found</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>
        <div>
          <h1 className="font-sora font-extrabold text-2xl text-navy dark:text-white">Edit Startup</h1>
          <p className="text-gray-400 dark:text-gray-500 text-sm font-jakarta mt-1">
            Update startup information
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6 space-y-6">
          <h2 className="font-sora font-bold text-lg text-navy dark:text-white">Basic Information</h2>

          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-150 dark:border-gray-800">
            <SlugEditor
              currentSlug={formData.slug}
              slugChangedAt={formData.slugChangedAt}
              entityType="startup"
              entityId={formData.id}
              baseUrl="https://udyaibase.com/startups"
              isAdmin={true}
              onSuccess={(newSlug) => {
                setFormData(prev => prev ? { ...prev, slug: newSlug } : null);
              }}
            />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
                Company Name *
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="input-field text-sm"
                placeholder="e.g. Sarvam AI"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta flex justify-between items-center">
                <span>Tagline *</span>
                <span className="text-[10px] lowercase font-normal text-gray-400 font-jakarta">
                  {(formData.tagline || '').length}/100 characters
                </span>
              </label>
              <input
                type="text"
                name="tagline"
                value={formData.tagline}
                onChange={handleChange}
                required
                maxLength={100}
                className="input-field text-sm"
                placeholder="e.g. India-first foundation models"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
                Stage
              </label>
              <select
                name="stage"
                value={formData.stage}
                onChange={handleChange}
                className="input-field text-sm"
              >
                {stages.map(s => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
                Company Status
              </label>
              <select
                name="status"
                value={formData.status || 'ACTIVE'}
                onChange={handleChange}
                className="input-field text-sm"
              >
                <option value="ACTIVE">Active</option>
                <option value="PUBLIC">Public</option>
                <option value="ACQUIRED">Acquired</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
                Location
              </label>
              <CityCombobox
                id="headquartersCity"
                name="headquartersCity"
                value={formData.headquartersCity || ''}
                onChange={(val) => setFormData(prev => prev ? { ...prev, headquartersCity: val } : null)}
                placeholder="e.g. Bengaluru"
                className="text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
                Category
              </label>
              <select
                name="category"
                value={formData.category || ''}
                onChange={handleChange}
                className="input-field text-sm"
              >
                <option value="">Select category</option>
                {startupCategories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
                Business Type
              </label>
              <select
                name="businessType"
                value={formData.businessType || ''}
                onChange={handleChange}
                className="input-field text-sm"
              >
                <option value="">Select business type</option>
                {businessTypes.map(bt => (
                  <option key={bt} value={bt}>{bt}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta flex justify-between items-center">
              <span>Description</span>
              <span className="text-[10px] lowercase font-normal text-gray-400 font-jakarta">
                {(formData.description || '').length}/1000 characters
              </span>
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={6}
              maxLength={1000}
              className="input-field text-sm"
              placeholder="Brief description of the startup..."
            />
          </div>
        </div>

        {/* Logo & URLs */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6 space-y-6">
          <h2 className="font-sora font-bold text-lg text-navy dark:text-white">Logo & URLs</h2>
          
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
              Logo
            </label>
            <div className="flex gap-2 items-start">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoUpload}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={logoUploading}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 disabled:opacity-50"
              >
                {logoUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {logoUploading ? 'Uploading…' : 'Upload'}
              </button>
              <input
                type="url"
                name="logoUrl"
                value={formData.logoUrl || ''}
                onChange={(e) => { handleChange(e); setLogoPreviewError(false); }}
                className="input-field text-sm flex-1"
                placeholder="https://... or upload above"
              />
            </div>
            {formData.logoUrl && !logoPreviewError && (
              <div className="mt-2 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={formData.logoUrl}
                  alt="Logo preview"
                  className="w-12 h-12 rounded-lg object-contain border border-gray-200 dark:border-gray-700 p-1 bg-white"
                  onError={() => setLogoPreviewError(true)}
                />
                <span className="text-xs text-gray-400 font-jakarta">Preview</span>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
              Website URL
            </label>
            <input
              type="url"
              name="websiteUrl"
              value={formData.websiteUrl || ''}
              onChange={handleChange}
              className="input-field text-sm"
              placeholder="https://..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
                LinkedIn URL
              </label>
              <input
                type="url"
                name="linkedinUrl"
                value={formData.linkedinUrl || ''}
                onChange={handleChange}
                className="input-field text-sm"
                placeholder="https://linkedin.com/company/..."
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
                Twitter/X URL
              </label>
              <input
                type="url"
                name="twitterUrl"
                value={formData.twitterUrl || ''}
                onChange={handleChange}
                className="input-field text-sm"
                placeholder="https://twitter.com/..."
              />
            </div>
          </div>

          <div className="border-t border-gray-150 dark:border-gray-800 pt-6">
            <SocialLinksManager links={socialLinks} onChange={setSocialLinks} />
          </div>
        </div>

        {/* Company Details */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6 space-y-6">
          <h2 className="font-sora font-bold text-lg text-navy dark:text-white">Company Details</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
                Founded Year
              </label>
              <input
                type="number"
                name="foundedYear"
                value={formData.foundedYear ?? ''}
                onChange={handleChange}
                className="input-field text-sm"
                placeholder="2023"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
                Employees
              </label>
              <input
                type="number"
                name="employeeCount"
                value={formData.employeeCount ?? ''}
                onChange={handleChange}
                className="input-field text-sm"
                placeholder="50"
              />
            </div>
          </div>

          <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
            <div className="flex items-center gap-3">
              <div>
                <span className="text-sm font-medium text-navy dark:text-white font-jakarta flex items-center gap-2">
                  <Crown className="w-4 h-4 text-yellow-500" />
                  Featured Placement
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta mt-0.5">
                  To schedule featured campaigns, use the &quot;Schedule&quot; button from the startups list page.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Founders Details */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6">
          <FoundersDetailsManager founders={foundersDetails} onChange={setFoundersDetails} maxFounders={5} />
        </div>

        {/* Funding Rounds */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6">
          {loadingFundingRounds ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-brand" />
              <span className="ml-2 text-sm text-gray-500">Loading funding rounds...</span>
            </div>
          ) : (
            <FundingRoundsManager rounds={fundingRounds} onChange={setFundingRounds} maxRounds={10} />
          )}
        </div>

        {/* FAQs */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6">
          {loadingFaqs ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-brand" />
              <span className="ml-2 text-sm text-gray-500">Loading FAQs...</span>
            </div>
          ) : (
            <FAQManager faqs={faqs} onChange={setFaqs} maxFaqs={10} />
          )}
        </div>


        {/* Jobs */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-sora font-bold text-lg text-navy dark:text-white flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-brand" /> Job Listings
            </h2>
            <Link href={`/jobs-board/new?startupId=${startupId}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-brand/10 text-brand hover:bg-brand/20 rounded-lg transition-colors">
              <Plus className="w-3.5 h-3.5" /> Post Job
            </Link>
          </div>
          {loadingJobs ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-brand" />
              <span className="ml-2 text-sm text-gray-500">Loading jobs...</span>
            </div>
          ) : startupJobs.length === 0 ? (
            <div className="text-center py-8">
              <Briefcase className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
              <p className="text-sm text-gray-400 font-jakarta">No job listings yet</p>
              <Link href={`/jobs-board/new?startupId=${startupId}`}
                className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 text-sm font-medium text-brand bg-brand/10 hover:bg-brand/20 rounded-lg transition-colors">
                <Plus className="w-4 h-4" /> Create First Job
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {startupJobs.map((job: any) => (
                <div key={job.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <h4 className="font-sora font-semibold text-sm text-navy dark:text-white truncate">{job.title}</h4>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 font-jakarta">
                        {job.category?.replace(/_/g, ' ')}
                      </span>
                      <span className="text-xs text-gray-400 font-jakarta">{job.workType?.replace(/_/g, ' ')}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      job.isActive
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                    }`}>
                      {job.isActive ? <><CheckCircle className="w-2.5 h-2.5" /> Active</> : 'Draft'}
                    </span>
                    <Link href={`/jobs-board/${job.id}/edit`}
                      className="text-xs text-brand hover:underline font-jakarta">
                      Edit
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 sticky bottom-0 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 p-4 rounded-xl">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-2.5 text-sm font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !formData.name || !formData.tagline}
            className="btn-brand text-sm flex items-center gap-2 disabled:opacity-50 px-6 py-2.5"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
