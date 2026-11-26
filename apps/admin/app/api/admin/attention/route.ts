import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { getAttentionCounts } from '@/lib/attention';

export const dynamic = 'force-dynamic';

const STAFF = ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SENIOR_WRITER', 'WRITER', 'AD_MANAGER', 'CONTRIBUTOR', 'EVENT_ORGANIZER'];

/** Counts of waiting work for the signed-in staff member's role (sidebar badges, dashboard, search). */
export async function GET() {
  const { session, error } = await requireApiAuth(STAFF);
  if (error) return error;
  const counts = await getAttentionCounts(session.user.role);
  return NextResponse.json({ counts }, { headers: { 'Cache-Control': 'private, no-store' } });
}
