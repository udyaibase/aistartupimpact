import { sql } from '@/lib/db';
import { isPortalPath } from '@/lib/csp';

/**
 * Whether the site's "what brings you here?" onboarding is done for this person, decided at sign-in.
 *
 * A founder who has finished founder onboarding has already told us why they're here. Their site record often still
 * said "not done", so opening their own public startup page sent them to a second onboarding. For them the site
 * record is marked done here, once, and the sign-in token carries the answer.
 */
export async function siteOnboarding(user: { id: string; email: string; onboardingCompleted?: boolean | null }): Promise<{ onboardingCompleted: boolean; isFounder: boolean }> {
  const founders = await sql`
    SELECT "onboardingCompleted" FROM "FounderUser"
    WHERE email = ${user.email.toLowerCase()} AND "deletedAt" IS NULL
    LIMIT 1
  `;
  const isFounder = founders.length > 0;
  if (user.onboardingCompleted) return { onboardingCompleted: true, isFounder };
  if (isFounder && founders[0].onboardingCompleted) {
    await sql`UPDATE "WebUser" SET "onboardingCompleted" = true, "updatedAt" = NOW() WHERE id = ${user.id}`;
    return { onboardingCompleted: true, isFounder };
  }
  return { onboardingCompleted: false, isFounder };
}

/**
 * Website onboarding ("what are you here for", topics…) is for people who use the website: news, tools, jobs, events.
 * Someone who signs up to reach a portal (founder, organizer, employer) gets that portal's own setup instead, so the
 * website one is marked done for them. Returns true when it did.
 */
export async function skipSiteOnboardingForPortal(userId: string, returnTo: string): Promise<boolean> {
  if (!isPortalPath(returnTo.split(/[?#]/)[0])) return false;
  await sql`UPDATE "WebUser" SET "onboardingCompleted" = true, "updatedAt" = NOW() WHERE id = ${userId} AND "onboardingCompleted" = false`;
  return true;
}
