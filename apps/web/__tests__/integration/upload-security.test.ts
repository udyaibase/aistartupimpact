import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(() => undefined),
    set: vi.fn(),
    delete: vi.fn(),
  })),
  headers: vi.fn(() => new Map()),
}));

vi.mock('@/lib/founder-auth', () => ({
  getFounderSession: vi.fn(() => Promise.resolve({ userId: 'founder-1' })),
}));

vi.mock('@/lib/user-session', () => ({
  getUserSession: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('@/lib/employer-auth', () => ({
  getEmployerSession: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('@/lib/organizer-auth', () => ({
  getOrganizerSession: vi.fn(() => Promise.resolve({ id: 'org-1' })),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ success: true })),
  getClientIdentifier: vi.fn(() => 'test-ip'),
  apiRateLimit: {},
  mediaUploadRateLimit: { name: 'media-upload' },
  rateLimitMessage: vi.fn(() => 'Too many attempts. Please try again in 20 minutes.'),
  retryAfterHeaders: vi.fn(() => ({})),
  strictRateLimit: {},
  organizerUploadDailyLimit: {},
}));

vi.mock('@aws-sdk/client-s3', () => {
  const MockS3Client = class {
    send = vi.fn(() => Promise.resolve({}));
  };
  return {
    S3Client: MockS3Client,
    PutObjectCommand: vi.fn(),
  };
});

// requirePermission looks up team membership; none means the session owns its workspace.
vi.mock('@udyaibase/database', () => ({
  prisma: { eventTeamMember: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) } },
}));

vi.mock('@neondatabase/serverless', () => ({
  neon: vi.fn(() => vi.fn(() => Promise.resolve([]))),
  neonConfig: {},
  Pool: vi.fn(),
  types: { setTypeParser: vi.fn(), builtins: {} },
}));

function createFileRequest(
  url: string,
  filename: string,
  content: ArrayBuffer | Uint8Array,
  mimeType: string,
  fieldName = 'file'
): NextRequest {
  const formData = new FormData();
  const blob = new Blob([content as BlobPart], { type: mimeType });
  formData.append(fieldName, new File([blob], filename, { type: mimeType }));
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method: 'POST',
    body: formData,
  } as any);
}

function createEmptyRequest(url: string): NextRequest {
  const formData = new FormData();
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method: 'POST',
    body: formData,
  } as any);
}

describe('Upload security — /api/media/upload', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects request with no file', async () => {
    const { POST } = await import('@/app/api/media/upload/route');
    const res = await POST(createEmptyRequest('/api/media/upload'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('No file');
  });

  it('rejects executable file types (application/x-executable)', async () => {
    const { POST } = await import('@/app/api/media/upload/route');
    const res = await POST(createFileRequest(
      '/api/media/upload', 'malware.exe', Buffer.from('MZ'), 'application/x-executable'
    ));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/only.*allowed/i);
  });

  it('rejects HTML files (XSS vector)', async () => {
    const { POST } = await import('@/app/api/media/upload/route');
    const res = await POST(createFileRequest(
      '/api/media/upload', 'xss.html', Buffer.from('<script>alert(1)</script>'), 'text/html'
    ));
    expect(res.status).toBe(400);
  });

  it('rejects SVG files (XSS vector)', async () => {
    const { POST } = await import('@/app/api/media/upload/route');
    const res = await POST(createFileRequest(
      '/api/media/upload', 'malicious.svg',
      Buffer.from('<svg onload="alert(1)"></svg>'), 'image/svg+xml'
    ));
    expect(res.status).toBe(400);
  });

  it('rejects files over 5MB', async () => {
    const { POST } = await import('@/app/api/media/upload/route');
    const largeBuffer = Buffer.alloc(5 * 1024 * 1024 + 1);
    const res = await POST(createFileRequest(
      '/api/media/upload', 'huge.jpg', largeBuffer, 'image/jpeg'
    ));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/size|5MB/i);
  });

  it('rejects JavaScript disguised as image', async () => {
    const { POST } = await import('@/app/api/media/upload/route');
    const res = await POST(createFileRequest(
      '/api/media/upload', 'image.jpg', Buffer.from('alert(1)'), 'application/javascript'
    ));
    expect(res.status).toBe(400);
  });

  it('accepts valid JPEG', async () => {
    const { POST } = await import('@/app/api/media/upload/route');
    const res = await POST(createFileRequest(
      '/api/media/upload', 'photo.jpg', Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]), 'image/jpeg'
    ));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('accepts valid PNG', async () => {
    const { POST } = await import('@/app/api/media/upload/route');
    const res = await POST(createFileRequest(
      '/api/media/upload', 'image.png', Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]), 'image/png'
    ));
    expect(res.status).toBe(200);
  });

  it('refuses a file that only claims to be an image (the type label is not trusted)', async () => {
    const { POST } = await import('@/app/api/media/upload/route');
    const res = await POST(createFileRequest(
      '/api/media/upload', 'logo.png', Buffer.from('<html><script>alert(1)</script></html>'), 'image/png'
    ));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/valid image/);
  });

  it('accepts valid WebP', async () => {
    const { POST } = await import('@/app/api/media/upload/route');
    const res = await POST(createFileRequest(
      '/api/media/upload', 'image.webp', Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0x00, 0x00, 0x00]), Buffer.from('WEBPVP8 ')]), 'image/webp'
    ));
    expect(res.status).toBe(200);
  });
});

describe('Upload security — /api/media/upload auth', () => {
  it('rejects unauthenticated upload', async () => {
    const founderAuth = await import('@/lib/founder-auth');
    const userSession = await import('@/lib/user-session');
    const orgAuth = await import('@/lib/organizer-auth');
    vi.mocked(founderAuth.getFounderSession).mockResolvedValueOnce(null);
    vi.mocked(userSession.getUserSession).mockResolvedValueOnce(null);
    vi.mocked(orgAuth.getOrganizerSession).mockResolvedValueOnce(null);

    const { POST } = await import('@/app/api/media/upload/route');
    const res = await POST(createFileRequest(
      '/api/media/upload', 'photo.jpg', Buffer.from([0xFF, 0xD8]), 'image/jpeg'
    ));
    expect(res.status).toBe(401);
  });

  it('limits uploads per account, not only per IP', async () => {
    const rl = await import('@/lib/rate-limit');
    vi.mocked(rl.checkRateLimit).mockImplementation(async (limiter: any, id: string) =>
      ({ success: !(limiter?.name === 'media-upload' && id === 'founder:founder-1'), limit: 30, remaining: 0, reset: Date.now() + 60_000 }) as any);

    const { POST } = await import('@/app/api/media/upload/route');
    const res = await POST(createFileRequest(
      '/api/media/upload', 'photo.jpg', Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 0x10]), 'image/jpeg'
    ));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/^Too many uploads/);
    vi.mocked(rl.checkRateLimit).mockImplementation(async () => ({ success: true }) as any);
  });
});

describe('Upload security — /api/organizer/upload', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects unauthenticated upload', async () => {
    const orgAuth = await import('@/lib/organizer-auth');
    vi.mocked(orgAuth.getOrganizerSession).mockResolvedValueOnce(null);

    const { POST } = await import('@/app/api/organizer/upload/route');
    const res = await POST(createFileRequest(
      '/api/organizer/upload', 'cover.jpg', Buffer.from([0xFF, 0xD8]), 'image/jpeg'
    ));
    expect(res.status).toBe(401);
  });

  it('rejects disallowed MIME types', async () => {
    const { POST } = await import('@/app/api/organizer/upload/route');
    const res = await POST(createFileRequest(
      '/api/organizer/upload', 'doc.pdf', Buffer.from('%PDF'), 'application/pdf'
    ));
    expect(res.status).toBe(400);
  });

  it('rejects files over 5MB', async () => {
    const { POST } = await import('@/app/api/organizer/upload/route');
    const res = await POST(createFileRequest(
      '/api/organizer/upload', 'huge.jpg', Buffer.alloc(5 * 1024 * 1024 + 1), 'image/jpeg'
    ));
    expect(res.status).toBe(400);
  });

  it('rejects no file provided', async () => {
    const { POST } = await import('@/app/api/organizer/upload/route');
    const res = await POST(createEmptyRequest('/api/organizer/upload'));
    expect(res.status).toBe(400);
  });
});

describe('Upload security — /api/careers/upload-resume', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects non-PDF files', async () => {
    const { POST } = await import('@/app/api/careers/upload-resume/route');
    const res = await POST(createFileRequest(
      '/api/careers/upload-resume', 'resume.docx',
      Buffer.from('PK'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'resume'
    ));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/PDF/i);
  });

  it('rejects executable disguised as PDF', async () => {
    const { POST } = await import('@/app/api/careers/upload-resume/route');
    const res = await POST(createFileRequest(
      '/api/careers/upload-resume', 'resume.pdf',
      Buffer.from('MZ'), 'application/x-msdownload',
      'resume'
    ));
    expect(res.status).toBe(400);
  });

  it('rejects files over 500KB', async () => {
    const { POST } = await import('@/app/api/careers/upload-resume/route');
    const res = await POST(createFileRequest(
      '/api/careers/upload-resume', 'resume.pdf',
      Buffer.alloc(501 * 1024), 'application/pdf',
      'resume'
    ));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/500KB/i);
  });

  it('rejects empty request (no file)', async () => {
    const { POST } = await import('@/app/api/careers/upload-resume/route');
    const formData = new FormData();
    const req = new NextRequest(new URL('/api/careers/upload-resume', 'http://localhost:3000'), {
      method: 'POST',
      body: formData,
    } as any);
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('accepts valid PDF under 300KB', async () => {
    const { POST } = await import('@/app/api/careers/upload-resume/route');
    const res = await POST(createFileRequest(
      '/api/careers/upload-resume', 'resume.pdf',
      Buffer.from('%PDF-1.4 test content'), 'application/pdf',
      'resume'
    ));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
