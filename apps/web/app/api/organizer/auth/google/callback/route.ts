import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { createOrganizerSession } from "@/lib/organizer-auth";
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
    if (!payload || !payload.email) {
      return NextResponse.redirect(new URL("/organizer/login?error=oauth_failed", request.url));
    }

    const googleUser = {
      googleId: payload.sub,
      email: payload.email,
      name: payload.name || payload.email.split("@")[0],
      avatar: payload.picture || null,
    };

    // Check if organizer exists with this Google ID or email
    let organizer = await prisma.eventOrganizer.findFirst({
      where: {
        OR: [
          { googleId: googleUser.googleId },
          { email: googleUser.email },
        ],
      },
    });

    if (organizer) {
      // Existing organizer — update Google ID if needed + login
      if (!organizer.googleId) {
        await prisma.eventOrganizer.update({
          where: { id: organizer.id },
          data: {
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
    }

    if (organizer.status === "SUSPENDED") {
      return NextResponse.redirect(new URL("/organizer/login?error=suspended", request.url));
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
