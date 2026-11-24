import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', 'date-fns', 'react-simple-maps'],
    // Keep visited dynamic pages in the browser for 30s so back/forward doesn't show a skeleton again
    // (default 0). Static pages already keep 300s.
    staleTimes: { dynamic: 30 },
  },
  // Images are never optimised by Vercel (billed per transformation): every next/image goes through
  // lib/image-loader.ts, which serves our media from Cloudflare (resized there when enabled).
  // remotePatterns only matters for the default optimiser, which is unused; kept to our own hosts so
  // /_next/image can't be used to process other people's images.
  images: {
    loader: 'custom',
    loaderFile: './lib/image-loader.ts',
    remotePatterns: [
      { protocol: 'https', hostname: 'media.udyaibase.com' },
    ],
  },
  async redirects() {
    return [
      { source: '/opinion', destination: '/opinions', permanent: true },
      { source: '/opinion/:slug', destination: '/opinions/:slug', permanent: true },
      { source: '/author/:slug', destination: '/authors/:slug', permanent: true },
      // Per-job applicants moved to the Candidates board, filtered to the job.
      { source: '/employer/jobs/:id/applications', destination: '/employer/applications?job=:id', permanent: false },
      { source: '/employer/promote', destination: '/employer/billing', permanent: true },
    ];
  },
  async headers() {
    const isDev = process.env.NODE_ENV !== 'production';
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://www.googletagmanager.com https://www.google-analytics.com https://va.vercel-scripts.com https://challenges.cloudflare.com https://checkout.razorpay.com`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://udyaibase.com https://media.udyaibase.com https://www.google-analytics.com https://vitals.vercel-insights.com https://va.vercel-scripts.com https://challenges.cloudflare.com https://api.razorpay.com https://lumberjack.razorpay.com",
      "frame-ancestors 'none'",
      // Sentry Session Replay compresses in a web worker created from a blob.
      "worker-src 'self' blob:",
      "frame-src 'self' https://challenges.cloudflare.com https://api.razorpay.com https://checkout.razorpay.com",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join('; ');

    return [
      {
        source: '/((?!embed).*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
      {
        // The cacheable policy for public pages. The signed-in portals (/founder, /employer, /organizer) get a stricter
        // per-request one with a nonce from middleware.ts (lib/csp.ts) instead, so they're left out here. "founder/"
        // or a bare "founder" only: public pages such as /founder-team keep this policy.
        source: '/((?!embed|founder/|founder$|employer/|employer$|organizer/|organizer$).*)',
        headers: [{ key: 'Content-Security-Policy', value: csp }],
      },
      {
        // Pages that frame the events widget or Razorpay checkout (billing, paid event tickets, funding data packs) can't
        // require COEP: those frames don't send it.
        // /careers is the jobs widget (it frames /embed/jobs/...).
        source: '/((?!embed|events|organizer/embed|organizer/billing|employer/careers|employer/billing|funding|careers).*)',
        headers: [{ key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' }],
      },
      {
        // Organizer portal: check-in scans tickets with the phone's camera. The policy belongs to the page that was first
        // loaded, not the one on screen: the portal (and the installed app) moves between pages without reloading, so
        // allowing the camera on /organizer/check-in alone wasn't enough. Opened from the dashboard or the bottom bar,
        // check-in kept the dashboard's camera=() and phones refused the camera without asking, so it never appeared in
        // the app's permissions (only "Sound" did). Allowed on the whole portal; the check-in page also reloads itself
        // if it was reached from a page that still blocks it (e.g. the home page the installed app starts on).
        // Declared after the site-wide block and before the billing rule, so billing keeps its own policy.
        source: '/organizer/:path*',
        headers: [
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=()' },
        ],
      },
      {
        // Pages that open Razorpay Checkout (lib/billing/checkout-client.ts and the ticket modal). Razorpay opens popups
        // for netbanking and 3-D Secure that report back to this window, so the opener must survive
        // (same-origin-allow-popups, not same-origin), and its frames may use the Payment Request API (Google Pay).
        // Declared after the site-wide block so these values replace it on these paths only.
        source: '/((?:funding|events/[^/]+|employer/billing|organizer/billing)(?:/.*)?)',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://api.razorpay.com" "https://checkout.razorpay.com"), usb=(), bluetooth=()' },
        ],
      },
      {
        // "Get notified" confirm and unsubscribe links carry a private token in the URL.
        source: '/job-alerts',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
      {
        // Talent pool leave/extend links carry a signed token in the URL.
        source: '/talent-pool',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
      {
        // Candidate status links carry a private token in the URL: never send it as a Referer.
        source: '/applications/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
      {
        // The certificate page shows this PDF in a frame (same origin only). Without these the site-wide
        // "frame-ancestors 'none'" / DENY applied and the preview box was always empty.
        source: '/api/certificates/:code/pdf',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; frame-ancestors 'self'" },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
      {
        // The resume viewer in the candidate panel frames this route (same origin only). Declared after the
        // site-wide block so these replace "frame-ancestors 'none'" / DENY here. The PDF is our own response,
        // so it gets a minimal policy: nothing loads, nothing runs, and only our pages may frame it.
        source: '/api/employer/applications/:id/resume',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; frame-ancestors 'self'" },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
      {
        source: '/embed/loader.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=3600, s-maxage=3600' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  silent: !process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  // Browser errors go to Sentry through this path on our own domain. Sent straight to Sentry they are blocked by
  // the Content-Security-Policy above (connect-src lists no Sentry host), so client errors were never reported.
  tunnelRoute: "/monitoring",
  hideSourceMaps: true,
  disableLogger: true,
});
