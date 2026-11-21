import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { founderApi, tooMany } from "@/lib/founder/api-session";
import { verifyStartupAccess, getFounderStartups, UNVERIFIED_STARTUP_ERROR } from "@/lib/founder-content-auth";
import { canCreateContent, canViewAllDrafts } from "@/lib/founder-team-permissions";
import { contentWriteRateLimit, draftSaveRateLimit } from "@/lib/rate-limit";
import { bodyProblem, prepareBody } from "@/lib/founder/content-body";
import { checkContentFields, UPDATES_PER_DAY } from "@/lib/founder/content-validation";
import { refreshPublicContent } from "@/lib/founder/refresh-listing";
import { generateUniqueSlug } from "@udyaibase/utils";
import crypto from "crypto";

async function createUniqueSlug(title: string): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const slug = generateUniqueSlug(title);
    const existing = await prisma.article.findUnique({ where: { slug }, select: { id: true } });
    if (!existing) return slug;
  }
  return generateUniqueSlug(title + "-" + Date.now());
}

export const dynamic = "force-dynamic";

const VALID_TYPES = ["FOUNDER_STORY", "STARTUP_UPDATE"] as const;
const SYSTEM_AUTHOR_ID = "system-founder-content";

export async function GET(request: NextRequest) {
  try {
    const guard = await founderApi();
    if (guard.error) return guard.error;
    const session = guard.session;

    const { searchParams } = new URL(request.url);
    const startupId = searchParams.get("startupId");
    const type = searchParams.get("type");
    const status = searchParams.get("status");

    const startups = await getFounderStartups(session.userId);
    if (startups.length === 0) return NextResponse.json({ success: true, articles: [], startups: [] });

    const startupIds = startups.map((s) => s.id);
    const targetIds = startupId && startupIds.includes(startupId) ? [startupId] : startupIds;

    const where: any = { startupId: { in: targetIds }, type: { in: ["FOUNDER_STORY", "STARTUP_UPDATE"] }, deletedAt: null };
    if (type && VALID_TYPES.includes(type as any)) where.type = type;

    const isOwnerOrAdmin = startups.some((s) => targetIds.includes(s.id) && (s.role === "OWNER" || s.role === "ADMIN"));
    if (!isOwnerOrAdmin) {
      where.submittedById = session.userId;
    }
    const VALID_STATUSES = ["DRAFT", "IN_REVIEW", "PUBLISHED", "ARCHIVED"];
    if (status && VALID_STATUSES.includes(status)) where.status = status;

    const articles = await prisma.article.findMany({
      where,
      select: {
        id: true, title: true, slug: true, type: true, status: true, coverImage: true,
        moderationStatus: true, moderationNote: true, publishedAt: true, createdAt: true,
        updatedAt: true, viewCount: true, startupId: true, submittedById: true, founderAuthorId: true,
        lastSavedAt: true, autoSaved: true, scheduledAt: true,
        Startup: { select: { id: true, name: true, slug: true } },
        SubmittedByFounder: { select: { id: true, name: true } },
        FounderAuthor: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    // Published coverage of their startups or tools, which they can read but don't manage.
    const tools = await prisma.aiTool.findMany({ where: { ownerId: session.userId, deletedAt: null }, select: { id: true } });
    const mentions = await prisma.article.findMany({
      where: {
        status: "PUBLISHED",
        deletedAt: null,
        type: { notIn: ["FOUNDER_STORY", "STARTUP_UPDATE"] },
        OR: [
          { startupId: { in: startupIds } },
          { StartupMentions: { some: { startupId: { in: startupIds } } } },
          { ToolMentions: { some: { toolId: { in: tools.map((t) => t.id) } } } },
        ],
      },
      select: { id: true, title: true, slug: true, type: true, publishedAt: true },
      orderBy: { publishedAt: "desc" },
      take: 20,
    });

    return NextResponse.json({ success: true, articles, startups, mentions });
  } catch (err) {
    console.error("[founder/content GET]", err);
    return NextResponse.json({ success: false, error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const guard = await founderApi();
    if (guard.error) return guard.error;
    const session = guard.session;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
    const { type, startupId, isDraft } = body;

    // Saving a draft is frequent (the story editor autosaves); publishing and submitting are counted separately.
    const limited = isDraft ? await tooMany(draftSaveRateLimit, `draft:${session.userId}`) : await tooMany(contentWriteRateLimit, `content:${session.userId}`);
    if (limited) return limited;

    if (!startupId || typeof startupId !== "string") return NextResponse.json({ success: false, error: "Startup is required" }, { status: 400 });
    const checked = checkContentFields(body, "create");
    if (!checked.ok) return NextResponse.json({ success: false, error: checked.error }, { status: 400 });
    const { excerpt, coverImage } = checked.data;
    const title = checked.data.title as string;
    const prepared = prepareBody(checked.data.content);

    const auth = await verifyStartupAccess(startupId);
    if (!auth) return NextResponse.json({ success: false, error: "Not authorized for this startup" }, { status: 403 });
    if (!isDraft && !auth.startupVerified) return NextResponse.json({ success: false, error: UNVERIFIED_STARTUP_ERROR, code: 'startup_unverified' }, { status: 403 });
    if (!canCreateContent(auth.role)) return NextResponse.json({ success: false, error: "Your role does not allow creating content" }, { status: 403 });

    const articleType = VALID_TYPES.includes(type) ? type : "STARTUP_UPDATE";

    // A draft can be anything; what goes public or to our editors must have real text.
    if (!isDraft) {
      const problem = bodyProblem(articleType, prepared);
      if (problem) return NextResponse.json({ success: false, error: problem }, { status: 400 });
    }

    // Updates go public at once, so each startup gets a daily allowance.
    if (!isDraft && articleType === "STARTUP_UPDATE") {
      const today = await prisma.article.count({
        where: { startupId, type: "STARTUP_UPDATE", publishedAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      });
      if (today >= UPDATES_PER_DAY) {
        return NextResponse.json({ success: false, error: `You can publish ${UPDATES_PER_DAY} updates a day. Save this one as a draft and publish it tomorrow.`, code: "daily_limit" }, { status: 429 });
      }
    }

    let articleStatus: string;
    let moderationStatus: string;
    if (isDraft) {
      articleStatus = "DRAFT";
      moderationStatus = "NONE";
    } else if (articleType === "STARTUP_UPDATE") {
      articleStatus = "PUBLISHED";
      moderationStatus = "APPROVED";
    } else {
      articleStatus = "IN_REVIEW";
      moderationStatus = "PENDING_REVIEW";
    }

    const id = crypto.randomUUID();
    const slug = await createUniqueSlug(title);

    const founderAuthorId = session.userId;

    let systemUser = await prisma.user.findUnique({ where: { id: SYSTEM_AUTHOR_ID }, select: { id: true } });
    if (!systemUser) {
      systemUser = await prisma.user.create({
        data: { id: SYSTEM_AUTHOR_ID, email: "founder-content@system.udyaibase.com", name: "Founder Content", slug: "founder-content-system", role: "CONTRIBUTOR", updatedAt: new Date() },
      });
    }

    const article = await prisma.article.create({
      data: {
        id,
        title,
        slug,
        content: prepared.content,
        contentText: prepared.text.slice(0, 50000),
        wordCount: prepared.words,
        readTimeMinutes: prepared.readMinutes,
        excerpt: excerpt ?? null,
        type: articleType,
        status: articleStatus as any,
        authorId: SYSTEM_AUTHOR_ID,
        startupId,
        coverImage: coverImage || null,
        submittedById: session.userId,
        founderAuthorId,
        moderationStatus: moderationStatus as any,
        publishedAt: articleStatus === "PUBLISHED" ? new Date() : null,
        updatedAt: new Date(),
      },
    });

    await prisma.contentActivityLog.create({
      data: {
        contentId: article.id,
        startupId,
        actorId: session.userId,
        actorType: "FOUNDER",
        action: isDraft ? "CREATED" : articleType === "STARTUP_UPDATE" ? "PUBLISHED" : "SUBMITTED_FOR_REVIEW",
      },
    });

    if (articleStatus === "PUBLISHED") await refreshPublicContent(startupId, article.slug);

    return NextResponse.json({ success: true, article });
  } catch (err) {
    console.error("[founder/content POST]", err);
    return NextResponse.json({ success: false, error: "Something went wrong" }, { status: 500 });
  }
}
