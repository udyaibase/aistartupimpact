import { NextRequest, NextResponse } from 'next/server';
import { clientIp } from '@/lib/client-ip';
import { requireFounderAuth } from '@/lib/founder-auth';
import { prisma } from '@udyaibase/database';
import { verifyDNS } from '@udyaibase/utils/src/verification/dns';
import { claimToken } from '@/lib/startups/claim';
import { founderAtStartupLimit, STARTUP_LIMIT_MESSAGE } from '@/lib/founder/limits';
import { logFounderActivity } from '@/lib/founder/activity';
import { markStartupVerified } from '@/lib/startups/ownership';
import { refreshPublicListing } from '@/lib/founder/refresh-listing';
import { recordTakeover } from '@/lib/startups/verification-lifecycle';

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
        id, name, "websiteUrl", "isVerified", "ownerId", "verificationToken", "verificationMethod", "verifiedDomain"
      FROM "Startup"
      WHERE id = ${id} AND "deletedAt" IS NULL
      LIMIT 1
    `;

    const startup = startups[0];

    if (!startup) {
      return NextResponse.json(
        { error: 'Startup not found' },
        { status: 404 }
      );
    }

    // Already verified: only its owner can continue, except that DNS (the stronger proof) may take over a startup
    // verified only by a work email. The previous owner is told, and the takeover is logged.
    // DNS against DNS: only when the current owner's record is no longer on the domain (e.g. it changed hands),
    // so two DNS-verified founders can't keep taking it from each other.
    let takeover = false;
    if (startup.isVerified && startup.ownerId && startup.ownerId !== session.userId) {
      if (startup.verificationMethod === 'EMAIL') takeover = true;
      else if (startup.verificationMethod === 'DNS') {
        const theirs = await verifyDNS(
          startup.verifiedDomain || extractDomainFromUrl(startup.websiteUrl || ''),
          claimToken({ id: startup.id, ownerId: startup.ownerId, verificationToken: startup.verificationToken }, startup.ownerId),
        );
        if (theirs.lookupFailed) {
          return NextResponse.json({ error: 'We couldn’t check DNS right now. Try again in a minute.' }, { status: 503 });
        }
        takeover = !theirs.verified;
        if (!takeover) {
          return NextResponse.json(
            { error: `${startup.name} is verified by another founder whose DNS record is still on the domain. Ask them to transfer it to you, or contact support.` },
            { status: 403 }
          );
        }
      }
    }
    if (startup.isVerified && startup.ownerId !== session.userId && !takeover) {
      return NextResponse.json(
        { error: `${startup.name} is already verified by another founder. Ask them to add you to their team.` },
        { status: 403 }
      );
    }

    if (startup.ownerId !== session.userId && (await founderAtStartupLimit(session.userId, id))) {
      return NextResponse.json({ error: STARTUP_LIMIT_MESSAGE }, { status: 400 });
    }

    // An owner checking again renews the verification (see markStartupVerified).

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

    if (!domain) {
      return NextResponse.json(
        { error: 'Invalid verification setup' },
        { status: 400 }
      );
    }

    // Verify DNS record
    const token = claimToken(startup, session.userId);
    const result = await verifyDNS(domain, token);
    const isVerified = result.verified;

    if (isVerified) {
      // Proof given: this founder becomes the owner and everything we hold for the startup moves to them.
      const previousOwnerId: string | null = startup.ownerId;
      await markStartupVerified(prisma, id, domain, session.userId, {
        method: 'DNS', token, ipAddress: clientIp(request), userAgent: request.headers.get('user-agent'),
      });
      await refreshPublicListing('startup', id); // verified badge
      await logFounderActivity(session.userId, 'startup_claim_verified', { request, metadata: { startupId: id, method: 'dns' } });
      if (takeover && previousOwnerId) {
        await recordTakeover({ startupId: id, startupName: startup.name, domain, previousOwnerId, newOwnerId: session.userId, previousMethod: startup.verificationMethod === 'DNS' ? 'DNS' : 'EMAIL' });
      }

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
          ${token},
          ${'udyaibase-verify=' + token},
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

function extractDomainFromUrl(url: string): string {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
  }
}
