import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { jwtSecret } from "@/lib/jwt-secret";
import { sql } from "@/lib/db";
import { destroyOrganizerSession } from "@/lib/organizer-auth";
import { destroyUnifiedSession } from "@/lib/unified-auth";
import { WORKSPACE_COOKIE } from "@/lib/organizer-auth/workspace";

export const dynamic = "force-dynamic";

const USER_JWT_SECRET = jwtSecret(process.env.USER_JWT_SECRET, "USER_JWT_SECRET");

/**
 * Sign out of the organizer portal. The portal also opens from the main site's sign-in (user-token) and the
 * unified session, so those end too: otherwise "Sign out" would leave the person signed in.
 */
export async function POST() {
  await destroyOrganizerSession();
  await destroyUnifiedSession().catch(() => {});

  const cookieStore = await cookies();
  const userToken = cookieStore.get("user-token")?.value;
  if (userToken) {
    try {
      const { payload } = await jwtVerify(userToken, USER_JWT_SECRET);
      const sessionId = (payload as { sessionId?: string }).sessionId;
      if (sessionId) await sql`DELETE FROM "WebUserSession" WHERE id = ${sessionId}`.catch(() => {});
    } catch {}
    cookieStore.delete("user-token");
  }
  cookieStore.delete(WORKSPACE_COOKIE);
  return NextResponse.json({ success: true });
}
