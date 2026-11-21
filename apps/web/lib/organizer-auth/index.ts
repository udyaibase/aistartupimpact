import { cache } from "react";
import { jwtSecret } from '@/lib/jwt-secret';
import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { clientIpFromHeaders } from "@/lib/client-ip";
import { prisma } from "@udyaibase/database";
import crypto from "crypto";

const JWT_SECRET = jwtSecret(process.env.NEXTAUTH_SECRET, 'NEXTAUTH_SECRET');
const USER_JWT_SECRET = jwtSecret(process.env.USER_JWT_SECRET, 'USER_JWT_SECRET');
const COOKIE_NAME = "organizer_session";
const SESSION_EXPIRY_DAYS = 7;

export interface OrganizerSession {
  id: string;
  email: string;
  name: string;
  company?: string;
  avatar?: string;
  onboardingCompleted?: boolean;
}

/** Emails are stored and compared in one form: trimmed, lower case. */
export function normalizeEmail(email: unknown): string {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

/** The organizer account for an email, whatever case it was saved in (older rows kept the typed case). */
export async function findOrganizerByEmail(email: string) {
  const address = normalizeEmail(email);
  if (!address) return null;
  return (
    (await prisma.eventOrganizer.findUnique({ where: { email: address } })) ??
    (await prisma.eventOrganizer.findFirst({ where: { email: { equals: address, mode: "insensitive" } }, orderBy: { createdAt: "asc" } }))
  );
}

/**
 * Create a session token and store it.
 */
export async function createOrganizerSession(organizerId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_EXPIRY_DAYS);

  // Where the session was started, for the owner's records.
  let ipAddress: string | null = null;
  let userAgent: string | null = null;
  try {
    const h = await headers();
    ipAddress = clientIpFromHeaders(h) || null;
    userAgent = h.get("user-agent")?.slice(0, 300) ?? null;
  } catch {}

  await prisma.eventOrganizerSession.create({
    data: {
      organizerId,
      token,
      expiresAt,
      ipAddress,
      userAgent,
    },
  });

  // Set JWT cookie (contains the session token reference)
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

const SESSION_SELECT = { id: true, email: true, name: true, company: true, avatar: true, status: true, deactivatedAt: true, onboardingCompleted: true, emailVerified: true } as const;

type OrganizerRow = { id: string; email: string; name: string; company: string | null; avatar: string | null; status: string; deactivatedAt: Date | null; onboardingCompleted: boolean; emailVerified: boolean };

/** A usable account: not suspended, not deactivated. `needVerified` also requires a confirmed email. */
function asSession(o: OrganizerRow | null | undefined, needVerified: boolean): OrganizerSession | null {
  if (!o || o.status === "SUSPENDED" || o.deactivatedAt) return null;
  if (needVerified && !o.emailVerified) return null;
  return { id: o.id, email: o.email, name: o.name, company: o.company || undefined, avatar: o.avatar || undefined, onboardingCompleted: o.onboardingCompleted };
}

/**
 * The signed-in organizer, or null. One resolver for pages and API routes, in this order:
 * 1. organizer_session cookie (the account's email must be confirmed: an unconfirmed sign-up proves nothing
 *    about who owns the address, and team access and startup tags are matched by email);
 * 2. user-token cookie (the main site's sign-in, whose email was confirmed by a code) → organizer with that email;
 * 3. unified_session cookie → its linked organizer profile.
 */
export const getOrganizerSession = cache(readOrganizerSession);

/** Looked up once per request: the layout, the page and its guards all ask, and each ask was three queries. */
async function readOrganizerSession(): Promise<OrganizerSession | null> {
  const cookieStore = await cookies();

  // 1. organizer_session cookie
  try {
    const cookie = cookieStore.get(COOKIE_NAME);
    if (cookie?.value) {
      const { payload } = await jwtVerify(cookie.value, JWT_SECRET);
      const sessionToken = payload.sessionToken as string;
      if (sessionToken) {
        const session = await prisma.eventOrganizerSession.findUnique({
          where: { token: sessionToken },
          include: { organizer: { select: SESSION_SELECT } },
        });
        if (session && session.expiresAt >= new Date()) {
          const found = asSession(session.organizer, true);
          if (found) {
            // For the signed-in devices list; written at most every 5 minutes, never blocking the request.
            if (!session.lastSeenAt || Date.now() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
              prisma.eventOrganizerSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
            }
            return found;
          }
        }
      }
    }
  } catch {}

  // 2. user-token cookie → organizer by email
  const fromUserToken = await getOrganizerSessionFromUserToken();
  if (fromUserToken) return fromUserToken;

  // 3. unified_session cookie → linked organizer profile
  try {
    if (cookieStore.get("unified_session")?.value) {
      const { getUnifiedSession } = await import("@/lib/unified-auth");
      const unified = await getUnifiedSession();
      if (unified?.organizerId) {
        const organizer = await prisma.eventOrganizer.findUnique({ where: { id: unified.organizerId }, select: SESSION_SELECT });
        const found = asSession(organizer, false);
        if (found) return found;
      }
    }
  } catch {}

  return null;
}

/**
 * Organizer session from the main site's user-token cookie (its email was confirmed when that account was made).
 */
export async function getOrganizerSessionFromUserToken(): Promise<OrganizerSession | null> {
  try {
    const cookieStore = await cookies();
    const userToken = cookieStore.get("user-token")?.value;
    if (!userToken) return null;

    const { payload } = await jwtVerify(userToken, USER_JWT_SECRET);
    const email = normalizeEmail((payload as any).email);
    if (!email) return null;

    // The site session behind this cookie must still exist. Signing out (here or "everywhere") deletes it; without
    // this check a copy of the cookie kept opening the workspace, attendee lists included, until it expired.
    const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : null;
    if (sessionId) {
      const live = await prisma.webUserSession.findFirst({ where: { id: sessionId, expiresAt: { gt: new Date() } }, select: { id: true } });
      if (!live) return null;
    }

    const organizer = await prisma.eventOrganizer.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      orderBy: { createdAt: "asc" },
      select: SESSION_SELECT,
    });
    return asSession(organizer, false);
  } catch {
    return null;
  }
}

/** The session token of this browser's organizer_session cookie, or null. */
export async function currentOrganizerSessionToken(): Promise<string | null> {
  try {
    const cookie = (await cookies()).get(COOKIE_NAME);
    if (!cookie?.value) return null;
    const { payload } = await jwtVerify(cookie.value, JWT_SECRET);
    return typeof payload.sessionToken === "string" ? payload.sessionToken : null;
  } catch {
    return null;
  }
}

/**
 * Destroy the current organizer session.
 */
export async function destroyOrganizerSession(): Promise<void> {
  try {
    const cookieStore = await cookies();
    const cookie = cookieStore.get(COOKIE_NAME);
    if (cookie?.value) {
      const { payload } = await jwtVerify(cookie.value, JWT_SECRET);
      const sessionToken = payload.sessionToken as string;
      if (sessionToken) {
        await prisma.eventOrganizerSession.deleteMany({
          where: { token: sessionToken },
        });
      }
    }
  } catch {
    // ignore
  }
  (await cookies()).delete(COOKIE_NAME);
}

/**
 * Hash a password using bcrypt-compatible approach (using Web Crypto for edge compat).
 */
export async function hashPassword(password: string): Promise<string> {
  // Using bcryptjs which is already in the web app dependencies
  const { hash } = await import("bcryptjs");
  return hash(password, 12);
}

/**
 * Verify a password.
 */
export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  const { compare } = await import("bcryptjs");
  return compare(password, hashedPassword);
}

/**
 * Generate a random token for email verification or password reset.
 */
export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Get the Google OAuth URL for organizer signup/login.
 */
export function getOrganizerGoogleAuthUrl(): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/organizer/auth/google/callback`;

  const params = new URLSearchParams({
    client_id: clientId || "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
    state: "organizer",
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
