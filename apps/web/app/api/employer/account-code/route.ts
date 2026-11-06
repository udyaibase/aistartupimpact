import { NextRequest, NextResponse } from 'next/server';
import { requireEmployerAuth } from '@/lib/employer-auth';
import { can, forbidden } from '@/lib/employer/permissions';
import { sendActionCode } from '@/lib/employer/account-action';
import { writeLimited } from '@/lib/employer/write-limit';

export const dynamic = 'force-dynamic';

/** Emails the signed-in owner a code that confirms deleting or deactivating the workspace. */
export async function POST(request: NextRequest) {
  const limited = await writeLimited(request, 'account-code', 'sensitive');
  if (limited) return limited;

  let session;
  try {
    session = await requireEmployerAuth();
  } catch {
    return NextResponse.json({ success: false, error: 'Please log in again.' }, { status: 401 });
  }
  if (!can(session.role, 'account.manage')) return forbidden();

  const r = await sendActionCode(session.email);
  if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: r.status });
  return NextResponse.json({ success: true, sentTo: session.email });
}
