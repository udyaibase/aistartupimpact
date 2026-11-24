import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls = vi.hoisted(() => [] as { text: string; values: unknown[] }[]);
const state = vi.hoisted(() => ({ toolCategories: { Coding: 'cat-coding', Data: 'cat-data' } as Record<string, string>, cities: ['city1'], failOn: '' }));
vi.mock('@/lib/db', () => ({
  sql: Object.assign(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?');
    calls.push({ text, values });
    if (state.failOn && text.includes(state.failOn)) throw new Error('db down');
    if (text.includes('FROM "ToolCategory"')) return (values[0] as string[]).filter((n) => state.toolCategories[n]).map((n) => ({ id: state.toolCategories[n] }));
    if (text.includes('FROM "City"')) return state.cities.includes(values[0] as string) ? [{ id: values[0] }] : [];
    if (text.includes('UPDATE "WebUser"')) return [{ email: 'a@example.test', name: 'A' }];
    return [];
  }, {}),
}));
vi.mock('@/lib/user-session', () => ({ getUserSession: vi.fn(), refreshUserToken: vi.fn(async () => undefined) }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: 'token' }) }) }));
vi.mock('jose', () => ({ jwtVerify: async () => ({ payload: { userId: 'u1', sessionId: 's1' } }) }));

import { completeOnboarding } from '@/app/onboarding/actions';

const update = () => calls.find((c) => c.text.includes('UPDATE "WebUser"'))!;
const valueAfter = (marker: string) => { const u = update(); const parts = u.text.split('?'); const i = parts.findIndex((p) => p.includes(marker)); return u.values[i]; };

beforeEach(() => { calls.length = 0; state.failOn = ''; });

describe('finishing onboarding', () => {
  it('keeps known answers, drops unknown ones and a city that no longer exists', async () => {
    expect(await completeOnboarding({
      intents: ['reading_news', 'nonsense', 'looking_for_jobs', 'exploring_tools', 'attending_events'],
      topics: ['devtools', 'data', 'made-up', 'devtools'],
      cityId: 'deleted-city',
      jobPrefs: { roles: ['ML_ENGINEER', 'NOT_A_ROLE'], experience: 'mid', workModes: ['REMOTE', 'MOON'] },
      referralSource: 'linkedin',
      referralDetail: 'ignored unless other',
    })).toEqual({ success: true });

    expect(valueAfter('"intents" =')).toEqual(['reading_news', 'looking_for_jobs', 'exploring_tools']); // max 3, in order
    expect(valueAfter('"primaryIntent" =')).toBe('reading_news');
    expect(valueAfter('"topics" =')).toEqual(['devtools', 'data']);
    expect(JSON.parse(valueAfter('"jobPrefs" =') as string)).toEqual({ roles: ['ML_ENGINEER'], experience: 'mid', workModes: ['REMOTE'] });
    expect(valueAfter('"cityId" =')).toBeNull();
    expect(valueAfter('"referralSource" = COALESCE')).toBe('linkedin');
    expect(valueAfter('"referralDetail" = COALESCE')).toBeNull();

    // Topics pick the tool categories they cover, so tool suggestions keep working.
    const insert = calls.find((c) => c.text.includes('INSERT INTO "WebUserInterest"'))!;
    expect(new Set(insert.values[1] as string[])).toEqual(new Set(['cat-coding', 'cat-data']));
  });

  it('saves job preferences only for people looking for jobs, and "Somewhere else" with their words', async () => {
    await completeOnboarding({ intents: ['reading_news'], jobPrefs: { roles: ['ML_ENGINEER'] }, referralSource: 'other', referralDetail: '  A podcast  ' });
    expect(valueAfter('"jobPrefs" =')).toBeNull();
    expect(valueAfter('"referralSource" = COALESCE')).toBe('other');
    expect(valueAfter('"referralDetail" = COALESCE')).toBe('A podcast');
  });

  it('subscribes to the newsletter only when ticked', async () => {
    await completeOnboarding({ intents: ['reading_news'] });
    expect(calls.some((c) => c.text.includes('"NewsletterSubscriber"'))).toBe(false);
    calls.length = 0;
    await completeOnboarding({ intents: ['reading_news'], newsletter: true });
    expect(calls.some((c) => c.text.includes('"NewsletterSubscriber"'))).toBe(true);
  });

  it('returns a message the screen can show when saving fails', async () => {
    state.failOn = 'UPDATE "WebUser"';
    expect(await completeOnboarding({ intents: ['reading_news'] })).toEqual({ error: expect.stringMatching(/try again/i) });
  });
});
