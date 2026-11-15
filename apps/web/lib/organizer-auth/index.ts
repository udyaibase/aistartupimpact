import { jwtSecret } from '@/lib/jwt-secret';
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
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
  onboardingCompleted?: boolean;
}

/**
 * Create a session token and store it.
 */
export async function createOrganizerSession(organizerId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_EXPIRY_DAYS);

  await prisma.eventOrganizerSession.create({
    data: {
      organizerId,
      token,
      expiresAt,
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

/**
 * Get the current organizer from the session cookie.
 * Checks: organizer_session cookie → user-token cookie (email match).
 * Returns null if not authenticated.
 */
export async function getOrganizerSession(): Promise<OrganizerSession | null> {
  // 1. Try organizer_session cookie
  try {
    const cookieStore = await cookies();
    const cookie = cookieStore.get(COOKIE_NAME);
    if (cookie?.value) {
      const { payload } = await jwtVerify(cookie.value, JWT_SECRET);
      const sessionToken = payload.sessionToken as string;
      if (sessionToken) {
        const session = await prisma.eventOrganizerSession.findUnique({
          where: { token: sessionToken },
          include: {
            organizer: {
              select: { id: true, email: true, name: true, company: true, status: true, deactivatedAt: true, onboardingCompleted: true },
            },
          },
        });

        if (session && session.expiresAt >= new Date() && session.organizer.status !== "SUSPENDED" && !session.organizer.deactivatedAt) {
          return {
            id: session.organizer.id,
            email: session.organizer.email,
            name: session.organizer.name,
            company: session.organizer.company || undefined,
            onboardingCompleted: session.organizer.onboardingCompleted,
          };
        }
      }
    }
  } catch {}

  // 2. Fallback: user-token cookie → find organizer by email
  try {
    const cookieStore = await cookies();
    const userToken = cookieStore.get("user-token")?.value;
    if (userToken) {
      const { payload } = await jwtVerify(userToken, USER_JWT_SECRET);
      const email = (payload as any).email;
      if (email) {
        const organizer = await prisma.eventOrganizer.findUnique({
          where: { email: email.toLowerCase() },
          select: { id: true, email: true, name: true, company: true, status: true, deactivatedAt: true, onboardingCompleted: true },
        });
        if (organizer && organizer.status !== "SUSPENDED" && !organizer.deactivatedAt) {
          return {
            id: organizer.id,
            email: organizer.email,
            name: organizer.name,
            company: organizer.company || undefined,
            onboardingCompleted: organizer.onboardingCompleted,
          };
        }
      }
    }
  } catch {}

  return null;
}

/**
 * Fallback: Get organizer session from user-token cookie (unified flow).
 * Call this after getOrganizerSession() returns null.
 */
export async function getOrganizerSessionFromUserToken(): Promise<OrganizerSession | null> {
  try {
    const cookieStore = await cookies();
    const userToken = cookieStore.get("user-token")?.value;
    if (!userToken) return null;

    const { payload } = await jwtVerify(userToken, USER_JWT_SECRET);
    const email = (payload as any).email;
    if (!email) return null;

    const organizer = await prisma.eventOrganizer.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, email: true, name: true, company: true, status: true, deactivatedAt: true, onboardingCompleted: true },
    });

    if (!organizer || organizer.status === "SUSPENDED" || organizer.deactivatedAt) return null;

    return {
      id: organizer.id,
      email: organizer.email,
      name: organizer.name,
      company: organizer.company || undefined,
      onboardingCompleted: organizer.onboardingCompleted,
    };
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
