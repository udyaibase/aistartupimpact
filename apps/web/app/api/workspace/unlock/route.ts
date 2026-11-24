import { jwtSecret } from '@/lib/jwt-secret';
import { NextRequest, NextResponse } from "next/server";
import { clientIp } from '@/lib/client-ip';
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { prisma } from "@udyaibase/database";
import { getUnifiedSession } from "@/lib/unified-auth";
import { unlockWorkspace } from "@/lib/unified-auth/workspace";
import { checkRateLimit, getClientIdentifier, authRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const USER_JWT_SECRET = jwtSecret(process.env.USER_JWT_SECRET, 'USER_JWT_SECRET');

/**
 * Get the UnifiedUser ID from either the unified session or legacy user-token.
 */
async function getAuthenticatedUnifiedUserId(): Promise<string | null> {
  // 1. Try unified session
  const session = await getUnifiedSession();
  if (session) return session.id;

  // 2. Fallback: read legacy user-token → find the user's email → find UnifiedUser
  const cookieStore = await cookies();
  const userToken = cookieStore.get("user-token")?.value;
  if (!userToken) return null;

  try {
    const { payload } = await jwtVerify(userToken, USER_JWT_SECRET);
    const userId = (payload as any).userId;
    const email = typeof (payload as any).email === 'string' ? ((payload as any).email as string).toLowerCase() : '';
    if (!email || typeof userId !== 'string') return null;

    const unifiedUser = await prisma.unifiedUser.findUnique({ where: { email } });
    if (unifiedUser) return unifiedUser.id;

    // Site accounts (Google or email sign-up) never got a unified account, so opening a workspace failed with
    // "Not authenticated". Create it now, from the signed-in, active site account. Its email is proven: site
    // sign-up requires the emailed code and Google sign-in requires a Google-verified address.
    const webUser = await prisma.webUser.findUnique({ where: { id: userId }, select: { email: true, name: true, avatar: true, isActive: true } });
    if (!webUser || !webUser.isActive || webUser.email.toLowerCase() !== email) return null;
    // Two requests at once (e.g. setup page plus another tab) can both try to create it: the loser reads the winner's row.
    const created = await prisma.unifiedUser.upsert({
      where: { email },
      update: {},
      create: { email, name: webUser.name || email.split('@')[0], avatar: webUser.avatar, emailVerified: true },
      select: { id: true },
    }).catch(async (e: unknown) => {
      if ((e as { code?: string })?.code !== 'P2002') throw e;
      return prisma.unifiedUser.findUniqueOrThrow({ where: { email }, select: { id: true } });
    });
    return created.id;
  } catch (err) {
    console.error('[workspace/unlock] could not resolve the account:', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function POST(request: NextRequest) {
  // Rate limit
  const identifier = getClientIdentifier(request);
  const { success: rlOk } = await checkRateLimit(authRateLimit, identifier);
  if (!rlOk) {
    return NextResponse.json({ success: false, error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const unifiedUserId = await getAuthenticatedUnifiedUserId();
  if (!unifiedUserId) {
    return NextResponse.json({ success: false, error: "Please sign in again to continue." }, { status: 401 });
  }

  const { workspace } = await request.json();
  if (!workspace || !["organizer", "founder"].includes(workspace)) {
    return NextResponse.json({ success: false, error: "Invalid workspace" }, { status: 400 });
  }

  const ipAddress = clientIp(request);

  try {
    const result = await unlockWorkspace(unifiedUserId, workspace, ipAddress);

    if (result.status === "error") {
      return NextResponse.json({ success: false, error: result.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      status: result.status,
      message: result.message,
      redirectTo: result.redirectTo,
    });
  } catch (err) {
    console.error("[workspace/unlock]", err);
    return NextResponse.json({ success: false, error: "Something went wrong. Please try again later." }, { status: 500 });
  }
}
