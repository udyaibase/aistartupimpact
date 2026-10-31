import { NextRequest, NextResponse } from 'next/server';
import { clientIp } from '@/lib/client-ip';
import { requireFounderAuth } from '@/lib/founder-auth';
import { prisma } from '@udyaibase/database';
import { verifyDNS } from '@udyaibase/utils/src/verification/dns';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    // Authenticate founder
    let session;
    try {
      session = await requireFounderAuth();
    } catch (authError) {
      return NextResponse.json(
        { error: 'Unauthorized - Please login' },
        { status: 401 }
      );
    }

    const { id } = params;

    // Get startup using raw query
    const startups = await prisma.$queryRaw<any[]>`
      SELECT 
        id, name, "websiteUrl", "isVerified", "claimedBy", "verificationToken"
      FROM "Startup"
      WHERE id = ${id}
      LIMIT 1
    `;

    const startup = startups[0];

    if (!startup) {
      return NextResponse.json(
        { error: 'Startup not found' },
        { status: 404 }
      );
    }

    // Check if user is the claimer
    if (startup.claimedBy !== session.userId) {
      return NextResponse.json(
        { error: 'You are not authorized to verify this startup' },
        { status: 403 }
      );
    }

    // Check if already verified
    if (startup.isVerified) {
      return NextResponse.json({
        success: true,
        verified: true,
        message: 'Startup is already verified',
      });
    }

    // Extract domain
    const extractDomain = (url: string): string => {
      try {
        const urlWithProtocol = url.startsWith('http') ? url : `https://${url}`;
        const parsed = new URL(urlWithProtocol);
        return parsed.hostname.replace(/^www\./, '');
      } catch {
        return url.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
      }
    };

    const domain = extractDomain(startup.websiteUrl || '');

    if (!domain || !startup.verificationToken) {
      return NextResponse.json(
        { error: 'Invalid verification setup' },
        { status: 400 }
      );
    }

    // Verify DNS record
    const result = await verifyDNS(domain, startup.verificationToken);
    const isVerified = result.verified;

    if (isVerified) {
      // Update startup as verified with VERIFIED status
      await prisma.$executeRaw`
        UPDATE "Startup"
        SET "isVerified" = true,
            "verifiedAt" = NOW(),
            "verifiedDomain" = ${domain},
            "claimStatus" = 'VERIFIED'::"ClaimStatus",
            "updatedAt" = NOW()
        WHERE id = ${id}
      `;

      // Log successful verification using raw query
      await prisma.$executeRaw`
        INSERT INTO "StartupVerificationLog" (
          id, "startupId", "userId", "action", "method", "token", "dnsRecord",
          "success", "ipAddress", "userAgent", "createdAt"
        )
        VALUES (
          gen_random_uuid(),
          ${id},
          ${session.userId},
          'DNS_VERIFIED',
          'DNS',
          ${startup.verificationToken},
          ${'udyaibase-verify=' + startup.verificationToken},
          true,
          ${clientIp(request)},
          ${request.headers.get('user-agent') || null},
          NOW()
        )
      `;

      return NextResponse.json({
        success: true,
        verified: true,
        message: 'Domain verified successfully! Your startup is now verified.',
      });
    } else {
      // Log failed verification using raw query
      await prisma.$executeRaw`
        INSERT INTO "StartupVerificationLog" (
          id, "startupId", "userId", "action", "method", "token", "dnsRecord",
          "success", "errorMessage", "ipAddress", "userAgent", "createdAt"
        )
        VALUES (
          gen_random_uuid(),
          ${id},
          ${session.userId},
          'VERIFICATION_FAILED',
          'DNS',
          ${startup.verificationToken},
          ${'udyaibase-verify=' + startup.verificationToken},
          false,
          'DNS record not found',
          ${clientIp(request)},
          ${request.headers.get('user-agent') || null},
          NOW()
        )
      `;

      return NextResponse.json({
        success: false,
        verified: false,
        error: result.error || 'DNS record not found. Please ensure you have added the TXT record correctly and wait a few minutes for DNS propagation.',
      });
    }
  } catch (error) {
    console.error('Error verifying startup:', error);
    return NextResponse.json(
      { error: 'Failed to verify startup' },
      { status: 500 }
    );
  }
}
