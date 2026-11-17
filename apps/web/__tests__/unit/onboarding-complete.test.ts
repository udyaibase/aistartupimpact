import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls = vi.hoisted(() => [] as { text: string; values: unknown[] }[]);
const state = vi.hoisted(() => ({ categories: ['c1', 'c2'], cities: ['city1'], failOn: '' }));
vi.mock('@/lib/db', () => ({
  sql: async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?');
    calls.push({ text, values });
    if (state.failOn && text.includes(state.failOn)) throw new Error('db down');
    if (text.includes('FROM "ToolCategory"')) return (values[0] as string[]).filter((id) => state.categories.includes(id)).map((id) => ({ id }));
    if (text.includes('FROM "City"')) return state.cities.includes(values[0] as string) ? [{ id: values[0] }] : [];
    return [];
  },
}));
vi.mock('@/lib/user-session', () => ({ getUserSession: vi.fn(), refreshUserToken: vi.fn(async () => undefined) }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: 'token' }) }) }));
vi.mock('jose', () => ({ jwtVerify: async () => ({ payload: { userId: 'u1', sessionId: 's1' } }) }));

import { completeOnboarding } from '@/app/onboarding/actions';

beforeEach(() => { calls.length = 0; state.failOn = ''; });

describe('finishing onboarding', () => {
  it('saves only categories and city that still exist, instead of failing', async () => {
    expect(await completeOnboarding({ categoryIds: ['c1', 'gone'], cityId: 'deleted-city' })).toEqual({ success: true });
    const update = calls.find((c) => c.text.includes('UPDATE "WebUser"'))!;
    expect(update.values).toContain(null); // stale city not saved
    const insert = calls.find((c) => c.text.includes('INSERT INTO "WebUserInterest"'))!;
    expect(insert.values[1]).toEqual(['c1']);
  });
  it('returns a message the screen can show when saving fails', async () => {
    state.failOn = 'UPDATE "WebUser"';
    expect(await completeOnboarding({ categoryIds: ['c1'] })).toEqual({ error: expect.stringMatching(/try again/i) });
  });
});
