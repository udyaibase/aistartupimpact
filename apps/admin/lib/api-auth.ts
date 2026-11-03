import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";

const ADMIN_ROLES = ["SUPER_ADMIN", "EDITOR_IN_CHIEF", "SENIOR_WRITER"];
const ALL_ROLES = ["SUPER_ADMIN", "EDITOR_IN_CHIEF", "SENIOR_WRITER", "WRITER"];

interface AuthOptions {
  /** Only for the 2FA endpoints themselves (setup / disable / status), which check codes on their own. */
  allowPending2FA?: boolean;
}

/**
 * Two-factor state of a session, checked here as well as in middleware — so an API route or server action is
 * never reachable on the Google sign-in alone, even if a path slips past the middleware matcher.
 */
export function twoFactorBlock(session: any): { status: 401 | 403; message: string } | null {
  if (session?.twoFactorEnabled && !session?.twoFactorVerified) {
    return { status: 401, message: "Two-factor verification required" };
  }
  if (session?.require2FA && !session?.twoFactorEnabled) {
    return { status: 403, message: "Set up two-factor authentication to continue" };
  }
  return null;
}

export async function requireApiAuth(allowedRoles: string[] = ADMIN_ROLES, opts: AuthOptions = {}) {
  const session: any = await getServerSession(authOptions);

  if (!session?.user) {
    return { session: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const block = opts.allowPending2FA ? null : twoFactorBlock(session);
  if (block) {
    return { session: null, error: NextResponse.json({ error: block.message }, { status: block.status }) };
  }

  const userRole = session.user.role;
  if (!allowedRoles.includes(userRole)) {
    return { session: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { session, error: null };
}

export async function requireActionAuth(allowedRoles: string[] = ADMIN_ROLES) {
  const session: any = await getServerSession(authOptions);

  if (!session?.user) {
    return { session: null, error: "Unauthorized" };
  }

  const block = twoFactorBlock(session);
  if (block) {
    return { session: null, error: block.message };
  }

  const userRole = session.user.role;
  if (!allowedRoles.includes(userRole)) {
    return { session: null, error: "Forbidden: insufficient permissions" };
  }

  return { session, error: null };
}

export { ADMIN_ROLES, ALL_ROLES };
