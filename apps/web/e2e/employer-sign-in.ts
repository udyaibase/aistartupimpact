import crypto from 'node:crypto';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { readEnvFile } from './safe-env';

/**
 * Signs a browser test in to the employer portal as one of the seeded test accounts (docs/development/TEST_ACCOUNTS.md).
 *
 * The portal signs in with an emailed code, and a test can't read an inbox. So the helper stores a code of its own for
 * that address, the way the app stores one (only its keyed hash), then finishes sign-in through the real route. It
 * runs only against the staging database from .env.staging (playwright.config.ts refuses anything else locally) and
 * only for `.test` addresses.
 */

const staging = readEnvFile(resolve(__dirname, '../../../.env.staging'));
const DATABASE_URL = process.env.CI ? process.env.DATABASE_URL : staging.DATABASE_URL;
// Same fallback as lib/otp.ts outside production.
const OTP_SECRET = (process.env.CI ? process.env.OTP_HASH_SECRET : staging.OTP_HASH_SECRET) || 'dev-only-otp-hash-secret';
const PURPOSE = 'employer_member_login';

export const EMPLOYER_TEST_ACCOUNTS = {
  owner: 'nimbus-owner@udyaibase.test',
  recruiter: 'nimbus-recruiter@udyaibase.test',
  /** Limited to the Senior ML Engineer job. */
  interviewer: 'nimbus-interviewer@udyaibase.test',
} as const;
export type EmployerTestRole = keyof typeof EMPLOYER_TEST_ACCOUNTS;

let prisma: PrismaClient | undefined;
function db(): PrismaClient {
  if (!DATABASE_URL) throw new Error('No test database: DATABASE_URL is missing from .env.staging.');
  prisma ??= new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
  return prisma;
}

/** True when the seeded hiring team exists in this database (tests skip themselves otherwise). */
export async function employerSeedPresent(): Promise<boolean> {
  try {
    return (await db().jobBoardTeamMember.count({ where: { email: EMPLOYER_TEST_ACCOUNTS.owner, status: 'ACTIVE' } })) > 0;
  } catch {
    return false;
  }
}

/** Signs `page` in as the seeded owner, recruiter or interviewer. Returns where the portal sends that role. */
export async function signInAsEmployer(page: Page, role: EmployerTestRole): Promise<string> {
  const email = EMPLOYER_TEST_ACCOUNTS[role];
  if (!email.endsWith('.test')) throw new Error('Browser tests sign in with .test addresses only.');

  const code = crypto.randomInt(100000, 1000000).toString();
  await db().emailOtp.deleteMany({ where: { email, purpose: PURPOSE } });
  await db().emailOtp.create({
    data: {
      email,
      purpose: PURPOSE,
      code: crypto.createHmac('sha256', OTP_SECRET).update(code).digest('hex'),
      expiresAt: new Date(Date.now() + 10 * 60_000),
    },
  });

  // Start on the site, so the request below carries its Origin (API writes are refused without one).
  await page.goto('/employer/login', { waitUntil: 'domcontentloaded' });
  // page.request shares the page's cookies, so the session cookie set here signs the page in.
  const res = await page.request.post('/api/employer/auth/member-code', {
    data: { step: 'verify', email, code },
    headers: { Origin: new URL(page.url()).origin },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok() || !body.success) throw new Error(`Test sign-in failed for the ${role} (${res.status()}): ${body.error ?? 'no session'}`);
  return body.redirect as string;
}

export async function closeEmployerTestDb(): Promise<void> {
  await prisma?.$disconnect();
  prisma = undefined;
}
