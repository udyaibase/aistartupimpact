import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';

export const dynamic = 'force-dynamic';

/**
 * Shareable "verify your startup" link (sent by a recruiter to their founder): /startups/claim/<slug>.
 * Signed-in founders go straight to the claim page; everyone else signs in first and comes back to it.
 */
export async function GET(request: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const startup = await prisma.startup.findFirst({ where: { slug, deletedAt: null }, select: { id: true } });
  if (!startup) return NextResponse.redirect(new URL('/startups', request.url));
  const claim = `/founder/claim/${startup.id}`;
  const signedIn = !!(request.cookies.get('founder-token')?.value || request.cookies.get('user-token')?.value);
  return NextResponse.redirect(new URL(signedIn ? claim : `/auth/login?returnTo=${encodeURIComponent(claim)}`, request.url));
}
