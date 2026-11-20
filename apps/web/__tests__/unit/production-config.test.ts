import { describe, it, expect } from 'vitest';
import { HIRING_SETTINGS, hiringSettingProblems } from '@/lib/ops/production-config';

describe('production settings check for hiring', () => {
  const all = Object.fromEntries(HIRING_SETTINGS.flatMap((g) => g.keys).map((k) => [k, 'set']));

  it('is quiet when everything is set', () => {
    expect(hiringSettingProblems(all)).toEqual([]);
  });

  it('names what is missing and says what breaks, without printing any value', () => {
    const problems = hiringSettingProblems({ ...all, TURNSTILE_SECRET_KEY: '', R2_RESUMES_BUCKET: undefined, RESEND_API_KEY: 'secret-value' });
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/^TURNSTILE_SECRET_KEY not set: the human check/);
    expect(problems[1]).toMatch(/^R2_RESUMES_BUCKET not set: resume uploads are refused/);
    expect(problems.join(' ')).not.toContain('secret-value');
  });

  it('treats blank as missing', () => {
    expect(hiringSettingProblems({ ...all, OTP_HASH_SECRET: '   ' })).toHaveLength(1);
  });
});
