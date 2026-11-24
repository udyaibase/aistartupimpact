import { describe, it, expect, beforeAll } from 'vitest';

const nextConfigModule = await import('../../next.config.mjs') as any;
const config = nextConfigModule.default?.__esModule
  ? nextConfigModule.default.default
  : nextConfigModule.default;

async function getConfiguredHeaders(): Promise<Array<{ key: string; value: string }>> {
  const resolved = typeof config === 'function' ? await config : config;
  if (resolved?.headers) {
    const result = await resolved.headers();
    // The site-wide rules (everything but /embed); the public CSP is its own rule because it leaves out the signed-in
    // portals, which get a per-request nonce policy from middleware.ts instead.
    return result.filter((r: { source: string }) => r.source.startsWith('/((?!embed')).flatMap((r: { headers: Array<{ key: string; value: string }> }) => r.headers);
  }
  throw new Error('Could not find headers function in next.config');
}

describe('Security headers — next.config.mjs', () => {
  let headers: Array<{ key: string; value: string }>;

  beforeAll(async () => {
    headers = await getConfiguredHeaders();
  });

  function findHeader(name: string) {
    return headers.find(h => h.key.toLowerCase() === name.toLowerCase());
  }

  it('sets X-Content-Type-Options to nosniff', () => {
    const h = findHeader('X-Content-Type-Options');
    expect(h).toBeDefined();
    expect(h!.value).toBe('nosniff');
  });

  it('sets X-Frame-Options to DENY', () => {
    const h = findHeader('X-Frame-Options');
    expect(h).toBeDefined();
    expect(h!.value).toBe('DENY');
  });

  it('sets HSTS with includeSubDomains and preload', () => {
    const h = findHeader('Strict-Transport-Security');
    expect(h).toBeDefined();
    expect(h!.value).toContain('max-age=');
    const maxAge = parseInt(h!.value.match(/max-age=(\d+)/)?.[1] || '0');
    expect(maxAge).toBeGreaterThanOrEqual(31536000);
    expect(h!.value).toContain('includeSubDomains');
    expect(h!.value).toContain('preload');
  });

  it('sets Referrer-Policy to strict-origin-when-cross-origin', () => {
    const h = findHeader('Referrer-Policy');
    expect(h).toBeDefined();
    expect(h!.value).toBe('strict-origin-when-cross-origin');
  });

  it('sets Permissions-Policy denying sensitive APIs', () => {
    const h = findHeader('Permissions-Policy');
    expect(h).toBeDefined();
    expect(h!.value).toContain('camera=()');
    expect(h!.value).toContain('microphone=()');
    expect(h!.value).toContain('geolocation=()');
    expect(h!.value).toContain('payment=()');
  });

  it('sets Content-Security-Policy', () => {
    const h = findHeader('Content-Security-Policy');
    expect(h).toBeDefined();
    expect(h!.value).toContain("default-src 'self'");
    expect(h!.value).toContain("object-src 'none'");
    expect(h!.value).toContain("frame-ancestors 'none'");
    expect(h!.value).toContain("base-uri 'self'");
    expect(h!.value).toContain("form-action 'self'");
  });

  it('the public CSP leaves out the portals (they get the nonce policy) but not public pages like /founder-team', async () => {
    const resolved = typeof config === 'function' ? await config : config;
    const rule = (await resolved.headers()).find((r: { headers: Array<{ key: string }> }) => r.headers.some((h) => h.key === 'Content-Security-Policy'));
    const re = new RegExp(`^${rule.source.replace(/^\//, '\\/')}$`);
    for (const p of ['/founder', '/founder/dashboard', '/employer/login', '/organizer/check-in', '/embed/abc']) expect(re.test(p)).toBe(false);
    for (const p of ['/', '/founder-team', '/events', '/stories/x']) expect(re.test(p)).toBe(true);
  });

  it('CSP blocks inline scripts except self and trusted origins', () => {
    const h = findHeader('Content-Security-Policy');
    expect(h).toBeDefined();
    expect(h!.value).toContain("script-src 'self'");
    expect(h!.value).not.toContain("script-src *");
    expect(h!.value).not.toContain("script-src 'unsafe-eval'");
  });

  it('sets Cross-Origin-Opener-Policy to same-origin', () => {
    const h = findHeader('Cross-Origin-Opener-Policy');
    expect(h).toBeDefined();
    expect(h!.value).toBe('same-origin');
  });

  it('sets Cross-Origin-Embedder-Policy on normal pages, but not where third-party frames must load', async () => {
    const resolved = typeof config === 'function' ? await config : config;
    const blocks: Array<{ source: string; headers: Array<{ key: string; value: string }> }> = await resolved.headers();
    const coep = blocks.find((b) => b.headers.some((h) => h.key === 'Cross-Origin-Embedder-Policy'));
    expect(coep).toBeDefined();
    expect(coep!.headers.find((h) => h.key === 'Cross-Origin-Embedder-Policy')!.value).toBe('credentialless');
    // Next.js path patterns are regex-like; test the pattern against sample paths.
    const re = new RegExp(`^${coep!.source.replace(/^\//, '\\/')}$`);
    expect(re.test('/news/some-article')).toBe(true);
    for (const path of ['/embed/abc', '/events/ai-meetup', '/organizer/billing', '/employer/billing', '/employer/careers']) {
      expect(re.test(path), path).toBe(false);
    }
  });

  it('allows the camera on the whole organizer portal (check-in is reached by in-app navigation), billing keeps its own policy', async () => {
    const resolved = typeof config === 'function' ? await config : config;
    const blocks: Array<{ source: string; headers: Array<{ key: string; value: string }> }> = await resolved.headers();
    const pp = (b: { headers: Array<{ key: string; value: string }> }) => b.headers.find((h) => h.key === 'Permissions-Policy')?.value;
    const organizer = blocks.findIndex((b) => b.source === '/organizer/:path*');
    expect(organizer).toBeGreaterThan(-1);
    expect(pp(blocks[organizer])).toContain('camera=(self)');
    // Next.js applies the last matching rule for a header key: the site-wide block (camera=()) must come before, and
    // the billing rule (Razorpay payment) after, so the portal gets the camera and billing keeps payment.
    const siteWide = blocks.findIndex((b) => b.source === '/((?!embed).*)');
    const billing = blocks.findIndex((b) => b.source.includes('organizer/billing') && pp(b)?.includes('payment=(self'));
    expect(siteWide).toBeLessThan(organizer);
    expect(billing).toBeGreaterThan(organizer);
    expect(pp(blocks[siteWide])).toContain('camera=()');
  });

  it('disables X-Powered-By header', () => {
    const rawConfig = (nextConfigModule as any).default;
    const unwrapped = rawConfig?.__esModule ? rawConfig.default : rawConfig;
    const configObj = typeof unwrapped === 'function' ? {} : unwrapped;
    expect(configObj?.poweredByHeader).toBe(false);
  });
});
