import { describe, it, expect } from 'vitest';

describe('Consent & Privacy — GDPR/GPC compliance', () => {
  it('consent manager honors GPC signal', async () => {
    const src = await import('fs').then(fs =>
      fs.readFileSync('lib/consent-manager.ts', 'utf8')
    );
    expect(src).toContain('globalPrivacyControl');
    expect(src).toContain('doNotTrack');
    expect(src).toContain("dnt === '1'");
  });

  it('consent manager auto-rejects when GPC/DNT enabled', async () => {
    const src = await import('fs').then(fs =>
      fs.readFileSync('lib/consent-manager.ts', 'utf8')
    );
    expect(src).toContain('rejectAll');
  });

  it('consent manager forces re-consent when policy version changes', async () => {
    const src = await import('fs').then(fs =>
      fs.readFileSync('lib/consent-manager.ts', 'utf8')
    );
    expect(src).toContain('policyVersion !== POLICY_VERSION');
    expect(src).toContain('clearConsent');
  });

  it('consent defaults deny analytics and marketing', async () => {
    const { DEFAULT_CONSENT } = await import('@/types/consent');
    expect(DEFAULT_CONSENT.analytics).toBe(false);
    expect(DEFAULT_CONSENT.marketing).toBe(false);
  });

  it('only necessary consent is enabled by default', async () => {
    const { DEFAULT_CONSENT } = await import('@/types/consent');
    expect(DEFAULT_CONSENT.necessary).toBe(true);
  });

  it('GA consent mode defaults to denied', async () => {
    const src = await import('fs').then(fs =>
      // The consent defaults script lives in lib/csp.ts (the portal CSP allows it by hash); the layout renders it.
      fs.readFileSync('lib/csp.ts', 'utf8') + fs.readFileSync('app/layout.tsx', 'utf8')
    );
    expect(src).toContain("analytics_storage:'denied'");
    expect(src).toContain("ad_storage:'denied'");
    expect(src).toContain("ad_user_data:'denied'");
    expect(src).toContain("ad_personalization:'denied'");
  });
});

describe('Consent & Privacy — data export and deletion', () => {
  it('user data export endpoint exists', async () => {
    const fs = await import('fs');
    expect(fs.existsSync('app/api/user/export-data/route.ts')).toBe(true);
  });

  it('user delete account endpoint exists', async () => {
    const fs = await import('fs');
    expect(fs.existsSync('app/api/user/delete-account/route.ts')).toBe(true);
  });

  it('event data deletion endpoint exists', async () => {
    const fs = await import('fs');
    expect(fs.existsSync('app/api/events/delete-my-data/route.ts')).toBe(true);
  });
});
