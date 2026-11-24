import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { verifyPauseToken } from '@/lib/network/profile';

export const dynamic = 'force-dynamic';

/** One-click unsubscribe from network emails (RFC 8058: mail apps POST here). Pauses the profile. */
export async function POST(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') ?? '';
  if (!verifyPauseToken(id, req.nextUrl.searchParams.get('t'))) return NextResponse.json({ error: 'Invalid link.' }, { status: 400 });
  await prisma.jobBoardOpenProfile.updateMany({ where: { id, pausedAt: null }, data: { pausedAt: new Date() } });
  return NextResponse.json({ success: true });
}
