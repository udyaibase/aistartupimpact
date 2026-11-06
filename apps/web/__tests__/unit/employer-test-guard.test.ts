import { describe, it, expect } from 'vitest';
import { testEnvProblems } from '@/e2e/safe-env';

const production = {
  DATABASE_URL: 'postgresql://u:p@ep-prod-pooler.neon.tech/db', R2_RESUMES_BUCKET: 'prod-resumes', R2_BUCKET_NAME: 'prod-media',
  RESEND_API_KEY: 'prod-resend', OPENAI_API_KEY: 'prod-ai', UPSTASH_REDIS_REST_URL: 'https://prod.upstash.io',
};
const staging = {
  DATABASE_URL: 'postgresql://u:p@ep-staging-pooler.neon.tech/db', R2_RESUMES_BUCKET: 'stg-resumes', R2_BUCKET_NAME: 'stg-media',
  RAZORPAY_KEY_ID: 'rzp_test_abc', RESEND_API_KEY: 'stg-resend', RESEND_WEBHOOK_SECRET: 's', OPENAI_API_KEY: '', TURNSTILE_SECRET_KEY: 't',
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: 't', UPSTASH_REDIS_REST_URL: 'https://stg.upstash.io',
};

describe('browser test guard', () => {
  it('accepts a separate environment', () => {
    expect(testEnvProblems(staging, production)).toEqual([]);
  });

  it('refuses to start with no staging file', () => {
    expect(testEnvProblems({}, production).join(' ')).toContain('DATABASE_URL is missing');
  });

  it('catches production values, including the pooled address of the same database', () => {
    const p = testEnvProblems({ ...staging, DATABASE_URL: 'postgresql://other:creds@ep-prod.neon.tech/db' }, production);
    expect(p.join(' ')).toContain('production database');
    expect(testEnvProblems({ ...staging, R2_RESUMES_BUCKET: 'prod-resumes' }, production).join(' ')).toContain('production bucket');
    expect(testEnvProblems({ ...staging, RAZORPAY_KEY_ID: 'rzp_live_x' }, production).join(' ')).toContain('test key');
    expect(testEnvProblems({ ...staging, RESEND_API_KEY: 'prod-resend' }, production).join(' ')).toContain('production value');
  });

  it('never prints a secret in its messages', () => {
    const text = testEnvProblems({ ...staging, DATABASE_URL: production.DATABASE_URL, RESEND_API_KEY: 'prod-resend' }, production).join(' ');
    expect(text).not.toContain('postgresql');
    expect(text).not.toContain('prod-resend');
  });
});
