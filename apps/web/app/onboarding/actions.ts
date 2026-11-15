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
}) {
  const ids = await getSessionIds();
  if (!ids) return { error: 'Not authenticated' };

  const { userId, sessionId } = ids;
  const { primaryIntent, categoryIds, cityId } = data;

  if (primaryIntent && !VALID_INTENTS.includes(primaryIntent)) {
    return { error: 'Invalid intent' };
  }

  await sql`
    UPDATE "WebUser"
    SET
      "onboardingCompleted" = true,
      "onboardingStep" = 3,
      "onboardingVersion" = 1,
      "primaryIntent" = ${primaryIntent || null},
      "cityId" = ${cityId || null},
      "preferencesUpdatedAt" = NOW(),
      "updatedAt" = NOW()
    WHERE id = ${userId}
  `;

  if (categoryIds && categoryIds.length > 0) {
    await sql`DELETE FROM "WebUserInterest" WHERE "userId" = ${userId}`;
    for (const catId of categoryIds.slice(0, 15)) {
      await sql`
        INSERT INTO "WebUserInterest" ("userId", "categoryId")
        VALUES (${userId}, ${catId})
        ON CONFLICT DO NOTHING
      `;
    }
  }

  await refreshUserToken(userId, sessionId);
  return { success: true };
}

export async function skipOnboarding() {
  const ids = await getSessionIds();
  if (!ids) return { error: 'Not authenticated' };

  const { userId, sessionId } = ids;

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
