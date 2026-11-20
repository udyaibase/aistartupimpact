import { NextRequest, NextResponse } from 'next/server';
import { writeLimited } from '@/lib/employer/write-limit';
import { askFounder } from '@/lib/employer/company-check';
import { employerApi } from '@/lib/employer/api-session';

export const dynamic = 'force-dynamic';

/** "Send to your founder": we email them the link to verify the startup (and one reminder after 24 hours). */
export async function POST(request: NextRequest) {
  const limited = await writeLimited(request, 'founder-ask');
  if (limited) return limited;
  const guard = await employerApi('jobs.manage');
  if (guard.error) return guard.error;
  const session = guard.session;
  const { email } = await request.json().catch(() => ({}));
  const r = await askFounder({ employerId: session.id, memberEmail: session.email, founderEmail: typeof email === 'string' ? email : '' });
  return r.ok ? NextResponse.json({ success: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}
