'use client';

import { toolRequiredError } from '@udyaibase/utils/tool-required';
import { notify } from '@/components/Toast';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Upload, Loader2, Save } from 'lucide-react';
import { getCategoriesAction } from '../actions';
import { updateToolProsConsAction } from '../tool-content-actions';
import { createToolAction } from '../tool-form-actions';
import { FAQManager, type FAQ } from '@/components/shared/FAQManager';
import ScreenshotManager from '@/components/shared/ScreenshotManager';
import { getTagGroupsWithTagsAction, updateToolTagsAction } from '../tags/actions';
import { Category } from './types';
import type { NewToolForm } from './types';
import NewToolFeaturesSection from './NewToolFeaturesSection';
import NewToolDetailsSection from './NewToolDetailsSection';
import NewToolPricingSection from './NewToolPricingSection';
import NewToolSocialLinksSection from './NewToolSocialLinksSection';
import NewToolLogoUrlsSection from './NewToolLogoUrlsSection';
import NewToolBasicInfoSection from './NewToolBasicInfoSection';

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
        notify("Something went wrong. Check your connection and try again.", 'error');
      }
    }
    setDraftLoaded(true);
  }, []);

  const [formData, setFormData] = useState<NewToolForm>({
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
      notify("Couldn't load this. Check your connection and refresh.", 'error');
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
      notify('Please fill in all required fields');
      return;
    }

    const featuresArray = (formData.features || '')
      .split('\n')
      .map(f => f.replace(/^[•\-*]\s*/, '').trim())
      .filter(Boolean);

    const useCasesArray = (formData.useCases || '')
      .split('\n')
      .map(u => u.replace(/^[•\-*]\s*/, '').trim())
      .filter(Boolean);

    const incomplete = toolRequiredError({ ...formData, features: featuresArray, useCases: useCasesArray });
    if (incomplete) { notify(incomplete, 'error'); return; }

    setSaving(true);

    try {
      const founderNamesArray = (formData.founderNames || '')
        .split(',')
        .map(f => f.trim())
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
          notify('Tool created but some data failed:\n' + errors.join('\n'));
        }
        localStorage.removeItem('draft_admin_new_tool');
        router.push('/tools-dir');
        router.refresh();
      } else {
        notify('Error: ' + (result.error || 'Failed to create tool'));
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
          <h1 className="portal-title">Add New Tool</h1>
          <p className="portal-subtitle">
            Add a new AI tool to the directory
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <NewToolBasicInfoSection formData={formData} setFormData={setFormData} handleChange={handleChange} tagGroups={tagGroups} categories={categories} selectedTagIds={selectedTagIds} setSelectedTagIds={setSelectedTagIds} />
        <NewToolLogoUrlsSection formData={formData} handleChange={handleChange} logoUploading={logoUploading} fileInputRef={fileInputRef} logoPreviewError={logoPreviewError} logoUploadError={logoUploadError} setLogoPreviewError={setLogoPreviewError} handleLogoUpload={handleLogoUpload} />
        <NewToolSocialLinksSection formData={formData} handleChange={handleChange} socialLinks={socialLinks} setSocialLinks={setSocialLinks} />
        <NewToolPricingSection formData={formData} handleChange={handleChange} />
        <NewToolDetailsSection formData={formData} setFormData={setFormData} handleChange={handleChange} />
        <NewToolFeaturesSection formData={formData} handleChange={handleChange} pros={pros} cons={cons} setPros={setPros} setCons={setCons} />
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
