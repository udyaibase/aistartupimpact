import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { founderApi, tooMany } from "@/lib/founder/api-session";
import { checkMilestoneAmount, checkMilestoneCurrency, checkMilestoneDate } from "@/lib/founder/content-validation";
import { refreshPublicContent } from "@/lib/founder/refresh-listing";
import { verifyStartupAccess } from "@/lib/founder-content-auth";
import { canEditOwnContent, canEditAnyContent, canDeleteContent } from "@/lib/founder-team-permissions";
import { contentWriteRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const VALID_TYPES = ["FUNDING", "LAUNCH", "PARTNERSHIP", "ACQUISITION", "AWARD", "HIRING", "REVENUE", "USER_MILESTONE"] as const;

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guard = await founderApi();
    if (guard.error) return guard.error;
    const session = guard.session;

    // Per founder, shared with updates and stories. It was 3 an hour per network, shared with unrelated actions.
    const limited = await tooMany(contentWriteRateLimit, `content:${session.userId}`);
    if (limited) return limited;

    const { id } = await params;

    const milestone = await prisma.founderMilestone.findUnique({
      where: { id },
      select: { id: true, startupId: true, founderId: true },
    });
    if (!milestone) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    const auth = await verifyStartupAccess(milestone.startupId);
    if (!auth) return NextResponse.json({ success: false, error: "Not authorized" }, { status: 403 });

    const isOwn = milestone.founderId === session.userId;
    if (!isOwn && !canEditAnyContent(auth.role)) {
      return NextResponse.json({ success: false, error: "Not authorized to edit this milestone" }, { status: 403 });
    }
    if (isOwn && !canEditOwnContent(auth.role)) {
      return NextResponse.json({ success: false, error: "Your role does not allow editing" }, { status: 403 });
    }

    const body = await request.json();
    const updateData: any = {};

    if (body.title !== undefined) {
      if (typeof body.title !== "string" || body.title.trim().length < 3) return NextResponse.json({ success: false, error: "Title must be at least 3 characters" }, { status: 400 });
      updateData.title = body.title.trim().slice(0, 200);
    }
    if (body.description !== undefined) updateData.description = typeof body.description === "string" ? body.description.slice(0, 500) || null : null;
    if (body.type && VALID_TYPES.includes(body.type)) updateData.type = body.type;
    if (body.amount !== undefined) {
      const amount = checkMilestoneAmount(body.amount);
      if (!amount.ok) return NextResponse.json({ success: false, error: amount.error }, { status: 400 });
      updateData.amount = amount.data;
    }
    if (body.currency) {
      const currency = checkMilestoneCurrency(body.currency);
      if (!currency.ok) return NextResponse.json({ success: false, error: currency.error }, { status: 400 });
      updateData.currency = currency.data;
    }
    if (body.date) {
      const date = checkMilestoneDate(body.date);
      if (!date.ok) return NextResponse.json({ success: false, error: date.error }, { status: 400 });
      updateData.date = date.data;
    }
    if (body.isPublic !== undefined) updateData.isPublic = body.isPublic;

    const updated = await prisma.founderMilestone.update({ where: { id }, data: updateData });

    await prisma.contentActivityLog.create({
      data: {
        milestoneId: id,
        startupId: milestone.startupId,
        actorId: session.userId,
        actorType: "FOUNDER",
        action: "EDITED",
        metadata: { fields: Object.keys(updateData) },
      },
    });

    await refreshPublicContent(milestone.startupId);
    return NextResponse.json({ success: true, milestone: updated });
  } catch (err) {
    console.error("[founder/milestones/[id] PUT]", err);
    return NextResponse.json({ success: false, error: "Something went wrong" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guard = await founderApi();
    if (guard.error) return guard.error;
    const session = guard.session;

    // Per founder, shared with updates and stories. It was 3 an hour per network, shared with unrelated actions.
    const limited = await tooMany(contentWriteRateLimit, `content:${session.userId}`);
    if (limited) return limited;

    const { id } = await params;

    const milestone = await prisma.founderMilestone.findUnique({
      where: { id },
      select: { id: true, startupId: true, founderId: true },
    });
    if (!milestone) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    const auth = await verifyStartupAccess(milestone.startupId);
    if (!auth) return NextResponse.json({ success: false, error: "Not authorized" }, { status: 403 });

    const isOwn = milestone.founderId === session.userId;
    if (!isOwn && !canDeleteContent(auth.role)) {
      return NextResponse.json({ success: false, error: "Not authorized to delete this milestone" }, { status: 403 });
    }

    await prisma.founderMilestone.update({ where: { id }, data: { status: "DELETED" } });

    await prisma.contentActivityLog.create({
      data: {
        milestoneId: id,
        startupId: milestone.startupId,
        actorId: session.userId,
        actorType: "FOUNDER",
        action: "DELETED",
      },
    });

    await refreshPublicContent(milestone.startupId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[founder/milestones/[id] DELETE]", err);
    return NextResponse.json({ success: false, error: "Something went wrong" }, { status: 500 });
  }
}
