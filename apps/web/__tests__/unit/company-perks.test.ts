import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { sql, session } = vi.hoisted(() => ({ sql: vi.fn(), session: { current: null as null | { id: string; role: string; companyName: string } } }));
vi.mock('@/lib/db', () => ({ sql: (...a: unknown[]) => sql(...a) }));
vi.mock('@/lib/employer-auth', () => ({ getEmployerSession: async () => session.current }));
vi.mock('@/lib/employer/write-limit', () => ({ writeLimited: async () => null }));
vi.mock('@/lib/revalidate', () => ({ refreshPaths: vi.fn(), refreshSections: vi.fn() }));
vi.mock('@/lib/workspace-activity', () => ({ employerActor: () => ({}), logEmployerActivity: vi.fn(async () => {}) }));
vi.mock('@/lib/locations', () => ({ checkLocation: async () => ({ ok: true, city: null, country: null }) }));

import { PUT } from '@/app/api/employer/company/route';
import { cleanPerks, MAX_PERKS } from '@/lib/jobs/perks';

const put = (body: unknown) => PUT(new NextRequest('http://x/api/employer/company', { method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }));

beforeEach(() => { sql.mockReset(); sql.mockResolvedValue([]); });

describe('cleanPerks', () => {
  it('trims, de-duplicates (any case), drops junk and caps the list', () => {
    expect(cleanPerks(['  Health insurance ', 'health INSURANCE', '', 42, 'Free   lunch'])).toEqual(['Health insurance', 'Free lunch']);
    expect(cleanPerks(Array.from({ length: 30 }, (_, i) => `Perk ${i}`))).toHaveLength(MAX_PERKS);
    expect(cleanPerks('not a list')).toEqual([]);
    expect(cleanPerks(['x'.repeat(100)])[0]).toHaveLength(60);
  });
});

describe('PUT /api/employer/company set_perks', () => {
  it('an owner saves cleaned perks', async () => {
    session.current = { id: 'e1', role: 'OWNER', companyName: 'Acme' };
    const res = await put({ action: 'set_perks', perks: ['Learning budget', 'learning budget', 'Gym'] });
    expect(await res.json()).toEqual({ success: true, perks: ['Learning budget', 'Gym'] });
    const call = sql.mock.calls[0];
    expect((call[0] as string[]).join('?')).toContain('SET perks =');
    expect(call).toContainEqual(['Learning budget', 'Gym']);
  });
  it('a recruiter can’t change company perks', async () => {
    session.current = { id: 'e1', role: 'RECRUITER', companyName: 'Acme' };
    expect((await put({ action: 'set_perks', perks: ['Gym'] })).status).toBe(403);
    expect(sql).not.toHaveBeenCalled();
  });
});
