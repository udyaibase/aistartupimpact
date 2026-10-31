import { jsonLd } from "@/lib/json-ld";
import type { Metadata } from 'next';
import Link from 'next/link';
import { Mail, MapPin, Clock, MessageSquare, Phone, Building2, Handshake, Newspaper, BriefcaseBusiness } from 'lucide-react';
import ContactForm from './ContactForm';

export const metadata: Metadata = {
  title: 'Contact Udyaibase — Partnerships, Press & Support',
  description:
    'Reach the Udyaibase team for startup listings, partnerships, advertising, press inquiries, bug reports, or general feedback. Based in Vijayawada, Andhra Pradesh.',
  alternates: { canonical: '/contact' },
  keywords: [
    'contact udyaibase',
    'udyaibase support',
    'AI startup listing contact',
    'udyaibase partnership',
    'advertise on udyaibase',
    'AI tools directory contact',
  ],
  openGraph: {
    title: 'Contact Udyaibase — Partnerships, Press & Support',
    description:
      'Reach the Udyaibase team for startup listings, partnerships, advertising, press inquiries, or feedback. Based in Vijayawada, India.',
    url: 'https://udyaibase.com/contact',
  },
};

const contactInfo = [
  {
    icon: Mail,
    label: 'Email',
    value: 'hello@udyaibase.com',
    href: 'mailto:hello@udyaibase.com',
    description: 'For all inquiries',
  },
  {
    icon: Phone,
    label: 'Phone',
    value: '+91 91829 28956',
    href: 'tel:+919182928956',
    description: 'Mon–Sat, 10 AM – 6 PM IST',
  },
  {
    icon: MapPin,
    label: 'Registered Office',
    value: 'Dr.No: 40-6/3-3, Co-Operative Bank Colony, Moghalrajpuram, Vijayawada (Urban), Krishna- 520010, Andhra Pradesh',
  },
  {
    icon: Clock,
    label: 'Response Time',
    value: 'Within 24–48 hours',
  },
];

const quickLinks = [
  {
    icon: Building2,
    title: 'List Your Startup',
    description: 'Get your AI startup featured in our directory and reach 50K+ professionals.',
    href: '/submit-startup',
    cta: 'Submit Startup',
  },
  {
    icon: Handshake,
    title: 'Partner With Us',
    description: 'Sponsorships, media partnerships, co-promotions, or advertising opportunities.',
    href: 'mailto:hello@udyaibase.com?subject=Partnership Inquiry',
    cta: 'Get in Touch',
  },
  {
    icon: Newspaper,
    title: 'Press & Media',
    description: 'Press kits, interviews, quotes, or media coverage requests.',
    href: 'mailto:hello@udyaibase.com?subject=Press Inquiry',
    cta: 'Press Inquiry',
  },
  {
    icon: BriefcaseBusiness,
    title: 'Post a Job',
    description: 'Reach AI talent across India by posting on our jobs board.',
    href: '/employer/signup',
    cta: 'Post a Job',
  },
];

function ContactJsonLd() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Udyaibase',
    legalName: 'Udyaibase Technologies Private Limited',
    url: 'https://udyaibase.com',
    logo: 'https://udyaibase.com/logo.png',
    contactPoint: [
      {
        '@type': 'ContactPoint',
        telephone: '+91-91829-28956',
        contactType: 'customer support',
        email: 'hello@udyaibase.com',
        availableLanguage: ['English', 'Hindi', 'Telugu'],
        areaServed: 'IN',
      },
    ],
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Dr.No: 40-6/3-3, Co-Operative Bank Colony, Moghalrajpuram',
      addressLocality: 'Vijayawada',
      addressRegion: 'Andhra Pradesh',
      postalCode: '520010',
      addressCountry: 'IN',
    },
    sameAs: [
      'https://www.linkedin.com/company/udyaibase',
      'https://x.com/udyaibase',
      'https://www.youtube.com/@udyaibase',
      'https://www.instagram.com/udyaibase/',
      'https://www.facebook.com/udyaibase',
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLd(schema) }}
    />
  );
}

export default function ContactPage() {
  return (
    <>
      <ContactJsonLd />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-14">

        {/* Hero */}
        <div className="text-center mb-10 sm:mb-14">
          <span className="inline-block text-brand text-xs font-bold uppercase tracking-widest mb-3 font-sora">
            Get in Touch
          </span>
          <h1 className="font-sora font-extrabold text-2xl sm:text-4xl text-navy dark:text-white">
            We&apos;d Love to Hear From You
          </h1>
          <p className="text-gray-500 dark:text-gray-400 font-jakarta text-sm sm:text-base mt-3 max-w-2xl mx-auto leading-relaxed">
            Whether it&apos;s a partnership, listing request, press inquiry, or feedback — our team is here to help.
            We typically respond within 24–48 hours.
          </p>
        </div>

        {/* Quick Action Cards */}
        <section className="mb-10 sm:mb-14" aria-label="Quick actions">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {quickLinks.map((item) => (
              <Link
                key={item.title}
                href={item.href}
                className="card p-4 sm:p-5 flex flex-col gap-3 group hover:border-brand/40 transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-brand/10 dark:bg-brand/20 flex items-center justify-center shrink-0 group-hover:bg-brand transition-colors">
                  <item.icon className="w-4 h-4 text-brand group-hover:text-white transition-colors" />
                </div>
                <div>
                  <h2 className="font-sora font-bold text-sm text-navy dark:text-white group-hover:text-brand transition-colors">
                    {item.title}
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta mt-1 leading-relaxed line-clamp-2">
                    {item.description}
                  </p>
                </div>
                <span className="mt-auto text-xs font-semibold font-jakarta text-brand">
                  {item.cta} &rarr;
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Form + Contact Info */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8">
          {/* Form */}
          <div className="lg:col-span-3">
            <h2 className="font-sora font-bold text-lg text-navy dark:text-white mb-4">
              Send Us a Message
            </h2>
            <ContactForm />
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="font-sora font-bold text-lg text-navy dark:text-white mb-4">
              Contact Information
            </h2>

            {contactInfo.map((item) => (
              <div key={item.label} className="card p-4 sm:p-5 hover:shadow-none">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-brand/10 dark:bg-brand/20 flex items-center justify-center shrink-0">
                    <item.icon className="w-4 h-4 text-brand" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-400 dark:text-gray-500 font-jakarta uppercase tracking-wider">
                      {item.label}
                    </p>
                    {item.href ? (
                      <a href={item.href} className="text-sm font-jakarta text-brand hover:underline mt-0.5 block">
                        {item.value}
                      </a>
                    ) : (
                      <p className="text-sm font-jakarta text-gray-700 dark:text-gray-300 mt-0.5">
                        {item.value}
                      </p>
                    )}
                    {item.description && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 font-jakarta mt-0.5">
                        {item.description}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Support hint */}
            <div className="card p-4 sm:p-5 hover:shadow-none">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-brand/10 dark:bg-brand/20 flex items-center justify-center shrink-0">
                  <MessageSquare className="w-4 h-4 text-brand" />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 dark:text-gray-500 font-jakarta uppercase tracking-wider">
                    Support
                  </p>
                  <p className="text-sm font-jakarta text-gray-700 dark:text-gray-300 mt-0.5">
                    Logged-in users can also raise tickets from their dashboard
                  </p>
                </div>
              </div>
            </div>

            {/* FAQ hint */}
            <div className="card p-4 sm:p-5 bg-amber-50/50 dark:bg-amber-900/10 border-amber-200/50 dark:border-amber-800/30 hover:shadow-none">
              <p className="text-xs font-bold text-amber-600 dark:text-amber-400 font-jakarta uppercase tracking-wider mb-1">
                Before you write
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 font-jakarta leading-relaxed">
                For startup or tool listing issues, try re-submitting from your{' '}
                <a href="/founder/login" className="text-brand hover:underline">founder dashboard</a>.
                For job board questions, visit{' '}
                <a href="/employer/login" className="text-brand hover:underline">employer settings</a>.
              </p>
            </div>

            {/* Company info */}
            <div className="card p-4 sm:p-5 bg-gray-50/50 dark:bg-gray-800/50 hover:shadow-none">
              <p className="text-xs font-bold text-gray-400 dark:text-gray-500 font-jakarta uppercase tracking-wider mb-1">
                Company
              </p>
              <p className="text-sm font-jakarta text-gray-700 dark:text-gray-300 font-semibold">
                Udyaibase Technologies Private Limited
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta mt-1">
                DPIIT Recognised Startup · CIN: U63122AP2026PTC128342
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
