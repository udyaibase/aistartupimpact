import Link from 'next/link';
import {
  Megaphone, Users, BarChart3, Globe, Mail, ArrowRight, Check,
  Zap, Newspaper, TrendingUp, Star, BookOpen, IndianRupee, Crown,
  Briefcase, Calendar, PartyPopper, MessageSquare, Trophy, Rocket,
  ChevronDown, X, CreditCard, HelpCircle, Clock, Shield, Package, Eye,
} from 'lucide-react';
import { sql } from '@/lib/db';
import { buildFallback } from '@/lib/build-fallback';

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678a6.162 6.162 0 100 12.324 6.162 6.162 0 100-12.324zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405a1.441 1.441 0 11-2.882 0 1.441 1.441 0 012.882 0z" />
    </svg>
  );
}

function RazorpayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M22.436 0l-11.91 7.773-1.174 4.276 6.625-4.297L11.65 24h4.391L22.436 0zM8.848 7.156L.587 24h4.476l6.583-13.3-2.798-3.544z" />
    </svg>
  );
}

export const revalidate = 3600;

export const metadata = {
  title: 'Advertise — Udyaibase',
  description: 'Launch Year pricing: AI jobs & events free for 12 months. One-time placement packages from ₹2,999. No subscriptions.',
};

/* ── Placement Zone Data ────────────────── */
const tier1Zones = [
  { name: 'Promo badge on header', icon: Crown },
  { name: 'Homepage hero section', icon: Zap },
  { name: 'Powered-by section', icon: Star },
];

const tier2Zones = [
  { name: 'Founder spotlight', icon: BookOpen },
  { name: 'Featured partner', icon: Users },
  { name: 'Website newsletter featured', icon: Mail },
  { name: 'LinkedIn newsletter featured', icon: LinkedInIcon },
];

const tier3Zones = [
  { name: 'Latest stories — Card #1', icon: Newspaper },
  { name: 'AI tool picks', icon: Star },
  { name: 'Stories page featured', icon: BookOpen },
  { name: 'AI tools page featured', icon: TrendingUp },
  { name: 'Startup directory featured', icon: BarChart3 },
];

/* ── Pricing Packages ──────────────────── */
const packages = [
  {
    tier: 'Tier 0',
    name: 'Free',
    price: '₹0',
    priceNote: 'No payment required',
    validity: 'Free for 12 months',
    description: 'Post jobs and events free for Year 1. List in directory. No placement zones.',
    color: 'border-gray-200 dark:border-gray-700',
    features: [
      'Unlimited AI job posts (Year 1)',
      'Unlimited AI events (Year 1)',
      'Startup & AI tool directory listing',
      '3 founder posts / month',
      'Basic analytics',
      '1 team member',
    ],
    excluded: ['No placement zones'],
    cta: 'Get Started Free',
    ctaStyle: 'border border-gray-200 dark:border-gray-700 text-navy dark:text-white hover:border-brand hover:text-brand',
  },
  {
    tier: 'Tier 3',
    name: 'Starter',
    price: '₹2,999',
    priceNote: '+ GST (one-time)',
    validity: 'Valid for 1 year',
    description: 'Access to standard placement zones. 3 free days per zone, extend at ₹99/day.',
    color: 'border-blue-200 dark:border-blue-800',
    features: [
      'Everything in Free, plus:',
      'Tier 3 zones (5 zones)',
      '3 free days per zone',
      'Extend at ₹99/day',
      'Unlimited founder posts',
      'Advanced analytics',
      '5 team members',
    ],
    cta: 'Buy Starter',
    ctaStyle: 'border border-gray-200 dark:border-gray-700 text-navy dark:text-white hover:border-brand hover:text-brand',
  },
  {
    tier: 'Tier 2 + 3',
    name: 'Growth',
    price: '₹5,999',
    priceNote: '+ GST (one-time)',
    validity: 'Valid for 1 year',
    description: 'High-visibility zones + social posts. 3 free days per zone, extend at ₹149/day or ₹99/day.',
    color: 'border-brand',
    popular: true,
    features: [
      'Everything in Starter, plus:',
      'Tier 2 zones (4 zones)',
      'LinkedIn + Instagram posts',
      'Extend T2 at ₹149/day',
      'Social posts: ₹999/post',
      'Unlimited founder posts',
      'Advanced analytics',
    ],
    cta: 'Buy Growth',
    ctaStyle: 'btn-brand',
  },
  {
    tier: 'All Tiers',
    name: 'Premium',
    price: '₹9,999',
    priceNote: '+ GST (one-time)',
    validity: 'Valid for 1 year',
    description: 'All zones including hero & promo badge. 3 free days per zone, extend at ₹199/day.',
    color: 'border-orange-200 dark:border-orange-800',
    features: [
      'Everything in Growth, plus:',
      'Tier 1 zones (hero, badge, powered-by)',
      'LinkedIn + Instagram posts',
      'Extend T1 at ₹199/day',
      'Social posts: ₹999/post',
      'Unlimited team members',
      'Priority support',
    ],
    cta: 'Buy Premium',
    ctaStyle: 'border border-gray-200 dark:border-gray-700 text-navy dark:text-white hover:border-brand hover:text-brand',
  },
];

/* ── FAQ Data ──────────────────────────── */
const faqs = [
  {
    q: 'How is this different from a monthly subscription?',
    a: 'You pay once for a package (₹2,999 / ₹5,999 / ₹9,999) and it\'s valid for an entire year. There are no monthly bills. Each placement zone includes 3 free days. If you need more time, you pay a small per-day rate (₹99, ₹149, or ₹199 depending on the zone). You only pay for what you actually use beyond the 3 free days.',
  },
  {
    q: 'What does "3 free days per zone" mean?',
    a: 'Every time-bound placement zone in your package includes 3 free days. You can activate any zone at any time during your 1-year validity, and it runs for 3 days at no extra cost. Each zone gets its own 3-day window — so if you have 5 zones in your package, you get 3 free days on each of those 5 zones (15 free days total, spread across 5 zones).',
  },
  {
    q: 'How do extension days work?',
    a: 'If you want a zone to run for more than 3 days, you pay a per-day rate for each extra day beyond the 3 free days. Tier 3 zones cost ₹99/day, Tier 2 zones cost ₹149/day, and Tier 1 zones cost ₹199/day. For example, 7 days on Latest Stories (Tier 3) = 3 free days + 4 extra days at ₹99 = ₹396 extra.',
  },
  {
    q: 'What are LinkedIn and Instagram featured posts?',
    a: 'These are dedicated posts on the platform\'s official LinkedIn and Instagram accounts featuring your startup, product, or announcement. They are per-purchase (₹999 per post), not time-bound. One purchase = one post that stays live permanently on the social account. Available only in Growth and Premium packages. The bundle (both posts) costs ₹1,799, saving you ₹199.',
  },
  {
    q: 'What is free during Year 1?',
    a: 'AI job posts and AI events are completely free with no limits for 12 months across all packages, including the Free tier. You can also list your startup in the directory, write 3 founder posts per month, and access basic analytics — all free. Placement zones require a paid package (Starter, Growth, or Premium).',
  },
  {
    q: 'How long is my package valid?',
    a: 'Each paid package is valid for 1 year from the purchase date. During that year, you can activate your 3 free days on any zone at any time, and purchase extensions or social posts whenever you need them. After 1 year, the package expires and you can renew or migrate to the subscription model.',
  },
  {
    q: 'What happens after Year 1?',
    a: 'After the first year, this fixed-package model transitions to a full subscription plan (monthly/annual Pro tiers). Users who purchased packages during Year 1 will be offered migration to subscription plans with loyalty pricing. Everything you posted during the year stays live.',
  },
  {
    q: 'Which payment methods do you accept?',
    a: 'UPI (Google Pay, PhonePe, Paytm, BHIM), credit/debit cards, netbanking via Razorpay, and bank transfer (NEFT) for large purchases. GST invoices are automatically generated for all purchases.',
  },
  {
    q: 'Can I upgrade my package later?',
    a: 'Yes. You can upgrade from Starter to Growth or Premium, or from Growth to Premium, at any time. You pay only the difference in package price. Your 1-year validity resets from the upgrade date.',
  },
];

/* ── Comparison Table Data ─────────────── */
const comparisonRows = [
  { section: 'Core Features' },
  { feature: 'AI job posts (Year 1)', free: 'Unlimited', starter: 'Unlimited', growth: 'Unlimited', premium: 'Unlimited' },
  { feature: 'AI events (Year 1)', free: 'Unlimited', starter: 'Unlimited', growth: 'Unlimited', premium: 'Unlimited' },
  { feature: 'Organic directory listing', free: 'Yes', starter: 'Yes', growth: 'Yes', premium: 'Yes' },
  { feature: 'Founder posts', free: '3/month', starter: 'Unlimited', growth: 'Unlimited', premium: 'Unlimited' },
  { feature: 'Basic analytics', free: 'Yes', starter: 'Yes', growth: 'Yes', premium: 'Yes' },
  { feature: 'Advanced analytics', free: '—', starter: 'Yes', growth: 'Yes', premium: 'Yes' },
  { feature: 'Team members', free: '1', starter: '5', growth: '5', premium: 'Unlimited' },
  { section: 'Tier 3 — Standard Zones (₹99/day extension)' },
  { feature: 'Latest stories — Card #1', free: '—', starter: '₹99/day', growth: '₹99/day', premium: '₹99/day' },
  { feature: 'AI tool picks', free: '—', starter: '₹99/day', growth: '₹99/day', premium: '₹99/day' },
  { feature: 'Stories page featured', free: '—', starter: '₹99/day', growth: '₹99/day', premium: '₹99/day' },
  { feature: 'AI tools page featured', free: '—', starter: '₹99/day', growth: '₹99/day', premium: '₹99/day' },
  { feature: 'Startup directory featured', free: '—', starter: '₹99/day', growth: '₹99/day', premium: '₹99/day' },
  { section: 'Tier 2 — High-Visibility Zones (₹149/day extension)' },
  { feature: 'Founder spotlight', free: '—', starter: '—', growth: '₹149/day', premium: '₹149/day' },
  { feature: 'Featured partner', free: '—', starter: '—', growth: '₹149/day', premium: '₹149/day' },
  { feature: 'Website newsletter featured', free: '—', starter: '—', growth: '₹149/day', premium: '₹149/day' },
  { feature: 'LinkedIn newsletter featured', free: '—', starter: '—', growth: '₹149/day', premium: '₹149/day' },
  { section: 'Tier 1 — Premium Zones (₹199/day extension)' },
  { feature: 'Promo badge on header', free: '—', starter: '—', growth: '—', premium: '₹199/day' },
  { feature: 'Homepage hero section', free: '—', starter: '—', growth: '—', premium: '₹199/day' },
  { feature: 'Powered-by section', free: '—', starter: '—', growth: '—', premium: '₹199/day' },
  { section: 'Social Posts (Per-Purchase)' },
  { feature: 'LinkedIn featured post', free: '—', starter: '—', growth: '₹999/post', premium: '₹999/post' },
  { feature: 'Instagram featured post', free: '—', starter: '—', growth: '₹999/post', premium: '₹999/post' },
  { feature: 'LinkedIn + Instagram bundle', free: '—', starter: '—', growth: '₹1,799', premium: '₹1,799' },
  { section: 'Pricing' },
  { feature: 'One-time price (+ GST)', free: '₹0', starter: '₹2,999', growth: '₹5,999', premium: '₹9,999' },
  { feature: 'Validity', free: '12 months free', starter: '1 year', growth: '1 year', premium: '1 year' },
  { feature: '3 free days per zone', free: '—', starter: 'Yes', growth: 'Yes', premium: 'Yes' },
];

type ZoneRow = { name: string; d3: string; d7: string; d15: string; d30: string; extra: string };
function zoneTable(rate: number): Omit<ZoneRow, 'name'> {
  return {
    d3: 'Included',
    d7: `₹${(4 * rate).toLocaleString('en-IN')}`,
    d15: `₹${(12 * rate).toLocaleString('en-IN')}`,
    d30: `₹${(27 * rate).toLocaleString('en-IN')}`,
    extra: `₹${rate}`,
  };
}

export default async function AdvertisePage() {
  const [startupCountResult, articleCountResult, toolCountResult, newsletterCountResult] = await Promise.all([
    sql`SELECT COUNT(*)::int as count FROM "Startup" WHERE "isIndian" = true AND "deletedAt" IS NULL AND "isApproved" = true`.catch(buildFallback([{ count: 0 }], 'advertise counts')),
    sql`SELECT COUNT(*)::int as count FROM "Article" WHERE status = 'PUBLISHED'`.catch(buildFallback([{ count: 0 }], 'advertise counts')),
    sql`SELECT COUNT(*)::int as count FROM "AiTool" WHERE status IN ('APPROVED', 'FEATURED') AND "deletedAt" IS NULL`.catch(buildFallback([{ count: 0 }], 'advertise counts')),
    sql`SELECT COUNT(*)::int as count FROM "NewsletterSubscriber" WHERE "isActive" = true`.catch(() => [{ count: 0 }]),
  ]);

  const startupCount = startupCountResult[0]?.count || 0;
  const articleCount = articleCountResult[0]?.count || 0;
  const toolCount = toolCountResult[0]?.count || 0;
  const newsletterCount = newsletterCountResult[0]?.count || 0;

  const stats = [
    { value: '50K+', label: 'LinkedIn Followers', icon: LinkedInIcon },
    { value: `${startupCount > 0 ? startupCount.toLocaleString('en-IN') : '800'}+`, label: 'AI Startups Listed', icon: BarChart3 },
    { value: `${articleCount > 0 ? articleCount.toLocaleString('en-IN') : '200'}+`, label: 'Published Stories', icon: Newspaper },
    { value: `${toolCount > 0 ? toolCount.toLocaleString('en-IN') : '500'}+`, label: 'AI Tools Reviewed', icon: Star },
    { value: newsletterCount > 1000 ? `${(newsletterCount / 1000).toFixed(1)}K+` : `${newsletterCount.toLocaleString('en-IN')}+`, label: 'Newsletter Subscribers', icon: Mail },
    { value: '4.2 min', label: 'Avg. Time on Page', icon: Globe },
    { value: '60%', label: 'Organic / Direct Traffic', icon: TrendingUp },
    { value: '42%', label: 'Newsletter Open Rate', icon: Mail },
  ];

  const t1 = zoneTable(199);
  const t2 = zoneTable(149);
  const t3 = zoneTable(99);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* ─── Hero ────────────────── */}
      <section aria-label="Advertise hero" className="text-center mb-12 sm:mb-16">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Megaphone className="w-5 h-5 text-brand" />
          <span className="text-xs font-bold uppercase tracking-widest text-brand font-jakarta">Launch Year</span>
        </div>
        <h1 className="font-sora font-extrabold text-3xl sm:text-4xl md:text-5xl text-navy dark:text-white leading-tight">
          Jobs &amp; Events Free for 12 Months
        </h1>
        <p className="text-gray-500 dark:text-gray-400 font-jakarta text-base sm:text-lg mt-4 max-w-2xl mx-auto leading-relaxed">
          Pay once. Place anywhere. Extend by the day. Buy a fixed package, get 3 free days on every placement zone, and extend at per-day rates. AI jobs and events are completely free for the first year. No monthly subscription needed.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-6">
          <a href="#pricing" className="btn-brand text-sm">
            View Packages <ArrowRight className="w-4 h-4 ml-1 inline" />
          </a>
          <a href="#zones" className="text-sm text-brand hover:underline font-jakarta font-semibold">
            Explore Placement Zones
          </a>
        </div>
      </section>

      {/* ─── Launch Year Banner ──── */}
      <div className="card p-5 sm:p-6 mb-12 sm:mb-16 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/10 dark:to-emerald-900/10 border-l-4 border-l-green-500">
        <div className="flex items-start gap-3">
          <PartyPopper className="w-6 h-6 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
          <div>
            <h2 className="font-sora font-bold text-base sm:text-lg text-navy dark:text-white">
              Launch Year Offer — AI Jobs &amp; Events Completely Free
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-300 font-jakarta mt-1 leading-relaxed">
              Job posting and event creation are completely free with no limits for 12 months. No credit card required. Placement zones are available through one-time fixed packages. We are building our audience now — performance metrics will be shared publicly as the platform grows.
            </p>
          </div>
        </div>
      </div>

      {/* ─── Stats Bar ───────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-12 sm:mb-16">
        {stats.map((s) => (
          <div key={s.label} className="card p-3 sm:p-4 text-center">
            <s.icon className="w-4 h-4 sm:w-5 sm:h-5 text-brand mx-auto mb-1.5" />
            <div className="font-sora font-extrabold text-lg sm:text-xl text-brand">{s.value}</div>
            <div className="text-[10px] sm:text-xs text-gray-400 font-jakarta mt-1 uppercase tracking-wider font-bold">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ─── How It Works ────────── */}
      <section aria-label="How it works" className="card p-6 sm:p-8 mb-12 sm:mb-16 bg-gradient-to-r from-brand-50/50 to-white dark:from-brand-900/10 dark:to-gray-900 border-l-4 border-l-brand">
        <h2 className="font-sora font-bold text-lg sm:text-xl text-navy dark:text-white mb-2">
          How It Works
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 font-jakarta mb-5">
          Three steps to visibility. No subscriptions. No recurring billing. Pay once, use for 3 days, extend only if you need more.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {[
            { step: '01', title: 'Buy a Package', desc: 'Choose Starter (₹2,999), Growth (₹5,999), or Premium (₹9,999). One-time payment, valid for 1 year. GST extra.', icon: Package },
            { step: '02', title: 'Get 3 Free Days Per Zone', desc: 'Every placement zone in your package tier includes 3 free days. Activate any zone, any time, for 3 days at no extra cost.', icon: Clock },
            { step: '03', title: 'Extend at Per-Day Rates', desc: 'Need more than 3 days? Extend at ₹99, ₹149, or ₹199 per day depending on the zone tier. Or buy social posts per-purchase.', icon: TrendingUp },
          ].map((s) => (
            <div key={s.step} className="flex gap-3">
              <div className="w-10 h-10 rounded-full bg-brand text-white flex items-center justify-center shrink-0">
                <s.icon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-sora font-bold text-sm text-navy dark:text-white">{s.title}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta mt-1 leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Pricing Packages ────── */}
      <section aria-label="Pricing packages" id="pricing" className="mb-12 sm:mb-16">
        <div className="text-center mb-8">
          <IndianRupee className="w-6 h-6 text-brand mx-auto mb-2" />
          <h2 className="font-sora font-extrabold text-2xl sm:text-3xl text-navy dark:text-white">
            Pricing Packages
          </h2>
          <p className="text-gray-500 dark:text-gray-400 font-jakarta text-sm mt-2 max-w-xl mx-auto">
            Four packages. One-time payment. Every package is valid for 1 year. AI jobs and events are free across all packages for Year 1. All prices are + GST.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {packages.map((pkg) => (
            <div
              key={pkg.name}
              className={`card p-5 border-2 ${pkg.color} relative flex flex-col ${pkg.popular ? 'ring-2 ring-brand/20' : ''}`}
            >
              {pkg.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 badge-brand text-xs">Most Popular</span>
              )}
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 font-jakarta mb-1">{pkg.tier}</div>
              <h3 className="font-sora font-bold text-lg text-navy dark:text-white">{pkg.name}</h3>
              <p className="text-xs text-gray-400 dark:text-gray-500 font-jakarta mt-1">{pkg.description}</p>
              <div className="mt-4 mb-1">
                <span className="font-sora font-extrabold text-3xl text-brand">{pkg.price}</span>
              </div>
              <div className="text-xs text-gray-400 font-jakarta mb-1">{pkg.priceNote}</div>
              <div className="text-xs font-semibold text-green-600 dark:text-green-400 font-jakarta mb-4">{pkg.validity}</div>
              <ul className="space-y-2 flex-1">
                {pkg.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300 font-jakarta">
                    <Check className="w-4 h-4 text-brand shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
                {pkg.excluded?.map((f, i) => (
                  <li key={`ex-${i}`} className="flex items-start gap-2 text-sm text-gray-400 font-jakarta">
                    <X className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
              {/* Buy button temporarily hidden
              <Link
                href="/client-portal"
                className={`block text-center mt-5 py-2.5 rounded-xl text-sm font-bold transition-colors ${pkg.ctaStyle}`}
              >
                {pkg.cta}
              </Link>
              */}
            </div>
          ))}
        </div>
      </section>

      {/* ─── Placement Zones ─────── */}
      <section aria-label="Placement zones" id="zones" className="mb-12 sm:mb-16">
        <div className="text-center mb-8">
          <Eye className="w-6 h-6 text-brand mx-auto mb-2" />
          <h2 className="font-sora font-extrabold text-2xl sm:text-3xl text-navy dark:text-white">
            Placement Zones
          </h2>
          <p className="text-gray-500 dark:text-gray-400 font-jakarta text-sm mt-2 max-w-xl mx-auto">
            Every zone, every duration, every price. Each zone includes 3 free days when you buy the corresponding package. Extend at the per-day rate shown. All extension prices are + GST.
          </p>
        </div>

        <div className="space-y-8">
          {/* Tier 1 */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="h-1 w-8 rounded-full bg-gradient-to-r from-brand to-red-600" />
              <h3 className="font-sora font-bold text-base text-navy dark:text-white">Tier 1 — Premium Zones</h3>
              <span className="text-xs text-gray-400 font-jakarta">Premium Only &middot; Extension: ₹199/day</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-jakarta">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 pr-4 font-semibold text-gray-500 dark:text-gray-400">Zone</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-500 dark:text-gray-400">3 Days</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-500 dark:text-gray-400">7 Days</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-500 dark:text-gray-400">15 Days</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-500 dark:text-gray-400">30 Days</th>
                    <th className="text-right py-2 pl-3 font-semibold text-gray-500 dark:text-gray-400">Extra Day</th>
                  </tr>
                </thead>
                <tbody>
                  {tier1Zones.map((z) => (
                    <tr key={z.name} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-2.5 pr-4 text-navy dark:text-white font-medium">
                        <span className="inline-flex items-center gap-2"><z.icon className="w-4 h-4 text-brand shrink-0" />{z.name}</span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-green-600 dark:text-green-400 font-semibold">{t1.d3}</td>
                      <td className="py-2.5 px-3 text-right text-gray-600 dark:text-gray-300">{t1.d7}</td>
                      <td className="py-2.5 px-3 text-right text-gray-600 dark:text-gray-300">{t1.d15}</td>
                      <td className="py-2.5 px-3 text-right text-gray-600 dark:text-gray-300">{t1.d30}</td>
                      <td className="py-2.5 pl-3 text-right font-semibold text-brand">{t1.extra}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tier 2 */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="h-1 w-8 rounded-full bg-gradient-to-r from-orange-500 to-amber-500" />
              <h3 className="font-sora font-bold text-base text-navy dark:text-white">Tier 2 — High-Visibility Zones</h3>
              <span className="text-xs text-gray-400 font-jakarta">Growth &amp; Premium &middot; Extension: ₹149/day</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-jakarta">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 pr-4 font-semibold text-gray-500 dark:text-gray-400">Zone</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-500 dark:text-gray-400">3 Days</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-500 dark:text-gray-400">7 Days</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-500 dark:text-gray-400">15 Days</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-500 dark:text-gray-400">30 Days</th>
                    <th className="text-right py-2 pl-3 font-semibold text-gray-500 dark:text-gray-400">Extra Day</th>
                  </tr>
                </thead>
                <tbody>
                  {tier2Zones.map((z) => (
                    <tr key={z.name} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-2.5 pr-4 text-navy dark:text-white font-medium">
                        <span className="inline-flex items-center gap-2"><z.icon className="w-4 h-4 text-orange-500 shrink-0" />{z.name}</span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-green-600 dark:text-green-400 font-semibold">{t2.d3}</td>
                      <td className="py-2.5 px-3 text-right text-gray-600 dark:text-gray-300">{t2.d7}</td>
                      <td className="py-2.5 px-3 text-right text-gray-600 dark:text-gray-300">{t2.d15}</td>
                      <td className="py-2.5 px-3 text-right text-gray-600 dark:text-gray-300">{t2.d30}</td>
                      <td className="py-2.5 pl-3 text-right font-semibold text-brand">{t2.extra}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tier 3 */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="h-1 w-8 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500" />
              <h3 className="font-sora font-bold text-base text-navy dark:text-white">Tier 3 — Standard Zones</h3>
              <span className="text-xs text-gray-400 font-jakarta">Starter, Growth &amp; Premium &middot; Extension: ₹99/day</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-jakarta">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 pr-4 font-semibold text-gray-500 dark:text-gray-400">Zone</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-500 dark:text-gray-400">3 Days</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-500 dark:text-gray-400">7 Days</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-500 dark:text-gray-400">15 Days</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-500 dark:text-gray-400">30 Days</th>
                    <th className="text-right py-2 pl-3 font-semibold text-gray-500 dark:text-gray-400">Extra Day</th>
                  </tr>
                </thead>
                <tbody>
                  {tier3Zones.map((z) => (
                    <tr key={z.name} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-2.5 pr-4 text-navy dark:text-white font-medium">
                        <span className="inline-flex items-center gap-2"><z.icon className="w-4 h-4 text-blue-500 shrink-0" />{z.name}</span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-green-600 dark:text-green-400 font-semibold">{t3.d3}</td>
                      <td className="py-2.5 px-3 text-right text-gray-600 dark:text-gray-300">{t3.d7}</td>
                      <td className="py-2.5 px-3 text-right text-gray-600 dark:text-gray-300">{t3.d15}</td>
                      <td className="py-2.5 px-3 text-right text-gray-600 dark:text-gray-300">{t3.d30}</td>
                      <td className="py-2.5 pl-3 text-right font-semibold text-brand">{t3.extra}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Social Posts ─────────── */}
      <section aria-label="Social posts" className="mb-12 sm:mb-16">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <LinkedInIcon className="w-5 h-5 text-[#0A66C2]" />
            <InstagramIcon className="w-5 h-5 text-[#E4405F]" />
          </div>
          <h2 className="font-sora font-extrabold text-2xl sm:text-3xl text-navy dark:text-white">
            Social Posts
          </h2>
          <p className="text-gray-500 dark:text-gray-400 font-jakarta text-sm mt-2 max-w-lg mx-auto">
            LinkedIn &amp; Instagram featured posts. Available in Growth and Premium packages only. One purchase = one dedicated post on the platform&apos;s social account. Not time-bound — the post stays live permanently.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="card p-5 text-center">
            <LinkedInIcon className="w-8 h-8 text-[#0A66C2] mx-auto mb-3" />
            <h3 className="font-sora font-bold text-sm text-navy dark:text-white">LinkedIn Featured Post</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta mt-1 leading-relaxed">
              Dedicated featured post on the platform&apos;s LinkedIn account with your startup story, product, or announcement.
            </p>
            <div className="mt-3">
              <span className="font-sora font-extrabold text-2xl text-brand">₹999</span>
              <span className="text-xs text-gray-400 font-jakarta ml-1">per post (one-time)</span>
            </div>
            <div className="text-xs text-gray-400 font-jakarta mt-1">Growth &amp; Premium</div>
          </div>

          <div className="card p-5 text-center">
            <InstagramIcon className="w-8 h-8 text-[#E4405F] mx-auto mb-3" />
            <h3 className="font-sora font-bold text-sm text-navy dark:text-white">Instagram Featured Post</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta mt-1 leading-relaxed">
              Dedicated featured post on the platform&apos;s Instagram account with visual storytelling for your startup.
            </p>
            <div className="mt-3">
              <span className="font-sora font-extrabold text-2xl text-brand">₹999</span>
              <span className="text-xs text-gray-400 font-jakarta ml-1">per post (one-time)</span>
            </div>
            <div className="text-xs text-gray-400 font-jakarta mt-1">Growth &amp; Premium</div>
          </div>

          <div className="card p-5 text-center border-2 border-green-200 dark:border-green-800">
            <div className="flex items-center justify-center gap-2 mb-3">
              <LinkedInIcon className="w-7 h-7 text-[#0A66C2]" />
              <span className="text-green-500 font-bold text-lg">+</span>
              <InstagramIcon className="w-7 h-7 text-[#E4405F]" />
            </div>
            <h3 className="font-sora font-bold text-sm text-navy dark:text-white">LinkedIn + Instagram Bundle</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta mt-1 leading-relaxed">
              Both posts together. One LinkedIn + one Instagram featured post. Save ₹199.
            </p>
            <div className="mt-3">
              <span className="font-sora font-extrabold text-2xl text-brand">₹1,799</span>
              <span className="text-xs text-gray-400 font-jakarta ml-1">for both (save ₹199)</span>
            </div>
            <div className="text-xs font-semibold text-green-600 dark:text-green-400 font-jakarta mt-1">Best Value</div>
          </div>
        </div>
      </section>

      {/* ─── Founder Portal Post Types ── */}
      <section aria-label="Founder portal post types" className="mb-12 sm:mb-16">
        <div className="text-center mb-8">
          <Rocket className="w-6 h-6 text-brand mx-auto mb-2" />
          <h2 className="font-sora font-extrabold text-2xl sm:text-3xl text-navy dark:text-white">
            Founder Portal — Post Types
          </h2>
          <p className="text-gray-500 dark:text-gray-400 font-jakarta text-sm mt-2 max-w-lg mx-auto">
            Four ways founders publish. Free tier: 3 posts per month across any combination. Paid packages: unlimited posts.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: BookOpen, title: 'Founder Story', desc: 'Share your startup journey, building in public, lessons learned.', limit: 'Free: 3/month total' },
            { icon: MessageSquare, title: 'Opinion Post', desc: 'Share your perspective on AI trends and thought leadership.', limit: 'Free: 3/month total' },
            { icon: Trophy, title: 'Milestone Post', desc: 'Announce product launches, user milestones, team growth.', limit: 'Free: 3/month total' },
            { icon: IndianRupee, title: 'Funding Post', desc: 'Announce funding rounds, grants, investments, fundraising.', limit: 'Free: 3/month total' },
          ].map((p) => (
            <div key={p.title} className="card p-5 text-center">
              <p.icon className="w-8 h-8 text-brand mx-auto mb-3" />
              <h3 className="font-sora font-bold text-sm text-navy dark:text-white">{p.title}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta mt-1 leading-relaxed">{p.desc}</p>
              <div className="text-xs text-gray-400 font-jakarta mt-3 font-semibold">{p.limit}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Full Comparison Table ── */}
      <section aria-label="Full comparison" className="mb-12 sm:mb-16">
        <div className="text-center mb-8">
          <BarChart3 className="w-6 h-6 text-brand mx-auto mb-2" />
          <h2 className="font-sora font-extrabold text-2xl sm:text-3xl text-navy dark:text-white">
            Full Comparison
          </h2>
          <p className="text-gray-500 dark:text-gray-400 font-jakarta text-sm mt-2 max-w-lg mx-auto">
            What&apos;s included in each package. Side-by-side breakdown of every zone and feature across all four packages.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm font-jakarta">
            <thead>
              <tr className="border-b-2 border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 pr-4 font-semibold text-gray-500 dark:text-gray-400 min-w-[180px]">Feature / Zone</th>
                <th className="text-center py-3 px-3 font-semibold text-gray-500 dark:text-gray-400 min-w-[90px]">Free</th>
                <th className="text-center py-3 px-3 font-semibold text-gray-500 dark:text-gray-400 min-w-[90px]">Starter</th>
                <th className="text-center py-3 px-3 font-semibold text-brand min-w-[90px]">Growth</th>
                <th className="text-center py-3 pl-3 font-semibold text-gray-500 dark:text-gray-400 min-w-[90px]">Premium</th>
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row, i) => {
                if ('section' in row && !('feature' in row)) {
                  return (
                    <tr key={i} className="bg-gray-50 dark:bg-gray-800/50">
                      <td colSpan={5} className="py-2 px-0 font-sora font-bold text-xs text-navy dark:text-white uppercase tracking-wider">
                        {row.section}
                      </td>
                    </tr>
                  );
                }
                if (!('feature' in row)) return null;
                return (
                  <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-2 pr-4 text-gray-700 dark:text-gray-300">{row.feature}</td>
                    <td className="py-2 px-3 text-center text-gray-500 dark:text-gray-400">{row.free}</td>
                    <td className="py-2 px-3 text-center text-gray-500 dark:text-gray-400">{row.starter}</td>
                    <td className="py-2 px-3 text-center text-gray-600 dark:text-gray-300 font-medium">{row.growth}</td>
                    <td className="py-2 pl-3 text-center text-gray-500 dark:text-gray-400">{row.premium}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ─── Cost Examples ────────── */}
      <section aria-label="Cost examples" className="mb-12 sm:mb-16">
        <div className="text-center mb-8">
          <CreditCard className="w-6 h-6 text-brand mx-auto mb-2" />
          <h2 className="font-sora font-extrabold text-2xl sm:text-3xl text-navy dark:text-white">
            Cost Examples
          </h2>
          <p className="text-gray-500 dark:text-gray-400 font-jakarta text-sm mt-2 max-w-lg mx-auto">
            Real scenarios, real numbers. See how the package + extension model works in practice.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Growth Example */}
          <div className="card p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-1 w-6 rounded-full bg-gradient-to-r from-orange-500 to-amber-500" />
              <h3 className="font-sora font-bold text-base text-navy dark:text-white">Growth Package — ₹5,999</h3>
            </div>
            <div className="space-y-2 text-sm font-jakarta">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300">Founder spotlight (7 days)</span>
                <span className="text-gray-500">4 × ₹149 = ₹596</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300">Latest stories Card #1 (3 days)</span>
                <span className="text-green-600 dark:text-green-400 font-semibold">Free</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300 inline-flex items-center gap-1.5"><LinkedInIcon className="w-3.5 h-3.5 text-[#0A66C2]" />LinkedIn featured post</span>
                <span className="text-gray-500">₹999</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300 inline-flex items-center gap-1.5"><InstagramIcon className="w-3.5 h-3.5 text-[#E4405F]" />Instagram featured post</span>
                <span className="text-gray-500">₹999</span>
              </div>
              <hr className="border-gray-200 dark:border-gray-700 my-2" />
              <div className="flex justify-between font-medium">
                <span className="text-navy dark:text-white">Package</span>
                <span>₹5,999</span>
              </div>
              <div className="flex justify-between font-medium">
                <span className="text-navy dark:text-white">Extensions + Posts</span>
                <span>₹2,594</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>GST (18%)</span>
                <span>₹1,547</span>
              </div>
              <div className="flex justify-between font-sora font-bold text-brand text-base pt-1">
                <span>Grand Total</span>
                <span>₹10,140</span>
              </div>
            </div>
          </div>

          {/* Premium Example */}
          <div className="card p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-1 w-6 rounded-full bg-gradient-to-r from-brand to-red-600" />
              <h3 className="font-sora font-bold text-base text-navy dark:text-white">Premium Package — ₹9,999</h3>
            </div>
            <div className="space-y-2 text-sm font-jakarta">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300">Homepage hero (7 days)</span>
                <span className="text-gray-500">4 × ₹199 = ₹796</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300">Powered-by section (3 days)</span>
                <span className="text-green-600 dark:text-green-400 font-semibold">Free</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300">Founder spotlight (5 days)</span>
                <span className="text-gray-500">2 × ₹149 = ₹298</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300 inline-flex items-center gap-1.5"><LinkedInIcon className="w-3.5 h-3.5 text-[#0A66C2]" /><span className="mx-0.5">+</span><InstagramIcon className="w-3.5 h-3.5 text-[#E4405F]" />bundle</span>
                <span className="text-gray-500">₹1,799</span>
              </div>
              <hr className="border-gray-200 dark:border-gray-700 my-2" />
              <div className="flex justify-between font-medium">
                <span className="text-navy dark:text-white">Package</span>
                <span>₹9,999</span>
              </div>
              <div className="flex justify-between font-medium">
                <span className="text-navy dark:text-white">Extensions + Posts</span>
                <span>₹2,893</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>GST (18%)</span>
                <span>₹2,321</span>
              </div>
              <div className="flex justify-between font-sora font-bold text-brand text-base pt-1">
                <span>Grand Total</span>
                <span>₹15,213</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FAQ ─────────────────── */}
      <section aria-label="FAQ" className="mb-12 sm:mb-16">
        <div className="text-center mb-8">
          <HelpCircle className="w-6 h-6 text-brand mx-auto mb-2" />
          <h2 className="font-sora font-extrabold text-2xl sm:text-3xl text-navy dark:text-white">
            FAQ
          </h2>
          <p className="text-gray-500 dark:text-gray-400 font-jakarta text-sm mt-2">Common questions</p>
        </div>

        <div className="space-y-3 max-w-3xl mx-auto">
          {faqs.map((faq) => (
            <details key={faq.q} className="card group">
              <summary className="flex items-center justify-between p-4 sm:p-5 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <span className="font-sora font-bold text-sm text-navy dark:text-white pr-4">{faq.q}</span>
                <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <div className="px-4 sm:px-5 pb-4 sm:pb-5 -mt-1">
                <p className="text-sm text-gray-600 dark:text-gray-300 font-jakarta leading-relaxed">{faq.a}</p>
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* ─── Final CTA ───────────── */}
      <section aria-label="Call to action" className="card p-6 sm:p-8 text-center bg-gradient-to-r from-brand-50 to-white dark:from-brand-900/15 dark:to-gray-900">
        <h2 className="font-sora font-extrabold text-xl sm:text-2xl text-navy dark:text-white">
          Pay once. Place anywhere.
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 font-jakarta mt-2 max-w-md mx-auto">
          Post AI jobs and events free for the entire first year. Buy a placement package when you need visibility. Extend by the day. No subscriptions, no recurring billing.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-5">
          {/* Buy button temporarily hidden
          <Link href="/client-portal" className="btn-brand text-sm">
            Get Started <ArrowRight className="w-4 h-4 ml-1 inline" />
          </Link>
          */}
          <span className="text-xs text-gray-400 font-jakarta">Email ads@udyaibase.com</span>
        </div>
      </section>
    </div>
  );
}
