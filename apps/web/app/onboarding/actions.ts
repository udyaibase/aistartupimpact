'use server';

import { jwtSecret } from '@/lib/jwt-secret';
import { sql } from '@/lib/db';
import { getUserSession, refreshUserToken } from '@/lib/user-session';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { cleanJobPrefs, cleanTopics, isIntent, isReferralSource, MAX_INTENTS, topicById } from '@/lib/personalization/topics';
import { JOB_CATEGORIES } from '@/lib/jobs/composer';

const JWT_SECRET = jwtSecret(process.env.USER_JWT_SECRET, 'USER_JWT_SECRET');

async function getSessionIds() {
  const cookieStore = await cookies();
  const token = cookieStore.get('user-token')?.value;
  if (!token) return null;
  const { payload } = await jwtVerify(token, JWT_SECRET);
  return { userId: payload.userId as string, sessionId: payload.sessionId as string };
}

export interface OnboardingAnswers {
  /** Up to 3, most important first. */
  intents?: string[];
  topics?: string[];
  jobPrefs?: { roles?: string[]; experience?: string | null; workModes?: string[] };
  cityId?: string;
  referralSource?: string;
  referralDetail?: string;
  newsletter?: boolean;
}

export async function completeOnboarding(data: OnboardingAnswers): Promise<{ success: true } | { error: string }> {
  const ids = await getSessionIds().catch(() => null);
  if (!ids) return { error: 'Your session has expired. Please sign in again.' };
  const { userId, sessionId } = ids;

  // Unknown values are dropped rather than failing the whole step: a stale page must never block finishing.
  const intents = [...new Set((Array.isArray(data.intents) ? data.intents : []).filter(isIntent))].slice(0, MAX_INTENTS);
  const topics = cleanTopics(data.topics);
  const jobPrefs = intents.includes('looking_for_jobs') ? cleanJobPrefs(data.jobPrefs, JOB_CATEGORIES.map((c) => c.value as string)) : null;
  const referralSource = isReferralSource(data.referralSource) ? data.referralSource : null;
  const referralDetail = referralSource === 'other' && typeof data.referralDetail === 'string' ? data.referralDetail.trim().slice(0, 120) || null : null;

  try {
    const cityId = typeof data.cityId === 'string' && data.cityId
      ? (((await sql`SELECT id FROM "City" WHERE id = ${data.cityId} LIMIT 1`) as { id: string }[])[0]?.id ?? null)
      : null;
    // Topics also pick the AI-tool categories they cover, so tool suggestions keep working.
    const toolNames = [...new Set(topics.flatMap((t) => topicById(t)?.tools ?? []))];
    const categoryIds = toolNames.length
      ? ((await sql`SELECT id FROM "ToolCategory" WHERE name = ANY(${toolNames}::text[]) AND "isActive" = true`) as { id: string }[]).map((r) => r.id)
      : [];

    const rows = await sql`
      UPDATE "WebUser"
      SET
        "onboardingCompleted" = true,
        "onboardingStep" = 3,
        "onboardingVersion" = 2,
        "primaryIntent" = ${intents[0] ?? null},
        "intents" = ${intents}::text[],
        "topics" = ${topics}::text[],
        "jobPrefs" = ${jobPrefs ? JSON.stringify(jobPrefs) : null}::jsonb,
        "cityId" = ${cityId},
        "referralSource" = COALESCE("referralSource", ${referralSource}),
        "referralDetail" = COALESCE("referralDetail", ${referralDetail}),
        "preferencesUpdatedAt" = NOW(),
        "updatedAt" = NOW()
      WHERE id = ${userId}
      RETURNING email, name
    `;

    await sql`DELETE FROM "WebUserInterest" WHERE "userId" = ${userId}`;
    if (categoryIds.length > 0) {
      await sql`
        INSERT INTO "WebUserInterest" ("userId", "categoryId")
        SELECT ${userId}, unnest(${categoryIds}::text[])
        ON CONFLICT DO NOTHING
      `;
    }

    // Ticked "Send me the weekly newsletter" (never pre-ticked). Their email is already verified by sign-up.
    const me = rows[0] as { email: string; name: string } | undefined;
    if (data.newsletter === true && me) {
      await sql`
        INSERT INTO "NewsletterSubscriber" (id, email, name, source, "isActive", "emailVerified", "subscribedAt")
        VALUES (gen_random_uuid(), ${me.email}, ${me.name}, 'onboarding', true, true, NOW())
        ON CONFLICT (email) DO UPDATE SET "isActive" = true, "unsubscribedAt" = NULL
      `.catch((err: unknown) => console.error('[onboarding] newsletter', err instanceof Error ? err.message : 'failed'));
    }

    await refreshUserToken(userId, sessionId);
    return { success: true };
  } catch (err) {
    console.error('[onboarding] could not save:', err instanceof Error ? err.message : err);
    return { error: 'We couldn’t save your choices. Please try again.' };
  }
}

export async function skipOnboarding(): Promise<{ success: true } | { error: string }> {
  const ids = await getSessionIds().catch(() => null);
  if (!ids) return { error: 'Your session has expired. Please sign in again.' };

  const { userId, sessionId } = ids;
  try {
    await sql`
      UPDATE "WebUser"
      SET
        "onboardingCompleted" = true,
        "onboardingVersion" = 1,
        "updatedAt" = NOW()
      WHERE id = ${userId}
    `;
    await refreshUserToken(userId, sessionId);
    return { success: true };
  } catch (err) {
    console.error('[onboarding] could not skip:', err instanceof Error ? err.message : err);
    return { error: 'Something went wrong. Please try again.' };
  }
}

export async function saveOnboardingStep(step: number, data: Record<string, any>) {
  const ids = await getSessionIds();
  if (!ids) return { error: 'Not authenticated' };

  await sql`
    UPDATE "WebUser"
    SET "onboardingStep" = ${step}, "updatedAt" = NOW()
    WHERE id = ${ids.userId}
  `;

  return { success: true };
}
