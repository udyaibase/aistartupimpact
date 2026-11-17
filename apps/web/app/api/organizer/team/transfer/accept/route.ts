import { NextRequest, NextResponse } from "next/server";
import { createOrganizerSession, getOrganizerSession } from "@/lib/organizer-auth";
import { acceptOwnershipTransfer, readTransfer, sendTransferDoneEmails, TransferError } from "@/lib/organizer-auth/ownership-transfer";
import { OWN_WORKSPACE, WORKSPACE_COOKIE } from "@/lib/organizer-auth/workspace";
import { apiRateLimit, checkRateLimit, getClientIdentifier } from "@/lib/rate-limit";
import { logOrganizerActivity } from "@/lib/workspace-activity";
import { maskEmail } from "@/lib/mask";

export const dynamic = "force-dynamic";

/** What the accept page shows: whose workspace, for which account, and whether this browser is that account. */
export async function GET(request: NextRequest) {
  const { success } = await checkRateLimit(apiRateLimit, `organizer-transfer-view:${getClientIdentifier(request)}`);
  if (!success) return NextResponse.json({ success: false, error: "Too many requests." }, { status: 429 });
  const found = await readTransfer(request.nextUrl.searchParams.get("token") || "");
  if (!found) return NextResponse.json({ success: false, error: "This link has expired or was cancelled. Ask the owner to send it again." }, { status: 410 });
  const session = await getOrganizerSession();
  return NextResponse.json({
    success: true,
    workspace: found.workspace.name,
    toEmail: found.transfer.toEmail,
    expiresAt: found.transfer.expiresAt,
    hasPayouts: found.workspace.hasPayouts,
    signedIn: !!session,
    isRecipient: session?.id === found.transfer.toAccountId,
  });
}

/** Accept: { token }. The new owner is signed straight in to the workspace. */
export async function POST(request: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ success: false, error: "Sign in first." }, { status: 401 });
  const { success } = await checkRateLimit(apiRateLimit, `organizer-transfer-accept:${session.id}`);
  if (!success) return NextResponse.json({ success: false, error: "Too many requests." }, { status: 429 });
  const { token } = await request.json().catch(() => ({}));
  try {
    const done = await acceptOwnershipTransfer(typeof token === "string" ? token : "", session.id);
    await logOrganizerActivity(done.workspaceId, "ownership_transferred", {
      actor: { name: session.name, email: done.newOwnerEmail }, request,
      metadata: { member: maskEmail(done.newOwnerEmail), previous: maskEmail(done.oldOwnerEmail) },
    });
    sendTransferDoneEmails(done);
    await createOrganizerSession(done.workspaceId);
    const res = NextResponse.json({ success: true, workspace: done.workspaceName });
    res.cookies.set(WORKSPACE_COOKIE, OWN_WORKSPACE, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 90 });
    return res;
  } catch (err) {
    if (err instanceof TransferError) return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    console.error("[organizer/transfer/accept]", err);
    return NextResponse.json({ success: false, error: "Something went wrong. Nothing was changed." }, { status: 500 });
  }
}
