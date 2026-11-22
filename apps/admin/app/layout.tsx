import type { Metadata } from 'next';
import { Sora, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import ThemeProvider from '@/components/ThemeProvider';
import { NextAuthProvider } from '@/components/NextAuthProvider';
import { ToastProvider } from '@/components/Toast';
import './globals.css';
import { connection } from 'next/server';
import { THEME_SCRIPT } from '@/lib/csp';

const sora = Sora({
  subsets: ['latin'],
  variable: '--font-sora',
  display: 'swap',
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Udyaibase — India\'s AI Startup Ecosystem',
    template: '%s | Udyaibase',
  },
  description:
    'India\'s definitive source for AI startup news, tools, funding data, and ecosystem intelligence.',
  metadataBase: new URL('https://udyaibase.com'),
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    siteName: 'Udyaibase',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    creator: '@aikitstartup',
  },
  robots: { index: true, follow: true },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Every admin page renders per request, so each carries the nonce of its CSP (middleware.ts, lib/csp.ts).
  await connection();
  return (
    <html
      lang="en"
      className={`${sora.variable} ${jakarta.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Prevent FOUC — set dark class before paint */}
        <script
          dangerouslySetInnerHTML={{
            // Fixed text: the CSP allows it by hash (lib/csp.ts).
            __html: THEME_SCRIPT,
          }}
        />
      </head>
      <body className="font-jakarta antialiased bg-white dark:bg-gray-950 text-charcoal dark:text-gray-100 transition-colors duration-300">
        <NextAuthProvider>
          <ThemeProvider>
            <ToastProvider>
              {children}
            </ToastProvider>
          </ThemeProvider>
        </NextAuthProvider>
      </body>
    </html>
  );
}
