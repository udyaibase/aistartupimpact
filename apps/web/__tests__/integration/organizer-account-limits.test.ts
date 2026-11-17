import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const limit = vi.hoisted(() => ({ ok: true, keys: [] as string[] }));
const sent = vi.hoisted(() => [] as { Key: string; ContentType: string }[]);

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: async (_l: unknown, key: string) => { limit.keys.push(key); return { success: limit.ok }; },
  authRateLimit: {}, apiRateLimit: {}, organizerUploadDailyLimit: {},
}));
vi.mock('@/lib/organizer-auth', () => ({
  getOrganizerSession: async () => ({ id: 'org1', email: 'me@host.co', name: 'Me' }),
  verifyPassword: vi.fn(async () => false), hashPassword: vi.fn(),
}));
vi.mock('@udyaibase/database', () => ({ prisma: { eventOrganizer: { findUnique: vi.fn(async () => ({ passwordHash: 'h' })) } } }));
vi.mock('@/lib/workspace-activity', () => ({ logOrganizerActivity: vi.fn(), organizerActor: () => null }));
vi.mock('@/lib/auth/set-password', () => ({ setAccountPassword: vi.fn() }));
vi.mock('@/lib/email/send', () => ({ sendEmailFireAndForget: vi.fn() }));
vi.mock('@/lib/organizer-auth/require-permission', () => ({
  requirePermission: async () => ({ id: 'org1', email: 'me@host.co', role: 'OWNER', organizerId: 'org1' }),
}));
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class { async send(cmd: { input: { Key: string; ContentType: string } }) { sent.push(cmd.input); return {}; } },
  PutObjectCommand: class { constructor(public input: unknown) {} },
}));

import { POST as changePassword } from '@/app/api/organizer/settings/password/route';
import { POST as changeEmail } from '@/app/api/organizer/change-email/route';
import { POST as upload } from '@/app/api/organizer/upload/route';

beforeEach(() => { limit.ok = true; limit.keys = []; sent.length = 0; });
const json = (url: string, body: unknown) => new NextRequest(url, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });

describe('password and email changes are rate-limited per account', () => {
  it('stops guessing the current password once the limit is hit', async () => {
    limit.ok = false;
    expect((await changePassword(json('http://localhost/x', { currentPassword: 'a', newPassword: 'Bbbbbbbb1!' }))).status).toBe(429);
    expect((await changeEmail(json('http://localhost/x', { newEmail: 'new@host.co', password: 'a' }))).status).toBe(429);
    expect(limit.keys).toEqual(['organizer-change-password:org1', 'organizer-change-email:org1']);
  });
});

describe('uploads are named by their checked type, not the file name', () => {
  it('a PNG named "page.html" is stored as .png', async () => {
    process.env.R2_BUCKET_NAME = 'b'; process.env.R2_ACCOUNT_ID = 'a'; process.env.R2_ACCESS_KEY_ID = 'k'; process.env.R2_SECRET_ACCESS_KEY = 's'; process.env.R2_PUBLIC_URL = 'https://media.example.com';
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const fd = new FormData();
    fd.append('file', new File([png], 'page.html', { type: 'image/png' }));
    const res = await upload(new NextRequest('http://localhost/api/organizer/upload', { method: 'POST', body: fd }));
    expect(res.status).toBe(200);
    expect(sent[0].Key).toMatch(/^events\/org1\/[\w-]+\.png$/);
  });
});
