import { NextRequest, NextResponse } from 'next/server';
import { employerApi } from '@/lib/employer/api-session';
import { sendActionCode } from '@/lib/employer/account-action';
import { writeLimited } from '@/lib/employer/write-limit';

export const dynamic = 'force-dynamic';

/** Emails the signed-in owner a code that confirms deleting or deactivating the workspace. */
export async function POST(request: NextRequest) {
  const limited = await writeLimited(request, 'account-code', 'sensitive');
  if (limited) return limited;

  const guard = await employerApi('account.manage');
  if (guard.error) return guard.error;
  const session = guard.session;

  const r = await sendActionCode(session.email);
  if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: r.status });
  return NextResponse.json({ success: true, sentTo: session.email });
}
