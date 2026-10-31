import { NextRequest, NextResponse } from 'next/server';
import { clientIp } from '@/lib/client-ip';
import { requireFounderAuth } from '@/lib/founder-auth';
import { prisma } from '@udyaibase/database';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

// Generate secure random token
function generateToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
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

    // Check if already claimed by someone else
    if (startup.claimedBy && startup.claimedBy !== session.userId) {
      return NextResponse.json(
        { error: 'Startup already claimed by another user' },
        { status: 400 }
      );
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

    // Generate or reuse verification token
    const token = startup.verificationToken || generateToken();
    const dnsRecord = `udyaibase-verify=${token}`;

    // Update startup with claim info using raw query
    await prisma.$executeRaw`
      UPDATE "Startup"
      SET "claimedBy" = ${session.userId},
          "claimedAt" = NOW(),
          "verificationToken" = ${token},
          "ownerId" = ${session.userId},
          "updatedAt" = NOW()
      WHERE id = ${id}
    `;

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
