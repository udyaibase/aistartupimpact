import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { verifyHostOptOutToken } from '@/lib/events/after-event';

export const dynamic = 'force-dynamic';

/**
 * Stop follow-up and survey emails from an event's host. Accepts the page's form POST and the one-click
 * List-Unsubscribe POST mail apps send. The signed token names one registration; nothing else changes.
 */
export async function POST(request: NextRequest) {
  let token = request.nextUrl.searchParams.get('t');
  if (!token) {
    const ct = request.headers.get('content-type') || '';
    if (ct.includes('application/json')) token = (await request.json().catch(() => ({})))?.t ?? null;
    else token = String((await request.formData().catch(() => null))?.get('t') ?? '') || null;
  }
  const registrationId = verifyHostOptOutToken(token);
  if (!registrationId) return NextResponse.json({ success: false, error: 'This link isn’t valid.' }, { status: 400 });
  await prisma.eventRegistration.updateMany({ where: { id: registrationId, hostEmailsOptOutAt: null }, data: { hostEmailsOptOutAt: new Date() } });
  return NextResponse.json({ success: true });
}
