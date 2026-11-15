import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { member, organizer } = vi.hoisted(() => ({
  member: { findUnique: vi.fn(), updateMany: vi.fn() },
  organizer: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
}));
vi.mock('@udyaibase/database', () => ({ prisma: { eventTeamMember: member, eventOrganizer: organizer } }));
vi.mock('@/lib/rate-limit', () => ({ authRateLimit: null, apiRateLimit: null, checkRateLimit: async () => ({ success: true }), getClientIdentifier: () => 'ip' }));
vi.mock('@/lib/workspace-activity', () => ({ logOrganizerActivity: vi.fn(async () => {}) }));

import { GET, POST } from '@/app/api/organizer/team/accept/route';
import { passwordProblem, passwordScore } from '@/lib/password-rules';

const invite = (over: Record<string, unknown> = {}) => ({
  id: 'm1', organizerId: 'o1', email: 'priya@acme.ai', role: 'MANAGER', status: 'PENDING',
  expiresAt: new Date(Date.now() + 86_400_000), organizer: { id: 'o1', name: 'Ravi', company: 'Acme Events' }, ...over,
});
const post = (body: unknown) => POST(new NextRequest('http://x/api/organizer/team/accept', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }));

beforeEach(() => {
  member.findUnique.mockReset(); member.updateMany.mockReset(); organizer.findUnique.mockReset(); organizer.create.mockReset(); organizer.update.mockReset();
  member.updateMany.mockResolvedValue({ count: 1 });
});

describe('password rules', () => {
  it('mixed (the platform default): explains the first rule a password breaks', () => {
    expect(passwordProblem('Short1', 'a@b.co')).toMatch(/at least 8/);
    expect(passwordProblem('alllowercase1', 'a@b.co')).toMatch(/upper and lower/);
    expect(passwordProblem('NoNumbersHere', 'a@b.co')).toMatch(/number/);
    expect(passwordProblem('Password123', 'a@b.co')).toMatch(/common/);
    expect(passwordProblem('Priya2024x', 'priya@acme.ai')).toMatch(/email/);
    expect(passwordProblem('Blue-River-42', 'priya@acme.ai')).toBeNull();
  });
  it('strict also needs a symbol and rejects the person’s name', () => {
    expect(passwordProblem('BlueRiver42', null, 'strict')).toMatch(/symbol/);
    expect(passwordProblem('Ravi-River-42', null, 'strict', 'Ravi')).toMatch(/name/);
    expect(passwordProblem('Blue-River-42', null, 'strict', 'Ravi')).toBeNull();
  });
  it('standard only needs a letter and a number', () => {
    expect(passwordProblem('blue-river-42', null, 'standard')).toBeNull();
  });
  it('copes with whatever a request sends', () => {
    expect(passwordProblem(undefined as unknown as string)).toMatch(/Enter a password/);
    expect(passwordProblem('Blue-River-42', 42 as unknown as string, 'mixed', {} as unknown as string)).toBeNull();
  });
  it('scores length and variety', () => {
    expect(passwordScore('', null)).toBe(0);
    expect(passwordScore('abc', null)).toBe(1);
    expect(passwordScore('Riverx42', null)).toBe(2);
    expect(passwordScore('Blue-River-4242', null)).toBe(4);
  });
});

describe('organizer invite accept', () => {
  it('previews the team, role and whether an account exists, without needing a password', async () => {
    member.findUnique.mockResolvedValue(invite());
    organizer.findUnique.mockResolvedValue({ passwordHash: 'hash' });
    const d = await (await GET(new NextRequest('http://x/api/organizer/team/accept?token=t'))).json();
    expect(d).toMatchObject({ state: 'pending', email: 'priya@acme.ai', team: 'Acme Events', role: 'Manager', hasAccount: true });
  });

  it('reports expired and already-accepted invites', async () => {
    member.findUnique.mockResolvedValue(invite({ expiresAt: new Date(Date.now() - 1000) }));
    expect((await (await GET(new NextRequest('http://x/api/organizer/team/accept?token=t'))).json()).state).toBe('expired');
    member.findUnique.mockResolvedValue(invite({ status: 'ACTIVE' }));
    expect((await (await GET(new NextRequest('http://x/api/organizer/team/accept?token=t'))).json()).state).toBe('accepted');
  });

  it('a new member must set a password that passes the rules', async () => {
    member.findUnique.mockResolvedValue(invite());
    organizer.findUnique.mockResolvedValue(null);
    const res = await post({ token: 't', password: 'password123' });
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe('password');
    expect(member.updateMany).not.toHaveBeenCalled();
  });

  it('a new member joins with their name and password', async () => {
    member.findUnique.mockResolvedValue(invite());
    organizer.findUnique.mockResolvedValue(null);
    const d = await (await post({ token: 't', password: 'Blue-River-42', name: ' Priya Sharma ' })).json();
    expect(d).toMatchObject({ success: true, email: 'priya@acme.ai', existingAccount: false });
    expect(organizer.create.mock.calls[0][0].data).toMatchObject({ email: 'priya@acme.ai', name: 'Priya Sharma' });
  });

  it('an existing account joins without a password and keeps its own', async () => {
    member.findUnique.mockResolvedValue(invite());
    organizer.findUnique.mockResolvedValue({ id: 'o9', passwordHash: 'existing-hash' });
    const d = await (await post({ token: 't' })).json();
    expect(d).toMatchObject({ success: true, existingAccount: true });
    expect(member.updateMany.mock.calls[0][0].data.passwordHash).toBe('existing-hash');
    expect(organizer.update).not.toHaveBeenCalled();
    expect(organizer.create).not.toHaveBeenCalled();
  });

  it('a second accept of the same invite changes nothing', async () => {
    member.findUnique.mockResolvedValue(invite());
    organizer.findUnique.mockResolvedValue(null);
    member.updateMany.mockResolvedValue({ count: 0 });
    expect((await post({ token: 't', password: 'Blue-River-42' })).status).toBe(400);
    expect(organizer.create).not.toHaveBeenCalled();
  });
});
