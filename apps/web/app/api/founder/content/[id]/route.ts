import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { founderApi, tooMany } from "@/lib/founder/api-session";
import { verifyStartupAccess, UNVERIFIED_STARTUP_ERROR } from "@/lib/founder-content-auth";
import { canEditOwnContent, canEditAnyContent, canDeleteContent } from "@/lib/founder-team-permissions";
import { contentWriteRateLimit, draftSaveRateLimit } from "@/lib/rate-limit";
import { bodyProblem, prepareBody } from "@/lib/founder/content-body";
import { checkContentFields, UPDATES_PER_DAY } from "@/lib/founder/content-validation";
import { refreshPublicContent } from "@/lib/founder/refresh-listing";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guard = await founderApi();
    if (guard.error) return guard.error;
    const session = guard.session;

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
    const guard = await founderApi();
    if (guard.error) return guard.error;
    const session = guard.session;


    const { id } = await params;

    const article = await prisma.article.findUnique({
      where: { id },
      select: { id: true, slug: true, type: true, startupId: true, submittedById: true, status: true, moderationStatus: true, title: true, content: true, excerpt: true, coverImage: true },
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

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
    const { isAutoSave, submitForReview } = body;

    // Saving a draft is frequent (the story editor autosaves); publishing and submitting are counted separately.
    const quietSave = article.status === "DRAFT" && !submitForReview && body.publish !== true;
    const limited = quietSave ? await tooMany(draftSaveRateLimit, `draft:${session.userId}`) : await tooMany(contentWriteRateLimit, `content:${session.userId}`);
    if (limited) return limited;

    const checked = checkContentFields(body, "edit");
    if (!checked.ok) return NextResponse.json({ success: false, error: checked.error }, { status: 400 });
    const { title, excerpt, coverImage } = checked.data;
    const prepared = checked.data.content !== undefined ? prepareBody(checked.data.content) : null;
    const content = prepared?.content;

    // Publishing a saved draft. Stories go to review (submitForReview); updates go live, like a new update does.
    const publishUpdate = body.publish === true && article.type === "STARTUP_UPDATE" && article.status === "DRAFT";
    // What goes public or to our editors must have real text: the new text if any was sent, else what's stored.
    if (submitForReview || publishUpdate) {
      const problem = bodyProblem(article.type, prepared ?? prepareBody(typeof article.content === "string" ? article.content : ""));
      if (problem) return NextResponse.json({ success: false, error: problem }, { status: 400 });
    }
    if ((submitForReview || publishUpdate) && !auth.startupVerified) return NextResponse.json({ success: false, error: UNVERIFIED_STARTUP_ERROR, code: 'startup_unverified' }, { status: 403 });
    if (publishUpdate) {
      const today = await prisma.article.count({
        where: { startupId: article.startupId, type: "STARTUP_UPDATE", publishedAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      });
      if (today >= UPDATES_PER_DAY) {
        return NextResponse.json({ success: false, error: `You can publish ${UPDATES_PER_DAY} updates a day. Your draft is saved; publish it tomorrow.`, code: "daily_limit" }, { status: 429 });
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
    if (title !== undefined) updateData.title = title;
    if (content !== undefined) {
      updateData.content = content;
      updateData.contentText = prepared!.text.slice(0, 50000);
      updateData.wordCount = prepared!.words;
      updateData.readTimeMinutes = prepared!.readMinutes;
    }
    if (excerpt !== undefined) updateData.excerpt = excerpt;
    if (coverImage !== undefined) updateData.coverImage = coverImage;
    // An approved story that is live: a change to what readers see goes back to our editors first. Otherwise a
    // harmless story could be approved and then rewritten. The approved version is kept in the version history.
    const same = (a: unknown, b: unknown) => (typeof a === "string" && typeof b === "string" ? a === b : JSON.stringify(a ?? null) === JSON.stringify(b ?? null));
    const liveStory = article.type === "FOUNDER_STORY" && article.status === "PUBLISHED" && article.moderationStatus === "APPROVED";
    const changed =
      (title !== undefined && title !== article.title) ||
      (content !== undefined && !same(content, article.content)) ||
      (excerpt !== undefined && (excerpt ?? null) !== (article.excerpt ?? null)) ||
      (coverImage !== undefined && (coverImage ?? null) !== (article.coverImage ?? null));
    const backToReview = liveStory && changed; // whatever the request says about autosave: that flag comes from the browser
    if (backToReview) {
      updateData.status = "IN_REVIEW";
      updateData.moderationStatus = "PENDING_REVIEW";
    }
    if (publishUpdate) {
      updateData.status = "PUBLISHED";
      updateData.moderationStatus = "APPROVED";
      updateData.publishedAt = new Date();
    }

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

    const action = isAutoSave ? "EDITED" : publishUpdate ? "PUBLISHED" : backToReview ? "RESUBMITTED" : submitForReview ? (article.moderationStatus === "REJECTED" ? "RESUBMITTED" : "SUBMITTED_FOR_REVIEW") : "EDITED";
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

    // Anything that is, or just became, public: show the change now, not when the hourly cache runs out.
    if (article.status === "PUBLISHED" || updated.status === "PUBLISHED") await refreshPublicContent(article.startupId, article.slug);

    return NextResponse.json({ success: true, article: updated, sentToReview: backToReview });
  } catch (err) {
    console.error("[founder/content/[id] PUT]", err);
    return NextResponse.json({ success: false, error: "Something went wrong" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guard = await founderApi();
    if (guard.error) return guard.error;
    const session = guard.session;

    const limited = await tooMany(contentWriteRateLimit, `content:${session.userId}`);
    if (limited) return limited;

    const { id } = await params;

    const article = await prisma.article.findUnique({
      where: { id },
      select: { id: true, slug: true, startupId: true, submittedById: true, title: true },
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

    await refreshPublicContent(article.startupId, article.slug); // gone from the public pages now

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[founder/content/[id] DELETE]", err);
    return NextResponse.json({ success: false, error: "Something went wrong" }, { status: 500 });
  }
}
