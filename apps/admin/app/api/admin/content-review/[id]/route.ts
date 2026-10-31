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

    const { action, note } = await request.json();

    if (!action || !["approve", "reject", "request_revision"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const article = await prisma.article.findUnique({
      where: { id: params.id },
      select: { id: true, type: true, startupId: true, moderationStatus: true },
    });
    if (!article) return NextResponse.json({ error: "Not found" }, { status: 404 });

    let updateData: any = {
      moderatedBy: session.user.id,
      moderatedAt: new Date(),
      moderationNote: typeof note === "string" ? note.slice(0, 1000) : null,
      updatedAt: new Date(),
    };

    if (action === "approve") {
      updateData.moderationStatus = "APPROVED";
      updateData.status = "PUBLISHED";
      updateData.publishedAt = new Date();
    } else if (action === "reject") {
      updateData.moderationStatus = "REJECTED";
      updateData.status = "DRAFT";
    } else if (action === "request_revision") {
      updateData.moderationStatus = "REVISION_REQUESTED";
      updateData.status = "DRAFT";
    }

    await prisma.article.update({ where: { id: params.id }, data: updateData });

    if (article.startupId) {
      await prisma.contentActivityLog.create({
        data: {
          contentId: params.id,
          startupId: article.startupId,
          actorId: session.user.id,
          actorType: "ADMIN",
          action: action === "approve" ? "APPROVED" : action === "reject" ? "REJECTED" : "REVISION_REQUESTED",
          metadata: note ? { note: note.slice(0, 1000) } : undefined,
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/content-review/[id] PUT]", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export const PUT = withPublicRefresh(['news', 'stories', 'opinions', 'milestones', 'home'], putHandler);
