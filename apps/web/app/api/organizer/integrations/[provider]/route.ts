import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { requirePermission } from '@/lib/organizer-auth/require-permission';
import { isProvider, PROVIDER_LABEL, revoke } from '@/lib/integrations/providers';
import { decryptToken } from '@/lib/integrations/crypto';
import { logOrganizerActivity, organizerActor } from '@/lib/workspace-activity';

export const dynamic = 'force-dynamic';

/** Disconnect: revoke our access at Zoom/Google and delete the stored tokens. Existing meeting links keep working. */
export async function DELETE(request: NextRequest, props: { params: Promise<{ provider: string }> }) {
  const { provider } = await props.params;
  if (!isProvider(provider)) return NextResponse.json({ success: false, error: 'Unknown app' }, { status: 404 });
  const session = await requirePermission('settings');
  if (session instanceof NextResponse) return session;
  const row = await prisma.organizerIntegration.findUnique({ where: { organizerId_provider: { organizerId: session.organizerId, provider } } });
  if (!row) return NextResponse.json({ success: true });
  try { await revoke(provider, decryptToken(row.refreshTokenEnc ?? row.accessTokenEnc)); } catch { /* still remove locally */ }
  await prisma.organizerIntegration.delete({ where: { id: row.id } });
  await logOrganizerActivity(session.organizerId, 'integration_disconnected', { actor: organizerActor(session), request, metadata: { provider: PROVIDER_LABEL[provider] } });
  return NextResponse.json({ success: true });
}
