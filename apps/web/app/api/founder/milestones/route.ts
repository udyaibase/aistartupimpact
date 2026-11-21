import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { founderApi, tooMany } from "@/lib/founder/api-session";
import { checkMilestoneAmount, checkMilestoneCurrency, checkMilestoneDate } from "@/lib/founder/content-validation";
import { refreshPublicContent } from "@/lib/founder/refresh-listing";
import { verifyStartupAccess, getFounderStartups } from "@/lib/founder-content-auth";
import { canCreateContent } from "@/lib/founder-team-permissions";
import { contentWriteRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const VALID_TYPES = ["FUNDING", "LAUNCH", "PARTNERSHIP", "ACQUISITION", "AWARD", "HIRING", "REVENUE", "USER_MILESTONE"] as const;

export async function GET(request: NextRequest) {
  try {
    const guard = await founderApi();
    if (guard.error) return guard.error;
    const session = guard.session;

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
    const guard = await founderApi();
    if (guard.error) return guard.error;
    const session = guard.session;

    // Per founder, shared with updates and stories. It was 3 an hour per network, shared with unrelated actions.
    const limited = await tooMany(contentWriteRateLimit, `content:${session.userId}`);
    if (limited) return limited;

    const { startupId, type, title, description, amount, currency, date, confirmSimilar } = await request.json();

    if (!startupId) return NextResponse.json({ success: false, error: "Startup is required" }, { status: 400 });
    if (!title || typeof title !== "string" || title.length < 3) return NextResponse.json({ success: false, error: "Title must be at least 3 characters" }, { status: 400 });
    if (title.length > 200) return NextResponse.json({ success: false, error: "Title must be 200 characters or less" }, { status: 400 });
    if (!type || !VALID_TYPES.includes(type)) return NextResponse.json({ success: false, error: "Invalid milestone type" }, { status: 400 });
    if (!date) return NextResponse.json({ success: false, error: "Date is required" }, { status: 400 });
    const checkedDate = checkMilestoneDate(date);
    if (!checkedDate.ok) return NextResponse.json({ success: false, error: checkedDate.error }, { status: 400 });
    const milestoneDate = checkedDate.data;
    const checkedAmount = checkMilestoneAmount(amount);
    if (!checkedAmount.ok) return NextResponse.json({ success: false, error: checkedAmount.error }, { status: 400 });
    const checkedCurrency = checkMilestoneCurrency(currency);
    if (!checkedCurrency.ok) return NextResponse.json({ success: false, error: checkedCurrency.error }, { status: 400 });
    if (description !== undefined && description !== null && typeof description !== "string") return NextResponse.json({ success: false, error: "Description must be text" }, { status: 400 });

    const auth = await verifyStartupAccess(startupId);
    if (!auth) return NextResponse.json({ success: false, error: "Not authorized for this startup" }, { status: 403 });
    if (!auth.startupVerified) return NextResponse.json({ success: false, error: "Only verified startups can post updates. Verify your startup first.", code: "startup_unverified" }, { status: 403 });
    if (!canCreateContent(auth.role)) return NextResponse.json({ success: false, error: "Your role does not allow creating milestones" }, { status: 403 });

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

    // A milestone of the same kind within 30 days is usually the same event entered twice. Ask before saving a
    // second one; "confirmSimilar" is the founder saying it really is a different event.
    if (duplicates.length > 0 && confirmSimilar !== true) {
      const d = duplicates[0];
      return NextResponse.json({
        success: false,
        code: "similar",
        error: `You already have a similar milestone: “${d.title}” (${new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}).`,
      }, { status: 409 });
    }

    const milestone = await prisma.founderMilestone.create({
      data: {
        founderId: session.userId,
        startupId,
        type: type as any,
        title: title.slice(0, 200),
        description: description?.slice(0, 500) || null,
        amount: checkedAmount.data,
        currency: checkedCurrency.data,
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

    await refreshPublicContent(startupId);

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
