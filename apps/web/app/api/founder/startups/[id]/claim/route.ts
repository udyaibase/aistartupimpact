import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIdentifier, strictRateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/client-ip';
import { requireFounderAuth } from '@/lib/founder-auth';
import { prisma } from '@udyaibase/database';
import { claimToken } from '@/lib/startups/claim';
import { founderAtStartupLimit, STARTUP_LIMIT_MESSAGE } from '@/lib/founder/limits';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { success: withinLimit } = await checkRateLimit(strictRateLimit, getClientIdentifier(request));
  if (!withinLimit) return NextResponse.json({ success: false, error: 'Too many requests. Please try again later.' }, { status: 429 });

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

    // Check if startup exists using raw query
    const startups = await prisma.$queryRaw<any[]>`
      SELECT 
        id, name, "websiteUrl", "isVerified", "claimedBy", "verificationToken", "ownerId"
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

    // A verified startup already has a proven owner. Otherwise, whoever proves the domain becomes the owner.
    if (startup.isVerified && startup.ownerId !== session.userId) {
      return NextResponse.json(
        { error: `${startup.name} is already verified by another founder. Ask them to add you to their team.` },
        { status: 400 }
      );
    }

    if (startup.ownerId !== session.userId && (await founderAtStartupLimit(session.userId, id))) {
      return NextResponse.json({ error: STARTUP_LIMIT_MESSAGE }, { status: 400 });
    }

    // Extract domain from website URL
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
        { error: 'Startup must have a valid website URL' },
        { status: 400 }
      );
    }

    // Starting a claim only hands out this founder's DNS token. Nothing on the startup changes until they prove it.
    const token = claimToken(startup, session.userId);
    const dnsRecord = `udyaibase-verify=${token}`;

    // Log the claim attempt using raw query
    await prisma.$executeRaw`
      INSERT INTO "StartupVerificationLog" (
        id, "startupId", "userId", "action", "method", "token", "dnsRecord", 
        "success", "ipAddress", "userAgent", "createdAt"
      )
      VALUES (
        gen_random_uuid(),
        ${id}, 
        ${session.userId}, 
        'CLAIM_INITIATED', 
        'DNS', 
        ${token}, 
        ${dnsRecord},
        true,
        ${clientIp(request)},
        ${request.headers.get('user-agent') || null},
        NOW()
      )
    `;

    return NextResponse.json({
      success: true,
      token,
      dnsRecord,
      domain,
      message: 'Claim initiated successfully. Please add the DNS TXT record to verify ownership.',
    });
  } catch (error) {
    console.error('Error claiming startup:', error);
    return NextResponse.json(
      { error: 'Failed to claim startup' },
      { status: 500 }
    );
  }
}
