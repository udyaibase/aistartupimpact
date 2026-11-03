import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { getFounderSession } from "@/lib/founder-auth";
import { verifyStartupAccess, getFounderStartups } from "@/lib/founder-content-auth";
import { canCreateContent } from "@/lib/founder-team-permissions";
import { checkRateLimit, getClientIdentifier, strictRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const VALID_TYPES = ["FUNDING", "LAUNCH", "PARTNERSHIP", "ACQUISITION", "AWARD", "HIRING", "REVENUE", "USER_MILESTONE"] as const;

export async function GET(request: NextRequest) {
  try {
    const session = await getFounderSession();
    if (!session) return NextResponse.json({ success: false }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const startupId = searchParams.get("startupId");

    const startups = await getFounderStartups(session.userId);
    if (startups.length === 0) return NextResponse.json({ success: true, milestones: [], startups: [] });

    const startupIds = startups.map((s) => s.id);
    const targetIds = startupId && startupIds.includes(startupId) ? [startupId] : startupIds;

    const milestones = await prisma.founderMilestone.findMany({
      where: { startupId: { in: targetIds }, status: { not: "DELETED" } },
      include: {
        startup: { select: { id: true, name: true, slug: true } },
        founder: { select: { id: true, name: true } },
      },
      orderBy: { date: "desc" },
      take: 100,
    });

    return NextResponse.json({ success: true, milestones, startups });
  } catch (err) {
    console.error("[founder/milestones GET]", err);
    return NextResponse.json({ success: false, error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getFounderSession();
    if (!session) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });

    const identifier = getClientIdentifier(request);
    const { success: rlOk } = await checkRateLimit(strictRateLimit, identifier);
    if (!rlOk) return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });

    const { startupId, type, title, description, amount, currency, date } = await request.json();

    if (!startupId) return NextResponse.json({ success: false, error: "Startup is required" }, { status: 400 });
    if (!title || typeof title !== "string" || title.length < 3) return NextResponse.json({ success: false, error: "Title must be at least 3 characters" }, { status: 400 });
    if (title.length > 200) return NextResponse.json({ success: false, error: "Title must be 200 characters or less" }, { status: 400 });
    if (!type || !VALID_TYPES.includes(type)) return NextResponse.json({ success: false, error: "Invalid milestone type" }, { status: 400 });
    if (!date) return NextResponse.json({ success: false, error: "Date is required" }, { status: 400 });

    const auth = await verifyStartupAccess(startupId);
    if (!auth) return NextResponse.json({ success: false, error: "Not authorized for this startup" }, { status: 403 });
    if (!auth.startupVerified) return NextResponse.json({ success: false, error: "Only verified startups can post updates. Verify your startup first.", code: "startup_unverified" }, { status: 403 });
    if (!canCreateContent(auth.role)) return NextResponse.json({ success: false, error: "Your role does not allow creating milestones" }, { status: 403 });

    const milestoneDate = new Date(date);
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const duplicates = await prisma.founderMilestone.findMany({
      where: {
        startupId,
        type: type as any,
        status: { not: "DELETED" },
        date: {
          gte: new Date(milestoneDate.getTime() - thirtyDaysMs),
          lte: new Date(milestoneDate.getTime() + thirtyDaysMs),
        },
      },
      select: { id: true, title: true, date: true },
    });

    const milestone = await prisma.founderMilestone.create({
      data: {
        founderId: session.userId,
        startupId,
        type: type as any,
        title: title.slice(0, 200),
        description: description?.slice(0, 500) || null,
        amount: amount ? parseFloat(amount) : null,
        currency: currency?.slice(0, 10) || "INR",
        date: milestoneDate,
      },
    });

    await prisma.contentActivityLog.create({
      data: {
        milestoneId: milestone.id,
        startupId,
        actorId: session.userId,
        actorType: "FOUNDER",
        action: "CREATED",
      },
    });

    return NextResponse.json({
      success: true,
      milestone,
      duplicateWarning: duplicates.length > 0 ? `Similar milestone exists: "${duplicates[0].title}"` : null,
    });
  } catch (err) {
    console.error("[founder/milestones POST]", err);
    return NextResponse.json({ success: false, error: "Something went wrong" }, { status: 500 });
  }
}
