import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { randomBytes } from "crypto";
import { checkRateLimit, getClientIdentifier, strictRateLimit } from "@/lib/rate-limit";
import { validatePassword } from "@/lib/password-validation";
import { logFounderActivity } from "@/lib/founder/activity";
import { maskEmail } from "@/lib/mask";

export const dynamic = "force-dynamic";

async function hasAccount(email: string): Promise<boolean> {
  const [founder, web, unified] = await Promise.all([
    prisma.founderUser.findUnique({ where: { email }, select: { id: true } }),
    prisma.webUser.findUnique({ where: { email }, select: { id: true } }),
    prisma.unifiedUser.findUnique({ where: { email }, select: { id: true } }),
  ]);
  return !!(founder || web || unified);
}

async function openInvite(token: unknown) {
  if (!token || typeof token !== "string") return null;
  const member = await prisma.founderTeamMember.findUnique({
    where: { inviteToken: token },
    include: { founder: { select: { id: true, name: true, company: true } } },
  });
  if (!member || member.status !== "PENDING") return null;
  if (member.expiresAt && member.expiresAt < new Date()) return null;
  return member;
}

const INVALID = { success: false, error: "This invite is no longer valid. Ask for a new one." };

/** What the invite is, so the page can say who's inviting and whether a password is needed. */
export async function GET(request: NextRequest) {
  const { success: rlOk } = await checkRateLimit(strictRateLimit, getClientIdentifier(request));
  if (!rlOk) return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });

  const member = await openInvite(request.nextUrl.searchParams.get("token"));
  if (!member) return NextResponse.json(INVALID, { status: 400 });
  const startup = await prisma.startup.findFirst({ where: { ownerId: member.founderId, deletedAt: null }, select: { name: true } });
  return NextResponse.json({
    success: true,
    invitedBy: member.founder?.name ?? "A founder",
    startup: startup?.name ?? member.founder?.company ?? null,
    role: member.role,
    needsPassword: !(await hasAccount(member.email.toLowerCase())),
  });
}

/** Accepts or declines. A new person sets a password. Someone with an account keeps theirs, and signs in as usual. */
export async function POST(request: NextRequest) {
  try {
    const { success: rlOk } = await checkRateLimit(strictRateLimit, getClientIdentifier(request));
    if (!rlOk) return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });

    const { token, password, action } = await request.json();
    const member = await openInvite(token);
    if (!member) return NextResponse.json(INVALID, { status: 400 });
    const email = member.email.toLowerCase();

    if (action === "decline") {
      await prisma.founderTeamMember.delete({ where: { id: member.id } });
      await logFounderActivity(member.founderId, "team_invite_declined", { request, metadata: { member: maskEmail(email) } });
      return NextResponse.json({ success: true, declined: true });
    }

    const existing = await hasAccount(email);
    let passwordHash: string | null = null;
    if (!existing) {
      if (!password || typeof password !== "string") return NextResponse.json({ success: false, error: "Password required" }, { status: 400 });
      const validation = validatePassword(password, { name: member.name, email });
      if (!validation.valid) return NextResponse.json({ success: false, error: validation.errors[0], errors: validation.errors }, { status: 400 });
      const { hash } = await import("bcryptjs");
      passwordHash = await hash(password, 12);
    }

    await prisma.founderTeamMember.update({
      where: { id: member.id },
      data: { status: "ACTIVE", acceptedAt: new Date(), inviteToken: null },
    });

    if (!(await prisma.founderUser.findUnique({ where: { email }, select: { id: true } }))) {
      await prisma.founderUser.create({
        data: {
          id: randomBytes(16).toString("hex"),
          email,
          name: member.name || email.split("@")[0],
          passwordHash,
          emailVerified: true,
          status: "ACTIVE",
          updatedAt: new Date(),
        },
      });
    }

    await logFounderActivity(member.founderId, "team_invite_accepted", { request, metadata: { member: maskEmail(email) } });
    return NextResponse.json({ success: true, message: "Welcome to the team! You can now log in." });
  } catch (err) {
    console.error("[founder/team/accept POST]", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ success: false, error: "Something went wrong" }, { status: 500 });
  }
}
