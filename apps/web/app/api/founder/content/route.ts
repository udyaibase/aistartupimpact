import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { getFounderSession } from "@/lib/founder-auth";
import { verifyStartupAccess, getFounderStartups, UNVERIFIED_STARTUP_ERROR } from "@/lib/founder-content-auth";
import { canCreateContent, canViewAllDrafts } from "@/lib/founder-team-permissions";
import { checkRateLimit, getClientIdentifier, strictRateLimit } from "@/lib/rate-limit";
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
    const session = await getFounderSession();
    if (!session) return NextResponse.json({ success: false }, { status: 401 });

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

    return NextResponse.json({ success: true, articles, startups });
  } catch (err) {
    console.error("[founder/content GET]", err);
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

    const body = await request.json();
    const { title, content, excerpt, type, startupId, coverImage, isDraft } = body;

    if (!startupId) return NextResponse.json({ success: false, error: "Startup is required" }, { status: 400 });
    if (!title || typeof title !== "string" || title.length < 3) return NextResponse.json({ success: false, error: "Title must be at least 3 characters" }, { status: 400 });
    if (title.length > 200) return NextResponse.json({ success: false, error: "Title must be 200 characters or less" }, { status: 400 });

    const auth = await verifyStartupAccess(startupId);
    if (!auth) return NextResponse.json({ success: false, error: "Not authorized for this startup" }, { status: 403 });
    if (!isDraft && !auth.startupVerified) return NextResponse.json({ success: false, error: UNVERIFIED_STARTUP_ERROR, code: 'startup_unverified' }, { status: 403 });
    if (!canCreateContent(auth.role)) return NextResponse.json({ success: false, error: "Your role does not allow creating content" }, { status: 403 });

    const articleType = VALID_TYPES.includes(type) ? type : "STARTUP_UPDATE";

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
        title: title.slice(0, 200),
        slug,
        content: content || {},
        contentText: typeof content === "string" ? content.slice(0, 50000) : "",
        excerpt: excerpt?.slice(0, 500) || null,
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

    return NextResponse.json({ success: true, article });
  } catch (err) {
    console.error("[founder/content POST]", err);
    return NextResponse.json({ success: false, error: "Something went wrong" }, { status: 500 });
  }
}
