import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const sqlCalls = vi.hoisted(() => [] as { text: string; values: unknown[] }[]);
const sqlRows = vi.hoisted(() => ({ startups: [] as unknown[], tools: [] as unknown[], founder: [{ avatar: null as string | null }] }));
vi.mock('@/lib/db', () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?');
    sqlCalls.push({ text, values });
    if (text.includes('SELECT avatar')) return Promise.resolve(sqlRows.founder);
    if (text.includes('FROM "Startup"')) return Promise.resolve(sqlRows.startups);
    if (text.includes('FROM "AiTool"')) return Promise.resolve(sqlRows.tools);
    return Promise.resolve([]);
  },
}));
const mockSession = vi.fn();
vi.mock('@/lib/founder-auth', () => ({ getFounderSession: () => mockSession() }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(async () => ({ success: true, reset: 0 })), getClientIdentifier: () => 'ip', apiRateLimit: null }));
vi.mock('@/lib/founder/activity', () => ({ logFounderActivity: vi.fn() }));

import { looksLikeImage } from '@/lib/media/image-signature';
import { RESERVED_SLUGS, slugFormatProblem, slugTakenByAnother } from '@/lib/founder/slug-rules';
import { overFormLimit, STARTUP_TAGLINE_MAX, TOOL_DESCRIPTION_MAX, TOOL_TAGLINE_MAX } from '@/lib/founder/listing-validation';
import { POST as updateProfile } from '@/app/api/founder/profile/update/route';

const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);
const text = (s: string) => new Uint8Array([...Buffer.from(s), ...new Array(16).fill(0)]);

describe('uploaded files must really be images', () => {
  it('accepts each allowed kind by its first bytes', () => {
    expect(looksLikeImage(bytes(0xff, 0xd8, 0xff, 0xe0), 'image/jpeg')).toBe(true);
    expect(looksLikeImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), 'image/png')).toBe(true);
    expect(looksLikeImage(text('GIF89a'), 'image/gif')).toBe(true);
    expect(looksLikeImage(new Uint8Array([...Buffer.from('RIFF'), 1, 2, 3, 4, ...Buffer.from('WEBP'), 0, 0, 0, 0]), 'image/webp')).toBe(true);
  });

  it.each([
    ['a web page labelled as a PNG', text('<html><script>alert(1)</script>'), 'image/png'],
    ['an SVG labelled as a JPEG', text('<svg xmlns="http://www.w3.org/2000/svg">'), 'image/jpeg'],
    ['a PNG labelled as a JPEG', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), 'image/jpeg'],
    ['a program labelled as a GIF', text('MZ\u0090\u0000'), 'image/gif'],
    ['an empty file', new Uint8Array(0), 'image/png'],
    ['a type that is not allowed', bytes(0xff, 0xd8, 0xff), 'image/svg+xml'],
  ])('refuses %s', (_name, data, mime) => {
    expect(looksLikeImage(data, mime)).toBe(false);
  });
});

describe('choosing a public URL', () => {
  beforeEach(() => { sqlCalls.length = 0; sqlRows.startups = []; sqlRows.tools = []; });

  it('checks the shape', () => {
    expect(slugFormatProblem('ab')).toBeTruthy();
    expect(slugFormatProblem('Has Spaces')).toBeTruthy();
    expect(slugFormatProblem('-starts-with-dash')).toBeTruthy();
    expect(slugFormatProblem('x'.repeat(81))).toBeTruthy();
    expect(slugFormatProblem(42)).toBeTruthy();
    expect(slugFormatProblem('krishi-mitra-ai')).toBeNull();
  });

  it.each(['submit', 'new', 'claim', 'category', 'compare', 'alternatives'])('"%s" is reserved', (word) => {
    expect(RESERVED_SLUGS.has(word)).toBe(true);
    expect(slugFormatProblem(word)).toMatch(/reserved/);
  });

  it('a URL nobody uses or used is free', async () => {
    expect(await slugTakenByAnother('fresh-name', { type: 'startup', id: 's1' })).toBe(false);
  });

  it('another listing’s current or old URL is taken, across startups and tools', async () => {
    sqlRows.tools = [{ id: 't9' }];
    expect(await slugTakenByAnother('old-name', { type: 'startup', id: 's1' })).toBe(true);
    for (const call of sqlCalls) {
      expect(call.text).toContain('ANY("previousSlugs")'); // old URLs are checked, not only current ones
      expect(call.values[0]).toBe('old-name');
    }
  });

  it('a listing is not blocked by its own old URL', async () => {
    await slugTakenByAnother('my-old-name', { type: 'startup', id: 's1' });
    const startupQuery = sqlCalls.find((c) => c.text.includes('"Startup"'))!;
    const toolQuery = sqlCalls.find((c) => c.text.includes('"AiTool"'))!;
    expect(startupQuery.values.at(-1)).toBe('s1'); // itself is left out
    expect(toolQuery.values.at(-1)).toBe('');      // but no tool is
  });
});

describe('form limits match the server', () => {
  it('the numbers the forms show', () => {
    expect([STARTUP_TAGLINE_MAX, TOOL_TAGLINE_MAX, TOOL_DESCRIPTION_MAX]).toEqual([60, 100, 1000]);
  });
  it('new text over the limit is refused with the limit in the message', () => {
    expect(overFormLimit('Tagline', 'x'.repeat(61), 60)).toBe('Tagline must be 60 characters or fewer');
    expect(overFormLimit('Tagline', 'x'.repeat(60), 60)).toBeNull();
    expect(overFormLimit('Tagline', null, 60)).toBeNull();
  });
  it('long text already on the listing may stay, but not be changed to other long text', () => {
    const long = 'y'.repeat(200);
    expect(overFormLimit('Tagline', long, 60, long)).toBeNull();
    expect(overFormLimit('Tagline', long + '!', 60, long)).toBeTruthy();
  });
});

describe('profile fields', () => {
  const save = async (body: Record<string, unknown>) => {
    const res = await updateProfile(new NextRequest('http://localhost/api/founder/profile/update', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
    return { status: res.status, body: await res.json() };
  };
  const saved = () => sqlCalls.some((c) => c.text.includes('UPDATE "FounderUser"'));
  beforeEach(() => {
    sqlCalls.length = 0;
    sqlRows.founder = [{ avatar: null }];
    mockSession.mockResolvedValue({ userId: 'f1', email: 'meera@startup.test', name: 'Meera', onboardingCompleted: true });
    process.env.R2_PUBLIC_URL = 'https://media.udyaibase.com';
  });

  it.each([
    ['a name of only spaces', { name: '   ' }],
    ['HTML in the name', { name: '<img src=x onerror=alert(1)>' }],
    ['letters as a phone number', { name: 'Meera Kulkarni', phone: 'not-a-phone!!' }],
    ['a phone number that is too short', { name: 'Meera Kulkarni', phone: '12345' }],
    ['a javascript: photo', { name: 'Meera Kulkarni', avatar: 'javascript:alert(1)' }],
    ['a photo on someone else’s site', { name: 'Meera Kulkarni', avatar: 'https://evil.example/track.gif' }],
    ['a lookalike of our media host', { name: 'Meera Kulkarni', avatar: 'https://media.udyaibase.com.evil.example/a.png' }],
    ['a javascript: link', { name: 'Meera Kulkarni', linkedin: 'javascript:alert(1)' }],
  ])('refuses %s', async (_name, body) => {
    expect((await save(body)).status).toBe(400);
    expect(saved()).toBe(false);
  });

  it('accepts a normal profile, an uploaded photo and a Google photo', async () => {
    expect((await save({ name: '  Meera Kulkarni ', phone: '+91 98765 43210', avatar: 'https://media.udyaibase.com/founder-avatar/f1/1.png', linkedin: 'https://www.linkedin.com/in/meera' })).status).toBe(200);
    expect(sqlCalls.find((c) => c.text.includes('UPDATE "FounderUser"'))!.values[0]).toBe('Meera Kulkarni'); // trimmed
    expect((await save({ name: 'Meera Kulkarni', avatar: 'https://lh3.googleusercontent.com/a/photo=s96-c' })).status).toBe(200);
    expect((await save({ name: 'Meera Kulkarni', phone: '', avatar: '' })).status).toBe(200);
  });

  it('a photo already on the profile may stay when saving other fields', async () => {
    sqlRows.founder = [{ avatar: 'https://old-host.example/me.png' }];
    expect((await save({ name: 'Meera Kulkarni', avatar: 'https://old-host.example/me.png' })).status).toBe(200);
  });

  it('signed out: 401', async () => {
    mockSession.mockResolvedValue(null);
    expect((await save({ name: 'Meera Kulkarni' })).status).toBe(401);
  });
});
