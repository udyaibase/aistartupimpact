/**
 * Content-Security-Policy for the signed-in areas (founder, employer and organizer portals).
 *
 * Public pages keep the cacheable policy in next.config.mjs, which has to allow inline scripts: Next.js adds inline
 * scripts to every page, and a page can only carry a nonce if it's rendered for each request. The portals already
 * render per request (they read the sign-in), so here each request gets a fresh nonce and inline scripts are allowed
 * only with that nonce. An injected <script> has no nonce, so it doesn't run.
 *
 * - Next.js puts the nonce on its own scripts by itself when it sees this header on the request (see middleware.ts).
 * - 'strict-dynamic' lets those trusted scripts load others (Razorpay checkout, Turnstile, Google Analytics).
 * - The root layout's two fixed inline scripts are allowed by their hash (below), so the layout stays static.
 * - https: and 'unsafe-inline' are only for very old browsers: browsers that understand nonces ignore them.
 */

/** Sets the dark theme before the first paint (app/layout.tsx). Its hash is in INLINE_SCRIPT_HASHES. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('ub-theme');if(t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`;

/** Google Analytics consent defaults, before the GA library loads (app/layout.tsx). Its hash is in INLINE_SCRIPT_HASHES. */
export const GA_CONSENT_SCRIPT = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',wait_for_update:500});gtag('js',new Date());`;

/** sha256 of THEME_SCRIPT and GA_CONSENT_SCRIPT. A test fails if a script changes without its hash. */
export const INLINE_SCRIPT_HASHES = [
  "'sha256-Qvk8OX/8elRUKaz3VJ5ROkARi7yytvGFhmygHdu+wa8='",
  "'sha256-AqtawWulLwhNEQ3cRcuG5HemqG/4d7dHBqhhqF0rr8I='",
];

/** The portals: these get the per-request policy. */
export function isPortalPath(pathname: string): boolean {
  return ['/founder', '/employer', '/organizer'].some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** A fresh random nonce (base64), for one response. */
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function buildPortalCsp(nonce: string, isDev = process.env.NODE_ENV !== 'production'): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${INLINE_SCRIPT_HASHES.join(' ')}${isDev ? " 'unsafe-eval'" : ''} https: 'unsafe-inline'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://udyaibase.com https://media.udyaibase.com https://www.google-analytics.com https://vitals.vercel-insights.com https://va.vercel-scripts.com https://challenges.cloudflare.com https://api.razorpay.com https://lumberjack.razorpay.com",
    "frame-ancestors 'none'",
    "worker-src 'self' blob:",
    "frame-src 'self' https://challenges.cloudflare.com https://api.razorpay.com https://checkout.razorpay.com",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}
