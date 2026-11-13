import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { createOrganizerSession, verifyPassword } from '@/lib/organizer-auth';
import { checkRateLimit, getClientIdentifier, strictRateLimit } from '@/lib/rate-limit';
import { logOrganizerActivity, organizerActor } from '@/lib/workspace-activity';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const identifier = getClientIdentifier(request);
    const { success } = await checkRateLimit(strictRateLimit, identifier);
    if (!success) return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });

    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const organizer = await prisma.eventOrganizer.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, email: true, name: true, passwordHash: true, deactivatedAt: true, status: true },
    });

    if (!organizer || !organizer.passwordHash) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    if (organizer.status === 'SUSPENDED') {
      return NextResponse.json({ error: 'Account is suspended. Contact support.' }, { status: 403 });
    }

    if (!organizer.deactivatedAt) {
      return NextResponse.json({ error: 'Account is not deactivated' }, { status: 400 });
    }

    const valid = await verifyPassword(password, organizer.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    await prisma.eventOrganizer.update({
      where: { id: organizer.id },
      data: { deactivatedAt: null, lastLoginAt: new Date() },
    });
    await logOrganizerActivity(organizer.id, 'account_reactivated', { actor: { name: organizer.name, email: organizer.email }, request });

    await createOrganizerSession(organizer.id);

    return NextResponse.json({
      success: true,
      message: 'Account reactivated. Your draft events remain as drafts — you can republish from your dashboard.',
    });
  } catch (error) {
    console.error('Organizer reactivation error:', error);
    return NextResponse.json({ error: 'Reactivation failed' }, { status: 500 });
  }
}
