'use client';

import { toolMissingList } from '@udyaibase/utils/tool-required';
import { notify } from '@/components/Toast';
import { useState, useRef, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Upload, Loader2, Save } from 'lucide-react';
import { getToolsAction, getCategoriesAction } from '../../actions';
import { getToolFAQsAction, getToolProsConsAction, updateToolProsConsAction } from '../../tool-content-actions';
import { updateToolAction, getToolUseCasesAction } from '../../tool-form-actions';
import { FAQManager, type FAQ } from '@/components/shared/FAQManager';
import ScreenshotManager from '@/components/shared/ScreenshotManager';
import { getTagGroupsWithTagsAction, getToolTagsAction, updateToolTagsAction } from '../../tags/actions';
import { Tool, Category } from './types';
import ToolDetailsSection from './ToolDetailsSection';
import ToolPricingSection from './ToolPricingSection';
import ToolSocialLinksSection from './ToolSocialLinksSection';
import ToolLogoUrlsSection from './ToolLogoUrlsSection';
import ToolProsFeaturesSection from './ToolProsFeaturesSection';
import ToolBasicInfoSection from './ToolBasicInfoSection';

export default function EditToolPage() {
  const router = useRouter();
  const params = useParams();
  const toolId = params.id as string;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoPreviewError, setLogoPreviewError] = useState(false);
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [loadingFaqs, setLoadingFaqs] = useState(false);
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [screenshotMeta, setScreenshotMeta] = useState<Record<string, { source: 'auto' | 'manual'; createdAt: string }>>({});
  const [tagGroups, setTagGroups] = useState<any[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [pros, setPros] = useState<string[]>([]);
  const [cons, setCons] = useState<string[]>([]);
  const [features, setFeatures] = useState('');
  const [useCases, setUseCases] = useState('');
  const [socialLinks, setSocialLinks] = useState<Array<{ platform: string; url: string }>>([]);

  const [formData, setFormData] = useState<Tool | null>(null);

  useEffect(() => {
    loadTool();
  }, [toolId]);

  const loadTool = async () => {
    setLoading(true);
    try {
      const [toolsResult, catsResult, tagGroupsData] = await Promise.all([
        getToolsAction(),
        getCategoriesAction(),
        getTagGroupsWithTagsAction(),
      ]);
      const tools = Array.isArray(toolsResult) ? toolsResult : [];
      const cats = Array.isArray(catsResult) ? catsResult : [];

      const tool = tools.find((t: any) => t.id === toolId);
      
      if (!tool) {
        notify('Tool not found');
        router.push('/tools-dir');
        return;
      }
      
      setFormData({
        ...tool,
        startingPrice: tool.startingPrice ? tool.startingPrice / 100 : null,
      } as Tool);
      setCategories(cats as Category[]);
      setScreenshots(tool.screenshotUrls || []);
      setScreenshotMeta(tool.screenshotMeta || {});
      setSocialLinks(Array.isArray(tool.socialLinks) ? tool.socialLinks : []);
      setTagGroups(tagGroupsData as any[]);
      
      // Load FAQs, Tags, Pros/Cons, Use Cases in parallel
      setLoadingFaqs(true);
      try {
        const [toolFaqs, toolTags, prosConsData, toolUseCases] = await Promise.all([
          getToolFAQsAction(toolId).catch(() => []),
          getToolTagsAction(toolId).catch(() => []),
          getToolProsConsAction(toolId).catch(() => ({ pros: [], cons: [] })),
          getToolUseCasesAction(toolId).catch(() => ({ features: [], useCases: [] })),
        ]);
        setFaqs(Array.isArray(toolFaqs) ? toolFaqs as FAQ[] : []);
        setSelectedTagIds(Array.isArray(toolTags) ? (toolTags as any[]).map((t: any) => t.id) : []);
        const pc = prosConsData as any;
        setPros(Array.isArray(pc?.pros) ? pc.pros.map((p: any) => p.text) : []);
        setCons(Array.isArray(pc?.cons) ? pc.cons.map((c: any) => c.text) : []);
        const uc = toolUseCases as any;
        const featureTexts = Array.isArray(uc?.features) ? uc.features.map((f: any) => f.text) : [];
        const useCaseTexts = Array.isArray(uc?.useCases) ? uc.useCases.map((u: any) => u.text) : [];
        setFeatures(featureTexts.join('\n'));
        setUseCases(useCaseTexts.join('\n'));
      } catch (faqError) {
        console.error('Error loading FAQs/Tags:', faqError);
        setFaqs([]);
      }

      // Check for drafts after database load finishes successfully
      const draftKey = `draft_admin_edit_tool_${toolId}`;
      const draft = localStorage.getItem(draftKey);
      if (draft) {
        try {
          const { formData: dForm, faqs: dFaqs, screenshots: dScreenshots } = JSON.parse(draft);
          if (dForm) setFormData(dForm);
          if (dFaqs) setFaqs(dFaqs);
          if (dScreenshots) setScreenshots(dScreenshots);
        } catch (e) {
          console.error('Failed to restore tool draft:', e);
          notify("Something went wrong. Check your connection and try again.", 'error');
        }
      }
    } catch (error) {
      console.error('Error loading tool:', error);
      notify('Error loading tool');
    } finally {
      setLoading(false);
      setLoadingFaqs(false);
    }
  };

  // Save draft to localStorage on changes
  useEffect(() => {
    if (loading || !formData) return;
    const draftKey = `draft_admin_edit_tool_${toolId}`;
    localStorage.setItem(draftKey, JSON.stringify({ formData, faqs, screenshots }));
  }, [formData, faqs, screenshots, loading, toolId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    if (!formData) return;
    
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      setFormData(prev => prev ? { ...prev, [name]: (e.target as HTMLInputElement).checked } : null);
    } else if (name === 'startingPrice' || name === 'avgRating' || name === 'launchYear' || name === 'freeTrialDays') {
      setFormData(prev => prev ? { ...prev, [name]: value ? parseFloat(value) : null } : null);
    } else {
      setFormData(prev => prev ? { ...prev, [name]: value } : null);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !formData) return;

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
        setFormData(prev => prev ? { ...prev, logoUrl: result.url } : null);
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
    
    if (!formData || !formData.name || !formData.tagline || !formData.websiteUrl || !formData.categoryId) {
      notify('Please fill in all required fields');
      return;
    }
    
    setSaving(true);
    
    try {
      const founderNamesArray = Array.isArray(formData.founderNames)
        ? formData.founderNames
        : typeof formData.founderNames === 'string'
          ? (formData.founderNames as string).split(',').map(f => f.trim()).filter(Boolean)
          : [];

      const featuresArray = features.split('\n').map(l => l.replace(/^[•\-\*]\s*/, '').trim()).filter(Boolean);
      const useCasesArray = useCases.split('\n').map(l => l.replace(/^[•\-\*]\s*/, '').trim()).filter(Boolean);

      const result = await updateToolAction(toolId, {
        name: formData.name,
        tagline: formData.tagline,
        description: formData.description,
        logoUrl: formData.logoUrl,
        websiteUrl: formData.websiteUrl,
        affiliateUrl: formData.affiliateUrl,
        categoryId: formData.categoryId,
        pricingModel: formData.pricingModel,
        pricingUrl: formData.pricingUrl,
        startingPrice: formData.startingPrice,
        freeTrialDays: formData.freeTrialDays,
        demoVideoUrl: formData.demoVideoUrl,
        hasApi: formData.hasApi,
        hasMobileApp: formData.hasMobileApp,
        launchYear: formData.launchYear,
        founderNames: founderNamesArray,
        headquartersCountry: formData.headquartersCountry,
        headquartersCity: formData.headquartersCity,
        avgRating: formData.avgRating,
        listingTier: formData.listingTier,
        status: formData.status,
        screenshotUrls: screenshots,
        screenshotMeta: Object.keys(screenshotMeta).length > 0 ? screenshotMeta : undefined,
        faqs: faqs.length > 0 ? faqs : undefined,
        twitterUrl: formData.twitterUrl || undefined,
        linkedinUrl: formData.linkedinUrl || undefined,
        socialLinks: socialLinks.filter(l => l.url.trim()).length > 0 ? socialLinks.filter(l => l.url.trim()) : undefined,
        features: featuresArray,
        useCases: useCasesArray,
      });
      
      if (result.success) {
        const [tagResult, prosConsResult] = await Promise.all([
          updateToolTagsAction(toolId, selectedTagIds),
          updateToolProsConsAction(toolId, { pros, cons }),
        ]);
        const errors: string[] = [];
        if (tagResult && !tagResult.success && tagResult.error) errors.push('Tags: ' + tagResult.error);
        if (prosConsResult && !prosConsResult.success && prosConsResult.error) errors.push('Pros/Cons: ' + prosConsResult.error);
        if (errors.length > 0) {
          notify('Tool saved but some data failed:\n' + errors.join('\n'));
        }
        localStorage.removeItem(`draft_admin_edit_tool_${toolId}`);
        router.push('/tools-dir');
        router.refresh();
      } else {
        notify('Error: ' + (result.error || 'Failed to update tool'));
      }
    } catch (error: any) {
      notify('Error: ' + error.message);
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
        <p className="text-gray-500">Tool not found</p>
      </div>
    );
  }

  const founderNamesStr = Array.isArray(formData.founderNames) 
    ? formData.founderNames.join(', ') 
    : formData.founderNames || '';

  const lineList = (v: string) => v.split('\n').map((l) => l.replace(/^[•\-*]\s*/, '').trim()).filter(Boolean);
  const stillMissing = toolMissingList({ ...formData, features: lineList(features), useCases: lineList(useCases) });

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
          <h1 className="portal-title">Edit Tool</h1>
          <p className="portal-subtitle">
            Update tool information
          </p>
        </div>
      </div>

      {/* Form */}
      {stillMissing.length > 0 && (
        <p role="status" className="mb-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          This listing is still missing: {stillMissing.join(', ')}. You can save without them, but new tools must have them, so add them when you can.
        </p>
      )}
      <form onSubmit={handleSubmit} className="space-y-6">
        <ToolBasicInfoSection formData={formData} setFormData={setFormData} handleChange={handleChange} tagGroups={tagGroups} categories={categories} selectedTagIds={selectedTagIds} setSelectedTagIds={setSelectedTagIds} />
        <ToolProsFeaturesSection pros={pros} cons={cons} features={features} useCases={useCases} setPros={setPros} setCons={setCons} setFeatures={setFeatures} setUseCases={setUseCases} />
        <ToolLogoUrlsSection formData={formData} handleChange={handleChange} logoUploading={logoUploading} fileInputRef={fileInputRef} logoPreviewError={logoPreviewError} logoUploadError={logoUploadError} setLogoPreviewError={setLogoPreviewError} handleLogoUpload={handleLogoUpload} />
        <ToolSocialLinksSection formData={formData} handleChange={handleChange} socialLinks={socialLinks} setSocialLinks={setSocialLinks} />
        <ToolPricingSection formData={formData} handleChange={handleChange} />
        <ToolDetailsSection formData={formData} setFormData={setFormData} handleChange={handleChange} toolId={toolId} founderNamesStr={founderNamesStr} />
        {/* Screenshots */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6">
          <ScreenshotManager
            screenshots={screenshots}
            onChange={setScreenshots}
            toolId={toolId}
            websiteUrl={formData?.websiteUrl}
            screenshotMeta={screenshotMeta}
            onMetaChange={setScreenshotMeta}
          />
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
            disabled={saving || !formData.name || !formData.tagline || !formData.websiteUrl || !formData.categoryId}
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
