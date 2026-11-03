'use client';

import { CityPicker, CountryPicker } from '@udyaibase/utils/src/LocationPickers';
import { useExtraCities } from '@/components/shared/useExtraCities';
import { CITY_REQUEST } from '@/lib/city-request';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Upload, X, Loader2, Plus } from 'lucide-react';
import { updateToolAction, getTagGroupsForFounderAction, getToolTagIdsAction } from '@/app/founder/tools/actions';
import { FAQManager, type FAQ } from '@/components/shared/FAQManager';
import CategoryCascadeSelect from '@/components/shared/CategoryCascadeSelect';
import ToolTagSelector from '@/components/shared/ToolTagSelector';
import ProsConsManager from '@/components/shared/ProsConsManager';
import ScreenshotManager from '@/components/shared/ScreenshotManager';

interface AiTool {
  id: string;
  name: string;
  slug: string;
  tagline: string;
  description: string;
  websiteUrl: string;
  logoUrl?: string | null;
  screenshotUrls?: string[];
  pricingModel: string;
  pricingUrl?: string | null;
  affiliateUrl?: string | null;
  categoryId?: string | null;
  hasApi?: boolean;
  hasMobileApp?: boolean;
  launchYear?: number;
  founderNames?: string[];
  headquartersCountry?: string | null;
  headquartersCity?: string | null;
  status: string;
  [key: string]: any;
}

const PRICING_MODELS = [
  'FREE',
  'FREEMIUM',
  'PAID',
  'ENTERPRISE',
  'OPEN_SOURCE',
];

interface ToolEditFormProps {
  tool: AiTool & {
    useCases: Array<{ id: string; text: string }>;
    faqs?: Array<{ id: string; question: string; answer: string; order: number }>;
    pros?: string[];
    cons?: string[];
    demoVideoUrl?: string | null;
    freeTrialDays?: number | null;
  };
}

export default function ToolEditForm({ tool }: ToolEditFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [logoPreview, setLogoPreview] = useState(tool.logoUrl || '');
  const [screenshots, setScreenshots] = useState<string[]>(tool.screenshotUrls || []);
  const [tagGroups, setTagGroups] = useState<any[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [pros, setPros] = useState<string[]>(tool.pros || []);
  const [cons, setCons] = useState<string[]>(tool.cons || []);
  const existingFeatures = (tool.keyFeatures || []).map((f: any) => f.text).join('\n');
  const existingUseCases = tool.useCases.map(uc => uc.text).join('\n');

  const [draftLoaded, setDraftLoaded] = useState(false);

  // Load tag groups and tool's existing tags on mount
  useEffect(() => {
    Promise.all([
      getTagGroupsForFounderAction(),
      getToolTagIdsAction(tool.id),
    ]).then(([groups, tagIds]) => {
      setTagGroups(groups);
      setSelectedTagIds(tagIds);
    }).catch(() => {});
  }, [tool.id]);

  // Load draft from localStorage on mount
  useEffect(() => {
    const draftKey = `draft_founder_edit_tool_${tool.id}`;
    const draft = localStorage.getItem(draftKey);
    if (draft) {
      try {
        const { formData: dForm, faqs: dFaqs, screenshots: dScreenshots, socialLinks: dSocial } = JSON.parse(draft);
        if (dForm) setFormData(dForm);
        if (dFaqs) setFaqs(dFaqs);
        if (dScreenshots) setScreenshots(dScreenshots);
        if (dSocial) setSocialLinks(dSocial);
      } catch (e) {
        console.error('Failed to restore tool draft:', e);
      }
    }
    setDraftLoaded(true);
  }, [tool.id]);

  const extraCities = useExtraCities();
  const [formData, setFormData] = useState({
    name: tool.name,
    tagline: tool.tagline,
    description: tool.description,
    websiteUrl: tool.websiteUrl,
    affiliateUrl: tool.affiliateUrl || '',
    demoVideoUrl: tool.demoVideoUrl || '',
    categoryId: tool.categoryId || '',
    pricingModel: tool.pricingModel,
    pricingUrl: tool.pricingUrl || '',
    startingPrice: tool.startingPrice ? (tool.startingPrice / 100).toString() : '',
    freeTrialDays: tool.freeTrialDays ? tool.freeTrialDays.toString() : '',
    hasApi: tool.hasApi || false,
    hasMobileApp: tool.hasMobileApp || false,
    launchYear: tool.launchYear || new Date().getFullYear(),
    founderNames: tool.founderNames?.join(', ') || '',
    headquartersCountry: tool.headquartersCountry || '',
    headquartersCity: tool.headquartersCity || '',
    features: existingFeatures,
    useCases: existingUseCases,
    logoUrl: tool.logoUrl || '',
    twitterUrl: tool.twitterUrl || '',
    linkedinUrl: tool.linkedinUrl || '',
  });

  const [socialLinks, setSocialLinks] = useState<Array<{ platform: string; url: string }>>(
    Array.isArray(tool.socialLinks) ? tool.socialLinks : []
  );

  const [faqs, setFaqs] = useState<FAQ[]>(
    (tool.faqs || []).map((faq, index) => ({
      id: faq.id,
      question: faq.question,
      answer: faq.answer,
      order: faq.order ?? index,
    }))
  );

  // Save draft on changes
  useEffect(() => {
    if (!draftLoaded) return;
    const draftKey = `draft_founder_edit_tool_${tool.id}`;
    localStorage.setItem(draftKey, JSON.stringify({ formData, faqs, screenshots, socialLinks }));
  }, [formData, faqs, screenshots, socialLinks, draftLoaded, tool.id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
    setFormData(prev => ({
      ...prev,
      [e.target.name]: value,
    }));
  };

  const handleBulletPointPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>, fieldName: 'features' | 'useCases') => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    
    // Split by newlines and filter empty lines
    const lines = pastedText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    // Add bullet points if not already present
    const bulletPoints = lines.map(line => {
      // Check if line already starts with a bullet point or dash
      if (line.startsWith('•') || line.startsWith('-') || line.startsWith('*')) {
        return `• ${line.substring(1).trim()}`;
      }
      return `• ${line}`;
    });
    
    const formattedText = bulletPoints.join('\n');
    
    // Apply character limit
    const limitedText = formattedText.substring(0, 500);
    
    setFormData(prev => ({
      ...prev,
      [fieldName]: limitedText,
    }));
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be less than 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setLogoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/media/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Upload failed');

      const data = await response.json();
      setFormData(prev => ({ ...prev, logoUrl: data.url }));
    } catch (err) {
      setError('Failed to upload logo');
      console.error(err);
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!formData.name || !formData.tagline || !formData.description || !formData.websiteUrl) {
        throw new Error('Please fill in all required fields');
      }

      const featuresArray = formData.features
        .split('\n')
        .map((f: string) => f.trim())
        .filter(Boolean);

      const useCasesArray = formData.useCases
        .split('\n')
        .map((u: string) => u.trim())
        .filter(Boolean);

      const founderNamesArray = formData.founderNames
        .split(',')
        .map((f: string) => f.trim())
        .filter(Boolean);

      const result = await updateToolAction(tool.id, {
        name: formData.name,
        tagline: formData.tagline,
        description: formData.description,
        websiteUrl: formData.websiteUrl,
        affiliateUrl: formData.affiliateUrl || undefined,
        demoVideoUrl: formData.demoVideoUrl || undefined,
        categoryId: (formData.categoryId || tool.categoryId) as string,
        pricingModel: formData.pricingModel as any,
        pricingUrl: formData.pricingUrl || undefined,
        startingPrice: formData.startingPrice ? parseFloat(formData.startingPrice) : undefined,
        freeTrialDays: formData.freeTrialDays ? parseInt(formData.freeTrialDays) : undefined,
        hasApi: formData.hasApi,
        hasMobileApp: formData.hasMobileApp,
        launchYear: formData.launchYear,
        founderNames: founderNamesArray.length > 0 ? founderNamesArray : undefined,
        headquartersCountry: formData.headquartersCountry || undefined,
        headquartersCity: formData.headquartersCity || undefined,
        features: featuresArray,
        useCases: useCasesArray,
        logoUrl: formData.logoUrl || undefined,
        screenshotUrls: screenshots,
        faqs: faqs.length > 0 ? faqs : undefined,
        tagIds: selectedTagIds,
        pros: pros.length > 0 ? pros : undefined,
        cons: cons.length > 0 ? cons : undefined,
        twitterUrl: formData.twitterUrl || undefined,
        linkedinUrl: formData.linkedinUrl || undefined,
        socialLinks: socialLinks.filter(l => l.url.trim()).length > 0 ? socialLinks.filter(l => l.url.trim()) : undefined,
      });

      if (!result.success) {
        throw new Error(result.error || 'Update failed');
      }

      localStorage.removeItem(`draft_founder_edit_tool_${tool.id}`);
      router.push('/founder/tools');
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-6">
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Logo Upload */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Logo
        </label>
        <div className="flex items-center gap-4">
          {logoPreview ? (
            <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
              <Image src={logoPreview} alt="Logo preview" width={80} height={80} unoptimized className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => {
                  setLogoPreview('');
                  setFormData(prev => ({ ...prev, logoUrl: '' }));
                }}
                className="absolute top-1 right-1 p-1 bg-red-500 rounded-full text-white hover:bg-red-600"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <label className="w-20 h-20 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg flex items-center justify-center cursor-pointer hover:border-brand transition-colors">
              <Upload className="w-6 h-6 text-gray-400" />
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
              />
            </label>
          )}
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <p>Upload your tool logo</p>
            <p className="text-xs">PNG, JPG up to 5MB</p>
          </div>
        </div>
      </div>

      {/* Tool Name & Category */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Tool Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
            placeholder="e.g. ChatGPT"
          />
        </div>

        <div>
          <CategoryCascadeSelect
            value={formData.categoryId}
            onChange={(categoryId) => setFormData(prev => ({ ...prev, categoryId }))}
            required
          />
        </div>
      </div>

      {/* Tagline */}
      <div>
        <label htmlFor="tagline" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Tagline <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id="tagline"
          name="tagline"
          value={formData.tagline}
          onChange={handleChange}
          required
          maxLength={100}
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
          placeholder="A short, catchy description (max 100 characters)"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {formData.tagline.length}/100 characters
        </p>
      </div>

      {/* Description */}
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Description <span className="text-red-500">*</span>
        </label>
        <textarea
          id="description"
          name="description"
          value={formData.description}
          onChange={handleChange}
          required
          maxLength={1000}
          rows={6}
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent resize-none"
          placeholder="Describe your tool, its features, and what makes it unique..."
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {formData.description.length}/1000 characters
        </p>
      </div>

      {/* URLs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="websiteUrl" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Website URL <span className="text-red-500">*</span>
          </label>
          <input
            type="url"
            id="websiteUrl"
            name="websiteUrl"
            value={formData.websiteUrl}
            onChange={handleChange}
            required
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
            placeholder="https://yourtool.com"
          />
        </div>

        <div>
          <label htmlFor="affiliateUrl" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Affiliate/Referral URL
          </label>
          <input
            type="url"
            id="affiliateUrl"
            name="affiliateUrl"
            value={formData.affiliateUrl}
            onChange={handleChange}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
            placeholder="https://yourtool.com?ref=..."
          />
        </div>
      </div>

      {/* Demo Video */}
      <div>
        <label htmlFor="demoVideoUrl" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Demo Video URL
        </label>
        <input
          type="url"
          id="demoVideoUrl"
          name="demoVideoUrl"
          value={formData.demoVideoUrl}
          onChange={handleChange}
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
          placeholder="YouTube, Vimeo, or Loom link"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Add a demo or walkthrough video of your tool</p>
      </div>

      {/* Social Links */}
      <div className="border-t border-gray-100 dark:border-gray-800 pt-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Social Links</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Twitter / X</label>
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">LinkedIn</label>
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
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Additional Social Links</label>
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label htmlFor="pricingModel" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Pricing Model
          </label>
          <select
            id="pricingModel"
            name="pricingModel"
            value={formData.pricingModel}
            onChange={handleChange}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
          >
            {PRICING_MODELS.map(model => (
              <option key={model} value={model}>
                {model.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="startingPrice" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Starting Price (USD/month)
          </label>
          <input
            type="number"
            id="startingPrice"
            name="startingPrice"
            value={formData.startingPrice}
            onChange={handleChange}
            min="0"
            step="0.01"
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
            placeholder="e.g. 9.99"
          />
        </div>

        <div>
          <label htmlFor="freeTrialDays" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Free Trial (Days)
          </label>
          <input
            type="number"
            id="freeTrialDays"
            name="freeTrialDays"
            value={formData.freeTrialDays}
            onChange={handleChange}
            min="0"
            max="365"
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
            placeholder="e.g. 14"
          />
        </div>

        <div>
          <label htmlFor="pricingUrl" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Pricing Page URL
          </label>
          <input
            type="url"
            id="pricingUrl"
            name="pricingUrl"
            value={formData.pricingUrl}
            onChange={handleChange}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
            placeholder="https://yourtool.com/pricing"
          />
        </div>
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="hasApi"
            name="hasApi"
            checked={formData.hasApi}
            onChange={handleChange}
            className="w-4 h-4 text-brand border-gray-300 rounded focus:ring-brand"
          />
          <label htmlFor="hasApi" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Has API
          </label>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="hasMobileApp"
            name="hasMobileApp"
            checked={formData.hasMobileApp}
            onChange={handleChange}
            className="w-4 h-4 text-brand border-gray-300 rounded focus:ring-brand"
          />
          <label htmlFor="hasMobileApp" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Has Mobile App
          </label>
        </div>
      </div>

      {/* Launch Year, Founders, HQ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label htmlFor="launchYear" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Launch Year
          </label>
          <input
            type="number"
            id="launchYear"
            name="launchYear"
            value={formData.launchYear}
            onChange={handleChange}
            min="1900"
            max={new Date().getFullYear()}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
          />
        </div>

        <div>
          <label htmlFor="founderNames" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Founder Names
          </label>
          <input
            type="text"
            id="founderNames"
            name="founderNames"
            value={formData.founderNames}
            onChange={handleChange}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
            placeholder="e.g. Vivek Raghavan, John Doe"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Comma-separated names
          </p>
        </div>

        <div>
          <label htmlFor="headquartersCountry" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Headquarters
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <CountryPicker id="headquartersCountry" value={formData.headquartersCountry ?? ''} clearable
              onChange={(c) => setFormData((prev: typeof formData) => ({ ...prev, headquartersCountry: c ?? '', headquartersCity: c === prev.headquartersCountry ? prev.headquartersCity : '' }))} />
            <CityPicker id="headquartersCity" value={formData.headquartersCity ?? ''} country={formData.headquartersCountry || null} extraCities={extraCities} requestHref={CITY_REQUEST}
              onChange={(c) => setFormData((prev: typeof formData) => ({ ...prev, headquartersCity: c?.city ?? '', headquartersCountry: prev.headquartersCountry || c?.country || '' }))} />
          </div>
        </div>
      </div>

      {/* Key Features */}
      <div>
        <label htmlFor="features" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Key Features
        </label>
        <textarea
          id="features"
          name="features"
          value={formData.features}
          onChange={handleChange}
          onPaste={(e) => handleBulletPointPaste(e, 'features')}
          maxLength={500}
          rows={6}
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent resize-none font-mono text-sm"
          placeholder="Paste your features here - they'll be automatically formatted with bullet points"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {formData.features.length}/500 characters • Paste content and it will be automatically converted to bullet points (•)
        </p>
      </div>

      {/* Use Cases */}
      <div>
        <label htmlFor="useCases" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Use Cases
        </label>
        <textarea
          id="useCases"
          name="useCases"
          value={formData.useCases}
          onChange={handleChange}
          onPaste={(e) => handleBulletPointPaste(e, 'useCases')}
          maxLength={500}
          rows={6}
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent resize-none font-mono text-sm"
          placeholder="Paste your use cases here - they'll be automatically formatted with bullet points"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {formData.useCases.length}/500 characters • Paste content and it will be automatically converted to bullet points (•)
        </p>
      </div>

      {/* Screenshots */}
      <ScreenshotManager
        screenshots={screenshots}
        onChange={setScreenshots}
        onError={setError}
      />

      {/* Tags */}
      <div className="border-t border-gray-200 dark:border-gray-800 pt-6">
        {tagGroups.length > 0 ? (
          <ToolTagSelector
            groups={tagGroups}
            selectedTagIds={selectedTagIds}
            onChange={setSelectedTagIds}
            maxTags={30}
          />
        ) : null}
      </div>

      {/* Pros & Cons */}
      <div className="border-t border-gray-200 dark:border-gray-800 pt-6">
        <ProsConsManager
          pros={pros}
          cons={cons}
          onChangePros={setPros}
          onChangeCons={setCons}
          maxPros={6}
          maxCons={3}
        />
      </div>

      {/* FAQs Section */}
      <div className="border-t border-gray-200 dark:border-gray-800 pt-6">
        <FAQManager faqs={faqs} onChange={setFaqs} maxFaqs={10} />
      </div>

      {/* Submit Button */}
      <div className="flex items-center justify-end gap-4 pt-4 border-t border-gray-200 dark:border-gray-800">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-6 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2 bg-brand hover:bg-brand/90 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {loading ? 'Updating...' : 'Update Tool'}
        </button>
      </div>
    </form>
  );
}
