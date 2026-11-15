import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/organizer-auth";
import { activeMembership, OWN_WORKSPACE, teamMemberships, WORKSPACE_COOKIE } from "@/lib/organizer-auth/workspace";

export const dynamic = "force-dynamic";

/** The workspaces this person can work in, and which one is active. */
export async function GET() {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  const { active, memberships } = await activeMembership(session.id, session.email);
  return NextResponse.json({
    success: true,
    active: active?.organizerId ?? OWN_WORKSPACE,
    workspaces: [
      { id: OWN_WORKSPACE, name: session.company || session.name, role: "OWNER" },
      ...memberships.map((m) => ({ id: m.organizerId, name: m.organizerName, role: m.role })),
    ],
  });
}

/** Choose a workspace: { workspace: "own" | <host id> }. A host id must be one whose team they are on right now. */
export async function POST(request: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  const { workspace } = await request.json().catch(() => ({}));
  if (typeof workspace !== "string" || !workspace) return NextResponse.json({ success: false, error: "Choose a workspace." }, { status: 400 });
  if (workspace !== OWN_WORKSPACE && !(await teamMemberships(session.id, session.email)).some((m) => m.organizerId === workspace)) {
    return NextResponse.json({ success: false, error: "You’re not on that team." }, { status: 403 });
  }
  const res = NextResponse.json({ success: true, active: workspace });
  res.cookies.set(WORKSPACE_COOKIE, workspace, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 90,
  });
  return res;
}
