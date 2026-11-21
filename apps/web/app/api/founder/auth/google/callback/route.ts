import { NextRequest, NextResponse } from 'next/server';
import { logFounderSignIn } from '@/lib/founder/activity';
import { secondFactorChallenge } from '@/lib/auth/second-factor';
import { sql } from '@/lib/db';
import { verifyGoogleToken, isCompanyEmail, extractCompanyDomain, getCompanyNameFromDomain } from '@/lib/google-oauth';
import { setFounderSession } from '@/lib/founder-auth';
import { clearOAuthState, readOAuthState } from '@/lib/auth/oauth-state';

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');

    if (!code) {
      return NextResponse.redirect(new URL('/auth/signup?error=no_code', request.url));
    }

    // The answer must belong to a sign-in this browser started (see lib/auth/oauth-state.ts).
    const returnPath = readOAuthState(request, '/founder/dashboard');
    if (!returnPath) {
      return clearOAuthState(NextResponse.redirect(new URL('/auth/login?error=oauth_state', request.url)));
    }

    // Verify Google token. Only a Google-verified address may sign in as that email.
    const verified = await verifyGoogleToken(code);
    if (!verified.emailVerified) {
      return clearOAuthState(NextResponse.redirect(new URL('/auth/signup?error=oauth_failed', request.url)));
    }
    const googleUser = { ...verified, email: verified.email.toLowerCase() };
    
    // Check if email is company email
    if (!isCompanyEmail(googleUser.email)) {
      return NextResponse.redirect(
        new URL('/auth/signup?error=personal_email&message=Please use your company email address', request.url)
      );
    }

    // Extract company domain
    const companyDomain = extractCompanyDomain(googleUser.email);
    const suggestedCompany = companyDomain ? getCompanyNameFromDomain(companyDomain) : null;

    // Check if user already exists
    let user = await sql`
      SELECT * FROM "FounderUser" WHERE email = ${googleUser.email} LIMIT 1
    `;

    if (user.length > 0) {
      // Update Google ID if not set
      if (!user[0].googleId) {
        // An account that already has a password keeps it (and stays an "email" account), so "forgot password"
        // goes on working. Only an account with no password becomes a Google account.
        await sql`
          UPDATE "FounderUser" SET
            "googleId" = ${googleUser.googleId},
            "authProvider" = CASE WHEN "passwordHash" IS NULL THEN 'google' ELSE "authProvider" END,
            "emailVerified" = true,
            avatar = COALESCE(avatar, ${googleUser.avatar}),
            "lastLoginAt" = NOW(),
            "updatedAt" = NOW()
          WHERE id = ${user[0].id}
        `;
        user[0].googleId = googleUser.googleId;
        if (!user[0].passwordHash) user[0].authProvider = 'google';
        user[0].emailVerified = true;
      } else {
        // Just update last login
        await sql`
          UPDATE "FounderUser" SET
            "lastLoginAt" = NOW(),
            "updatedAt" = NOW()
          WHERE id = ${user[0].id}
        `;
      }
    } else {
      // Create new user with raw SQL
      const result = await sql`
        INSERT INTO "FounderUser" (
          id, email, name, "googleId", "authProvider", "emailVerified",
          avatar, company, "companyDomain", status,
          "onboardingCompleted", "onboardingStep",
          "lastLoginAt", "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid(),
          ${googleUser.email},
          ${googleUser.name},
          ${googleUser.googleId},
          'google',
          true,
          ${googleUser.avatar},
          ${suggestedCompany},
          ${companyDomain},
          'ACTIVE',
          false,
          1,
          NOW(),
          NOW(),
          NOW()
        )
        RETURNING *
      `;
      user = result;
    }

    // Set session
    // Anyone with 2FA on signs in through the main form, which asks for their code.
    if (await secondFactorChallenge(user[0].email)) {
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }
    await setFounderSession(user[0].id, user[0].email, user[0].name, !!user[0].onboardingCompleted);
    await logFounderSignIn(user[0].email, request, 'google');

    const returnTo = returnPath; // checked against this browser's cookie above, and always a path on this site

    // Redirect based on onboarding status
    if (!user[0].onboardingCompleted) {
      const onboardingUrl = new URL('/founder/onboarding', request.url);
      if (returnTo) {
        onboardingUrl.searchParams.set('returnTo', returnTo);
      }
      return clearOAuthState(NextResponse.redirect(onboardingUrl));
    }

    return clearOAuthState(NextResponse.redirect(new URL(returnTo, request.url)));
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    return NextResponse.redirect(
      new URL('/auth/signup?error=oauth_failed&message=Authentication failed. Please try again.', request.url)
    );
  }
}
