import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { jwtSecret } from "@/lib/jwt-secret";

/**
 * The second step of an organizer sign-in. The first step (password, Google, a reset link) proved one thing; when
 * 2FA is on, no session starts until the code is entered too. The token lasts 5 minutes and is useless without the code.
 */
const CHALLENGE_SECRET = jwtSecret(process.env.ORGANIZER_JWT_SECRET || process.env.USER_JWT_SECRET, "ORGANIZER_JWT_SECRET");
export const CHALLENGE_COOKIE = "organizer_2fa_challenge";

export async function organizerChallengeToken(organizerId: string): Promise<string> {
  return new SignJWT({ userId: organizerId, userType: "organizer", purpose: "2fa-challenge" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(CHALLENGE_SECRET);
}

/** The organizer id a challenge token was issued for, or null when it is invalid or expired. */
export async function readChallengeToken(token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, CHALLENGE_SECRET);
    if (payload.purpose !== "2fa-challenge" || typeof payload.userId !== "string") return null;
    return payload.userId;
  } catch {
    return null;
  }
}

/** For sign-ins that end in a redirect (Google): the challenge travels in a short-lived, http-only cookie. */
export async function setChallengeCookie(organizerId: string): Promise<void> {
  (await cookies()).set(CHALLENGE_COOKIE, await organizerChallengeToken(organizerId), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 300, path: "/api/organizer/auth",
  });
}
