import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireFounderAuth } from '@/lib/founder-auth';
import { prisma } from '@udyaibase/database';
import { verifyDNS } from '@udyaibase/utils/src/verification/dns';

export const dynamic = 'force-dynamic';

function generateToken(): string {
  return 'aisitool_' + crypto.randomBytes(8).toString('hex');
}

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
    const session = await requireFounderAuth();
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

    // Generate or retrieve verification token
    // Store in a simple pattern: we'll use a deterministic token based on tool ID
    const token = 'aisitool_' + tool.id.substring(0, 10);
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
    if (error.message?.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// POST — Trigger verification check
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await requireFounderAuth();
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

    const token = 'aisitool_' + tool.id.substring(0, 10);
    const domain = extractDomain(tool.websiteUrl || '');

    if (!domain) {
      return NextResponse.json({ error: 'No valid website URL' }, { status: 400 });
    }

    // Verify DNS
    const result = await verifyDNS(domain, token);

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
    if (error.message?.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Tool verification error:', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
