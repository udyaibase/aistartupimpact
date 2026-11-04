'use client';

import { useState, useEffect } from 'react';
import { StatusNote } from './Guidance';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Upload, X, Loader2 } from 'lucide-react';
import { submitStartupAction, updateStartupAction, getStartupCategoriesAction, getStartupTypesAction } from '@/app/founder/startups/actions';
import { FAQManager, type FAQ } from '@/components/shared/FAQManager';
import FundingRoundsManager, { FundingRound, convertToSaveFormat, convertFromDbFormat } from '@/components/shared/FundingRoundsManager';
import FoundersDetailsManager, { FounderDetail } from '@/components/shared/FoundersDetailsManager';
import SocialLinksManager, { SocialLink } from '@/components/shared/SocialLinksManager';
import CityCombobox from '@/components/shared/CityCombobox';

interface Startup {
  id: string;
  name: string;
  slug: string;
  tagline: string;
  description: string;
  websiteUrl?: string | null;
  logoUrl?: string | null;
  stage?: string | null;
  fundingAmount?: number | null;
  teamSize?: number | null;
  foundedYear?: number | null;
  location?: string | null;
  linkedinUrl?: string | null;
  twitterUrl?: string | null;
  socialLinks?: any;
  isVerified?: boolean;
  status?: string;
  [key: string]: any;
}

const STARTUP_STAGES = [
  'BOOTSTRAPPED',
  'IDEA',
  'PRE_SEED',
  'SEED',
  'PRE_SERIES_A',
  'SERIES_A',
  'PRE_SERIES_B',
  'SERIES_B',
  'PRE_SERIES_C',
  'SERIES_C',
  'PRE_SERIES_D',
  'SERIES_D',
  'SERIES_E',
  'SERIES_F',
  'SERIES_G',
  'SERIES_I',
  'SERIES_J',
  'GROWTH',
  'PUBLIC',
];

interface StartupFormProps {
  /** The listing being edited. Without one, this is the form for a new startup. */
  startup?: Startup;
  existingFaqs?: any[];
  existingFundingRounds?: any[];
  /** A new startup starts with its founder filled in. */
  initialFounder?: { name: string; role: string; prev?: string; bio: string; avatar: string; linkedin: string; twitter?: string };
}

const NEW_STARTUP: Startup = { id: '', name: '', slug: '', tagline: '', description: '', stage: 'SEED', status: 'ACTIVE' };
const NEW_DRAFT_KEY = 'draft_founder_new_startup';

/** The site's host, to warn when an edit moves a verified listing to another domain. The server makes the final call. */
function hostOf(url: string | null | undefined): string {
  try {
    return new URL(url ?? '').hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return (url ?? '').trim().toLowerCase();
  }
}

export default function StartupForm({ startup: existing, existingFaqs = [], existingFundingRounds = [], initialFounder }: StartupFormProps) {
  const isNew = !existing;
  const startup = existing ?? NEW_STARTUP;
  const [success, setSuccess] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(!isNew);
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<{ published: string[]; pending: string[] } | null>(null);
  const [logoPreview, setLogoPreview] = useState(startup.logoUrl || '');
  const [startupCategories, setStartupCategories] = useState<string[]>([]);
  const [businessTypesOptions, setBusinessTypesOptions] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([
      getStartupCategoriesAction(),
      getStartupTypesAction(),
    ]).then(([cats, types]) => {
      setStartupCategories(cats as string[]);
      setBusinessTypesOptions(types as string[]);
    });
  }, []);

  const [faqs, setFaqs] = useState<FAQ[]>(
    existingFaqs.map((faq, index) => ({
      id: faq.id,
      question: faq.question,
      answer: faq.answer,
      order: faq.order ?? index,
    }))
  );
  // Seed existing funding rounds into the manager
  const [fundingRounds, setFundingRounds] = useState<FundingRound[]>(
    convertFromDbFormat(existingFundingRounds)
  );
  // Seed existing foundersData from startup
  const [foundersDetails, setFoundersDetails] = useState<FounderDetail[]>(
    isNew && initialFounder?.name
      ? [{ ...initialFounder, prev: initialFounder.prev || '', twitter: initialFounder.twitter || '' }]
      : Array.isArray(startup.foundersData)
      ? startup.foundersData.map((f: any) => ({
          name: f.name || '',
          role: f.role || '',
          prev: f.prev || '',
          bio: f.bio || '',
          avatar: f.avatar || '',
          linkedin: f.linkedin || '',
          twitter: f.twitter || '',
        }))
      : []
  );

  const [socialLinks, setSocialLinks] = useState<SocialLink[]>(
    Array.isArray(startup.socialLinks)
      ? startup.socialLinks.map((s: any) => ({
          platform: s.platform || '',
          url: s.url || '',
        }))
      : []
  );


  const [formData, setFormData] = useState({
    name: startup.name,
    tagline: startup.tagline,
    description: startup.description,
    websiteUrl: startup.websiteUrl || '',
    linkedinUrl: startup.linkedinUrl || '',
    twitterUrl: startup.twitterUrl || '',
    foundedYear: startup.foundedYear || new Date().getFullYear(),
    headquartersCity: startup.headquartersCity || '',
    stage: startup.stage,
    status: startup.status || 'ACTIVE',
    employeeCount: startup.employeeCount?.toString() || '',
    logoUrl: startup.logoUrl || '',
    category: startup.category || '',
    businessType: startup.businessType || '',
    totalFundingInr: startup.totalFundingInr ? (Number(startup.totalFundingInr) / 100).toString() : '',
    fundingCurrency: 'INR',
  });


  const taglineCharLimit = 60;
  const descriptionCharLimit = 500;
  const taglineCharsRemaining = taglineCharLimit - (formData.tagline?.length || 0);
  const descriptionCharsRemaining = descriptionCharLimit - (formData.description?.length || 0);

  // A new startup's form survives a refresh. Saved listings don't need this.
  useEffect(() => {
    if (!isNew) return;
    const draft = localStorage.getItem(NEW_DRAFT_KEY);
    if (draft) {
      try {
        const d = JSON.parse(draft);
        if (d.formData) setFormData(d.formData);
        if (d.faqs) setFaqs(d.faqs);
        if (d.fundingRounds) setFundingRounds(d.fundingRounds);
        if (d.foundersDetails) setFoundersDetails(d.foundersDetails);
        if (d.socialLinks) setSocialLinks(d.socialLinks);
      } catch {
        localStorage.removeItem(NEW_DRAFT_KEY);
      }
    }
    setDraftLoaded(true);
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isNew || !draftLoaded) return;
    localStorage.setItem(NEW_DRAFT_KEY, JSON.stringify({ formData, faqs, fundingRounds, foundersDetails, socialLinks }));
  }, [isNew, formData, faqs, fundingRounds, foundersDetails, socialLinks, draftLoaded]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    // Enforce character limits
    if (name === 'tagline' && value.length > taglineCharLimit) {
      return;
    }
    if (name === 'description' && value.length > descriptionCharLimit) {
      return;
    }
    
    setFormData(prev => ({
      ...prev,
      [name]: value,
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
      // Validate required fields
      if (!formData.name || !formData.tagline || !formData.description || !formData.websiteUrl || !formData.category || !formData.businessType || !formData.employeeCount || !formData.foundedYear || !formData.stage || !formData.logoUrl) {
        throw new Error('Please fill in all required fields');
      }

      const activeFounders = foundersDetails.filter(f => f.name.trim());
      if (activeFounders.length === 0) {
        throw new Error('Please add at least one founder under Founders Details');
      }

      const foundersArray = foundersDetails
        .map(f => f.name.trim())
        .filter(Boolean);

      const payload = {
        name: formData.name,
        tagline: formData.tagline,
        description: formData.description,
        websiteUrl: formData.websiteUrl,
        linkedinUrl: formData.linkedinUrl || undefined,
        twitterUrl: formData.twitterUrl || undefined,
        foundedYear: formData.foundedYear,
        headquartersCity: formData.headquartersCity || undefined,
        stage: formData.stage as any,
        status: formData.status,
        employeeCount: formData.employeeCount ? parseInt(formData.employeeCount) : undefined,
        founders: foundersArray,
        logoUrl: formData.logoUrl || undefined,
        category: formData.category || undefined,
        businessType: formData.businessType || undefined,
        totalFundingInr: formData.totalFundingInr ? Math.round(parseFloat(formData.totalFundingInr) * 100) : undefined,
        faqs: faqs.length > 0 ? faqs : undefined,
        fundingRounds: fundingRounds.length > 0 ? convertToSaveFormat(fundingRounds) : undefined,
        foundersData: foundersDetails.filter(f => f.name.trim()).length > 0
          ? foundersDetails.filter(f => f.name.trim())
          : undefined,
        socialLinks: socialLinks.length > 0 ? socialLinks : undefined,
      };

      if (isNew) {
        const created = await submitStartupAction(payload);
        if (!created.success) throw new Error(created.error || 'Submission failed');
        localStorage.removeItem(NEW_DRAFT_KEY);
        setSuccess(true);
        return;
      }

      const result = await updateStartupAction(startup.id, payload);
      if (!result.success) throw new Error(result.error || 'Update failed');

      setSaved({ published: result.published ?? [], pending: result.pending ?? [] });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8 text-center">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white font-sora mb-2">Startup submitted</h2>
        <p className="text-gray-600 dark:text-gray-400 font-jakarta text-sm mb-6">Our team will review it, and we’ll email you once it’s live.</p>
        <button onClick={() => router.push('/founder/startups')} className="px-6 py-2.5 bg-brand text-white font-bold text-sm rounded-lg hover:bg-brand/90 transition-colors">
          View in Dashboard
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-6">
      {saved && (
        <StatusNote tone={saved.pending.length ? 'waiting' : 'success'} title={saved.pending.length ? 'Saved. Some changes are waiting for our team.' : 'Saved'}>
          {saved.published.length > 0 && `Live now: ${saved.published.join(', ')}. `}
          {saved.pending.length > 0 && `Waiting for review: ${saved.pending.join(', ')}. Your listing shows the current version until then.`}
          {saved.published.length === 0 && saved.pending.length === 0 && 'Nothing had changed.'}
        </StatusNote>
      )}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Logo Upload */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Logo <span className="text-red-500">*</span>
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
            <p>Upload your startup logo</p>
            <p className="text-xs">PNG, JPG up to 5MB</p>
          </div>
        </div>
      </div>

      {/* Company Name */}
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Company Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id="name"
          name="name"
          value={formData.name}
          onChange={handleChange}
          required
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
          placeholder="e.g. OpenAI"
        />
      </div>

      {/* Tagline */}
      <div>
        <label htmlFor="tagline" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Tagline <span className="text-red-500">*</span>
          <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
            ({taglineCharsRemaining} characters remaining)
          </span>
        </label>
        <input
          type="text"
          id="tagline"
          name="tagline"
          value={formData.tagline}
          onChange={handleChange}
          required
          maxLength={taglineCharLimit}
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
          placeholder="A short, catchy description"
        />
        <div className="flex justify-between items-center mt-1">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Keep it concise and compelling
          </p>
          <p className={`text-xs font-medium ${
            taglineCharsRemaining < 10 ? 'text-orange-600 dark:text-orange-400' : 'text-gray-500 dark:text-gray-400'
          }`}>
            {formData.tagline.length} / {taglineCharLimit}
          </p>
        </div>
      </div>

      {/* Description */}
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Description <span className="text-red-500">*</span>
          <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
            ({descriptionCharsRemaining} characters remaining)
          </span>
        </label>
        <textarea
          id="description"
          name="description"
          value={formData.description}
          onChange={handleChange}
          required
          rows={6}
          maxLength={descriptionCharLimit}
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent resize-none"
          placeholder="Describe your startup, what problem it solves, and what makes it unique..."
        />
        <div className="flex justify-between items-center mt-1">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Provide a clear and compelling description of your startup
          </p>
          <p className={`text-xs font-medium ${
            descriptionCharsRemaining < 50 ? 'text-orange-600 dark:text-orange-400' : 'text-gray-500 dark:text-gray-400'
          }`}>
            {formData.description.length} / {descriptionCharLimit}
          </p>
        </div>
      </div>

      {/* Category/Sector */}
      <div>
        <label htmlFor="category" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Category / Sector <span className="text-red-500">*</span>
        </label>
        <select
          id="category"
          name="category"
          value={formData.category}
          onChange={handleChange}
          required
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
        >
          <option value="">Select a category</option>
          {startupCategories.map(category => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Choose the primary sector your startup operates in
        </p>
      </div>

      {/* Business Type */}
      <div>
        <label htmlFor="businessType" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Business Model <span className="text-red-500">*</span>
        </label>
        <select
          id="businessType"
          name="businessType"
          value={formData.businessType}
          onChange={handleChange}
          required
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
        >
          <option value="">Select business model</option>
          {businessTypesOptions.map(type => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Select your primary business model (B2B, B2C, B2G, etc.)
        </p>
      </div>

      {/* Website URL */}
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
          placeholder="https://yourcompany.com"
        />
        {startup.isVerified && hostOf(formData.websiteUrl) !== hostOf(startup.websiteUrl) && (
          <p role="status" className="text-sm text-amber-700 dark:text-amber-400 mt-1.5">
            A new website domain goes to our team first. Once approved, your Verified badge is removed until you verify the new domain.
          </p>
        )}
      </div>

      {/* Social Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="linkedinUrl" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            LinkedIn URL
          </label>
          <input
            type="url"
            id="linkedinUrl"
            name="linkedinUrl"
            value={formData.linkedinUrl}
            onChange={handleChange}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
            placeholder="https://linkedin.com/company/..."
          />
        </div>

        <div>
          <label htmlFor="twitterUrl" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Twitter/X URL
          </label>
          <input
            type="url"
            id="twitterUrl"
            name="twitterUrl"
            value={formData.twitterUrl}
            onChange={handleChange}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
            placeholder="https://twitter.com/..."
          />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
        <SocialLinksManager links={socialLinks} onChange={setSocialLinks} />
      </div>

      {/* Company Details */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label htmlFor="foundedYear" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Founded Year <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            id="foundedYear"
            name="foundedYear"
            value={formData.foundedYear}
            onChange={handleChange}
            min="1900"
            max={new Date().getFullYear()}
            required
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
          />
        </div>

        <div>
          <label htmlFor="stage" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Funding Stage <span className="text-red-500">*</span>
          </label>
          <select
            id="stage"
            name="stage"
            value={formData.stage ?? ''}
            onChange={handleChange}
            required
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
          >
            {STARTUP_STAGES.map(stage => (
              <option key={stage} value={stage}>
                {stage.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="status" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Company Status <span className="text-red-500">*</span>
          </label>
          <select
            id="status"
            name="status"
            value={formData.status}
            onChange={handleChange}
            required
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
          >
            <option value="ACTIVE">Active</option>
            <option value="PUBLIC">Public</option>
            <option value="ACQUIRED">Acquired</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>

        <div>
          <label htmlFor="employeeCount" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Team Size <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            id="employeeCount"
            name="employeeCount"
            value={formData.employeeCount}
            onChange={handleChange}
            min="1"
            required
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
            placeholder="e.g. 10"
          />
        </div>
      </div>

      {/* Funding Information */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
          Funding Information (Optional)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="totalFundingInr" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Total Funding Raised
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">
                ₹
              </span>
              <input
                type="number"
                id="totalFundingInr"
                name="totalFundingInr"
                value={formData.totalFundingInr}
                onChange={handleChange}
                min="0"
                step="100000"
                className="w-full pl-8 pr-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
                placeholder="e.g. 10000000"
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Enter amount in INR (e.g., 1 Crore = 10000000)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Quick Amount
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, totalFundingInr: '5000000' }))}
                className="px-3 py-2 text-xs border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                ₹50 Lakhs
              </button>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, totalFundingInr: '10000000' }))}
                className="px-3 py-2 text-xs border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                ₹1 Crore
              </button>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, totalFundingInr: '50000000' }))}
                className="px-3 py-2 text-xs border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                ₹5 Crores
              </button>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, totalFundingInr: '100000000' }))}
                className="px-3 py-2 text-xs border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                ₹10 Crores
              </button>
            </div>
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="headquartersCity" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Headquarters
        </label>
        <CityCombobox
          id="headquartersCity"
          name="headquartersCity"
          value={formData.headquartersCity}
          onChange={(val) => setFormData(prev => ({ ...prev, headquartersCity: val }))}
          placeholder="Search and select city (e.g. Bengaluru)"
        />
      </div>


      {/* FAQs Section */}
      <div className="border-t border-gray-200 dark:border-gray-800 pt-6">
        <FAQManager faqs={faqs} onChange={setFaqs} maxFaqs={10} />
      </div>

      {/* Founders Details Section */}
      <div className="border-t border-gray-200 dark:border-gray-800 pt-6">
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">Only add details and photos of people who’ve agreed to appear on your profile.</p>
        <FoundersDetailsManager founders={foundersDetails} onChange={setFoundersDetails} maxFounders={5} />
      </div>

      {/* Funding Rounds Section */}
      <div className="border-t border-gray-200 dark:border-gray-800 pt-6">
        <FundingRoundsManager rounds={fundingRounds} onChange={setFundingRounds} maxRounds={10} />
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
          disabled={
            loading ||
            !formData.name ||
            !formData.tagline ||
            !formData.description ||
            !formData.websiteUrl ||
            !formData.category ||
            !formData.businessType ||
            !formData.employeeCount ||
            !formData.foundedYear ||
            !formData.stage ||
            !formData.logoUrl ||
            !foundersDetails.some(f => f.name.trim())
          }
          className="px-6 py-2 bg-brand hover:bg-brand/90 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {loading ? (isNew ? 'Submitting...' : 'Saving...') : isNew ? 'Submit Startup' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}
