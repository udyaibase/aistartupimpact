import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { prisma } from '@udyaibase/database';
import {
  Mail, BookOpen, Building2, Eye, ShieldCheck, Users, Unlock, ArrowRight, Handshake,
  Target, Linkedin, GraduationCap, BadgeCheck,
} from 'lucide-react';
import SectionHeader from '@/components/about/SectionHeader';
import EcosystemHub from '@/components/about/EcosystemHub';
import VerificationFlow from '@/components/about/VerificationFlow';
import GrowthLoops from '@/components/about/GrowthLoops';
import PlatformStats, { type PlatformStat } from '@/components/about/PlatformStats';
import { jsonLd } from '@/lib/json-ld';
import { getSeoConfig } from '@/lib/seo-config';
import { getBrandConfig } from '@/lib/brand';

// Live counts (visitors, subscribers, listings) refresh hourly instead of only on deploy.
export const revalidate = 3600;

/** One number for every mention on this page. */
const LINKEDIN_FOLLOWERS = '50K+';
const LINKEDIN_URL = 'https://www.linkedin.com/company/udyaibase';

const PAGE_TITLE = "About Udyaibase — India's AI Startup Ecosystem Platform";
const PAGE_DESCRIPTION =
  "Udyaibase is India's AI startup platform — founder stories, startup and AI tool directories, funding rounds and events in one place.";

// A page's openGraph/twitter objects replace the layout's rather than merging, so every field is set here.
export async function generateMetadata(): Promise<Metadata> {
  const [seo, brand] = await Promise.all([getSeoConfig(), getBrandConfig()]);
  const siteName = seo.metaTitle.split(/\s[–—|-]\s/)[0]?.trim() || 'Udyaibase';
  const ogImage = brand.ogImage || '/og-image.webp';
  return {
    title: { absolute: PAGE_TITLE },
    description: PAGE_DESCRIPTION,
    alternates: { canonical: '/about' },
    openGraph: {
      title: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
      url: `${seo.canonicalDomain}/about`,
      siteName,
      type: 'website',
      locale: 'en_IN',
      images: [{ url: ogImage, ...(brand.ogImage ? {} : { width: 2250, height: 1181 }), alt: PAGE_TITLE }],
    },
    twitter: {
      card: 'summary_large_image',
      site: seo.twitterHandle,
      creator: seo.twitterHandle,
      title: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
      images: [ogImage],
    },
  };
}

// ── Fetch live counts from DB ─────────────────────────────────────────────────
async function getLiveCounts() {
  try {
    const [startups, tools, subscribers, funding] = await Promise.all([
      prisma.startup.count({ where: { isApproved: true, deletedAt: null } }),
      prisma.aiTool.count({ where: { status: 'APPROVED' } }),
      prisma.newsletterSubscriber.count({ where: { isActive: true } }),
      // Same total as the funding dashboard (rounds of non-deleted startups); amountUsd is stored in cents.
      prisma.fundingRound.aggregate({ _sum: { amountUsd: true }, where: { Startup: { deletedAt: null } } }),
    ]);
    const fundingUsd = Number(funding._sum.amountUsd ?? BigInt(0)) / 100;
    return { startups, tools, subscribers, fundingUsd };
  } catch {
    // Graceful fallback — never break the page
    return { startups: 0, tools: 0, subscribers: 0, fundingUsd: 0 };
  }
}

// ── Format number display ─────────────────────────────────────────────────────
function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K+`;
  return n > 0 ? `${n}+` : '—';
}

/** Exact counts read better for directories (780+), rounded down so the "+" stays true. */
function countPlus(n: number): string {
  return n > 0 ? `${n.toLocaleString('en-IN')}+` : '—';
}

/** US$ total, rounded down so the "+" stays true: $53B+, $850M+. */
function usdPlus(dollars: number): string {
  if (dollars >= 1e9) return `$${Math.floor(dollars / 1e9)}B+`;
  if (dollars >= 1e6) return `$${Math.floor(dollars / 1e6)}M+`;
  return '—';
}

// ── Static content ────────────────────────────────────────────────────────────
const values = [
  {
    icon: Eye,
    title: 'Visibility for the overlooked',
    desc: 'We exist to surface the startups that crowded global platforms miss. The quality of the work matters more than the size of the marketing budget.',
  },
  {
    icon: ShieldCheck,
    title: 'Editorial independence',
    desc: "No pay-to-play listings. No sponsored reviews dressed up as coverage. No startup earns a better spot by paying for it. Our independence is what makes us worth trusting.",
  },
  {
    icon: Users,
    title: 'Founder-first',
    desc: 'We build for the people building. The founder figuring out their next move matters as much to us as the investor writing the cheque.',
  },
  {
    icon: Unlock,
    title: 'Open and accessible',
    desc: "Core content stays free. The directories, the stories, and the funding dashboard aren't paywalled — because a more visible ecosystem is a stronger one.",
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────
export default async function AboutPage() {
  const counts = await getLiveCounts();

  const stats: PlatformStat[] = [
    { value: countPlus(counts.startups), label: 'AI Startups', href: '/startups' },
    { value: countPlus(counts.tools), label: 'AI Tools', href: '/tools' },
    { value: usdPlus(counts.fundingUsd), label: 'Funding Tracked', href: '/funding' },
    { value: LINKEDIN_FOLLOWERS, label: 'LinkedIn Community', href: LINKEDIN_URL },
  ];

  // Real numbers only: the newsletter figure is the live count, and is left out if it couldn't be read.
  const subscriberPhrase = counts.subscribers > 0 ? ` and ${fmt(counts.subscribers)} newsletter subscribers` : '';

  const aboutSchema = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    name: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: 'https://udyaibase.com/about',
    about: {
      '@type': 'Organization',
      name: 'Udyaibase Technologies Private Limited',
      alternateName: 'Udyaibase',
      url: 'https://udyaibase.com',
      sameAs: [LINKEDIN_URL],
      founder: { '@type': 'Person', name: 'Lahori Venkatesh' },
    },
    mainEntity: {
      '@type': 'Person',
      name: 'Lahori Venkatesh',
      jobTitle: 'Founder & Director',
      image: 'https://udyaibase.com/founder-venkatesh.png',
      worksFor: { '@type': 'Organization', name: 'Udyaibase Technologies Private Limited', url: 'https://udyaibase.com' },
      alumniOf: { '@type': 'CollegeOrUniversity', name: 'Malaviya National Institute of Technology Jaipur', alternateName: 'MNIT Jaipur' },
    },
  };

  const wrap = 'max-w-6xl mx-auto px-4 sm:px-6 lg:px-8';
  const tintIcon = 'bg-[color:color-mix(in_srgb,var(--brand-color)_10%,transparent)] text-brand';

  return (
    // The (public) layout already provides <main>.
    <div className="overflow-x-clip">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(aboutSchema) }} />

      {/* ── Hero ──────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden border-b border-gray-100 dark:border-gray-900" aria-labelledby="about-hero-heading">
        <div
          className="absolute inset-0 -z-10 [background-image:linear-gradient(color-mix(in_srgb,currentColor_7%,transparent)_1px,transparent_1px),linear-gradient(90deg,color-mix(in_srgb,currentColor_7%,transparent)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black_30%,transparent_80%)] text-navy dark:text-white"
          aria-hidden="true"
        />
        <div
          className="absolute -z-10 -top-40 left-1/2 -translate-x-1/2 w-[900px] max-w-[140%] h-[420px] rounded-full blur-3xl bg-[color:color-mix(in_srgb,var(--brand-color)_18%,transparent)]"
          aria-hidden="true"
        />
        <div className={`${wrap} pt-14 pb-16 sm:pt-24 sm:pb-24 text-center`}>
          <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-950/70 backdrop-blur px-3.5 py-1.5 font-jakarta text-xs font-semibold text-gray-600 dark:text-gray-300">
            <span className="relative flex w-2 h-2" aria-hidden="true">
              <span className="absolute inline-flex w-full h-full rounded-full bg-brand opacity-60 animate-ping motion-reduce:animate-none" />
              <span className="relative inline-flex w-2 h-2 rounded-full bg-brand" />
            </span>
            About Udyaibase
          </span>
          <h1
            id="about-hero-heading"
            className="mt-6 font-sora font-extrabold tracking-tight text-[32px] leading-[1.1] sm:text-5xl md:text-6xl md:leading-[1.05] text-navy dark:text-white max-w-4xl mx-auto"
          >
            One place to track{' '}
            <span className="bg-gradient-to-r from-brand to-[color:color-mix(in_srgb,var(--brand-color)_60%,#f59e0b)] bg-clip-text text-transparent">
              India&apos;s AI startup ecosystem
            </span>
          </h1>
          <p className="mt-5 sm:mt-6 font-jakarta text-base sm:text-xl text-gray-500 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed">
            Founder stories, startups, AI tools, jobs, funding and events — connected in one
            independent platform, so India&apos;s AI startups get the visibility they deserve.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
            <Link href="/startups" className="btn-brand inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold">
              Explore AI startups <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
            <a
              href="#contact-heading"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-6 py-3 font-jakarta text-sm font-semibold text-navy dark:text-white hover:border-gray-300 dark:hover:border-gray-700 transition-colors"
            >
              Partner with us
            </a>
          </div>
          <ul className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-jakarta text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            <li className="inline-flex items-center gap-1.5"><BadgeCheck className="w-4 h-4 text-brand" aria-hidden="true" /> DPIIT-recognised startup</li>
            <li className="inline-flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-brand" aria-hidden="true" /> Independent &amp; free to use</li>
            <li className="inline-flex items-center gap-1.5"><Linkedin className="w-4 h-4 text-brand" aria-hidden="true" /> {LINKEDIN_FOLLOWERS} LinkedIn community</li>
          </ul>
        </div>
      </section>

      {/* ── Vision + Mission ──────────────────────────────── */}
      <div className={`${wrap} py-16 sm:py-24`}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
          {[
            {
              id: 'vision-heading', n: '01', label: 'Our Vision', icon: Eye,
              title: 'Give every AI startup the visibility it deserves',
              text: "Great Indian AI startups get buried on crowded global platforms. We believe great work shouldn't depend on who shouts the loudest — so we surface it.",
            },
            {
              id: 'mission-heading', n: '02', label: 'Our Mission', icon: Target,
              title: 'Bring the whole ecosystem into one place',
              text: "Who's raising, who's hiring, which tools work — today it's scattered across a dozen sites. We connect it, free to access, so founders and investors see the full picture in one visit.",
            },
          ].map((b) => (
            <section
              key={b.id}
              aria-labelledby={b.id}
              className="group relative overflow-hidden rounded-3xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 p-6 sm:p-9 transition-shadow hover:shadow-xl hover:shadow-black/5"
            >
              <span className="absolute top-4 right-6 font-sora font-extrabold text-6xl sm:text-7xl text-gray-100 dark:text-gray-900 select-none" aria-hidden="true">{b.n}</span>
              <span className={`relative w-12 h-12 rounded-2xl flex items-center justify-center ${tintIcon}`}>
                <b.icon className="w-6 h-6" aria-hidden="true" />
              </span>
              <p className="relative mt-6 font-sora text-xs font-bold uppercase tracking-[0.16em] text-brand">{b.label}</p>
              <h2 id={b.id} className="relative mt-2 font-sora font-extrabold tracking-tight text-xl sm:text-2xl text-navy dark:text-white">{b.title}</h2>
              <p className="relative mt-3 font-jakarta text-sm sm:text-base text-gray-600 dark:text-gray-400 leading-relaxed">{b.text}</p>
            </section>
          ))}
        </div>
      </div>

      {/* ── Ecosystem hub ─────────────────────────────────── */}
      <div className="border-y border-gray-100 dark:border-gray-900 bg-gray-50/70 dark:bg-white/[0.015]">
        <div className={`${wrap} py-16 sm:py-24`}>
          <EcosystemHub />
        </div>
      </div>

      {/* ── Verification ──────────────────────────────────── */}
      <div className={`${wrap} py-16 sm:py-24`}>
        <VerificationFlow />
      </div>

      {/* ── Growth loops ──────────────────────────────────── */}
      <div className="border-y border-gray-100 dark:border-gray-900 bg-gray-50/70 dark:bg-white/[0.015]">
        <div className={`${wrap} py-16 sm:py-24`}>
          <GrowthLoops />
        </div>
      </div>

      {/* ── Stats ─────────────────────────────────────────── */}
      <div className={`${wrap} pt-16 sm:pt-24`}>
        <PlatformStats stats={stats} />
      </div>

      {/* ── Values ────────────────────────────────────────── */}
      <section className={`${wrap} py-16 sm:py-24`} aria-labelledby="values-heading">
        <SectionHeader id="values-heading" eyebrow="Our Principles" title="What We Stand For" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
          {values.map((v, i) => (
            <div
              key={v.title}
              className="group rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 p-6 sm:p-7 transition-all duration-300 hover:-translate-y-0.5 hover:border-[color:color-mix(in_srgb,var(--brand-color)_30%,transparent)] hover:shadow-xl hover:shadow-black/5 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <div className="flex items-center justify-between">
                <span className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors group-hover:bg-brand group-hover:text-white ${tintIcon}`}>
                  <v.icon className="w-5 h-5" aria-hidden="true" />
                </span>
                <span className="font-sora text-xs font-bold text-gray-300 dark:text-gray-700" aria-hidden="true">0{i + 1}</span>
              </div>
              <h3 className="mt-5 font-sora font-bold text-base sm:text-lg text-navy dark:text-white">{v.title}</h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 font-jakarta leading-relaxed">{v.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── DPIIT Recognition ─────────────────────────────── */}
      <div className={wrap}>
        <section
          className="relative overflow-hidden rounded-3xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950"
          aria-labelledby="dpiit-heading"
        >
          <div className="flex h-1" aria-hidden="true">
            <span className="flex-1 bg-[#FF9933]" />
            <span className="flex-1 bg-white dark:bg-gray-200" />
            <span className="flex-1 bg-[#138808]" />
          </div>
          <div className="absolute inset-0 top-1 bg-gradient-to-r from-[#FF9933]/[0.06] via-transparent to-[#138808]/[0.06] pointer-events-none" aria-hidden="true" />
          <div className="relative p-6 sm:p-9 flex flex-col sm:flex-row items-start sm:items-center gap-6">
            {/* Official DPIIT / Startup India mark. The file has wide white margins, so the tile crops them. */}
            <div className="relative shrink-0 w-[200px] sm:w-[220px] aspect-[2/1] rounded-2xl overflow-hidden bg-white ring-1 ring-black/5 dark:ring-white/10 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.35)]">
              <Image
                src="/startup-india.png"
                alt="DPIIT #startupindia — Government of India"
                fill
                sizes="220px"
                className="object-cover scale-[1.12]"
              />
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="dpiit-heading" className="font-sora font-extrabold tracking-tight text-xl sm:text-2xl text-navy dark:text-white">
                  DPIIT Recognised Startup
                </h2>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#E07B00] bg-[#FF9933]/10 border border-[#FF9933]/25 px-2 py-0.5 rounded-full">
                  Startup India
                </span>
              </div>
              <p className="mt-2 font-jakarta text-sm sm:text-base text-gray-600 dark:text-gray-400 leading-relaxed max-w-3xl">
                Udyaibase Technologies Private Limited is recognised by the Department for Promotion of
                Industry and Internal Trade (DPIIT), Government of India, under the Startup India initiative.
              </p>
            </div>
            <div className="sm:text-right shrink-0 font-jakarta">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">CIN</p>
              <p className="mt-0.5 font-mono text-xs sm:text-sm text-gray-700 dark:text-gray-300">U63122AP2026PTC128342</p>
            </div>
          </div>
        </section>
      </div>

      {/* ── Founder ───────────────────────────────────────── */}
      <section className={`${wrap} py-16 sm:py-24`} aria-labelledby="founder-heading">
        <SectionHeader id="founder-heading" eyebrow="Leadership" title="The Founder" />
        <div className="grid grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)] lg:grid-cols-[340px_minmax(0,1fr)] gap-8 md:gap-12 items-center">
          <div className="relative mx-auto w-full max-w-[260px] md:max-w-[340px]">
            <div className="absolute -inset-3 rounded-[2rem] bg-gradient-to-br from-[color:color-mix(in_srgb,var(--brand-color)_35%,transparent)] to-transparent blur-2xl opacity-70" aria-hidden="true" />
            <div className="relative aspect-[4/5] rounded-3xl overflow-hidden border border-gray-100 dark:border-gray-800 bg-gray-100 dark:bg-gray-900">
              <Image
                src="/founder-venkatesh.png"
                alt="Lahori Venkatesh — Founder & Director, Udyaibase"
                fill
                sizes="(min-width: 1024px) 340px, (min-width: 768px) 300px, 90vw"
                className="object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent" aria-hidden="true" />
              <div className="absolute bottom-4 left-4 right-4">
                <p className="font-sora font-bold text-white text-base leading-tight">Lahori Venkatesh</p>
                <p className="font-jakarta text-xs text-white/75">Founder &amp; Director</p>
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-sora font-extrabold tracking-tight text-2xl sm:text-3xl text-navy dark:text-white">Lahori Venkatesh</h3>
            <div className="mt-3 flex flex-wrap gap-2 font-jakarta text-xs font-semibold">
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 bg-[color:color-mix(in_srgb,var(--brand-color)_10%,transparent)] text-brand">
                <Building2 className="w-3.5 h-3.5" aria-hidden="true" /> Founder &amp; Director, Udyaibase
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-300">
                <GraduationCap className="w-3.5 h-3.5" aria-hidden="true" /> MNIT Jaipur
              </span>
            </div>
            <div className="mt-6 space-y-4 font-jakarta text-gray-600 dark:text-gray-400 text-sm sm:text-base leading-relaxed">
              <p>
                Lahori Venkatesh is the Founder &amp; Director of Udyaibase, India&apos;s AI startup media and ecosystem platform, dedicated to showcasing AI startups, founders, AI tools, industry news, funding, and events.
              </p>
              <p>
                With a vision to build the go-to platform for India&apos;s AI ecosystem, he helps AI companies increase visibility, build credibility, and connect with customers, investors, partners, and talent through trusted media, community, and strategic partnerships.
              </p>
              <p>
                A graduate of Malaviya National Institute of Technology (MNIT) Jaipur, Lahori is passionate about making Indian AI innovation more discoverable through high-quality content and ecosystem building. Under his leadership, Udyaibase reaches India&apos;s AI startup community through {LINKEDIN_FOLLOWERS} LinkedIn followers{subscriberPhrase}.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Collaborate + Contact ─────────────────────────── */}
      <div className={`${wrap} pb-16 sm:pb-24`}>
        <section
          className="relative overflow-hidden rounded-3xl bg-gray-950 border border-white/10 p-6 sm:p-10 lg:p-12"
          aria-labelledby="contact-heading"
        >
          <div
            className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:36px_36px] [mask-image:radial-gradient(ellipse_at_top_left,black_20%,transparent_70%)]"
            aria-hidden="true"
          />
          <div className="absolute -top-32 -left-24 w-96 h-96 rounded-full blur-3xl bg-[color:color-mix(in_srgb,var(--brand-color)_30%,transparent)]" aria-hidden="true" />
          <div className="relative grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-8 lg:gap-12 items-center">
            <div>
              <p className="font-sora text-xs font-bold uppercase tracking-[0.16em] text-brand">Work with us</p>
              <h2 id="contact-heading" className="mt-3 font-sora font-extrabold tracking-tight text-2xl sm:text-4xl text-white">
                Let&apos;s build India&apos;s AI ecosystem together
              </h2>
              <p className="mt-3 font-jakarta text-sm sm:text-base text-gray-400 leading-relaxed max-w-md">
                Partnerships, getting your startup featured, advertising, or a correction — we read every message.
              </p>
              <div className="mt-7 flex flex-col sm:flex-row gap-3">
                <Link href="/contact" className="btn-brand inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold">
                  Contact us <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Link>
                <a
                  href="mailto:contact@udyaibase.com"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-6 py-3 font-jakarta text-sm font-semibold text-white/90 hover:bg-white/5 transition-colors"
                >
                  <Mail className="w-4 h-4" aria-hidden="true" /> contact@udyaibase.com
                </a>
              </div>
            </div>

            <ul className="space-y-3">
              {[
                { icon: Building2, title: 'Feature Your Startup', desc: `Get in front of our ${LINKEDIN_FOLLOWERS} LinkedIn followers — founders, investors and operators.`, href: 'mailto:contact@udyaibase.com?subject=Feature My Startup' },
                { icon: Handshake, title: 'Partner With Us', desc: "Sponsorships, media partnerships, co-promotions or advertising.", href: 'mailto:contact@udyaibase.com?subject=Partnership Inquiry' },
                { icon: BookOpen, title: 'Share Your Story', desc: "A founder with a story worth telling? Tell us what you're building.", href: 'mailto:contact@udyaibase.com?subject=Founder Story' },
              ].map((c) => (
                <li key={c.title}>
                  <a
                    href={c.href}
                    className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5 hover:bg-white/[0.06] hover:border-[color:color-mix(in_srgb,var(--brand-color)_45%,transparent)] transition-colors"
                  >
                    <span className="w-11 h-11 shrink-0 rounded-xl flex items-center justify-center bg-[color:color-mix(in_srgb,var(--brand-color)_18%,transparent)] text-brand">
                      <c.icon className="w-5 h-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-sora font-bold text-sm sm:text-base text-white">{c.title}</span>
                      <span className="block mt-0.5 font-jakarta text-xs sm:text-sm text-gray-400 leading-relaxed">{c.desc}</span>
                    </span>
                    <ArrowRight className="w-4 h-4 shrink-0 text-gray-500 transition-all group-hover:text-brand group-hover:translate-x-0.5" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
