'use server';

import { jwtSecret } from '@/lib/jwt-secret';
import { sql } from '@/lib/db';
import { getUserSession, refreshUserToken } from '@/lib/user-session';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';

const JWT_SECRET = jwtSecret(process.env.USER_JWT_SECRET, 'USER_JWT_SECRET');

const VALID_INTENTS = ['exploring_tools', 'following_startups', 'looking_for_jobs', 'founder_builder', 'learning_ai', 'investor_vc'];

async function getSessionIds() {
  const cookieStore = await cookies();
  const token = cookieStore.get('user-token')?.value;
  if (!token) return null;
  const { payload } = await jwtVerify(token, JWT_SECRET);
  return { userId: payload.userId as string, sessionId: payload.sessionId as string };
}

export async function completeOnboarding(data: {
  primaryIntent?: string;
  categoryIds?: string[];
  cityId?: string;
}): Promise<{ success: true } | { error: string }> {
  const ids = await getSessionIds().catch(() => null);
  if (!ids) return { error: 'Your session has expired. Please sign in again.' };

  const { userId, sessionId } = ids;
  const { primaryIntent } = data;

  if (primaryIntent && !VALID_INTENTS.includes(primaryIntent)) {
    return { error: 'Invalid intent' };
  }

  try {
    // Only keep choices that still exist: a category or city removed while the page was open must not stop the
    // whole onboarding (it used to fail on the foreign key and the button silently did nothing).
    const wanted = Array.isArray(data.categoryIds) ? data.categoryIds.filter((c) => typeof c === 'string').slice(0, 15) : [];
    const categoryIds = wanted.length
      ? ((await sql`SELECT id FROM "ToolCategory" WHERE id = ANY(${wanted}::text[]) AND "isActive" = true`) as { id: string }[]).map((r) => r.id)
      : [];
    const cityId = typeof data.cityId === 'string' && data.cityId
      ? (((await sql`SELECT id FROM "City" WHERE id = ${data.cityId} LIMIT 1`) as { id: string }[])[0]?.id ?? null)
      : null;

    await sql`
      UPDATE "WebUser"
      SET
        "onboardingCompleted" = true,
        "onboardingStep" = 3,
        "onboardingVersion" = 1,
        "primaryIntent" = ${primaryIntent || null},
        "cityId" = ${cityId},
        "preferencesUpdatedAt" = NOW(),
        "updatedAt" = NOW()
      WHERE id = ${userId}
    `;

    if (categoryIds.length > 0) {
      await sql`DELETE FROM "WebUserInterest" WHERE "userId" = ${userId}`;
      await sql`
        INSERT INTO "WebUserInterest" ("userId", "categoryId")
        SELECT ${userId}, unnest(${categoryIds}::text[])
        ON CONFLICT DO NOTHING
      `;
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
