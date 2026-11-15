import { jwtSecret } from '@/lib/jwt-secret';
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@udyaibase/database";
import crypto from "crypto";

const JWT_SECRET = jwtSecret(process.env.NEXTAUTH_SECRET, 'NEXTAUTH_SECRET');
const COOKIE_NAME = "unified_session";
const SESSION_EXPIRY_DAYS = 7;

// Rate limit: max 5 workspace link attempts per user per hour
const LINK_RATE_LIMIT = 5;

export interface UnifiedUserSession {
  id: string;
  email: string;
  name: string;
  avatar?: string | null;
  emailVerified: boolean;
  lastWorkspace: string;
  twoFactorEnabled: boolean;
  twoFactorInherited: boolean;
  // Workspace links (resolved from profile tables)
  founderId?: string | null;
  organizerId?: string | null;
}

/**
 * Create a unified session and set cookie.
 */
export async function createUnifiedSession(userId: string, source: string = "direct"): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_EXPIRY_DAYS);

  await prisma.unifiedSession.create({
    data: { userId, token, expiresAt, source },
  });

  const jwt = await new SignJWT({ sessionToken: token })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_EXPIRY_DAYS}d`)
    .sign(JWT_SECRET);

  (await cookies()).set(COOKIE_NAME, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_EXPIRY_DAYS * 24 * 60 * 60,
    path: "/",
  });

  return token;
}

/**
 * Get unified session from cookie.
 * Also handles dual-read of old cookies during transition.
 */
export async function getUnifiedSession(): Promise<UnifiedUserSession | null> {
  try {
    // 1. Try unified cookie (primary path)
    const cookieStore = await cookies();
    const cookie = cookieStore.get(COOKIE_NAME);

    if (cookie?.value) {
      const { payload } = await jwtVerify(cookie.value, JWT_SECRET);
      const sessionToken = payload.sessionToken as string;
      if (!sessionToken) return null;

      const session = await prisma.unifiedSession.findUnique({
        where: { token: sessionToken },
        include: {
          user: {
            select: {
              id: true, email: true, name: true, avatar: true,
              emailVerified: true, lastWorkspace: true,
              twoFactorEnabled: true, twoFactorInherited: true,
              founderProfile: { select: { id: true } },
              organizerProfile: { select: { id: true } },
            },
          },
        },
      });

      if (!session || session.expiresAt < new Date()) return null;
      return {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        avatar: session.user.avatar,
        emailVerified: session.user.emailVerified,
        lastWorkspace: session.user.lastWorkspace,
        twoFactorEnabled: session.user.twoFactorEnabled,
        twoFactorInherited: session.user.twoFactorInherited,
        founderId: session.user.founderProfile?.id || null,
        organizerId: session.user.organizerProfile?.id || null,
      };
    }

    // 2. Fallback: read old organizer cookie (transition)
    const organizerCookie = cookieStore.get("organizer_session");
    if (organizerCookie?.value) {
      return await migrateOldSession(organizerCookie.value, "organizer");
    }

    // 3. Fallback: read old founder cookie
    const founderCookie = cookieStore.get("founder_session");
    if (founderCookie?.value) {
      return await migrateOldSession(founderCookie.value, "founder");
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Migrate an old session to unified.
 * IMPORTANT: Inherits emailVerified from old record. Does NOT skip verification gate.
 */
async function migrateOldSession(cookieValue: string, source: "organizer" | "founder"): Promise<UnifiedUserSession | null> {
  try {
    const { payload } = await jwtVerify(cookieValue, JWT_SECRET);
    const sessionToken = payload.sessionToken as string;
    if (!sessionToken) return null;

    let email: string | null = null;
    let name: string | null = null;
    let emailVerified = false;

    if (source === "organizer") {
      const oldSession = await prisma.eventOrganizerSession.findUnique({
        where: { token: sessionToken },
        include: { organizer: { select: { email: true, name: true, emailVerified: true } } },
      });
      if (!oldSession || oldSession.expiresAt < new Date()) return null;
      email = oldSession.organizer.email;
      name = oldSession.organizer.name;
      emailVerified = oldSession.organizer.emailVerified;
    }

    if (!email) return null;

    // Find or create UnifiedUser — inherit emailVerified from old record
    let unifiedUser = await prisma.unifiedUser.findUnique({ where: { email } });

    if (!unifiedUser) {
      unifiedUser = await prisma.unifiedUser.create({
        data: { email, name: name || email.split("@")[0], emailVerified },
      });

      // Log the auto-migration (durable DB write, not console.log)
      await prisma.workspaceLinkLog.create({
        data: {
          userId: unifiedUser.id,
          workspace: source,
          action: "auto_migrated",
          linkedId: "session_migration",
          emailMatch: true,
          verified: emailVerified,
        },
      });
    }

    // Create unified session
    await createUnifiedSession(unifiedUser.id, `migrated_${source}`);

    // Resolve workspace links
    const founderProfile = await prisma.founderUser.findUnique({ where: { unifiedUserId: unifiedUser.id }, select: { id: true } });
    const organizerProfile = await prisma.eventOrganizer.findUnique({ where: { unifiedUserId: unifiedUser.id }, select: { id: true } });

    return {
      id: unifiedUser.id,
      email: unifiedUser.email,
      name: unifiedUser.name,
      avatar: unifiedUser.avatar,
      emailVerified: unifiedUser.emailVerified,
      lastWorkspace: unifiedUser.lastWorkspace || "COMMUNITY",
      twoFactorEnabled: unifiedUser.twoFactorEnabled,
      twoFactorInherited: unifiedUser.twoFactorInherited || false,
      founderId: founderProfile?.id || null,
      organizerId: organizerProfile?.id || null,
    };
  } catch {
    return null;
  }
}

/**
 * Destroy unified session.
 */
export async function destroyUnifiedSession(): Promise<void> {
  try {
    const cookieStore = await cookies();
    const cookie = cookieStore.get(COOKIE_NAME);
    if (cookie?.value) {
      const { payload } = await jwtVerify(cookie.value, JWT_SECRET);
      const sessionToken = payload.sessionToken as string;
      if (sessionToken) {
        await prisma.unifiedSession.deleteMany({ where: { token: sessionToken } });
      }
    }
  } catch {}
  (await cookies()).delete(COOKIE_NAME);
  // Also clear old cookies during transition
  (await cookies()).delete("organizer_session");
  (await cookies()).delete("founder_session");
}

/**
 * Hash password.
 */
export async function hashPassword(password: string): Promise<string> {
  const { hash } = await import("bcryptjs");
  return hash(password, 12);
}

/**
 * Verify password.
 */
export async function verifyPassword(password: string, hashed: string): Promise<boolean> {
  const { compare } = await import("bcryptjs");
  return compare(password, hashed);
}

/**
 * Generate a random token.
 */
export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}
