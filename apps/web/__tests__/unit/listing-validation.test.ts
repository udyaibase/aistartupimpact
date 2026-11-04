import { describe, it, expect } from 'vitest';
import { isPublicWebUrl, startupSubmissionSchema, toolSubmissionSchema } from '@/lib/founder/listing-validation';

const startup = { name: 'Acme AI', tagline: 'AI for x', description: 'What it does', websiteUrl: 'https://acme.ai', foundedYear: 2024, founders: ['A'] };
const tool = { name: 'Acme Writer', tagline: 'Writes', description: 'What it does', websiteUrl: 'https://acme.ai', launchYear: 2024, features: [], useCases: [], screenshotUrls: [] };
const message = (r: { success: boolean; error?: { errors: { message: string }[] } }) => r.error?.errors[0].message;

describe('isPublicWebUrl', () => {
  it('accepts normal addresses', () => {
    for (const u of ['https://acme.ai', 'http://acme.ai/about?x=1', 'https://www.linkedin.com/company/acme']) expect(isPublicWebUrl(u)).toBe(true);
  });

  it('rejects links that run code or mislead', () => {
    for (const u of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,hi', 'vbscript:x', 'file:///etc/passwd', 'ftp://acme.ai', 'https://bank.com@evil.test', 'https://user:pw@acme.ai']) {
      expect(isPublicWebUrl(u), u).toBe(false);
    }
  });

  it('rejects local and bare addresses', () => {
    for (const u of ['http://localhost:3000', 'https://127.0.0.1', 'http://169.254.169.254/latest', 'https://[::1]', 'https://intranet', 'acme.ai', '']) {
      expect(isPublicWebUrl(u), u).toBe(false);
    }
  });
});

describe('startup submission', () => {
  it('accepts a normal listing, and trims it', () => {
    const r = startupSubmissionSchema.safeParse({ ...startup, name: '  Acme AI  ', linkedinUrl: '', socialLinks: [{ platform: 'x', url: 'https://x.com/acme' }] });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toBe('Acme AI');
  });

  it('keeps fields it doesn’t check', () => {
    const r = startupSubmissionSchema.safeParse({ ...startup, stage: 'SEED' });
    expect(r.success && (r.data as Record<string, unknown>).stage).toBe('SEED');
  });

  it('checks every link, including ones nested in lists', () => {
    expect(startupSubmissionSchema.safeParse({ ...startup, websiteUrl: 'javascript:alert(1)' }).success).toBe(false);
    expect(startupSubmissionSchema.safeParse({ ...startup, socialLinks: [{ platform: 'x', url: 'javascript:alert(1)' }] }).success).toBe(false);
    expect(startupSubmissionSchema.safeParse({ ...startup, foundersData: [{ name: 'A', linkedin: 'javascript:alert(1)' }] }).success).toBe(false);
  });

  it('explains what’s wrong', () => {
    expect(message(startupSubmissionSchema.safeParse({ ...startup, websiteUrl: 'acme.ai' }) as never)).toContain('Website must be a full web address');
    expect(message(startupSubmissionSchema.safeParse({ ...startup, name: 'x'.repeat(121) }) as never)).toContain('120');
  });

  it('rejects impossible numbers and oversized lists', () => {
    expect(startupSubmissionSchema.safeParse({ ...startup, foundedYear: 3000 }).success).toBe(false);
    expect(startupSubmissionSchema.safeParse({ ...startup, employeeCount: -1 }).success).toBe(false);
    expect(startupSubmissionSchema.safeParse({ ...startup, founders: Array(51).fill('A') }).success).toBe(false);
  });
});

describe('tool submission', () => {
  it('accepts a normal listing', () => {
    expect(toolSubmissionSchema.safeParse({ ...tool, pricingUrl: 'https://acme.ai/pricing' }).success).toBe(true);
  });

  it('checks every link', () => {
    for (const key of ['affiliateUrl', 'pricingUrl', 'demoVideoUrl', 'logoUrl']) {
      expect(toolSubmissionSchema.safeParse({ ...tool, [key]: 'javascript:alert(1)' }).success, key).toBe(false);
    }
    expect(toolSubmissionSchema.safeParse({ ...tool, screenshotUrls: ['data:image/png;base64,x'] }).success).toBe(false);
  });
});
