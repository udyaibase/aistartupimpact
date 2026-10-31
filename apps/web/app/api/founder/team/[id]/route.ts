import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { getFounderSession } from "@/lib/founder-auth";
import { canChangeRole, canRemoveMember } from "@/lib/founder-team-permissions";
import { verifyOTP } from "@/lib/action-otp";
import { checkRateLimit, getClientIdentifier, strictRateLimit } from "@/lib/rate-limit";
import { removeHiringAccess } from "@/lib/people/access";

export const dynamic = "force-dynamic";

const VALID_ROLES = ["ADMIN", "EDITOR", "VIEWER"] as const;

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getFounderSession();
    if (!session) return NextResponse.json({ success: false }, { status: 401 });

    const identifier = getClientIdentifier(request);
    const { success: rlOk } = await checkRateLimit(strictRateLimit, identifier);
    if (!rlOk) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const { id } = await params;

    const member = await prisma.founderTeamMember.findFirst({ where: { id, founderId: session.userId } });
    if (!member) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    const { role, otpToken, otpCode } = await request.json();
    if (!role || !VALID_ROLES.includes(role)) {
      return NextResponse.json({ success: false, error: "Invalid role" }, { status: 400 });
    }

    if (!otpToken || !otpCode) {
      return NextResponse.json({ success: false, error: "Verification code required" }, { status: 403 });
    }
    const otpResult = verifyOTP(otpToken, otpCode);
    if (!otpResult.valid) {
      return NextResponse.json({ success: false, error: otpResult.error }, { status: 403 });
    }

    if (member.email === session.email.toLowerCase()) {
      return NextResponse.json({ success: false, error: "Cannot change your own role" }, { status: 400 });
    }

    const actorRole = "OWNER" as const;
    if (!canChangeRole(actorRole, member.role, role)) {
      return NextResponse.json({ success: false, error: "Not authorized to change this role" }, { status: 403 });
    }

    await prisma.founderTeamMember.update({ where: { id }, data: { role } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[founder/team/[id] PUT]", err);
    return NextResponse.json({ success: false, error: "Something went wrong" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getFounderSession();
    if (!session) return NextResponse.json({ success: false }, { status: 401 });

    const identifier = getClientIdentifier(request);
    const { success: rlOk } = await checkRateLimit(strictRateLimit, identifier);
    if (!rlOk) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const { id } = await params;

    const member = await prisma.founderTeamMember.findFirst({ where: { id, founderId: session.userId } });
    if (!member) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    if (member.role === "OWNER") {
      return NextResponse.json({ success: false, error: "Cannot revoke the owner" }, { status: 400 });
    }

    if (member.email === session.email.toLowerCase()) {
      return NextResponse.json({ success: false, error: "Cannot revoke yourself" }, { status: 400 });
    }

    if (!canRemoveMember("OWNER", member.role)) {
      return NextResponse.json({ success: false, error: "Not authorized" }, { status: 403 });
    }

    let otpToken: string | undefined;
    let otpCode: string | undefined;
    let alsoHiring = false;
    try {
      const body = await request.json();
      otpToken = body.otpToken;
      otpCode = body.otpCode;
      alsoHiring = body.alsoHiring === true;
    } catch {
      return NextResponse.json({ success: false, error: "Verification code required" }, { status: 403 });
    }

    if (!otpToken || !otpCode) {
      return NextResponse.json({ success: false, error: "Verification code required" }, { status: 403 });
    }
    const otpResult = verifyOTP(otpToken, otpCode);
    if (!otpResult.valid) {
      return NextResponse.json({ success: false, error: otpResult.error }, { status: 403 });
    }

    await prisma.founderTeamMember.updateMany({
      where: { id, founderId: session.userId },
      data: { status: "REVOKED" },
    });
    // Offboarding in one step: also end their access to this founder's hiring workspaces.
    const hiringRemoved = alsoHiring ? await removeHiringAccess(session.userId, member.email) : 0;

    return NextResponse.json({ success: true, hiringRemoved });
  } catch (err) {
    console.error("[founder/team/[id] DELETE]", err);
    return NextResponse.json({ success: false, error: "Something went wrong" }, { status: 500 });
  }
}
