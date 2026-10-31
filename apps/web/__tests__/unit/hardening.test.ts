import { describe, expect, it } from 'vitest';
import { generateSlug } from '@udyaibase/utils/slug';
import { generateShortCode } from '@/lib/events/short-code';
import { generateQrToken } from '@/lib/events/qr-token';
import { buildFallback } from '@/lib/build-fallback';

describe('generateSlug', () => {
  it('makes URL-safe slugs and trims edge dashes', () => {
    expect(generateSlug('  Best AI Tools for 2025!  ')).toBe('best-ai-tools-for-2025');
    expect(generateSlug('--Hello__World--')).toBe('hello-world');
    expect(generateSlug('---')).toBe('');
  });
  it('stays fast on long dash runs', () => {
    const t = Date.now();
    generateSlug('-'.repeat(50_000) + 'x' + '-'.repeat(50_000));
    expect(Date.now() - t).toBeLessThan(200);
  });
});

describe('random codes', () => {
  it('have the right length and characters', () => {
    expect(generateShortCode()).toHaveLength(6);
    expect(generateQrToken()).toMatch(/^[0-9A-Za-z]{16}$/);
  });
});

describe('buildFallback', () => {
  it('rethrows outside the build, so a runtime blip keeps the last good page', () => {
    const prev = process.env.NEXT_PHASE;
    delete process.env.NEXT_PHASE;
    expect(() => buildFallback([], 'x')(new Error('db down'))).toThrow('db down');
    process.env.NEXT_PHASE = 'phase-production-build';
    expect(buildFallback(['fallback'], 'x')(new Error('db down'))).toEqual(['fallback']);
    if (prev === undefined) delete process.env.NEXT_PHASE; else process.env.NEXT_PHASE = prev;
  });
});
