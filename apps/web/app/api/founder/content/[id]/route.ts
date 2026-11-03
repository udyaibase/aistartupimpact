import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { getFounderSession } from "@/lib/founder-auth";
import { verifyStartupAccess, UNVERIFIED_STARTUP_ERROR } from "@/lib/founder-content-auth";
import { canEditOwnContent, canEditAnyContent, canDeleteContent } from "@/lib/founder-team-permissions";
import { checkRateLimit, getClientIdentifier, strictRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MAX_CONTENT_SIZE = 100000;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getFounderSession();
    if (!session) return NextResponse.json({ success: false }, { status: 401 });

    const { id } = await params;

    const article = await prisma.article.findUnique({
      where: { id },
      include: {
        Startup: { select: { id: true, name: true, slug: true } },
        SubmittedByFounder: { select: { id: true, name: true } },
        FounderAuthor: { select: { id: true, name: true } },
        ArticleVersion: { orderBy: { createdAt: "desc" }, take: 20 },
        ContentActivityLog: { orderBy: { createdAt: "desc" }, take: 50, include: { actor: { select: { id: true, name: true } } } },
      },
    });

    if (!article || !article.startupId) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    const auth = await verifyStartupAccess(article.startupId);
    if (!auth) return NextResponse.json({ success: false, error: "Not authorized" }, { status: 403 });

    if (!canEditAnyContent(auth.role) && article.submittedById !== session.userId) {
      return NextResponse.json({ success: false, error: "Not authorized" }, { status: 403 });
    }

    return NextResponse.json({ success: true, article });
  } catch (err) {
    console.error("[founder/content/[id] GET]", err);
    return NextResponse.json({ success: false, error: "Something went wrong" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getFounderSession();
    if (!session) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });

    const identifier = getClientIdentifier(request);
    const { success: rlOk } = await checkRateLimit(strictRateLimit, identifier);
    if (!rlOk) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const { id } = await params;

    const article = await prisma.article.findUnique({
      where: { id },
      select: { id: true, startupId: true, submittedById: true, status: true, moderationStatus: true, title: true, content: true, excerpt: true, coverImage: true },
    });
    if (!article || !article.startupId) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    const auth = await verifyStartupAccess(article.startupId);
    if (!auth) return NextResponse.json({ success: false, error: "Not authorized" }, { status: 403 });

    const isOwnContent = article.submittedById === session.userId;
    if (!isOwnContent && !canEditAnyContent(auth.role)) {
      return NextResponse.json({ success: false, error: "Not authorized to edit this content" }, { status: 403 });
    }
    if (isOwnContent && !canEditOwnContent(auth.role)) {
      return NextResponse.json({ success: false, error: "Your role does not allow editing" }, { status: 403 });
    }

    const body = await request.json();
    const { title, content, excerpt, coverImage, isAutoSave, submitForReview } = body;
    if (submitForReview && !auth.startupVerified) return NextResponse.json({ success: false, error: UNVERIFIED_STARTUP_ERROR, code: 'startup_unverified' }, { status: 403 });

    if (content !== undefined) {
      const contentStr = typeof content === "string" ? content : JSON.stringify(content);
      if (contentStr.length > MAX_CONTENT_SIZE) {
        return NextResponse.json({ success: false, error: "Content too large" }, { status: 400 });
      }
    }

    if (article.status === "PUBLISHED" && article.moderationStatus === "APPROVED" && !isAutoSave) {
      const versionCount = await prisma.articleVersion.count({ where: { articleId: id } });
      await prisma.articleVersion.create({
        data: {
          id: crypto.randomUUID(),
          articleId: id,
          versionNumber: versionCount + 1,
          title: article.title,
          content: article.content as any,
          excerpt: article.excerpt,
          coverImage: article.coverImage,
          createdBy: session.userId,
          changeNote: body.changeNote || null,
        },
      });
    }

    const updateData: any = { updatedAt: new Date() };
    if (title) updateData.title = title.slice(0, 200);
    if (content !== undefined) {
      updateData.content = content;
      if (typeof content === "string") updateData.contentText = content.slice(0, 50000);
    }
    if (excerpt !== undefined) updateData.excerpt = excerpt?.slice(0, 500) || null;
    if (coverImage !== undefined) updateData.coverImage = coverImage;

    if (isAutoSave) {
      updateData.lastSavedAt = new Date();
      updateData.autoSaved = true;
    }

    if (submitForReview && article.status === "DRAFT") {
      updateData.status = "IN_REVIEW";
      updateData.moderationStatus = "PENDING_REVIEW";
    }

    if (submitForReview && article.moderationStatus === "REJECTED") {
      updateData.status = "IN_REVIEW";
      updateData.moderationStatus = "PENDING_REVIEW";
    }

    const updated = await prisma.article.update({ where: { id }, data: updateData });

    const action = isAutoSave ? "EDITED" : submitForReview ? (article.moderationStatus === "REJECTED" ? "RESUBMITTED" : "SUBMITTED_FOR_REVIEW") : "EDITED";
    if (!isAutoSave) {
      await prisma.contentActivityLog.create({
        data: {
          contentId: id,
          startupId: article.startupId,
          actorId: session.userId,
          actorType: "FOUNDER",
          action: action as any,
          metadata: { fields: Object.keys(updateData).filter((k) => k !== "updatedAt") },
        },
      });
    }

    return NextResponse.json({ success: true, article: updated });
  } catch (err) {
    console.error("[founder/content/[id] PUT]", err);
    return NextResponse.json({ success: false, error: "Something went wrong" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getFounderSession();
    if (!session) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });

    const identifier = getClientIdentifier(request);
    const { success: rlOk } = await checkRateLimit(strictRateLimit, identifier);
    if (!rlOk) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const { id } = await params;

    const article = await prisma.article.findUnique({
      where: { id },
      select: { id: true, startupId: true, submittedById: true, title: true },
    });
    if (!article || !article.startupId) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    const auth = await verifyStartupAccess(article.startupId);
    if (!auth) return NextResponse.json({ success: false, error: "Not authorized" }, { status: 403 });

    const isOwnContent = article.submittedById === session.userId;
    if (!isOwnContent && !canDeleteContent(auth.role)) {
      return NextResponse.json({ success: false, error: "Not authorized to delete this content" }, { status: 403 });
    }

    await prisma.article.update({ where: { id }, data: { deletedAt: new Date(), status: "ARCHIVED" } });

    await prisma.contentActivityLog.create({
      data: {
        contentId: id,
        startupId: article.startupId,
        actorId: session.userId,
        actorType: "FOUNDER",
        action: "DELETED",
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[founder/content/[id] DELETE]", err);
    return NextResponse.json({ success: false, error: "Something went wrong" }, { status: 500 });
  }
}
