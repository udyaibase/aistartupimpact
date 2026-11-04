import { NextRequest, NextResponse } from "next/server";
import { logFounderSignIn } from '@/lib/founder/activity';
import { secondFactorChallenge } from '@/lib/auth/second-factor';
import { prisma } from "@udyaibase/database";
import { createUnifiedSession } from "@/lib/unified-auth";

export const dynamic = "force-dynamic";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI_UNIFIED ||
  (process.env.NEXT_PUBLIC_BASE_URL ? `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/google/callback` : "http://localhost:3000/api/auth/google/callback");

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const state = searchParams.get("state") || "/profile";
    const error = searchParams.get("error");

    if (error || !code) {
      return NextResponse.redirect(new URL("/?error=oauth_cancelled", request.url));
    }

    // Exchange code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID || "",
        client_secret: GOOGLE_CLIENT_SECRET || "",
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    const tokens = await tokenResponse.json();
    if (!tokens.access_token) {
      return NextResponse.redirect(new URL("/?error=oauth_token_failed", request.url));
    }

    // Get user info from Google
    const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const googleUser = await userInfoResponse.json();

    if (!googleUser.email) {
      return NextResponse.redirect(new URL("/?error=oauth_no_email", request.url));
    }

    const email = googleUser.email.toLowerCase();
    const name = googleUser.name || email.split("@")[0];
    const avatar = googleUser.picture || null;
    const googleId = googleUser.id;

    // Find or create UnifiedUser
    let user = await prisma.unifiedUser.findFirst({
      where: { OR: [{ email }, { googleId }] },
    });

    if (!user) {
      user = await prisma.unifiedUser.create({
        data: {
          email,
          name,
          avatar,
          googleId,
          emailVerified: true, // Google verifies email
        },
      });
    } else {
      // Update avatar and googleId if missing
      const updates: any = {};
      if (!user.googleId && googleId) updates.googleId = googleId;
      if (!user.avatar && avatar) updates.avatar = avatar;
      if (!user.emailVerified) updates.emailVerified = true;
      if (Object.keys(updates).length > 0) {
        await prisma.unifiedUser.update({ where: { id: user.id }, data: updates });
      }
    }

    // Create unified session
    // Anyone with 2FA on signs in through the main form, which asks for their code.
    if (user.twoFactorEnabled || (await secondFactorChallenge(user.email))) {
      return NextResponse.redirect(new URL("/auth/login", request.url));
    }
    await createUnifiedSession(user.id, "google");
    await logFounderSignIn(user.email, request, "google");

    return NextResponse.redirect(new URL(state, request.url));
  } catch (error) {
    console.error("Google OAuth callback error:", error);
    return NextResponse.redirect(new URL("/?error=oauth_error", request.url));
  }
}
