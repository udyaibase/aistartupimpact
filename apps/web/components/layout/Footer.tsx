'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CookieSettingsLink } from '@/components/CookieConsent';
import Logo from '@/components/Logo';
import SubscribeForm from '@/components/SubscribeForm';
import { Check } from 'lucide-react';

type FooterLink = { label: string; href: string | null; soon?: boolean };
type FooterGroup = { title: string; links: FooterLink[] };

/** Each inner array is one column; a column can hold more than one titled group. */
const footerColumns: FooterGroup[][] = [
  [
    {
      title: 'Platform',
      links: [
        { label: 'AI Startups', href: '/startups' },
        { label: 'AI Tools', href: '/tools' },
        { label: 'AI Jobs', href: '/jobs' },
        { label: 'Events', href: '/events' },
        { label: 'Funding Digest', href: '/funding' },
        { label: 'India AI', href: '/india-ai' },
        { label: 'News', href: '/news' },
        { label: 'Founder Stories', href: '/stories' },
        { label: 'Opinion', href: '/opinions' },
      ],
    },
  ],
  [
    {
      title: 'For Founders',
      links: [
        { label: 'List Your Startup', href: '/submit-startup' },
        { label: 'Submit AI Tool', href: '/submit-tool' },
        { label: 'Founder Login', href: '/auth/login' },
        { label: 'Advertise', href: '/advertise' },
        { label: 'Pricing', href: '/hire/pricing' },
      ],
    },
  ],
  [
    {
      title: 'For Employers',
      links: [
        { label: 'Post a Job', href: '/employer/signup' },
        { label: 'Employer Login', href: '/employer/login' },
        { label: 'Pricing', href: '/hire/pricing' },
      ],
    },
    {
      title: 'For Event Hosts',
      links: [
        { label: 'Host an Event', href: '/organizer/signup' },
        { label: 'Organizer Login', href: '/organizer/login' },
      ],
    },
  ],
  [
    {
      title: 'Company',
      links: [
        { label: 'About', href: '/about' },
        { label: 'Careers', href: '/careers' },
        { label: 'Newsletter', href: '/newsletter' },
        { label: 'Contact', href: '/contact' },
        // Set the URL once the status page (BetterStack or Upptime) is live.
        { label: 'Status', href: null, soon: true },
      ],
    },
    {
      title: 'Support',
      links: [
        { label: 'Founder Support', href: '/founder/support' },
        { label: 'Employer Support', href: '/employer/support' },
        { label: 'Organizer Support', href: '/organizer/support' },
        { label: 'Refund Policy', href: '/refund' },
      ],
    },
  ],
];

/** Shown as one inline row above the bottom bar rather than a column, to keep the footer short. */
const legalLinks = [
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Terms of Service', href: '/terms' },
  { label: 'Cookie Policy', href: '/cookie-policy' },
  { label: 'Content Guidelines', href: '/content-guidelines' },
  { label: 'Copyright Policy', href: '/copyright' },
  { label: 'Trademark Policy', href: '/trademark' },
  { label: 'Verification Policy', href: '/verification-policy' },
  { label: 'Grievance Officer', href: '/privacy#grievance-officer' },
];

const socials = [
  {
    label: 'YouTube',
    href: 'https://www.youtube.com/@udyaibase',
    icon: (props: React.SVGProps<SVGSVGElement>) => (
      <svg {...props} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path fillRule="evenodd" d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.517 3.545 12 3.545 12 3.545s-7.517 0-9.388.508a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.871.508 9.388.508 9.388.508s7.517 0 9.388-.508a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    label: 'X (Twitter)',
    href: 'https://x.com/udyaibase',
    icon: (props: React.SVGProps<SVGSVGElement>) => (
      <svg {...props} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/company/udyaibase',
    icon: (props: React.SVGProps<SVGSVGElement>) => (
      <svg {...props} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path fillRule="evenodd" d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    label: 'Instagram',
    href: 'https://www.instagram.com/udyaibase/',
    icon: (props: React.SVGProps<SVGSVGElement>) => (
      <svg {...props} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path fillRule="evenodd" d="M12 0C8.74 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.051.014 8.333 0 8.74 0 12s.014 3.667.072 4.947c.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.257 0 3.666-.014 4.947-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.256-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.256 0 12 0zm0 5.838a6.162 6.162 0 1 1 0 12.324 6.162 6.162 0 0 1 0-12.324zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    label: 'Facebook',
    href: 'https://www.facebook.com/udyaibase',
    icon: (props: React.SVGProps<SVGSVGElement>) => (
      <svg {...props} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path fillRule="evenodd" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" clipRule="evenodd" />
      </svg>
    ),
  },
];

function DpiitBadge() {
  return (
    <a
      href="https://recognition-be.startupindia.gov.in/s3/download/document/RECOGNITION_CERTIFICATE/38a95db9-53f1-402f-9902-b80623c7f294.pdf"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2.5 px-3 py-2 rounded-lg border border-white/25 hover:border-white/40 transition-all duration-200 hover:scale-[1.02] h-[42px]"
      style={{ background: 'linear-gradient(135deg, rgba(255,153,51,0.25) 0%, rgba(255,255,255,0.12) 50%, rgba(19,136,8,0.25) 100%)' }}
    >
      <div className="relative flex-shrink-0 w-8 h-8">
        <svg viewBox="0 0 32 32" fill="none" className="w-full h-full" aria-hidden="true">
          <circle cx="16" cy="16" r="14.5" stroke="#FF9933" strokeWidth="2" fill="none" />
          <circle cx="16" cy="16" r="11" stroke="white" strokeWidth="1" fill="none" opacity="0.7" />
          <circle cx="16" cy="16" r="8" stroke="#138808" strokeWidth="1" fill="none" />
          {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((angle) => (
            <line
              key={angle}
              x1="16"
              y1="16"
              x2={16 + 5.5 * Math.cos((angle * Math.PI) / 180)}
              y2={16 + 5.5 * Math.sin((angle * Math.PI) / 180)}
              stroke="#000080"
              strokeWidth="0.5"
              opacity="0.6"
            />
          ))}
          <circle cx="16" cy="16" r="2" fill="#000080" opacity="0.7" />
          <circle cx="16" cy="16" r="1" fill="white" />
          <path d="M12 16.5l2.5 2.5 5.5-5.5" stroke="#138808" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] font-extrabold text-white uppercase tracking-widest leading-tight">DPIIT Recognised</span>
        <span className="text-[9px] font-semibold text-[#FF9933] tracking-wide leading-tight">Startup India · Govt. of India</span>
      </div>
    </a>
  );
}

/** Same shape as the DPIIT badge, in the MSME (Udyam) blue. Not a link: there is no public certificate URL yet. */
function MsmeBadge() {
  return (
    <div
      className="inline-flex items-center gap-2.5 px-3 py-2 rounded-lg border border-white/25 h-[42px]"
      style={{ background: 'linear-gradient(135deg, rgba(37,99,235,0.28) 0%, rgba(255,255,255,0.10) 55%, rgba(14,165,233,0.22) 100%)' }}
    >
      <div className="relative flex-shrink-0 w-8 h-8">
        <svg viewBox="0 0 32 32" fill="none" className="w-full h-full" aria-hidden="true">
          <circle cx="16" cy="16" r="14.5" stroke="#3B82F6" strokeWidth="2" fill="none" />
          <circle cx="16" cy="16" r="11" stroke="white" strokeWidth="1" fill="none" opacity="0.7" />
          <path d="M9.5 21.5v-7l3.25 4 3.25-4 3.25 4 3.25-4v7" stroke="#38BDF8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M11 10.5h10" stroke="white" strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />
        </svg>
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] font-extrabold text-white uppercase tracking-widest leading-tight">MSME Registered</span>
        <span className="text-[9px] font-semibold text-sky-300 tracking-wide leading-tight">Udyam · Govt. of India</span>
      </div>
    </div>
  );
}

function ProductHuntBadge() {
  return (
    <a
      href="https://www.producthunt.com/products/udyaibase?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-udyaibase"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center h-[42px]"
    >
      <img
        src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1271380&theme=light&t=1791626934574"
        alt="Udyaibase on Product Hunt"
        width={200}
        height={42}
        loading="lazy"
        className="h-[42px] w-auto"
      />
    </a>
  );
}

export default function Footer() {
  const pathname = usePathname();

  return (
    <footer className={`${pathname === '/newsletter' ? 'hidden md:block' : ''} bg-black relative`}>
      {/* Red top stroke with glow */}
      <div className="h-[2px] bg-brand shadow-[0_4px_20px_rgba(239,68,68,0.5)]" />
      <div className="h-6 bg-gradient-to-b from-[color:color-mix(in_srgb,var(--brand-color)_15%,transparent)] to-transparent" />

      {/* Newsletter card */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6">
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#17171b] via-[#0f0f12] to-[#0a0a0b]">
          {/* Faint grid, fading out toward the right */}
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)',
              backgroundSize: '28px 28px',
              maskImage: 'radial-gradient(ellipse 70% 90% at 15% 0%, black 30%, transparent 75%)',
              WebkitMaskImage: 'radial-gradient(ellipse 70% 90% at 15% 0%, black 30%, transparent 75%)',
            }}
            aria-hidden="true"
          />
          {/* Red highlight on the top edge + glow */}
          <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[color:color-mix(in_srgb,var(--brand-color)_70%,transparent)] to-transparent" aria-hidden="true" />
          <div className="pointer-events-none absolute -top-32 left-1/4 h-64 w-[28rem] rounded-full bg-[color:color-mix(in_srgb,var(--brand-color)_20%,transparent)] blur-[110px]" aria-hidden="true" />

          <div className="relative grid grid-cols-1 md:grid-cols-[1.15fr_1fr] items-center gap-7 md:gap-12 p-5 sm:p-10">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold text-gray-300 font-jakarta">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-brand opacity-75 animate-ping motion-reduce:animate-none" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand" />
                </span>
                Free weekly digest
              </span>
              <h2 className="mt-4 font-sora font-bold text-2xl sm:text-3xl tracking-tight text-white">
                India&apos;s{' '}
                <span className="bg-gradient-to-r from-white via-red-200 to-brand bg-clip-text text-transparent">AI Ecosystem</span>{' '}
                Digest
              </h2>
              <p className="mt-2 text-sm sm:text-[15px] text-gray-400 font-jakarta leading-relaxed max-w-lg">
                Weekly funding rounds, startup launches, AI tools and jobs — straight to your inbox.
              </p>
              <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-gray-300 font-jakarta">
                {['Funding rounds', 'Startup launches', 'AI tools', 'AI jobs'].map((item) => (
                  <li key={item} className="inline-flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-brand" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="w-full min-w-0">
              <SubscribeForm source="footer" buttonText="Subscribe" />
            </div>
          </div>
        </div>
      </div>

      {/* Main footer: brand block + 4 link columns */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-10 sm:pt-14 sm:pb-14">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-[1.7fr_1fr_1fr_1fr_1fr] gap-x-6 gap-y-8 lg:gap-8">
          {/* Brand block: full width on phones and tablets, first column on desktop */}
          <div className="col-span-2 sm:col-span-4 lg:col-span-1">
            <Link href="/" className="inline-block" aria-label="Udyaibase home">
              <Logo height={76} forceLight />
            </Link>
            <p className="text-gray-400 text-sm font-jakarta mt-4 leading-relaxed max-w-sm">
              India&apos;s AI startup ecosystem platform — tracking startups, tools, funding, jobs and events across the AI landscape.
            </p>

            <div className="mt-5 space-y-0.5 text-[11px] leading-relaxed text-gray-500 font-jakarta">
              <p className="text-gray-400 font-semibold">Udyaibase Technologies Private Limited</p>
              <p>CIN: U63122AP2026PTC128342</p>
              <p>GSTIN: 37AAECU2973K1ZU</p>
            </div>
            <address className="mt-3 not-italic text-[11px] leading-relaxed text-gray-500 font-jakarta">
              Dr. No. 40-6/3-3, Co-Operative Bank Colony,<br />
              Moghalrajpuram, Vijayawada (Urban),<br />
              Krishna – 520010, Andhra Pradesh, India
            </address>
          </div>

          {/* Link columns */}
          {footerColumns.map((groups) => (
            <div key={groups[0].title} className="space-y-7 sm:space-y-8">
              {groups.map((group) => (
                <div key={group.title}>
                  <h2 className="font-jakarta font-bold text-xs uppercase tracking-widest text-white mb-3 sm:mb-4">
                    {group.title}
                  </h2>
                  <ul className="space-y-2 sm:space-y-2.5">
                    {group.links.map((link) => (
                      <li key={link.label}>
                        {link.href ? (
                          <Link
                            href={link.href}
                            className="text-[12px] sm:text-sm font-jakarta transition-colors text-gray-400 hover:text-white"
                          >
                            {link.label}
                          </Link>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-[12px] sm:text-sm font-jakarta text-gray-500">
                            {link.label}
                            {link.soon && (
                              <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500 border border-gray-700 rounded px-1 py-px">
                                Soon
                              </span>
                            )}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Recognition badges: one row on tablet and desktop, stacked on phones */}
        <div className="mt-10 flex flex-col items-start gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          <DpiitBadge />
          <MsmeBadge />
          <ProductHuntBadge />
        </div>
      </div>

      {/* Bottom bar: legal links, then copyright + cookie settings + socials */}
      <div className="border-t border-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <nav aria-label="Legal" className="mb-5 sm:mb-6">
            <ul className="flex flex-wrap items-center justify-center gap-y-2 text-[12px] font-jakarta text-gray-500">
              {legalLinks.map((link, i) => (
                <li key={link.href} className="flex items-center">
                  {i > 0 && <span className="mx-2.5 text-gray-700" aria-hidden="true">·</span>}
                  <Link href={link.href} className="hover:text-white transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex flex-col md:flex-row items-center justify-between gap-5 md:gap-4 text-xs text-gray-500 font-jakarta">
            <span className="text-center md:text-left">
              &copy; {new Date().getFullYear()} Udyaibase Technologies Private Limited. All rights reserved.
            </span>

            <div className="flex items-center gap-5">
              <CookieSettingsLink className="hover:text-brand transition-colors" />
              <span className="text-gray-700" aria-hidden="true">·</span>
              {socials.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white hover:text-brand transition-colors duration-250 transform hover:scale-110"
                  aria-label={s.label}
                >
                  <s.icon className="w-5 h-5" />
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
