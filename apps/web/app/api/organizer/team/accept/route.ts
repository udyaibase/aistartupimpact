import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { apiRateLimit, authRateLimit, checkRateLimit, getClientIdentifier, rateLimitMessage, retryAfterHeaders } from "@/lib/rate-limit";
import { logOrganizerActivity } from '@/lib/workspace-activity';
import { maskEmail } from '@/lib/mask';
import { passwordProblem } from "@/lib/password-rules";
import { findOrganizerByEmail } from "@/lib/organizer-auth";

export const dynamic = "force-dynamic";

const ROLE_INFO: Record<string, { label: string; can: string }> = {
  ADMIN: { label: "Admin", can: "Manage events, registrations and the team." },
  MANAGER: { label: "Manager", can: "Create and edit events, and manage registrations." },
  STAFF: { label: "Staff", can: "Help run the events you're assigned to." },
  CHECK_IN: { label: "Check-in", can: "Check attendees in at the door for assigned events." },
};

/**
 * What the invite page shows before accepting: who invited you, to which team, in what role, and whether you
 * already have an organizer account (then you keep your password; there's nothing to set).
 */
export async function GET(request: NextRequest) {
  // Reading the invite is harmless and happens on every page load, so it uses the normal API limit; accepting
  // (POST) keeps the strict one.
  const { success: rlOk, reset: rlReset } = await checkRateLimit(apiRateLimit, `organizer-invite-view:${getClientIdentifier(request)}`);
  if (!rlOk) return NextResponse.json({ success: false, error: rateLimitMessage(rlReset) }, { status: 429, headers: retryAfterHeaders(rlReset) });
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ state: "invalid" }, { status: 400 });
  const member = await prisma.eventTeamMember.findUnique({
    where: { inviteToken: token },
    select: { email: true, role: true, status: true, expiresAt: true, organizer: { select: { name: true, company: true } } },
  }).catch(() => null);
  if (!member || member.status === "REVOKED") return NextResponse.json({ state: "invalid" });
  if (member.status === "ACTIVE") return NextResponse.json({ state: "accepted", email: member.email });
  if (member.expiresAt < new Date()) return NextResponse.json({ state: "expired", team: member.organizer?.company || member.organizer?.name || null });
  const account = await findOrganizerByEmail(member.email);
  const role = ROLE_INFO[member.role] ?? { label: member.role, can: "" };
  return NextResponse.json({
    state: "pending",
    email: member.email,
    team: member.organizer?.company || member.organizer?.name || "an organizer team",
    inviter: member.organizer?.name || null,
    role: role.label,
    roleCan: role.can,
    // An account that never confirmed its email doesn't count: its password may be someone else's.
    hasAccount: !!account?.passwordHash && account.emailVerified,
    expiresAt: member.expiresAt.toISOString(),
  });
}

export async function POST(request: NextRequest) {
  try {
    // Its own counter at the sign-in rate (5 per 15 minutes per IP). The shared 3-per-hour bucket blocked people
    // after a couple of tries; the token is a long random value, so guessing isn't a risk here.
    const identifier = `organizer-invite-accept:${getClientIdentifier(request)}`;
    const { success: rlOk, reset: rlReset } = await checkRateLimit(authRateLimit, identifier);
    if (!rlOk) return NextResponse.json({ success: false, error: rateLimitMessage(rlReset) }, { status: 429, headers: retryAfterHeaders(rlReset) });

    const body = await request.json().catch(() => ({}));
    const { token, password } = body as { token?: unknown; password?: unknown };
    const name = typeof body?.name === "string" ? body.name.trim().slice(0, 100) : "";

    if (!token || typeof token !== "string") {
      return NextResponse.json({ success: false, error: "Token required" }, { status: 400 });
    }

    const member = await prisma.eventTeamMember.findUnique({
      where: { inviteToken: token },
      include: { organizer: { select: { id: true, name: true, company: true } } },
    });
    const existingOrganizer = member ? await findOrganizerByEmail(member.email) : null;
    // Someone who already has a confirmed organizer account keeps their password; a new member must set one. An
    // account that never confirmed its email may have been made by someone else, so its password is replaced: the
    // invite link, sent to this address, is what proves who owns it.
    const needsPassword = !existingOrganizer?.passwordHash || !existingOrganizer.emailVerified;
    if (needsPassword) {
      if (!password || typeof password !== "string") {
        return NextResponse.json({ success: false, error: "Set a password to continue." }, { status: 400 });
      }
      const problem = passwordProblem(password, member?.email, 'mixed', name);
      if (problem) return NextResponse.json({ success: false, error: problem, field: "password" }, { status: 400 });
    }

    if (!member) {
      return NextResponse.json({ success: false, error: "Invalid or expired invite" }, { status: 400 });
    }
    if (member.expiresAt < new Date()) {
      return NextResponse.json({ success: false, error: "Invite expired. Ask organizer to resend." }, { status: 400 });
    }
    if (member.status === "ACTIVE") {
      return NextResponse.json({ success: false, error: "Already accepted" }, { status: 400 });
    }
    if (member.status === "REVOKED") {
      return NextResponse.json({ success: false, error: "Invalid or expired invite" }, { status: 400 });
    }
    if (existingOrganizer && (existingOrganizer.status === "SUSPENDED" || existingOrganizer.deactivatedAt)) {
      return NextResponse.json({ success: false, error: "This account can't join a team right now. Contact support." }, { status: 403 });
    }

    const { hash } = await import("bcryptjs");
    const passwordHash = needsPassword ? await hash(password as string, 12) : existingOrganizer!.passwordHash;

    // Only one accept can flip a pending invite.
    const flipped = await prisma.eventTeamMember.updateMany({
      where: { id: member.id, status: "PENDING" },
      data: { status: "ACTIVE", acceptedAt: new Date() },
    });
    if (!flipped.count) return NextResponse.json({ success: false, error: "Already accepted" }, { status: 400 });

    let accountId = existingOrganizer?.id;
    if (!existingOrganizer) {
      const created = await prisma.eventOrganizer.create({
        data: {
          email: member.email,
          name: name || member.email.split("@")[0],
          passwordHash,
          emailVerified: true,
          status: "ACTIVE",
          company: member.organizer?.company || undefined,
        },
        select: { id: true },
      });
      accountId = created.id;
    } else if (needsPassword) {
      if (!existingOrganizer.emailVerified) await prisma.eventOrganizerSession.deleteMany({ where: { organizerId: existingOrganizer.id } });
      await prisma.eventOrganizer.update({
        where: { id: existingOrganizer.id },
        data: { passwordHash, emailVerified: true, status: "ACTIVE", verifyToken: null, ...(name ? { name } : {}) },
      });
    }

    // From now on the membership belongs to this account, whatever happens to the email address later.
    await prisma.eventTeamMember.update({ where: { id: member.id }, data: { memberOrganizerId: accountId } });

    await logOrganizerActivity(member.organizerId, 'team_invite_accepted', { actor: { email: member.email }, request, metadata: { member: maskEmail(member.email) } });
    return NextResponse.json({ success: true, email: member.email, existingAccount: !needsPassword, team: member.organizer?.company || member.organizer?.name || null });
  } catch (err) {
    console.error("[organizer/team/accept]", err);
    return NextResponse.json({ success: false, error: "Something went wrong" }, { status: 500 });
  }
}
