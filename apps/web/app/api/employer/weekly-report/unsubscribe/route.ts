import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { applicationStatusRateLimit } from '@/lib/event-rate-limit';
import { turnOffReport, verifyReportToken, type ReportRecipient } from '@/lib/employer/weekly-report';

export const dynamic = 'force-dynamic';

/**
 * Turns the Monday hiring report off without signing in: the page's button, or a mail app's one-click
 * List-Unsubscribe POST. Only a valid signed link for that person works.
 */
export async function POST(request: NextRequest) {
  const { success } = await checkRateLimit(applicationStatusRateLimit, getClientIdentifier(request));
  if (!success) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  const sp = request.nextUrl.searchParams;
  const kind = sp.get('k');
  const r: ReportRecipient | null = kind === 'workspace' || kind === 'member' ? { kind, id: sp.get('id') ?? '' } : null;
  if (!r || !verifyReportToken(r, sp.get('t') ?? '')) return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 404 });
  await turnOffReport(r);
  return NextResponse.json({ ok: true });
}
