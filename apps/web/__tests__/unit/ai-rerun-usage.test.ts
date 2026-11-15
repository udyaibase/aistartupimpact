import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = vi.hoisted(() => new Map<string, number>());
vi.mock('@upstash/redis', () => ({
  Redis: class {
    async get(k: string) { return store.get(k) ?? null; }
    async incr(k: string) { store.set(k, (store.get(k) ?? 0) + 1); return store.get(k); }
    async expire() { return 1; }
  },
}));

import { aiRerunCount, recordAiRerun } from '@/lib/employer/ai-usage';

describe('AI review re-runs count against the allowance', () => {
  beforeEach(() => store.clear());
  const period = new Date('2026-11-01T00:00:00Z');

  it('counts each re-run for the workspace and period', async () => {
    expect(await aiRerunCount('emp1', period)).toBe(0);
    expect(await recordAiRerun('emp1', period)).toBe(true);
    expect(await recordAiRerun('emp1', period)).toBe(true);
    expect(await aiRerunCount('emp1', period)).toBe(2);
  });

  it('keeps workspaces and periods apart', async () => {
    await recordAiRerun('emp1', period);
    expect(await aiRerunCount('emp2', period)).toBe(0);
    expect(await aiRerunCount('emp1', new Date('2026-12-01T00:00:00Z'))).toBe(0);
  });
});
