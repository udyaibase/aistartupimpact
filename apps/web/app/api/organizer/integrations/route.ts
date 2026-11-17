import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/organizer-auth/require-permission';
import { integrationStatus } from '@/lib/integrations/meetings';

export const dynamic = 'force-dynamic';

/** Which meeting tools are set up on Udyaibase and connected for this workspace. */
export async function GET() {
  const session = await requirePermission('events.view');
  if (session instanceof NextResponse) return session;
  return NextResponse.json({ success: true, integrations: await integrationStatus(session.organizerId) }, { headers: { 'Cache-Control': 'no-store' } });
}
