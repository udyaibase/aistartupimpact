import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { requirePermission } from "@/lib/organizer-auth/require-permission";
import { confirmAccountHolder } from "@/lib/organizer-auth/confirm-action";
import { cancelOwnershipTransfer, pendingTransfer, startOwnershipTransfer, TransferError, workspaceTransferProblem } from "@/lib/organizer-auth/ownership-transfer";
import { authRateLimit, checkRateLimit } from "@/lib/rate-limit";
import { logOrganizerActivity, organizerActor } from "@/lib/workspace-activity";
import { maskEmail } from "@/lib/mask";

export const dynamic = "force-dynamic";

const ownerOnly = () => NextResponse.json({ success: false, error: "Only the workspace owner can transfer it." }, { status: 403 });

/** The pending transfer of this workspace, and whether one can be started now. Owner only. */
export async function GET() {
  const session = await requirePermission("team.manage");
  if (session instanceof NextResponse) return session;
  if (session.role !== "OWNER") return ownerOnly();
  const [pending, blocked] = await Promise.all([pendingTransfer(session.organizerId), workspaceTransferProblem(session.organizerId)]);
  return NextResponse.json({ success: true, pending, blocked });
}

/** Start: { memberId, password? | codeToken + password(code) }. */
export async function POST(request: NextRequest) {
  const session = await requirePermission("team.manage");
  if (session instanceof NextResponse) return session;
  if (session.role !== "OWNER") return ownerOnly();
  const { success } = await checkRateLimit(authRateLimit, `organizer-transfer:${session.organizerId}`);
  if (!success) return NextResponse.json({ success: false, error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  if (typeof body.memberId !== "string" || !body.memberId) return NextResponse.json({ success: false, error: "Choose who should take over." }, { status: 400 });

  const owner = await prisma.eventOrganizer.findUnique({ where: { id: session.organizerId }, select: { id: true, email: true, passwordHash: true } });
  if (!owner) return NextResponse.json({ success: false, error: "Account not found." }, { status: 404 });
  const confirmed = await confirmAccountHolder(owner, body, "organizer-transfer");
  if (!confirmed.ok) return confirmed.response;

  try {
    const started = await startOwnershipTransfer(session.organizerId, body.memberId);
    await logOrganizerActivity(session.organizerId, "ownership_transfer_requested", { actor: organizerActor(session), request, metadata: { member: maskEmail(started.toEmail) } });
    return NextResponse.json({ success: true, pending: started });
  } catch (err) {
    if (err instanceof TransferError) return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    throw err;
  }
}

/** Cancel the pending transfer. */
export async function DELETE(request: NextRequest) {
  const session = await requirePermission("team.manage");
  if (session instanceof NextResponse) return session;
  if (session.role !== "OWNER") return ownerOnly();
  const count = await cancelOwnershipTransfer(session.organizerId);
  if (count) await logOrganizerActivity(session.organizerId, "ownership_transfer_cancelled", { actor: organizerActor(session), request });
  return NextResponse.json({ success: true });
}
