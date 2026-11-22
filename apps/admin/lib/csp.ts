/**
 * Content-Security-Policy for the admin app, with a fresh nonce per request (set in middleware.ts).
 *
 * Every admin page renders per request (app/layout.tsx calls connection()), so inline scripts are allowed only with
 * this request's nonce, which Next.js adds to its own scripts. An injected <script> or inline event handler has no
 * nonce, so it doesn't run. The layout's one fixed inline script (THEME_SCRIPT) is allowed by its hash.
 * https: and 'unsafe-inline' are only for very old browsers: browsers that understand nonces ignore them.
 */

/** Sets the dark theme before the first paint (app/layout.tsx). Its hash is THEME_SCRIPT_HASH; a test checks it. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('ub-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`;

export const THEME_SCRIPT_HASH = "'sha256-Q5tHL7LO4egJI67BPi1T3peubn1MHHv9UCV+OADJhSw='";

export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function buildAdminCsp(nonce: string, isDev = process.env.NODE_ENV !== 'production'): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${THEME_SCRIPT_HASH}${isDev ? " 'unsafe-eval'" : ''} https: 'unsafe-inline'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://media.udyaibase.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}
