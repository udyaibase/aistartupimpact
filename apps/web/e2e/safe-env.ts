import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const LOCAL_TEST_PORT = 3100;

const ROOT = resolve(__dirname, '../../..');

/** Reads KEY=value lines. Values stay in memory and are never printed. */
export function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}

const dbHost = (url: string | undefined) => {
  try {
    return url ? new URL(url).hostname.replace('-pooler', '') : '';
  } catch {
    return '';
  }
};

/** The reasons these settings aren't safe to test against. Empty means safe. Messages never contain values. */
export function testEnvProblems(staging: Record<string, string>, production: Record<string, string>): string[] {
  const problems: string[] = [];
  const stagingDb = dbHost(staging.DATABASE_URL);
  if (!stagingDb) problems.push('DATABASE_URL is missing from .env.staging.');
  else if (stagingDb === dbHost(production.DATABASE_URL)) problems.push('DATABASE_URL in .env.staging points at the production database.');

  const differs = ['R2_RESUMES_BUCKET', 'R2_BUCKET_NAME'];
  for (const k of differs) {
    if (!staging[k]) problems.push(`${k} is missing from .env.staging.`);
    else if (staging[k] === production[k]) problems.push(`${k} in .env.staging is the production bucket.`);
  }
  if (!staging.RAZORPAY_KEY_ID?.startsWith('rzp_test_')) problems.push('RAZORPAY_KEY_ID in .env.staging must be a test key (rzp_test_...).');
  // Must exist here, or Next.js would fall back to the real one in apps/web/.env.local.
  for (const k of ['RESEND_API_KEY', 'RESEND_WEBHOOK_SECRET', 'OPENAI_API_KEY', 'TURNSTILE_SECRET_KEY', 'NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'UPSTASH_REDIS_REST_URL']) {
    if (!(k in staging)) problems.push(`${k} is missing from .env.staging (it can be empty, but must be listed).`);
  }
  for (const k of ['RESEND_API_KEY', 'OPENAI_API_KEY', 'UPSTASH_REDIS_REST_URL']) {
    if (staging[k] && staging[k] === production[k]) problems.push(`${k} in .env.staging is the production value.`);
  }
  return problems;
}

export function assertSafeTestEnv(): void {
  const problems = testEnvProblems(readEnvFile(resolve(ROOT, '.env.staging')), readEnvFile(resolve(ROOT, '.env')));
  if (problems.length) {
    throw new Error(`Browser tests stopped, to protect production data:\n- ${problems.join('\n- ')}\nSee docs/STAGING_SETUP.md.`);
  }
}
