import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@udyaibase/database";
import { withPublicRefresh } from '@/lib/refresh-public';

async function putHandler(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session: any = await getServerSession(authOptions);
    if (!session?.user || !["SUPER_ADMIN", "EDITOR_IN_CHIEF"].includes(session.user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { action } = await request.json();

    if (!action || !["verify", "unverify", "delete"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const milestone = await prisma.founderMilestone.findUnique({
      where: { id: params.id },
      select: { id: true, startupId: true },
    });
    if (!milestone) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (action === "verify") {
      await prisma.founderMilestone.update({
        where: { id: params.id },
        data: { verificationStatus: "PLATFORM_VERIFIED" },
      });
    } else if (action === "unverify") {
      await prisma.founderMilestone.update({
        where: { id: params.id },
        data: { verificationStatus: "FOUNDER_REPORTED" },
      });
    } else if (action === "delete") {
      await prisma.founderMilestone.update({
        where: { id: params.id },
        data: { status: "DELETED" },
      });
    }

    await prisma.contentActivityLog.create({
      data: {
        milestoneId: params.id,
        startupId: milestone.startupId,
        actorId: session.user.id,
        actorType: "ADMIN",
        action: action === "verify" ? "MILESTONE_VERIFIED" : action === "unverify" ? "MILESTONE_UNVERIFIED" : "DELETED",
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/milestones/[id] PUT]", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export const PUT = withPublicRefresh(['milestones', 'home'], putHandler);
