'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Upload, Loader2, Save, Plus, X } from 'lucide-react';
import { getToolsAction, getToolFAQsAction, updateToolAction, getCategoriesAction, getToolProsConsAction, updateToolProsConsAction, getToolUseCasesAction } from '../../actions';
import { FAQManager, type FAQ } from '@/components/shared/FAQManager';
import ProsConsManager from '@/components/shared/ProsConsManager';
import ScreenshotManager from '@/components/shared/ScreenshotManager';
import CategoryCascadeSelect from '@/components/shared/CategoryCascadeSelect';
import ToolTagSelector from '@/components/shared/ToolTagSelector';
import StartupLinker from '@/components/shared/StartupLinker';
import AlternativeToolsManager from '@/components/shared/AlternativeToolsManager';
import { getTagGroupsWithTagsAction, getToolTagsAction, updateToolTagsAction } from '../../tags/actions';
import SlugEditor from '@/components/shared/SlugEditor';

const pricingModels = ['FREE', 'FREEMIUM', 'PAID', 'ENTERPRISE', 'OPEN_SOURCE'];
const listingTiers = ['STANDARD', 'PRIORITY', 'FEATURED'];
const statuses = ['PENDING', 'APPROVED', 'ARCHIVED'];

interface Tool {
  id: string;
  name: string;
  slug: string;
  slugChangedAt?: string | null;
  tagline: string;
  description: string;
  logoUrl?: string;
  websiteUrl: string;
  affiliateUrl?: string;
  pricingModel: string;
  pricingUrl?: string;
  startingPrice?: number | null;
  freeTrialDays?: number | null;
  demoVideoUrl?: string;
  avgRating: number;
  listingTier: string;
  status: string;
  categoryId: string;
  hasApi?: boolean;
  hasMobileApp?: boolean;
  launchYear?: number;
  founderNames?: string[];
  headquartersCountry?: string;
  screenshotUrls?: string[];
  screenshotMeta?: Record<string, any>;
  twitterUrl?: string;
  linkedinUrl?: string;
  socialLinks?: Array<{ platform: string; url: string }>;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  parentId?: string | null;
  parentName?: string | null;
  parentSlug?: string | null;
  parentIcon?: string | null;
}

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
        alert('Tool not found');
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
        }
      }
    } catch (error) {
      console.error('Error loading tool:', error);
      alert('Error loading tool');
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
      alert('Please fill in all required fields');
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
          alert('Tool saved but some data failed:\n' + errors.join('\n'));
        }
        localStorage.removeItem(`draft_admin_edit_tool_${toolId}`);
        router.push('/tools-dir');
        router.refresh();
      } else {
        alert('Error: ' + (result.error || 'Failed to update tool'));
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
        <p className="text-gray-500">Tool not found</p>
      </div>
    );
  }

  const founderNamesStr = Array.isArray(formData.founderNames) 
    ? formData.founderNames.join(', ') 
    : formData.founderNames || '';

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
          <h1 className="font-sora font-extrabold text-2xl text-navy dark:text-white">Edit Tool</h1>
          <p className="text-gray-400 dark:text-gray-500 text-sm font-jakarta mt-1">
            Update tool information
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

            <div className="md:col-span-2 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-150 dark:border-gray-800">
              <SlugEditor
                currentSlug={formData.slug}
                slugChangedAt={formData.slugChangedAt}
                entityType="tool"
                entityId={formData.id}
                baseUrl="https://udyaibase.com/tools"
                isAdmin={true}
                onSuccess={(newSlug) => {
                  setFormData(prev => prev ? { ...prev, slug: newSlug } : null);
                }}
              />
            </div>

            <div>
              <CategoryCascadeSelect
                categories={categories}
                value={formData.categoryId}
                onChange={(categoryId) => setFormData(prev => prev ? { ...prev, categoryId } : null)}
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

        {/* Pros & Cons */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6">
          <h2 className="font-sora font-bold text-lg text-navy dark:text-white mb-4">Pros & Cons</h2>
          <ProsConsManager
            pros={pros}
            cons={cons}
            onChangePros={setPros}
            onChangeCons={setCons}
            maxPros={6}
            maxCons={6}
          />
        </div>

        {/* Features & Use Cases */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6 space-y-6">
          <h2 className="font-sora font-bold text-lg text-navy dark:text-white">Features & Use Cases</h2>

          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
              Key Features
            </label>
            <textarea
              value={features}
              onChange={(e) => setFeatures(e.target.value)}
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
              value={useCases}
              onChange={(e) => setUseCases(e.target.value)}
              rows={4}
              className="input-field text-sm"
              placeholder="Paste use cases here — one per line"
            />
            <p className="text-xs text-gray-400 mt-1">One use case per line</p>
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
              value={formData.affiliateUrl || ''}
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
              value={formData.demoVideoUrl || ''}
              onChange={handleChange}
              className="input-field text-sm"
              placeholder="YouTube, Vimeo, or Loom URL"
            />
            <p className="text-[10px] text-gray-400 font-jakarta mt-1">Accepts YouTube, Vimeo, or Loom links</p>
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
                value={formData.twitterUrl || ''}
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
                value={formData.linkedinUrl || ''}
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
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                Free Trial (Days)
              </label>
              <input
                type="number"
                name="freeTrialDays"
                value={formData.freeTrialDays ?? ''}
                onChange={handleChange}
                min="0"
                max="365"
                className="input-field text-sm"
                placeholder="14"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
                Pricing Page URL
              </label>
              <input
                type="url"
                name="pricingUrl"
                value={formData.pricingUrl || ''}
                onChange={handleChange}
                className="input-field text-sm"
                placeholder="https://..."
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
                value={formData.launchYear ?? ''}
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
                value={founderNamesStr}
                onChange={handleChange}
                className="input-field text-sm"
                placeholder="John Doe, Jane Smith"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
                Headquarters
              </label>
              <input
                type="text"
                name="headquartersCountry"
                value={formData.headquartersCountry || ''}
                onChange={handleChange}
                className="input-field text-sm"
                placeholder="USA, India, etc."
              />
            </div>
          </div>

          {/* Link to Startup */}
          <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
            <StartupLinker toolId={toolId} />
          </div>

          {/* Alternative Tools */}
          <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
            <AlternativeToolsManager toolId={toolId} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="hasApi"
                checked={formData.hasApi || false}
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
                checked={formData.hasMobileApp || false}
                onChange={handleChange}
                className="w-4 h-4 text-brand bg-gray-100 border-gray-300 rounded focus:ring-brand"
              />
              <span className="text-sm font-medium text-navy dark:text-white font-jakarta">
                Has Mobile App
              </span>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-gray-100 dark:border-gray-800">
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
                Rating
              </label>
              <input
                type="number"
                name="avgRating"
                value={formData.avgRating}
                onChange={handleChange}
                min="0"
                max="5"
                step="0.1"
                className="input-field text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
                Listing Tier
              </label>
              <div className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-sm font-jakarta text-gray-600 dark:text-gray-400">
                {formData.listingTier} <span className="text-xs text-gray-400">(managed via Schedule button on tools list)</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
                Status
              </label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="input-field text-sm"
              >
                {statuses.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

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
