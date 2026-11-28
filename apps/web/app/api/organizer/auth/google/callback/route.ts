import { claimHostAutoOffers } from '@/lib/offers/claim';
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import crypto from "crypto";
import { createOrganizerSession, findOrganizerByEmail, normalizeEmail } from "@/lib/organizer-auth";
import { setChallengeCookie } from "@/lib/organizer-auth/challenge";
import { isTwoFactorOn } from "@/lib/auth/account-two-factor";
import { OAuth2Client } from "google-auth-library";
import { logOrganizerActivity, organizerActor } from '@/lib/workspace-activity';

export const dynamic = "force-dynamic";

/**
 * GET /api/organizer/auth/google/callback
 * Handles the Google OAuth callback for organizer accounts.
 */
export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get("code");

    if (!code) {
      return NextResponse.redirect(new URL("/organizer/login?error=no_code", request.url));
    }

    // The state must be the one this browser was given when the sign-in started.
    const sent = request.nextUrl.searchParams.get("state") ?? "";
    const kept = request.cookies.get("organizer_oauth_state")?.value ?? "";
    const a = Buffer.from(sent), b = Buffer.from(kept);
    if (!sent || !kept || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return NextResponse.redirect(new URL("/organizer/login?error=oauth_failed", request.url));
    }

    // Use a dedicated OAuth client with the organizer redirect URI
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
    const redirectUri = `${siteUrl}/api/organizer/auth/google/callback`;

    const client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token!,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email || payload.email_verified === false) {
      return NextResponse.redirect(new URL("/organizer/login?error=oauth_failed", request.url));
    }

    const googleUser = {
      googleId: payload.sub,
      email: normalizeEmail(payload.email),
      name: payload.name || payload.email.split("@")[0],
      avatar: payload.picture || null,
    };

    // Check if organizer exists with this Google ID or email
    let organizer =
      (await prisma.eventOrganizer.findUnique({ where: { googleId: googleUser.googleId } })) ??
      (await findOrganizerByEmail(googleUser.email));

    if (organizer) {
      // Existing organizer — update Google ID if needed + login
      if (!organizer.googleId) {
        // An account that never confirmed its email may have been made by someone else with their own password.
        // Google has now shown who owns the address: drop that password and every session it started.
        const squatted = !organizer.emailVerified;
        if (squatted) await prisma.eventOrganizerSession.deleteMany({ where: { organizerId: organizer.id } });
        await prisma.eventOrganizer.update({
          where: { id: organizer.id },
          data: {
            ...(squatted ? { passwordHash: null, verifyToken: null, failedLoginAttempts: 0, lockedUntil: null } : {}),
            googleId: googleUser.googleId,
            emailVerified: true,
            status: "ACTIVE",
            avatar: organizer.avatar || googleUser.avatar,
            lastLoginAt: new Date(),
          },
        });
      } else {
        await prisma.eventOrganizer.update({
          where: { id: organizer.id },
          data: { lastLoginAt: new Date() },
        });
      }
    } else {
      // New organizer — create account (auto-verified since Google verified email)
      organizer = await prisma.eventOrganizer.create({
        data: {
          email: googleUser.email,
          name: googleUser.name,
          googleId: googleUser.googleId,
          avatar: googleUser.avatar,
          emailVerified: true,
          status: "ACTIVE",
        },
      });
      // Google has confirmed the email, so a running offer for new hosts or verified founders is granted now.
      await claimHostAutoOffers(organizer.id);
    }

    if (organizer.status === "SUSPENDED") {
      return NextResponse.redirect(new URL("/organizer/login?error=suspended", request.url));
    }

    if (organizer.deactivatedAt) {
      return NextResponse.redirect(new URL("/organizer/login?error=deactivated", request.url));
    }

    // 2FA is one setting per person: Google saying yes is the first step, the code is the second.
    if (await isTwoFactorOn(organizer.email)) {
      await setChallengeCookie(organizer.id);
      const res = NextResponse.redirect(new URL("/organizer/login?twofa=1", request.url));
      res.cookies.set("organizer_oauth_state", "", { path: "/api/organizer/auth/google", maxAge: 0 });
      return res;
    }

    await logOrganizerActivity(organizer.id, 'signed_in', { actor: { name: organizer.name, email: organizer.email }, request, metadata: { method: 'google' } });
    // Create session
    await createOrganizerSession(organizer.id);

    return NextResponse.redirect(new URL("/organizer", request.url));
  } catch (error) {
    console.error("Organizer Google OAuth error:", error);
    return NextResponse.redirect(new URL("/organizer/login?error=oauth_failed", request.url));
  }
}
