'use client';

import { CityPicker, CountryPicker } from '@/components/LocationFields';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Upload, Loader2, Save, Plus, X } from 'lucide-react';
import { createToolAction, getCategoriesAction, updateToolProsConsAction } from '../actions';
import { FAQManager, type FAQ } from '@/components/shared/FAQManager';
import CategoryCascadeSelect from '@/components/shared/CategoryCascadeSelect';
import ToolTagSelector from '@/components/shared/ToolTagSelector';
import ProsConsManager from '@/components/shared/ProsConsManager';
import ScreenshotManager from '@/components/shared/ScreenshotManager';
import { getTagGroupsWithTagsAction, updateToolTagsAction } from '../tags/actions';

const pricingModels = ['FREE', 'FREEMIUM', 'PAID', 'ENTERPRISE', 'OPEN_SOURCE'];

interface Category {
  id: string;
  name: string;
  slug: string;
  parentId?: string | null;
  parentName?: string | null;
  parentSlug?: string | null;
  parentIcon?: string | null;
}

export default function NewToolPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoPreviewError, setLogoPreviewError] = useState(false);
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [tagGroups, setTagGroups] = useState<any[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [pros, setPros] = useState<string[]>([]);
  const [cons, setCons] = useState<string[]>([]);

  const [draftLoaded, setDraftLoaded] = useState(false);

  // Load draft from localStorage on mount
  useEffect(() => {
    const draft = localStorage.getItem('draft_admin_new_tool');
    if (draft) {
      try {
        const { formData: dForm, faqs: dFaqs, screenshots: dScreenshots, socialLinks: dSocial } = JSON.parse(draft);
        if (dForm) setFormData(prev => ({ ...prev, ...dForm }));
        if (dFaqs) setFaqs(dFaqs);
        if (dScreenshots) setScreenshots(dScreenshots);
        if (dSocial) setSocialLinks(dSocial);
      } catch (e) {
        console.error('Failed to restore tool draft:', e);
      }
    }
    setDraftLoaded(true);
  }, []);

  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    tagline: '',
    description: '',
    logoUrl: '',
    websiteUrl: '',
    affiliateUrl: '',
    demoVideoUrl: '',
    categoryId: '',
    pricingModel: 'FREEMIUM',
    pricingUrl: '',
    startingPrice: null as number | null,
    freeTrialDays: null as number | null,
    hasApi: false,
    hasMobileApp: false,
    launchYear: new Date().getFullYear(),
    founderNames: '',
    headquartersCountry: '',
    headquartersCity: '',
    avgRating: 0,
    features: '',
    useCases: '',
    twitterUrl: '',
    linkedinUrl: '',
  });

  const [socialLinks, setSocialLinks] = useState<Array<{ platform: string; url: string }>>([]);

  // Save draft to localStorage on changes
  useEffect(() => {
    if (!draftLoaded) return;
    localStorage.setItem('draft_admin_new_tool', JSON.stringify({ formData, faqs, screenshots, socialLinks }));
  }, [formData, faqs, screenshots, socialLinks, draftLoaded]);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const [cats, tagGroupsData] = await Promise.all([
        getCategoriesAction(),
        getTagGroupsWithTagsAction(),
      ]);
      setCategories(cats as Category[]);
      setTagGroups(tagGroupsData as any[]);
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      setFormData(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else if (name === 'startingPrice' || name === 'avgRating' || name === 'launchYear' || name === 'freeTrialDays') {
      setFormData(prev => ({ ...prev, [name]: value ? parseFloat(value) : null }));
    } else if (name === 'name') {
      // Auto-generate slug from name
      const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      setFormData(prev => ({ ...prev, name: value, slug }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setLogoUploadError(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 5MB.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setLogoUploading(true);
    setLogoPreviewError(false);
    setLogoUploadError(null);

    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/media/upload', { method: 'POST', body: fd });
      const result = await res.json();

      if (res.ok && result.success && result.url) {
        setFormData(prev => ({ ...prev, logoUrl: result.url }));
        setLogoUploadError(null);
      } else {
        setLogoUploadError(result.error || `Upload failed (${res.status}). Please try again.`);
      }
    } catch (err: any) {
      setLogoUploadError('Network error: ' + (err?.message || 'Check your connection and try again.'));
    } finally {
      setLogoUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.slug || !formData.tagline || !formData.websiteUrl || !formData.categoryId) {
      alert('Please fill in all required fields');
      return;
    }

    setSaving(true);

    try {
      const founderNamesArray = (formData.founderNames || '')
        .split(',')
        .map(f => f.trim())
        .filter(Boolean);

      const featuresArray = (formData.features || '')
        .split('\n')
        .map(f => f.replace(/^[•\-*]\s*/, '').trim())
        .filter(Boolean);

      const useCasesArray = (formData.useCases || '')
        .split('\n')
        .map(u => u.replace(/^[•\-*]\s*/, '').trim())
        .filter(Boolean);

      const result = await createToolAction({
        name: formData.name,
        slug: formData.slug,
        tagline: formData.tagline,
        description: formData.description,
        logoUrl: formData.logoUrl,
        websiteUrl: formData.websiteUrl,
        affiliateUrl: formData.affiliateUrl || undefined,
        demoVideoUrl: formData.demoVideoUrl || undefined,
        categoryId: formData.categoryId,
        pricingModel: formData.pricingModel,
        pricingUrl: formData.pricingUrl || undefined,
        startingPrice: formData.startingPrice,
        freeTrialDays: formData.freeTrialDays,
        hasApi: formData.hasApi,
        hasMobileApp: formData.hasMobileApp,
        launchYear: formData.launchYear,
        founderNames: founderNamesArray.length > 0 ? founderNamesArray : undefined,
        headquartersCountry: formData.headquartersCountry || undefined,
        headquartersCity: formData.headquartersCity || undefined,
        avgRating: formData.avgRating,
        screenshotUrls: screenshots,
        faqs: faqs.length > 0 ? faqs : undefined,
        features: featuresArray.length > 0 ? featuresArray : undefined,
        useCases: useCasesArray.length > 0 ? useCasesArray : undefined,
        twitterUrl: formData.twitterUrl || undefined,
        linkedinUrl: formData.linkedinUrl || undefined,
        socialLinks: socialLinks.filter(l => l.url.trim()).length > 0 ? socialLinks.filter(l => l.url.trim()) : undefined,
      });

      if (result.success && result.toolId) {
        // Save tags, pros/cons
        const errors: string[] = [];
        if (selectedTagIds.length > 0) {
          const tagResult = await updateToolTagsAction(result.toolId, selectedTagIds);
          if (tagResult && !tagResult.success && tagResult.error) errors.push('Tags: ' + tagResult.error);
        }
        if (pros.length > 0 || cons.length > 0) {
          const pcResult = await updateToolProsConsAction(result.toolId, { pros, cons });
          if (pcResult && !pcResult.success && pcResult.error) errors.push('Pros/Cons: ' + pcResult.error);
        }
        if (errors.length > 0) {
          alert('Tool created but some data failed:\n' + errors.join('\n'));
        }
        localStorage.removeItem('draft_admin_new_tool');
        router.push('/tools-dir');
        router.refresh();
      } else {
        alert('Error: ' + (result.error || 'Failed to create tool'));
      }
    } catch (error: any) {
      alert('Error: ' + error.message);
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
          <h1 className="font-sora font-extrabold text-2xl text-navy dark:text-white">Add New Tool</h1>
          <p className="text-gray-400 dark:text-gray-500 text-sm font-jakarta mt-1">
            Add a new AI tool to the directory
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
                Tool Name *
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="input-field text-sm"
                placeholder="e.g. ChatGPT"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
                Slug *
              </label>
              <input
                type="text"
                name="slug"
                value={formData.slug}
                onChange={handleChange}
                required
                className="input-field text-sm"
                placeholder="e.g. chatgpt"
              />
            </div>

            <div>
              <CategoryCascadeSelect
                categories={categories}
                value={formData.categoryId}
                onChange={(categoryId) => setFormData(prev => ({ ...prev, categoryId }))}
                required
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
                Tagline *
              </label>
              <input
                type="text"
                name="tagline"
                value={formData.tagline}
                onChange={handleChange}
                required
                maxLength={100}
                className="input-field text-sm"
                placeholder="A short, catchy description"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {formData.tagline.length}/100 characters
              </p>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
              Description
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={6}
              maxLength={1000}
              className="input-field text-sm"
              placeholder="Detailed description of the tool..."
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {formData.description.length}/1000 characters
            </p>
          </div>

          {/* Tags — inline in Basic Info */}
          <div>
            {tagGroups.length > 0 ? (
              <ToolTagSelector
                groups={tagGroups}
                selectedTagIds={selectedTagIds}
                onChange={setSelectedTagIds}
                maxTags={30}
                isAdmin={true}
              />
            ) : (
              <div className="flex items-center gap-2 py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
                <span className="text-xs text-gray-500">Loading tags...</span>
              </div>
            )}
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
                value={formData.logoUrl}
                onChange={(e) => { handleChange(e); setLogoPreviewError(false); }}
                className="input-field text-sm flex-1"
                placeholder="https://... or upload above"
              />
            </div>
            {logoUploadError && (
              <p className="mt-1.5 text-xs text-red-500 font-jakarta">{logoUploadError}</p>
            )}
            {formData.logoUrl && logoPreviewError && (
              <p className="mt-1.5 text-xs text-amber-600 font-jakarta">
                Logo URL could not be loaded. The image may not be publicly reachable — check the URL or the media domain.
              </p>
            )}
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

          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
              Affiliate/Referral URL
            </label>
            <input
              type="url"
              name="affiliateUrl"
              value={formData.affiliateUrl}
              onChange={handleChange}
              className="input-field text-sm"
              placeholder="https://..."
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
              Demo Video URL
            </label>
            <input
              type="url"
              name="demoVideoUrl"
              value={formData.demoVideoUrl}
              onChange={handleChange}
              className="input-field text-sm"
              placeholder="https://youtube.com/watch?v=... or https://loom.com/..."
            />
          </div>
        </div>

        {/* Social Links */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6 space-y-6">
          <h2 className="font-sora font-bold text-lg text-navy dark:text-white">Social Links</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
                Twitter / X URL
              </label>
              <input
                type="url"
                name="twitterUrl"
                value={formData.twitterUrl}
                onChange={handleChange}
                className="input-field text-sm"
                placeholder="https://x.com/..."
              />
            </div>
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
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
              Additional Social Links
            </label>
            <div className="space-y-2">
              {socialLinks.map((link, index) => (
                <div key={index} className="flex gap-2 items-center">
                  <select
                    value={link.platform}
                    onChange={(e) => {
                      const updated = [...socialLinks];
                      updated[index] = { ...updated[index], platform: e.target.value };
                      setSocialLinks(updated);
                    }}
                    className="input-field text-sm w-40"
                  >
                    <option value="instagram">Instagram</option>
                    <option value="github">GitHub</option>
                    <option value="youtube">YouTube</option>
                    <option value="facebook">Facebook</option>
                    <option value="producthunt">Product Hunt</option>
                    <option value="discord">Discord</option>
                  </select>
                  <input
                    type="url"
                    value={link.url}
                    onChange={(e) => {
                      const updated = [...socialLinks];
                      updated[index] = { ...updated[index], url: e.target.value };
                      setSocialLinks(updated);
                    }}
                    className="input-field text-sm flex-1"
                    placeholder="https://..."
                  />
                  <button
                    type="button"
                    onClick={() => setSocialLinks(prev => prev.filter((_, i) => i !== index))}
                    className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setSocialLinks(prev => [...prev, { platform: 'instagram', url: '' }])}
                className="flex items-center gap-1.5 text-xs font-semibold text-brand hover:text-brand-600 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add Social Link
              </button>
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6 space-y-6">
          <h2 className="font-sora font-bold text-lg text-navy dark:text-white">Pricing</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
                Pricing Model
              </label>
              <select
                name="pricingModel"
                value={formData.pricingModel}
                onChange={handleChange}
                className="input-field text-sm"
              >
                {pricingModels.map(p => (
                  <option key={p} value={p}>{p.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
                Starting Price (USD/month)
              </label>
              <input
                type="number"
                name="startingPrice"
                value={formData.startingPrice ?? ''}
                onChange={handleChange}
                min="0"
                step="0.01"
                className="input-field text-sm"
                placeholder="9.99"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
                Pricing Page URL
              </label>
              <input
                type="url"
                name="pricingUrl"
                value={formData.pricingUrl}
                onChange={handleChange}
                className="input-field text-sm"
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
                Free Trial Days
              </label>
              <input
                type="number"
                name="freeTrialDays"
                value={formData.freeTrialDays ?? ''}
                onChange={handleChange}
                min="0"
                className="input-field text-sm"
                placeholder="14"
              />
            </div>
          </div>
        </div>

        {/* Tool Details */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6 space-y-6">
          <h2 className="font-sora font-bold text-lg text-navy dark:text-white">Tool Details</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
                Launch Year
              </label>
              <input
                type="number"
                name="launchYear"
                value={formData.launchYear}
                onChange={handleChange}
                min="1900"
                max={new Date().getFullYear()}
                className="input-field text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
                Founder Names
              </label>
              <input
                type="text"
                name="founderNames"
                value={formData.founderNames}
                onChange={handleChange}
                className="input-field text-sm"
                placeholder="John Doe, Jane Smith"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
                Headquarters
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <CountryPicker value={formData.headquartersCountry || ''} clearable placeholder="Country"
                  onChange={(c) => setFormData((prev: any) => (prev ? { ...prev, headquartersCountry: c ?? '', headquartersCity: c === prev.headquartersCountry ? prev.headquartersCity : '' } : prev))} />
                <CityPicker value={formData.headquartersCity || ''} country={formData.headquartersCountry || null} placeholder="City"
                  onChange={(c) => setFormData((prev: any) => (prev ? { ...prev, headquartersCity: c?.city ?? '', headquartersCountry: prev.headquartersCountry || c?.country || '' } : prev))} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="hasApi"
                checked={formData.hasApi}
                onChange={handleChange}
                className="w-4 h-4 text-brand bg-gray-100 border-gray-300 rounded focus:ring-brand"
              />
              <span className="text-sm font-medium text-navy dark:text-white font-jakarta">
                Has API
              </span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="hasMobileApp"
                checked={formData.hasMobileApp}
                onChange={handleChange}
                className="w-4 h-4 text-brand bg-gray-100 border-gray-300 rounded focus:ring-brand"
              />
              <span className="text-sm font-medium text-navy dark:text-white font-jakarta">
                Has Mobile App
              </span>
            </label>
          </div>
        </div>

        {/* Features & Use Cases */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6 space-y-6">
          <h2 className="font-sora font-bold text-lg text-navy dark:text-white">Features & Use Cases</h2>

          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
              Key Features
            </label>
            <textarea
              name="features"
              value={formData.features}
              onChange={handleChange}
              rows={4}
              className="input-field text-sm"
              placeholder="Paste features here — one per line, auto-formatted with bullet points"
            />
            <p className="text-xs text-gray-400 mt-1">One feature per line</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
              Use Cases
            </label>
            <textarea
              name="useCases"
              value={formData.useCases}
              onChange={handleChange}
              rows={4}
              className="input-field text-sm"
              placeholder="Paste use cases here — one per line"
            />
            <p className="text-xs text-gray-400 mt-1">One use case per line</p>
          </div>
        </div>

        {/* Pros & Cons */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6">
          <ProsConsManager
            pros={pros}
            cons={cons}
            onChangePros={setPros}
            onChangeCons={setCons}
          />
        </div>

        {/* Screenshots */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6">
          <ScreenshotManager screenshots={screenshots} onChange={setScreenshots} />
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
            disabled={saving || !formData.name || !formData.slug || !formData.tagline || !formData.websiteUrl || !formData.categoryId}
            className="btn-brand text-sm flex items-center gap-2 disabled:opacity-50 px-6 py-2.5"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Creating...' : 'Create Tool'}
          </button>
        </div>
      </form>
    </div>
  );
}
