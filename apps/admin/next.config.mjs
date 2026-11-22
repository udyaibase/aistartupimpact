import { withSentryConfig } from "@sentry/nextjs";
import { execSync } from "node:child_process";

// Build metadata for Settings → System Info (Vercel's own git variables take precedence at runtime)
function gitValue(cmd) {
  try { return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return ""; }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The career scraper renders JavaScript-heavy pages with headless Chromium; on Vercel it uses @sparticuz/chromium,
  // whose compressed browser must ship with that one function.
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
  // Image uploads go through Server Actions (default limit 1 MB). The editor shrinks big photos first;
  // this leaves headroom while staying under Vercel's 4.5 MB request limit.
  experimental: {
    serverActions: { bodySizeLimit: '4mb' },
  },
  outputFileTracingIncludes: {
    '/api/admin/scrape-careers': ['../../node_modules/@sparticuz/chromium/bin/**'],
  },
  env: {
    BUILD_TIME: new Date().toISOString(),
    BUILD_COMMIT_SHA: gitValue("git rev-parse HEAD"),
    BUILD_COMMIT_REF: gitValue("git rev-parse --abbrev-ref HEAD"),
  },
  // The admin app has no next/image; turn the optimiser off so /_next/image can't be used (or billed).
  images: {
    unoptimized: true,
  },
  async redirects() {
    return [
      {
        source: '/',
        destination: '/dashboard',
        permanent: true,
      },
    ];
  },
  async headers() {
    // Fallback policy: pages the middleware doesn't run on (sign-in). Every other page also gets a stricter
    // per-request policy with a nonce from middleware.ts (lib/csp.ts). No database host here: only server code talks
    // to the database. 'unsafe-eval' only in development (React's dev tooling needs it).
    const isDev = process.env.NODE_ENV !== 'production';
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://media.udyaibase.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; ');

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  silent: !process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
});
