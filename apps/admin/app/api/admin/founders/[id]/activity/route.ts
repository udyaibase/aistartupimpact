import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { requireApiAuth } from '@/lib/api-auth';
import { logAuditEvent } from '@/lib/audit-log';

export const dynamic = 'force-dynamic';

/**
 * A founder's activity log, for security investigations. It holds IP addresses, so: Super Admins only (with 2FA, via
 * requireApiAuth), a written reason is required, and every view goes in the admin audit log. POST so the reason never
 * lands in a URL or access log.
 */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { error } = await requireApiAuth(['SUPER_ADMIN']);
  if (error) return error;

  const { id } = await props.params;
  const body = await request.json().catch(() => ({}));
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (reason.length < 10) {
    return NextResponse.json({ error: 'Say why you need this log, in at least 10 characters.' }, { status: 400 });
  }

  try {
    const entries = await prisma.founderActivityLog.findMany({
      where: { founderId: id },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { id: true, action: true, ipAddress: true, userAgent: true, metadata: true, createdAt: true },
    });

    await logAuditEvent({
      action: 'ACCESS',
      resourceType: 'USER',
      resourceId: id,
      resourceName: 'Founder activity log',
      after: { reason, entries: entries.length },
    });

    return NextResponse.json({ entries });
  } catch (err) {
    console.error('[founder-activity] admin view failed', err instanceof Error ? err.message : 'unknown error');
    return NextResponse.json({ error: 'Couldn’t load this log. Try again.' }, { status: 500 });
  }
}
