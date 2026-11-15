'use client';

import { useState, useEffect, useRef } from 'react';
import { StatusNote } from './Guidance';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Upload, X, Loader2, ArrowLeft, ArrowRight, Check, BadgeCheck, ShieldCheck, Clock, Pencil } from 'lucide-react';
import { submitStartupAction, updateStartupAction, getStartupCategoriesAction, getStartupTypesAction, checkStartupDomainAction, type DomainCheck } from '@/app/founder/startups/actions';
import ContactEmailField from './ContactEmailField';
import StartupDomainVerify from './StartupDomainVerify';
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
  /** New startup: the founder's sign-in email, offered as the contact email. */
  founderEmail?: string;
  /** New startup already submitted (from ?created=): open on the Verify phase. */
  created?: CreatedStartup | null;
}

export interface CreatedStartup {
  startupId: string;
  slug: string;
  name: string;
  websiteUrl: string;
  verified: boolean;
  workEmailHint: string | null;
}

const STEPS = [
  { title: 'Basics', hint: 'Start with your website. We use it to check the startup isn’t listed already, and later to verify you own it.' },
  { title: 'Details', hint: 'What you do, how far along you are, and how we reach you.' },
  { title: 'Team', hint: 'Who’s building it. You’re already added.' },
  { title: 'Funding & FAQs', hint: 'Both optional. Skip ahead if you’d rather add them later.' },
  { title: 'Review', hint: 'Check everything, then submit and verify.' },
] as const;

const isWebUrl = (u: string) => /^https?:\/\/[^\s/.]+\.[^\s]{2,}/i.test(u.trim());
const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e.trim());
const normEmail = (e: string | null | undefined) => (e ?? '').trim().toLowerCase();
type DomainState = { status: 'idle' | 'checking' } | (DomainCheck & { url: string });

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

export default function StartupForm({ startup: existing, existingFaqs = [], existingFundingRounds = [], initialFounder, founderEmail, created }: StartupFormProps) {
  const isNew = !existing;
  const startup = existing ?? NEW_STARTUP;
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
  // Same limit as the admin startup editor and the server check (STARTUP_DESCRIPTION_MAX).
  const descriptionCharLimit = 1000;
  const taglineCharsRemaining = taglineCharLimit - (formData.tagline?.length || 0);
  const descriptionCharsRemaining = descriptionCharLimit - (formData.description?.length || 0);

  // ----- Step-by-step flow (new startups only) -----
  const [step, setStep] = useState(1);
  const [phase, setPhase] = useState<'form' | 'verify' | 'done'>(created ? (created.verified ? 'done' : 'verify') : 'form');
  const [createdInfo, setCreatedInfo] = useState<CreatedStartup | null>(created ?? null);
  const [domainState, setDomainState] = useState<DomainState>({ status: 'idle' });
  const submittingRef = useRef(false);
  const topRef = useRef<HTMLDivElement>(null);

  // Private contact email. `contact` is the address already confirmed (saved, or proven with a code just now).
  const [contactEmail, setContactEmail] = useState(isNew ? (founderEmail ?? '') : (startup.contactEmail ?? ''));
  const [contact, setContact] = useState<{ email: string; proof: string | null }>({ email: isNew ? '' : normEmail(startup.contactEmail), proof: null });
  const contactConfirmed = !!contactEmail.trim() && normEmail(contactEmail) === contact.email;

  // Is a startup on this website already listed? Checked as the founder types (debounced) and again on Continue.
  const domainSeq = useRef(0);
  const runDomainCheck = async (url: string): Promise<DomainState> => {
    const seq = ++domainSeq.current;
    if (!isWebUrl(url)) { const idle = { status: 'idle' } as const; setDomainState(idle); return idle; }
    setDomainState({ status: 'checking' });
    try {
      const r = await checkStartupDomainAction(url);
      const next = { ...r, url } as DomainState;
      if (seq === domainSeq.current) setDomainState(next);
      return next;
    } catch {
      const idle = { status: 'idle' } as const;
      if (seq === domainSeq.current) setDomainState(idle);
      return idle; // the server checks again on submit
    }
  };
  useEffect(() => {
    if (!isNew || phase !== 'form') return;
    const url = formData.websiteUrl;
    const t = setTimeout(() => { runDomainCheck(url); }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.websiteUrl, isNew, phase]);

  // A new startup's form survives a refresh. Saved listings don't need this.
  useEffect(() => {
    if (!isNew || created) { setDraftLoaded(true); return; }
    const draft = localStorage.getItem(NEW_DRAFT_KEY);
    if (draft) {
      try {
        const d = JSON.parse(draft);
        // Merged, because team size isn't in the draft. Founder details from an older draft are ignored.
        if (d.formData) setFormData((prev) => ({ ...prev, ...d.formData, employeeCount: prev.employeeCount }));
        if (d.faqs) setFaqs(d.faqs);
        if (d.fundingRounds) setFundingRounds(d.fundingRounds);
        if (d.socialLinks) setSocialLinks(d.socialLinks);
        if (typeof d.step === 'number' && d.step >= 1 && d.step <= STEPS.length) setStep(d.step);
      } catch {
        localStorage.removeItem(NEW_DRAFT_KEY);
      }
    }
    setDraftLoaded(true);
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isNew || !draftLoaded || phase !== 'form') return;
    // Browser storage is readable by anyone using this computer, so the draft holds public company details only:
    // never people's details or team size.
    const { name, tagline, description, websiteUrl, linkedinUrl, twitterUrl, foundedYear, headquartersCity, stage, status, logoUrl, category, businessType } = formData;
    const companyDetails = { name, tagline, description, websiteUrl, linkedinUrl, twitterUrl, foundedYear, headquartersCity, stage, status, logoUrl, category, businessType };
    localStorage.setItem(NEW_DRAFT_KEY, JSON.stringify({ formData: companyDetails, faqs, fundingRounds, socialLinks, step }));
  }, [isNew, formData, faqs, fundingRounds, socialLinks, draftLoaded, step, phase]);

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

    // Same list the upload API accepts (SVG is refused there because it can carry scripts).
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      setError(file.type === 'image/svg+xml'
        ? 'SVG logos are not supported. Please upload a PNG or JPG version.'
        : 'Please upload a PNG, JPG, WebP or GIF image.');
      e.target.value = '';
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
      const body = new FormData();
      body.append('file', file);

      const response = await fetch('/api/media/upload', {
        method: 'POST',
        body,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        // Show the server's reason (wrong type, too big, signed out...) instead of a generic error.
        setError(typeof data?.error === 'string' ? data.error : 'Failed to upload logo. Please try again.');
        setLogoPreview(formData.logoUrl || '');
        e.target.value = '';
        return;
      }
      setError('');
      setFormData(prev => ({ ...prev, logoUrl: data.url }));
    } catch {
      setError('Failed to upload logo. Check your connection and try again.');
      setLogoPreview(formData.logoUrl || '');
      e.target.value = '';
    }
  };

  /** The payload both submit and save send. */
  const buildPayload = () => {
    const foundersArray = foundersDetails.map(f => f.name.trim()).filter(Boolean);
    return {
      name: formData.name,
      tagline: formData.tagline,
      description: formData.description,
      websiteUrl: formData.websiteUrl,
      linkedinUrl: formData.linkedinUrl || undefined,
      twitterUrl: formData.twitterUrl || undefined,
      foundedYear: Number(formData.foundedYear),
      headquartersCity: formData.headquartersCity || undefined,
      stage: formData.stage as any,
      status: formData.status,
      employeeCount: formData.employeeCount ? parseInt(formData.employeeCount) : undefined,
      founders: foundersArray,
      logoUrl: formData.logoUrl || undefined,
      category: formData.category || undefined,
      businessType: formData.businessType || undefined,
      // Total comes from the funding rounds (same as admin). With no rounds, keep whatever total is already on file.
      totalFundingInr: fundingRounds.length > 0
        ? convertToSaveFormat(fundingRounds).reduce((sum, r) => sum + (r.amountInr || 0), 0)
        : (formData.totalFundingInr ? Math.round(parseFloat(formData.totalFundingInr) * 100) : undefined),
      faqs: faqs.length > 0 ? faqs : undefined,
      fundingRounds: fundingRounds.length > 0 ? convertToSaveFormat(fundingRounds) : undefined,
      foundersData: foundersDetails.filter(f => f.name.trim()).length > 0
        ? foundersDetails.filter(f => f.name.trim())
        : undefined,
      socialLinks: socialLinks.length > 0 ? socialLinks : undefined,
      contactEmail: contactEmail.trim() ? normEmail(contactEmail) : undefined,
      contactEmailProof: contact.proof ?? undefined,
    };
  };

  /** What still blocks a step, in the order the founder sees the fields. */
  const problemFor = (n: number, domain: DomainState = domainState): string | null => {
    if (n === 1) {
      if (!isWebUrl(formData.websiteUrl)) return 'Add your website, starting with https://';
      if (domain.status === 'listed' || domain.status === 'yours') return 'This startup is already listed. See the note under Website.';
      if (!formData.logoUrl) return 'Upload your logo.';
      if (formData.name.trim().length < 2) return 'Add your startup’s name.';
      if (!formData.tagline.trim()) return 'Add a tagline.';
      if (!formData.description.trim()) return 'Add a description.';
    }
    if (n === 2) {
      if (!formData.category) return 'Choose a category.';
      if (!formData.businessType) return 'Choose a business model.';
      if (!formData.stage) return 'Choose a funding stage.';
      const y = Number(formData.foundedYear);
      if (!y || y < 1900 || y > new Date().getFullYear()) return 'Enter the year you were founded.';
      if (!formData.employeeCount || parseInt(formData.employeeCount) < 1) return 'Enter your team size.';
      if (!isEmail(contactEmail)) return 'Add a contact email.';
      if (!contactConfirmed) return 'Confirm your contact email with the 6-digit code.';
    }
    if (n === 3 && !foundersDetails.some(f => f.name.trim())) return 'Add at least one founder.';
    return null;
  };

  const scrollTop = () => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const goTo = (n: number) => { setError(''); setStep(n); scrollTop(); };

  const goNext = async () => {
    setError('');
    let domain = domainState;
    // Make sure the duplicate check ran for the website as typed now.
    if (step === 1 && (!('url' in domain) || domain.url !== formData.websiteUrl)) domain = await runDomainCheck(formData.websiteUrl);
    const problem = problemFor(step, domain);
    if (problem) { setError(problem); return; }
    goTo(step + 1);
  };

  /** Step 5: create the startup, then move to the Verify phase. Safe to tap twice. */
  const submitNew = async () => {
    if (submittingRef.current) return;
    for (let n = 1; n <= 3; n++) {
      const problem = problemFor(n);
      if (problem) { setError(problem); setStep(n); scrollTop(); return; }
    }
    submittingRef.current = true;
    setLoading(true);
    setError('');
    try {
      const res = await submitStartupAction(buildPayload());
      if (!res.success) {
        if (res.duplicate) {
          setDomainState({ status: 'listed', ...res.duplicate, url: formData.websiteUrl });
          setStep(1);
        }
        setError(res.error || 'Submission failed');
        scrollTop();
        return;
      }
      localStorage.removeItem(NEW_DRAFT_KEY);
      const info: CreatedStartup = {
        startupId: res.startupId, slug: res.slug, name: res.name, websiteUrl: formData.websiteUrl,
        verified: res.verified, workEmailHint: res.workEmailHint,
      };
      setCreatedInfo(info);
      setPhase(res.verified ? 'done' : 'verify');
      // The address now points at this startup's Verify step: a refresh or Back can't reopen the editable form.
      router.replace(`/founder/startups/new?created=${encodeURIComponent(res.startupId)}`, { scroll: false });
      scrollTop();
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  // Saving an existing startup (the edit page stays one page).
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!formData.name || !formData.tagline || !formData.description || !formData.websiteUrl || !formData.category || !formData.businessType || !formData.employeeCount || !formData.foundedYear || !formData.stage || !formData.logoUrl) {
        throw new Error('Please fill in all required fields');
      }
      if (!foundersDetails.some(f => f.name.trim())) {
        throw new Error('Please add at least one founder under Founders Details');
      }
      if (contactEmail.trim() && !contactConfirmed) {
        throw new Error('Confirm the new contact email with the 6-digit code, or change it back.');
      }

      const result = await updateStartupAction(startup.id, buildPayload());
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

  const sectionCls = isNew ? '' : 'border-t border-gray-200 dark:border-gray-800 pt-6';

  const domainNote = domainState.status === 'checking' ? (
    <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-gray-500"><Loader2 className="w-3 h-3 animate-spin" aria-hidden /> Checking if it’s already listed…</p>
  ) : domainState.status === 'yours' ? (
    <div role="alert" className="mt-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-900 dark:text-amber-200">
      You’ve already added <strong>{domainState.name}</strong>.{' '}
      <Link href={`/founder/startups/${domainState.slug}`} className="font-semibold underline">Open it →</Link>
    </div>
  ) : domainState.status === 'listed' ? (
    <div role="alert" className="mt-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-900 dark:text-amber-200">
      <strong>{domainState.name}</strong> is already listed on Udyaibase.{' '}
      {domainState.verified && domainState.dnsTakeover
        ? <>It was verified with a work email. If you control the domain’s DNS, <Link href={`/founder/claim/${domainState.id}`} className="font-semibold underline">take it over with a DNS record →</Link></>
        : domainState.verified
        ? <>It’s verified by its founder. Ask them to add you to their team, or <Link href="/founder/support" className="font-semibold underline">contact support</Link>.</>
        : <Link href={`/founder/claim/${domainState.id}`} className="font-semibold underline">Claim it instead →</Link>}
    </div>
  ) : null;

  const contactBlock = (
    <ContactEmailField
      value={contactEmail}
      onChange={setContactEmail}
      confirmedEmail={contact.email}
      onConfirmed={(email, proof) => setContact({ email, proof })}
      autoCheck={isNew}
    />
  );

  const errorBanner = error ? (
    <div role="alert" className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
      <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
    </div>
  ) : null;

  const logoBlock = (
    <>
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
                accept="image/png,image/jpeg,image/webp,image/gif"
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
    </>
  );
  const nameBlock = (
    <>
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
    </>
  );
  const taglineBlock = (
    <>
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
    </>
  );
  const descriptionBlock = (
    <>
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
    </>
  );
  const categoryBlock = (
    <>
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
    </>
  );
  const businessBlock = (
    <>
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
    </>
  );
  const websiteBlock = (
    <>
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
        {isNew && domainNote}
      </div>
    </>
  );
  const socialBlock = (
    <>
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
    </>
  );
  const detailsBlock = (
    <>
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
    </>
  );
  const hqBlock = (
    <>
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
    </>
  );
  const teamBlock = (
    <>
      {/* Founders Details Section */}
      <div className={sectionCls}>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">Only add details and photos of people who’ve agreed to appear on your profile.</p>
        <FoundersDetailsManager founders={foundersDetails} onChange={setFoundersDetails} maxFounders={5} />
      </div>
    </>
  );
  const fundingBlock = (
    <>
      {/* Funding Rounds Section */}
      <div className={sectionCls}>
        <FundingRoundsManager rounds={fundingRounds} onChange={setFundingRounds} maxRounds={10} />
      </div>
    </>
  );
  const faqsBlock = (
    <>
      {/* FAQs Section */}
      <div className={sectionCls}>
        <FAQManager faqs={faqs} onChange={setFaqs} maxFaqs={10} />
      </div>
    </>
  );

  if (!isNew) {
    return (
      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-6">
        {saved && (
          <StatusNote tone={saved.pending.length ? 'waiting' : 'success'} title={saved.pending.length ? 'Saved. Some changes are waiting for our team.' : 'Saved'}>
            {saved.published.length > 0 && `Live now: ${saved.published.join(', ')}. `}
            {saved.pending.length > 0 && `Waiting for review: ${saved.pending.join(', ')}. Your listing shows the current version until then.`}
            {saved.published.length === 0 && saved.pending.length === 0 && 'Nothing had changed.'}
          </StatusNote>
        )}
        {errorBanner}
        {logoBlock}
        {nameBlock}
        {taglineBlock}
        {descriptionBlock}
        {categoryBlock}
        {businessBlock}
        {websiteBlock}
        {socialBlock}
        {detailsBlock}
        {hqBlock}
        {contactBlock}
        {teamBlock}
        {fundingBlock}
        {faqsBlock}
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

  // ----- New startup: Verify phase and finish screen -----
  if (phase !== 'form' && createdInfo) {
    const verified = phase === 'done' && createdInfo.verified;
    return (
      <div ref={topRef} className="space-y-4 scroll-mt-24">
        <PhaseBar phase={verified ? 'done' : 'verify'} />
        {phase === 'verify' ? (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-400 mb-1">Submitted · one last step</p>
            <h2 className="text-xl sm:text-2xl font-bold font-sora text-gray-900 dark:text-white">Verify you own {createdInfo.name}</h2>
            <ul className="mt-3 mb-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
              <li className="flex gap-2"><BadgeCheck className="w-4 h-4 mt-0.5 shrink-0 text-blue-600" aria-hidden /> A blue verified tick on your listing</li>
              <li className="flex gap-2"><Clock className="w-4 h-4 mt-0.5 shrink-0 text-blue-600" aria-hidden /> Verified startups are reviewed first</li>
              <li className="flex gap-2"><ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-blue-600" aria-hidden /> Nobody else can claim or edit it</li>
            </ul>
            <StartupDomainVerify
              startupId={createdInfo.startupId}
              startupName={createdInfo.name}
              websiteUrl={createdInfo.websiteUrl}
              workEmailHint={createdInfo.workEmailHint}
              onVerified={() => { setCreatedInfo({ ...createdInfo, verified: true }); setPhase('done'); scrollTop(); router.refresh(); }}
            />
            <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800 text-center">
              <button type="button" onClick={() => { setPhase('done'); scrollTop(); }} className="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white underline underline-offset-2">
                I’ll verify later
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 sm:p-8 text-center">
            <div className={`mx-auto mb-4 w-14 h-14 rounded-full flex items-center justify-center ${verified ? 'bg-green-100 dark:bg-green-900/30' : 'bg-amber-100 dark:bg-amber-900/30'}`}>
              {verified ? <BadgeCheck className="w-7 h-7 text-green-600" aria-hidden /> : <Clock className="w-7 h-7 text-amber-600" aria-hidden />}
            </div>
            <h2 className="text-xl font-bold font-sora text-gray-900 dark:text-white mb-2">
              {verified ? `${createdInfo.name} is submitted and verified` : `${createdInfo.name} is submitted`}
            </h2>
            {verified ? (
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">You’re confirmed as the owner. Our team reviews verified startups first, and we’ll email you once it’s live.</p>
            ) : (
              <>
                <p className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 mb-3">Not verified yet</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">Our team will review it and email you once it’s live. Verify your domain any time to get the blue tick and a faster review.</p>
              </>
            )}
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              {!verified && (
                <button type="button" onClick={() => { setPhase('verify'); scrollTop(); }} className="btn-brand h-11 px-6">Verify now</button>
              )}
              <button type="button" onClick={() => router.push('/founder/startups')} className={`h-11 px-6 rounded-lg font-semibold text-sm ${verified ? 'bg-brand text-white hover:bg-brand/90' : 'border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                Go to My startups
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ----- New startup: the five steps -----
  const reviewRows: { step: number; label: string; value: React.ReactNode }[] = [
    { step: 1, label: 'Website', value: formData.websiteUrl },
    { step: 1, label: 'Name', value: formData.name },
    { step: 1, label: 'Tagline', value: formData.tagline },
    { step: 1, label: 'Description', value: <span className="line-clamp-3 whitespace-pre-line">{formData.description}</span> },
    { step: 2, label: 'Category', value: [formData.category, formData.businessType].filter(Boolean).join(' · ') },
    { step: 2, label: 'Stage', value: `${(formData.stage || '').replace(/_/g, ' ')} · ${formData.status} · founded ${formData.foundedYear}` },
    { step: 2, label: 'Team size', value: formData.employeeCount },
    { step: 2, label: 'Headquarters', value: formData.headquartersCity || '—' },
    { step: 2, label: 'Contact email', value: <>{contactEmail} <span className="text-xs text-gray-500">(private)</span></> },
    { step: 3, label: 'Founders', value: foundersDetails.filter(f => f.name.trim()).map(f => f.name.trim()).join(', ') || '—' },
    { step: 4, label: 'Funding rounds', value: fundingRounds.length ? `${fundingRounds.length} round${fundingRounds.length === 1 ? '' : 's'}` : 'None added' },
    { step: 4, label: 'FAQs', value: faqs.length ? `${faqs.length}` : 'None added' },
  ];

  return (
    <div ref={topRef} className="scroll-mt-24">
      <PhaseBar phase="form" step={step} onStep={(n) => { if (n < step) goTo(n); }} />

      <div className="mt-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 sm:p-6 space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">Step {step} of {STEPS.length}</p>
          <h2 className="text-xl sm:text-2xl font-bold font-sora text-gray-900 dark:text-white">{STEPS[step - 1].title}</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{STEPS[step - 1].hint}</p>
        </div>

        {errorBanner}

        {step === 1 && (
          <>
            {websiteBlock}
            {logoBlock}
            {nameBlock}
            {taglineBlock}
            {descriptionBlock}
          </>
        )}
        {step === 2 && (
          <>
            {categoryBlock}
            {businessBlock}
            {detailsBlock}
            {hqBlock}
            {contactBlock}
            {socialBlock}
          </>
        )}
        {step === 3 && teamBlock}
        {step === 4 && (
          <>
            {fundingBlock}
            <div className="border-t border-gray-200 dark:border-gray-800 pt-6">{faqsBlock}</div>
          </>
        )}
        {step === 5 && (
          <dl className="divide-y divide-gray-100 dark:divide-gray-800 rounded-lg border border-gray-200 dark:border-gray-800">
            {logoPreview && (
              <div className="flex items-center gap-3 p-3">
                <Image src={logoPreview} alt="" width={40} height={40} unoptimized className="w-10 h-10 rounded-lg object-cover border border-gray-200 dark:border-gray-700" />
                <span className="font-semibold text-gray-900 dark:text-white">{formData.name}</span>
              </div>
            )}
            {reviewRows.map((r) => (
              <div key={r.label} className="grid grid-cols-[7rem_1fr_auto] sm:grid-cols-[9rem_1fr_auto] gap-2 items-start p-3 text-sm">
                <dt className="text-gray-500 dark:text-gray-400">{r.label}</dt>
                <dd className="text-gray-900 dark:text-white min-w-0 break-words">{r.value}</dd>
                <button type="button" onClick={() => goTo(r.step)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand" aria-label={`Edit ${r.label}`}>
                  <Pencil className="w-3 h-3" aria-hidden /> Edit
                </button>
              </div>
            ))}
          </dl>
        )}
      </div>

      {/* Back / Continue: stays in reach above the phone tab bar */}
      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] md:bottom-0 z-10 -mx-4 md:mx-0 mt-4 px-4 md:px-0 py-3 bg-white/95 dark:bg-gray-950/95 backdrop-blur border-t md:border-t-0 border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2">
          {step > 1 ? (
            <button type="button" onClick={() => goTo(step - 1)} disabled={loading} className="h-11 px-4 inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
              <ArrowLeft className="w-4 h-4" aria-hidden /> Back
            </button>
          ) : (
            <button type="button" onClick={() => router.back()} className="h-11 px-4 rounded-lg text-sm font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
          )}
          <div className="flex-1" />
          {step === 4 && fundingRounds.length === 0 && faqs.length === 0 && (
            <button type="button" onClick={() => goTo(5)} className="h-11 px-3 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">Skip</button>
          )}
          {step < STEPS.length ? (
            <button type="button" onClick={goNext} disabled={domainState.status === 'checking' && step === 1} className="h-11 px-5 inline-flex items-center gap-1.5 rounded-lg bg-brand hover:bg-brand/90 text-white text-sm font-semibold disabled:opacity-60">
              Continue <ArrowRight className="w-4 h-4" aria-hidden />
            </button>
          ) : (
            <button type="button" onClick={submitNew} disabled={loading} aria-busy={loading} className="h-11 px-5 inline-flex items-center gap-1.5 rounded-lg bg-brand hover:bg-brand/90 text-white text-sm font-semibold disabled:opacity-60">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Check className="w-4 h-4" aria-hidden />}
              {loading ? 'Submitting…' : 'Submit & verify'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Two phases: "Add startup" (5 steps) then "Verify". Earlier steps can be tapped to go back. */
function PhaseBar({ phase, step = 1, onStep }: { phase: 'form' | 'verify' | 'done'; step?: number; onStep?: (n: number) => void }) {
  const formDone = phase !== 'form';
  return (
    <nav aria-label="Progress" className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-semibold mb-1.5 ${formDone ? 'text-green-700 dark:text-green-400' : 'text-gray-900 dark:text-white'}`}>
          {formDone ? 'Startup added' : `Add startup · ${STEPS[step - 1].title}`}
        </p>
        <ol className="flex gap-1">
          {STEPS.map((s, i) => {
            const n = i + 1;
            const done = formDone || n < step;
            const current = !formDone && n === step;
            return (
              <li key={s.title} className="flex-1">
                <button
                  type="button"
                  onClick={() => onStep?.(n)}
                  disabled={formDone || n >= step}
                  aria-current={current ? 'step' : undefined}
                  aria-label={`Step ${n}: ${s.title}${done ? ' (done)' : ''}`}
                  className={`block w-full h-1.5 rounded-full transition-colors ${done ? 'bg-green-500' : current ? 'bg-brand' : 'bg-gray-200 dark:bg-gray-700'} disabled:cursor-default`}
                />
              </li>
            );
          })}
        </ol>
      </div>
      <span aria-hidden className="text-gray-300 dark:text-gray-600">→</span>
      <div className="w-20 sm:w-28 shrink-0">
        <p className={`text-xs font-semibold mb-1.5 ${phase === 'form' ? 'text-gray-400' : phase === 'verify' ? 'text-gray-900 dark:text-white' : 'text-green-700 dark:text-green-400'}`}>Verify</p>
        <div className={`h-1.5 rounded-full ${phase === 'verify' ? 'bg-brand' : phase === 'done' ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
      </div>
    </nav>
  );
}
