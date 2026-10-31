import { NextRequest, NextResponse } from "next/server";
import { clientIp } from '@/lib/client-ip';
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { prisma } from "@udyaibase/database";
import { getUnifiedSession } from "@/lib/unified-auth";
import { unlockWorkspace } from "@/lib/unified-auth/workspace";
import { checkRateLimit, getClientIdentifier, authRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const USER_JWT_SECRET = new TextEncoder().encode(
  process.env.USER_JWT_SECRET!
);

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
    const email = (payload as any).email;

    if (!email) return null;

    // Find UnifiedUser by email
    const unifiedUser = await prisma.unifiedUser.findUnique({ where: { email: email.toLowerCase() } });
    if (unifiedUser) return unifiedUser.id;

    // No UnifiedUser yet — this shouldn't happen after migration, but handle gracefully
    return null;
  } catch {
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
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
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
