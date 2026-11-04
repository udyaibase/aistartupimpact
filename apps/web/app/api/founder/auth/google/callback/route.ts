import { NextRequest, NextResponse } from 'next/server';
import { logFounderSignIn } from '@/lib/founder/activity';
import { secondFactorChallenge } from '@/lib/auth/second-factor';
import { sql } from '@/lib/db';
import { verifyGoogleToken, isCompanyEmail, extractCompanyDomain, getCompanyNameFromDomain } from '@/lib/google-oauth';
import { setFounderSession } from '@/lib/founder-auth';

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    
    if (!code) {
      return NextResponse.redirect(new URL('/auth/signup?error=no_code', request.url));
    }

    // Verify Google token
    const googleUser = await verifyGoogleToken(code);
    
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
        await sql`
          UPDATE "FounderUser" SET
            "googleId" = ${googleUser.googleId},
            "authProvider" = 'google',
            "emailVerified" = true,
            avatar = COALESCE(avatar, ${googleUser.avatar}),
            "lastLoginAt" = NOW(),
            "updatedAt" = NOW()
          WHERE id = ${user[0].id}
        `;
        user[0].googleId = googleUser.googleId;
        user[0].authProvider = 'google';
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

    // Parse state to get return URL (validated to prevent open redirects)
    let returnTo = '/founder/dashboard';
    if (state) {
      try {
        const decoded = JSON.parse(Buffer.from(state, 'base64').toString());
        const candidate = decoded.returnTo || returnTo;
        if (typeof candidate === 'string' && candidate.startsWith('/') && !candidate.startsWith('//')) {
          returnTo = candidate;
        }
      } catch (e) {
        // Invalid state, use default
      }
    }

    // Redirect based on onboarding status
    if (!user[0].onboardingCompleted) {
      const onboardingUrl = new URL('/founder/onboarding', request.url);
      if (returnTo) {
        onboardingUrl.searchParams.set('returnTo', returnTo);
      }
      return NextResponse.redirect(onboardingUrl);
    }

    return NextResponse.redirect(new URL(returnTo, request.url));
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    return NextResponse.redirect(
      new URL('/auth/signup?error=oauth_failed&message=Authentication failed. Please try again.', request.url)
    );
  }
}
