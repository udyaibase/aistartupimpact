'use client';

import { notify } from '@/components/Toast';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Upload, Loader2, Save, Crown } from 'lucide-react';
import { createStartupAction } from '../startup-form-actions';
import { uploadLogoAction } from '../../media/actions';
import { FAQManager, type FAQ } from '@/components/shared/FAQManager';
import FundingRoundsManager, { FundingRound, convertToSaveFormat } from '@/components/shared/FundingRoundsManager';
import FoundersDetailsManager, { FounderDetail } from '@/components/shared/FoundersDetailsManager';
import SocialLinksManager, { SocialLink } from '@/components/shared/SocialLinksManager';
import CityCombobox from '@/components/shared/CityCombobox';
import { getCanonicalCategoriesAction, getCanonicalTypesAction } from '../manage/actions';

const stages = ['BOOTSTRAPPED', 'IDEA', 'PRE_SEED', 'SEED', 'PRE_SERIES_A', 'SERIES_A', 'PRE_SERIES_B', 'SERIES_B', 'PRE_SERIES_C', 'SERIES_C', 'PRE_SERIES_D', 'SERIES_D', 'SERIES_E', 'SERIES_F', 'SERIES_G', 'SERIES_I', 'SERIES_J', 'GROWTH', 'PUBLIC'];

export default function NewStartupPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [startupCategories, setStartupCategories] = useState<string[]>([]);
  const [businessTypes, setBusinessTypes] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([
      getCanonicalCategoriesAction(),
      getCanonicalTypesAction(),
    ]).then(([cats, types]) => {
      setStartupCategories((cats as any[]).filter(c => c.isActive).map(c => c.name));
      setBusinessTypes((types as any[]).filter(t => t.isActive).map(t => t.name));
    });
  }, []);
  
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoPreviewError, setLogoPreviewError] = useState(false);
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [fundingRounds, setFundingRounds] = useState<FundingRound[]>([]);
  const [foundersDetails, setFoundersDetails] = useState<FounderDetail[]>([]);
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  
  const [draftLoaded, setDraftLoaded] = useState(false);

  // Load draft from localStorage on mount
  useEffect(() => {
    const draft = localStorage.getItem('draft_admin_new_startup');
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
        notify("Something went wrong. Check your connection and try again.", 'error');
      }
    }
    setDraftLoaded(true);
  }, []);

  const [formData, setFormData] = useState({
    name: '',
    tagline: '',
    description: '',
    logoUrl: '',
    websiteUrl: '',
    linkedinUrl: '',
    twitterUrl: '',
    stage: 'SEED',
    status: 'ACTIVE',
    headquartersCity: '',
    foundedYear: null as number | null,
    employeeCount: null as number | null,
    isFeatured: false,
    category: '',
    businessType: '',
  });

  // Save draft to localStorage on changes
  useEffect(() => {
    if (!draftLoaded) return;
    localStorage.setItem('draft_admin_new_startup', JSON.stringify({ formData, faqs, fundingRounds, foundersDetails, socialLinks }));
  }, [formData, faqs, fundingRounds, foundersDetails, socialLinks, draftLoaded]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      setFormData(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else if (name === 'foundedYear' || name === 'employeeCount') {
      setFormData(prev => ({ ...prev, [name]: value ? parseInt(value) : null }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setLogoUploading(true);
    setLogoPreviewError(false);
    
    try {
      const fd = new FormData();
      fd.append('file', file);
      const result = await uploadLogoAction(fd);
      
      if (result.success && result.url) {
        setFormData(prev => ({ ...prev, logoUrl: result.url! }));
      } else {
        notify('Upload failed: ' + (result.error || 'Unknown error'));
      }
    } catch (err: any) {
      notify('Upload error: ' + err.message);
    } finally {
      setLogoUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const missingFields = [];
    if (!formData.name) missingFields.push('Name');
    if (!formData.tagline) missingFields.push('Tagline');
    if (!formData.description) missingFields.push('Description');
    if (!formData.websiteUrl) missingFields.push('Website URL');
    if (!formData.logoUrl) missingFields.push('Logo');
    if (!formData.category) missingFields.push('Category');
    if (!formData.businessType) missingFields.push('Business Type');
    if (!formData.foundedYear) missingFields.push('Founded Year');
    if (!formData.employeeCount) missingFields.push('Employee Count');
    if (!foundersDetails.some(f => f.name.trim())) missingFields.push('At least 1 Founder');
    if (missingFields.length > 0) {
      notify('Required fields missing: ' + missingFields.join(', '));
      return;
    }
    
    setSaving(true);
    
    try {
      const result = await createStartupAction({
        ...formData,
        faqs: faqs.length > 0 ? faqs : undefined,
        fundingRounds: fundingRounds.length > 0 ? convertToSaveFormat(fundingRounds) : undefined,
        foundersData: foundersDetails.filter(f => f.name.trim()).length > 0
          ? foundersDetails.filter(f => f.name.trim())
          : undefined,
        socialLinks: socialLinks.length > 0 ? socialLinks : undefined,
      });
      
      if (result.success) {
        localStorage.removeItem('draft_admin_new_startup');
        router.push('/startups-dir');
        router.refresh();
      } else {
        notify('Error: ' + (result.error || 'Failed to create startup'));
      }
    } catch (error: any) {
      notify('Error: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

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
          <h1 className="portal-title">Add New Startup</h1>
          <p className="portal-subtitle">
            Fill in the details to add a new startup to the directory
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6 space-y-6">
          <h2 className="font-sora font-bold text-lg text-navy dark:text-white">Basic Information</h2>
          
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
                  {formData.tagline.length}/100 characters
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
                value={formData.status}
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
                value={formData.headquartersCity}
                onChange={(val) => setFormData(prev => ({ ...prev, headquartersCity: val }))}
                placeholder="e.g. Bengaluru"
                className="text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
                Category *
              </label>
              <select
                name="category"
                value={formData.category}
                onChange={handleChange}
                required
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
                Business Type *
              </label>
              <select
                name="businessType"
                value={formData.businessType}
                onChange={handleChange}
                required
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
              <span>Description *</span>
              <span className="text-[10px] lowercase font-normal text-gray-400 font-jakarta">
                {formData.description.length}/1000 characters
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
              Logo *
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
                value={formData.logoUrl}
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
              Website URL *
            </label>
            <input
              type="url"
              name="websiteUrl"
              value={formData.websiteUrl}
              onChange={handleChange}
              required
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
                value={formData.linkedinUrl}
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
                value={formData.twitterUrl}
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
                Founded Year *
              </label>
              <input
                type="number"
                name="foundedYear"
                value={formData.foundedYear ?? ''}
                onChange={handleChange}
                required
                className="input-field text-sm"
                placeholder="2023"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
                Employees *
              </label>
              <input
                type="number"
                name="employeeCount"
                value={formData.employeeCount ?? ''}
                onChange={handleChange}
                required
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
                  To feature this startup, use the &quot;Schedule&quot; button from the startups list after creation.
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
          <FundingRoundsManager rounds={fundingRounds} onChange={setFundingRounds} maxRounds={10} />
        </div>

        {/* FAQs */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6">
          <FAQManager faqs={faqs} onChange={setFaqs} maxFaqs={10} />
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
            disabled={saving || !formData.name || !formData.tagline || !formData.description || !formData.websiteUrl || !formData.logoUrl || !formData.category || !formData.businessType}
            className="btn-brand text-sm flex items-center gap-2 disabled:opacity-50 px-6 py-2.5"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save Startup'}
          </button>
        </div>
      </form>
    </div>
  );
}
