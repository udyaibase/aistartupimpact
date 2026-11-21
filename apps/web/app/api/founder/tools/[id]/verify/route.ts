import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { founderApi, tooMany } from '@/lib/founder/api-session';
import { dnsCheckRateLimit } from '@/lib/rate-limit';
import { prisma } from '@udyaibase/database';
import { verifyDNS } from '@udyaibase/utils/src/verification/dns';

export const dynamic = 'force-dynamic';

/**
 * The value a founder puts in their DNS to prove they control the tool's domain. Made from a server secret, so it
 * can't be worked out from the tool's public id, and tied to the owner, so it stops working if the tool changes hands.
 */
function toolVerifyToken(toolId: string, ownerId: string): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('NEXTAUTH_SECRET is not set');
  return 'aisitool_' + crypto.createHmac('sha256', `${secret}:tool-verify`).update(`${toolId}\n${ownerId}`).digest('hex').slice(0, 20);
}
const legacyToolVerifyToken = (toolId: string) => 'aisitool_' + toolId.substring(0, 10);

function extractDomain(url: string): string {
  try {
    const urlWithProtocol = url.startsWith('http') ? url : `https://${url}`;
    const parsed = new URL(urlWithProtocol);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
  }
}

// GET — Check verification status & get token/instructions
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const guard = await founderApi();
    if (guard.error) return guard.error;
    const session = guard.session;
    const { id } = params;

    const tools = await prisma.$queryRaw<any[]>`
      SELECT id, name, slug, "websiteUrl", "isUrlVerified", "ownerId", "claimStatus"
      FROM "AiTool"
      WHERE id = ${id} AND "deletedAt" IS NULL
      LIMIT 1
    `;

    const tool = tools[0];
    if (!tool) {
      return NextResponse.json({ error: 'Tool not found' }, { status: 404 });
    }

    if (tool.ownerId !== session.userId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    if (tool.isUrlVerified) {
      return NextResponse.json({ verified: true, message: 'Tool is already verified' });
    }

    const token = toolVerifyToken(tool.id, session.userId);
    const domain = extractDomain(tool.websiteUrl || '');

    return NextResponse.json({
      verified: false,
      domain,
      token,
      dnsRecord: `udyaibase-verify=${token}`,
      instructions: {
        method: 'DNS TXT Record',
        steps: [
          `Go to your DNS provider for ${domain}`,
          `Add a TXT record at @ (the root of the domain) with value: udyaibase-verify=${token}`,
          'Wait 1-5 minutes for DNS propagation',
          'Click "Verify" to check',
        ],
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// POST — Trigger verification check
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const guard = await founderApi();
    if (guard.error) return guard.error;
    const session = guard.session;
    const limited = await tooMany(dnsCheckRateLimit, `dns:${session.userId}`);
    if (limited) return limited;
    const { id } = params;

    const tools = await prisma.$queryRaw<any[]>`
      SELECT id, name, slug, "websiteUrl", "isUrlVerified", "ownerId"
      FROM "AiTool"
      WHERE id = ${id} AND "deletedAt" IS NULL
      LIMIT 1
    `;

    const tool = tools[0];
    if (!tool) {
      return NextResponse.json({ error: 'Tool not found' }, { status: 404 });
    }

    if (tool.ownerId !== session.userId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    if (tool.isUrlVerified) {
      return NextResponse.json({ verified: true, message: 'Already verified' });
    }

    const token = toolVerifyToken(tool.id, session.userId);
    const domain = extractDomain(tool.websiteUrl || '');

    if (!domain) {
      return NextResponse.json({ error: 'No valid website URL' }, { status: 400 });
    }

    // Verify DNS
    let result = await verifyDNS(domain, token);
    // Records added before tokens became unguessable used a token made from the tool's id. Still accepted, so a
    // founder who already added one isn't asked to change their DNS.
    if (!result.verified) result = await verifyDNS(domain, legacyToolVerifyToken(tool.id));

    if (result.verified) {
      await prisma.$executeRaw`
        UPDATE "AiTool"
        SET "isUrlVerified" = true,
            "claimStatus" = 'VERIFIED'::"ClaimStatus",
            "updatedAt" = NOW()
        WHERE id = ${id}
      `;

      return NextResponse.json({
        verified: true,
        message: 'Domain verified successfully! Your tool now has the Verified badge.',
      });
    }

    return NextResponse.json({
      verified: false,
      message: 'DNS record not found yet. Please ensure the TXT record is added and wait for propagation (1-5 minutes).',
    });
  } catch (error: any) {
    console.error('Tool verification error:', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
