import { jsonLd } from "@/lib/json-ld";
import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import { Sora, Plus_Jakarta_Sans, Bebas_Neue } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import ThemeProvider from '@/components/ThemeProvider';
import NavigationProgress from '@/components/NavigationProgress';
import AnalyticsTracker from '@/components/Analytics';
import CookieConsent from '@/components/CookieConsent';
import GoogleAnalytics from '@/components/GoogleAnalytics';
import ClearConsentButton from '@/components/ClearConsentButton';
import ScrollRestoration from '@/components/ScrollRestoration';
import { ScrollToTop } from '@/components/ClientOnly';
import NewsletterPopup from '@/components/NewsletterPopup';
import SignupSuccessPopup from '@/components/auth/SignupSuccessPopup';
import SiteChrome from '@/components/SiteChrome';
import { generateWebSiteSchema, generateOrganizationSchema } from '@/lib/seo';
import { getBrandConfig } from '@/lib/brand';
import { getSeoConfig } from '@/lib/seo-config';
import { buildGoogleFontsUrl } from '@/lib/font-registry';
import './globals.css';

// Only load the two fonts actually used in UI — JetBrains is code-only, loaded on demand
const sora = Sora({
  subsets: ['latin'],
  variable: '--font-sora',
  display: 'swap',
  preload: true,
  weight: ['400', '600', '700', '800'],
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
  preload: true,
  weight: ['400', '500', '600', '700'],
});

const bebasNeue = Bebas_Neue({
  subsets: ['latin'],
  variable: '--font-bebas',
  display: 'swap',
  weight: '400',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#030712' },
  ],
};

export async function generateMetadata(): Promise<Metadata> {
  const [seo, brand] = await Promise.all([getSeoConfig(), getBrandConfig()]);
  const siteName = seo.metaTitle.split(/\s[–—|-]\s/)[0]?.trim() || 'Udyaibase';
  const ogImage = brand.ogImage || '/og-image.png';

  return {
    metadataBase: new URL(seo.canonicalDomain),
    alternates: { canonical: '/' },
    title: {
      default: seo.metaTitle,
      template: `%s | ${siteName}`,
    },
    description: seo.metaDescription,
    keywords: [
      'ai startups india 2026', 'Krutrim AI', 'India AI news', 'best AI tools India',
      'Sarvam AI', 'India AI ecosystem', 'Bhavish Aggarwal AI', 'AI funding India 2026',
      'top AI companies India', 'Sarvam AI funding', 'AI startup news India', 'IndiaAI Mission',
      'India AI unicorn', 'AI jobs India', 'best AI assistant India', 'India AI funding tracker',
      'Neysa AI India', 'sovereign AI India', 'AI newsletter India', 'Indian AI founder stories',
      'udyaibase', 'AI startups India', 'India AI startup news',
      'AI startup funding India 2026', 'Indian AI ecosystem', 'AI founder stories India',
      'India artificial intelligence news', 'AI startup news', 'IndiaAI startup ecosystem',
    ],
    openGraph: {
      title: seo.metaTitle,
      description: seo.metaDescription,
      url: seo.canonicalDomain,
      siteName,
      type: 'website',
      locale: 'en_IN',
      images: [{ url: ogImage, width: 1200, height: 630, alt: seo.metaTitle }],
    },
    twitter: {
      card: 'summary_large_image',
      site: seo.twitterHandle,
      creator: seo.twitterHandle,
      title: seo.metaTitle,
      description: seo.metaDescription,
    },
    robots: {
      index: !seo.noindex,
      follow: !seo.noindex,
      googleBot: {
        index: !seo.noindex,
        follow: !seo.noindex,
        'max-image-preview': 'large' as const,
        'max-snippet': -1,
      },
    },
    ...(seo.gscVerification ? { verification: { google: seo.gscVerification } } : {}),
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [seo, brand] = await Promise.all([getSeoConfig(), getBrandConfig()]);
  const websiteSchema = generateWebSiteSchema(seo);
  const orgSchema = generateOrganizationSchema(seo, brand);
  const gaId = seo.gaId || process.env.NEXT_PUBLIC_GA_ID;

  return (
    <html
      lang="en"
      className={`${sora.variable} ${jakarta.variable} ${bebasNeue.variable}`}
      suppressHydrationWarning
    >
      <head>
        {brand.favicon && <link rel="icon" href={brand.favicon} />}
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        {/* Dynamic Google Fonts for brand typography */}
        {(() => {
          const fontsToLoad = [brand.displayFont, brand.bodyFont].filter(Boolean) as string[];
          const url = fontsToLoad.length > 0 ? buildGoogleFontsUrl(fontsToLoad) : null;
          return url ? (
            <>
              <link rel="preconnect" href="https://fonts.googleapis.com" />
              <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
              <link rel="stylesheet" href={url} />
            </>
          ) : null;
        })()}
        {/* Custom font files uploaded via admin */}
        {brand.customDisplayFontUrl && brand.customDisplayFontName && (
          <style dangerouslySetInnerHTML={{ __html: `@font-face { font-family: '${brand.customDisplayFontName}'; src: url('${brand.customDisplayFontUrl}') format('woff2'); font-display: swap; }` }} />
        )}
        {brand.customBodyFontUrl && brand.customBodyFontName && (
          <style dangerouslySetInnerHTML={{ __html: `@font-face { font-family: '${brand.customBodyFontName}'; src: url('${brand.customBodyFontUrl}') format('woff2'); font-display: swap; }` }} />
        )}
        {/* Inject brand colors + font overrides as CSS custom properties */}
        <style dangerouslySetInnerHTML={{ __html: `:root { --brand-color: ${brand.brandColor}; --brand-secondary: ${brand.brandSecondary}; --brand-tertiary: ${brand.brandTertiary};${brand.customDisplayFontName || brand.displayFont ? ` --font-brand-display: '${brand.customDisplayFontName || brand.displayFont}', sans-serif;` : ''}${brand.customBodyFontName || brand.bodyFont ? ` --font-brand-body: '${brand.customBodyFontName || brand.bodyFont}', sans-serif;` : ''} }` }} />
        {/* Prevent FOUC — set dark class before paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('ub-theme');if(t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`,
          }}
        />
        {/* GA Consent Mode v2 defaults — must run before GA library loads */}
        {gaId && gaId !== 'G-XXXXXXXXXX' && (
          <script
            dangerouslySetInnerHTML={{
              __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',wait_for_update:500});gtag('js',new Date());`,
            }}
          />
        )}
      </head>
      <body className="font-jakarta antialiased bg-page dark:bg-page-dark text-charcoal dark:text-gray-100" suppressHydrationWarning>
        {/* Site-level structured data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd(websiteSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd(orgSchema) }}
        />
        <ThemeProvider>
          <SiteChrome>
            <Suspense fallback={null}>
              <NavigationProgress />
            </Suspense>
            <AnalyticsTracker />
            <ScrollRestoration />
          </SiteChrome>
          {children}
          <SiteChrome>
            {/* <NewsletterPopup /> */}
            <SignupSuccessPopup />
            <ScrollToTop />
            <CookieConsent />
            {gaId && <GoogleAnalytics measurementId={gaId} />}
            <ClearConsentButton />
          </SiteChrome>
        </ThemeProvider>
        <SiteChrome>
          <Analytics />
          <SpeedInsights />
        </SiteChrome>
      </body>
    </html>
  );
}
