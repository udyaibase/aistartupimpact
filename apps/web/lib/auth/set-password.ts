import { sql } from '@/lib/db';

/**
 * Changes a person's password everywhere it's stored. One person can have several account records with the same
 * email, and sign-in may check any of them, so updating only one leaves the old password working and can make the new
 * one fail. Every password change and reset goes through here.
 *
 * Also clears lockouts, because a successful change proves who they are, and ends every other session. Pass
 * `keepWebSessionId` to leave this device's session running. Returns the founder record, if there is one.
 */
export async function setAccountPassword(
  email: string,
  passwordHash: string,
  opts: { keepWebSessionId?: string | null } = {},
): Promise<{ id: string; email: string; name: string; onboardingCompleted: boolean } | null> {
  const address = email.toLowerCase();

  await sql`UPDATE "WebUser" SET "passwordHash" = ${passwordHash}, "failedLoginAttempts" = 0, "lockedUntil" = NULL, "updatedAt" = NOW() WHERE email = ${address}`;
  await sql`UPDATE "UnifiedUser" SET "passwordHash" = ${passwordHash} WHERE email = ${address}`;
  await sql`UPDATE "EventOrganizer" SET "passwordHash" = ${passwordHash}, "failedLoginAttempts" = 0, "lockedUntil" = NULL WHERE email = ${address}`;
  const founders = await sql`
    UPDATE "FounderUser"
    SET "passwordHash" = ${passwordHash}, "failedLoginAttempts" = 0, "lockedUntil" = NULL,
        "sessionsValidAfter" = NOW(), "updatedAt" = NOW()
    WHERE email = ${address}
    RETURNING id, email, name, "onboardingCompleted"
  `;

  if (opts.keepWebSessionId) {
    await sql`DELETE FROM "WebUserSession" WHERE "webUserId" IN (SELECT id FROM "WebUser" WHERE email = ${address}) AND id != ${opts.keepWebSessionId}`;
  } else {
    await sql`DELETE FROM "WebUserSession" WHERE "webUserId" IN (SELECT id FROM "WebUser" WHERE email = ${address})`;
  }
  await sql`DELETE FROM "UnifiedSession" WHERE "userId" IN (SELECT id FROM "UnifiedUser" WHERE email = ${address})`;
  await sql`DELETE FROM "EventOrganizerSession" WHERE "organizerId" IN (SELECT id FROM "EventOrganizer" WHERE email = ${address})`;
  await sql`DELETE FROM "FounderSession" WHERE "userId" IN (SELECT id FROM "FounderUser" WHERE email = ${address})`;

  if (founders.length === 0) return null;
  const f = founders[0];
  return { id: f.id as string, email: f.email as string, name: f.name as string, onboardingCompleted: !!f.onboardingCompleted };
}
