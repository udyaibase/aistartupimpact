import { jwtSecret } from '@/lib/jwt-secret';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { jwtVerify } from 'jose';
import { checkRateLimit, getClientIdentifier, strictRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const identifier = getClientIdentifier(request);
    const { success } = await checkRateLimit(strictRateLimit, identifier);
    if (!success) return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });

    const { token } = await request.json();

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Token is required' },
        { status: 400 }
      );
    }

    const secret = jwtSecret(process.env.NEXTAUTH_SECRET, 'NEXTAUTH_SECRET');
    let email: string;

    try {
      const { payload } = await jwtVerify(token, secret);
      email = payload.email as string;
      if (!email) throw new Error('No email in token');
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired link' },
        { status: 401 }
      );
    }

    const normalizedEmail = email.toLowerCase();

    await prisma.$transaction(async (tx) => {
      const registrations = await tx.eventRegistration.findMany({
        where: { guestEmail: normalizedEmail },
        select: { id: true },
      });

      if (registrations.length > 0) {
        const regIds = registrations.map(r => r.id);
        await tx.eventRegistrationAnswer.deleteMany({
          where: { registrationId: { in: regIds } },
        });
      }

      await tx.eventRegistration.deleteMany({
        where: { guestEmail: normalizedEmail },
      });

      await tx.eventSubscriber.deleteMany({
        where: { email: normalizedEmail },
      });
    });

    return NextResponse.json({
      success: true,
      message: 'All your event data has been permanently deleted.',
    });
  } catch (error) {
    console.error('Event data deletion error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete data' },
      { status: 500 }
    );
  }
}
