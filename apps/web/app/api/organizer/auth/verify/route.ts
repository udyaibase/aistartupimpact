import { claimHostAutoOffers } from '@/lib/offers/claim';
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { storedVerifyToken, verifyTokenIssuedAt } from "@/lib/organizer-auth/verify-token";

export const dynamic = "force-dynamic";

/**
 * GET /api/organizer/auth/verify?token=<token>
 * Verifies the organizer's email and redirects to dashboard.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  // Password-reset tokens share this column but are stored hashed with a "reset:" prefix, so they never match here.
  if (!token || token.startsWith("reset:") || token.startsWith("verify:")) {
    return NextResponse.redirect(new URL("/organizer/login?error=invalid_token", request.url));
  }

  try {
    // New links are stored hashed; links sent before that change were stored as sent.
    const hashed = storedVerifyToken(token);
    const organizer =
      (hashed ? await prisma.eventOrganizer.findUnique({ where: { verifyToken: hashed }, select: { id: true, emailVerified: true } }) : null) ??
      (await prisma.eventOrganizer.findUnique({ where: { verifyToken: token }, select: { id: true, emailVerified: true } }));

    if (!organizer) {
      return NextResponse.redirect(new URL("/organizer/login?error=invalid_token", request.url));
    }

    if (organizer.emailVerified) {
      return NextResponse.redirect(new URL("/organizer/login?verified=already", request.url));
    }

    // Links last 24 hours, as the email says (the time is the token's last part; older links without one are
    // still accepted). Signing in again sends a fresh link.
    const stamp = verifyTokenIssuedAt(token);
    if (stamp && Date.now() - stamp > 24 * 60 * 60 * 1000) {
      return NextResponse.redirect(new URL("/organizer/login?error=verify_expired", request.url));
    }

    // Mark as verified and activate
    await prisma.eventOrganizer.update({
      where: { id: organizer.id },
      data: {
        emailVerified: true,
        verifyToken: null,
        status: "ACTIVE",
      },
    });
    // The email is now confirmed: a running offer for new hosts or verified founders is granted here.
    await claimHostAutoOffers(organizer.id);

    return NextResponse.redirect(new URL("/organizer/login?verified=1", request.url));
  } catch (error) {
    console.error("Email verification error:", error);
    return NextResponse.redirect(new URL("/organizer/login?error=verification_failed", request.url));
  }
}
