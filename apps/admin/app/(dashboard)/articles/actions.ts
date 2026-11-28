"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma, Prisma } from "@udyaibase/database";
import { revalidatePath } from "next/cache";
import { logAuditEvent, canDelete } from '@/lib/audit-log';
import { refreshPublic, type PublicSection } from '@/lib/refresh-public';
import { uploadToMediaLibrary } from "@/lib/media";
import { cleanArticleHtml } from "@/lib/article-html";
import { articleHtml, htmlWordCount } from "@udyaibase/utils/article-content";
import { generateSlug } from "@udyaibase/utils/slug";
import { mentionPaths, syncArticleMentions } from "@/lib/article-mentions";

/**
 * Articles. Writers draft and submit for review; only editors (Super Admin, Editor-in-Chief) publish, schedule,
 * archive, feature or pin. Writers edit only their own articles, and not once they are live or scheduled.
 * Scheduled articles go live from the website's publish-scheduled job.
 */

const WRITERS = ["SUPER_ADMIN", "EDITOR_IN_CHIEF", "SENIOR_WRITER", "WRITER"];
const PUBLISHERS = ["SUPER_ADMIN", "EDITOR_IN_CHIEF"];
const STATUSES = ["DRAFT", "IN_REVIEW", "SCHEDULED", "PUBLISHED", "ARCHIVED"] as const;
const TYPES = ["NEWS", "STORY", "OPINION", "TOOL_REVIEW", "GUIDE", "COMPARISON", "REPORT", "SPONSORED", "FOUNDER_STORY", "STARTUP_UPDATE"];
const LOCKED_FOR_WRITERS = ["PUBLISHED", "SCHEDULED"];
/** Written by founders in their own portal: the staff publishing checklist (category, cover, subtitle) does not apply. */
const FOUNDER_TYPES = ["FOUNDER_STORY", "STARTUP_UPDATE"];

/** What a staff article must have before it goes live, as a sentence for the editor; null when nothing is missing. */
function missingToPublish(a: { type: string; categoryId: string | null; coverImage: string | null; excerpt: string | null }) {
  if (FOUNDER_TYPES.includes(a.type)) return null;
  const missing = [!a.categoryId && "a category", !a.coverImage && "a cover image", !a.excerpt?.trim() && "a subtitle"].filter(Boolean) as string[];
  if (!missing.length) return null;
  const list = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;
  return `Before this goes live, add ${list}. Readers and search results show them.`;
}

const PUBLIC_SECTIONS: PublicSection[] = ['news', 'stories', 'opinions', 'authors', 'home'];

type Status = (typeof STATUSES)[number];
type Viewer = { id: string; role: string; name?: string | null; email?: string | null };

async function viewer(roles = WRITERS): Promise<Viewer | null> {
  const session: any = await getServerSession(authOptions);
  const user = session?.user;
  return user?.id && roles.includes(user.role) ? user : null;
}

export async function canPublishRole(role?: string | null) {
  return !!role && PUBLISHERS.includes(role);
}
const isPublisher = (v: Viewer) => PUBLISHERS.includes(v.role);
const isStatus = (s: unknown): s is Status => typeof s === "string" && (STATUSES as readonly string[]).includes(s);
const httpUrl = (u: unknown) => (typeof u === "string" && /^https?:\/\/\S+$/i.test(u.trim()) ? u.trim() : null);
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Next free slug: base, base-1, base-2… (deleted articles keep theirs; slugs are unique across all rows). */
async function uniqueSlug(base: string, articleId?: string | null) {
  const taken: { slug: string }[] = await prisma.$queryRaw`
    SELECT slug FROM "Article" WHERE (slug = ${base} OR slug LIKE ${base + "-%"}) AND id <> ${articleId ?? ""}`;
  const used = new Set(taken.map((t) => t.slug));
  // Another article's old link still redirects to it, so that address is taken too.
  try {
    const old: { slug: string }[] = await prisma.$queryRaw`
      SELECT s AS slug FROM "Article" a, unnest(a."previousSlugs") s
      WHERE a.id <> ${articleId ?? ""} AND a."deletedAt" IS NULL AND (s = ${base} OR s LIKE ${base + "-%"})`;
    for (const o of old) used.add(o.slug);
  } catch { /* slug history not available yet */ }
  if (!used.has(base)) return base;
  for (let n = 1; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}

function parseTags(tags: unknown) {
  if (typeof tags !== "string") return [];
  const seen = new Map<string, string>();
  for (const raw of tags.split(",")) {
    const name = raw.trim().slice(0, 50);
    const slug = generateSlug(name);
    if (name && slug && !seen.has(slug)) seen.set(slug, name);
  }
  return Array.from(seen, ([slug, name]) => ({ slug, name })).slice(0, 20);
}

/** Replace an article's tags (creating missing ones), as statements for one transaction. */
function tagWrites(articleId: string, tags: { slug: string; name: string }[]) {
  const writes: Prisma.PrismaPromise<unknown>[] = [prisma.$executeRaw`DELETE FROM "ArticleTag" WHERE "articleId" = ${articleId}`];
  if (!tags.length) return writes;
  const slugs = tags.map((t) => t.slug);
  const names = tags.map((t) => t.name);
  writes.push(
    prisma.$executeRaw`INSERT INTO "Tag" (id, name, slug, "createdAt") VALUES ${Prisma.join(tags.map((t) => Prisma.sql`(${crypto.randomUUID()}, ${t.name}, ${t.slug}, NOW())`))} ON CONFLICT DO NOTHING`,
    prisma.$executeRaw`INSERT INTO "ArticleTag" ("articleId", "tagId") SELECT ${articleId}, id FROM "Tag" WHERE slug = ANY(${slugs}::text[]) OR name = ANY(${names}::text[]) ON CONFLICT DO NOTHING`,
  );
  return writes;
}

/** Article images: raster formats only (no SVG, which can carry scripts), checked by their first bytes. */
const IMAGE_SIGNATURES: [string, (b: Buffer) => boolean][] = [
  ["image/jpeg", (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ["image/png", (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ["image/gif", (b) => b.subarray(0, 4).toString("latin1") === "GIF8"],
  ["image/webp", (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP"],
  ["image/avif", (b) => b.subarray(4, 12).toString("latin1").startsWith("ftypavi")],
];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export async function uploadMediaAction(formData: FormData) {
  const user = await viewer();
  if (!user) return { success: false, error: "Unauthorized or insufficient permissions to upload media" };
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) return { success: false, error: "No file provided" };
  if (file.size > MAX_IMAGE_BYTES) return { success: false, error: "Images must be 10 MB or smaller." };
  const head = Buffer.from(await file.slice(0, 16).arrayBuffer());
  const kind = IMAGE_SIGNATURES.find(([, test]) => test(head))?.[0];
  if (!kind || kind !== file.type) return { success: false, error: "Upload a JPG, PNG, WebP, GIF or AVIF image." };
  try {
    const result = await uploadToMediaLibrary(file, { prefix: "uploads", uploadedById: user.id });
    return { success: true, data: { url: result.url, id: result.key, fileName: result.originalName } };
  } catch (error: any) {
    console.error("[articles] image upload failed:", error?.message);
    return { success: false, error: "Couldn't upload the image. Try again." };
  }
}

export type ArticlePayload = {
  title?: string; subtitle?: string; content?: string; type?: string; category?: string; tags?: string;
  coverImage?: string | null; thumbnailImage?: string | null; seoTitle?: string; seoDescription?: string;
  focusKeyword?: string; slug?: string; status?: string; canonicalUrl?: string; ogImage?: string; noIndex?: boolean;
  scheduledAt?: string | null; isFeatured?: boolean; isPinned?: boolean; isSponsored?: boolean; keyTakeaways?: string[];
  /** Background save of an unpublished draft: no audit entry and no site refresh. */
  autosave?: boolean;
};

export async function saveArticleAction(payload: ArticlePayload, articleId?: string | null) {
  const user = await viewer();
  if (!user) return { success: false as const, error: "Unauthorized or insufficient permissions to save articles" };
  const publisher = isPublisher(user);

  const title = text(payload.title, 300);
  if (!title) return { success: false as const, error: "Add a title first." };
  // An unknown type used to be saved as News without a word; say so instead.
  if (payload.type && !TYPES.includes(String(payload.type))) return { success: false as const, error: "Pick an article type from the list." };
  const type = payload.type ? String(payload.type) : "NEWS";
  let status: Status = isStatus(payload.status) ? payload.status : "DRAFT";

  const existing = articleId
    ? (await prisma.$queryRaw<any[]>`
        SELECT "authorId", slug, status::text AS status, to_char("publishedAt", 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "publishedAt", "isFeatured", "isPinned", "isSponsored", "canonicalUrl"
        FROM "Article" WHERE id = ${articleId} AND "deletedAt" IS NULL LIMIT 1`)[0]
    : null;
  if (articleId && !existing) return { success: false as const, error: "Article not found." };

  if (!publisher) {
    if (existing && existing.authorId !== user.id) return { success: false as const, error: "You can only edit your own articles." };
    if (existing && LOCKED_FOR_WRITERS.includes(existing.status)) {
      return { success: false as const, error: "This article is live or scheduled. Ask an editor to make changes." };
    }
    // Writers can't publish, schedule or archive: anything past a draft goes to review.
    if (status !== "DRAFT") status = "IN_REVIEW";
  }
  if (payload.autosave && (status === "PUBLISHED" || existing?.status === "PUBLISHED")) {
    return { success: false as const, error: "Live articles aren't autosaved." };
  }

  let scheduledAt: Date | null = null;
  if (status === "SCHEDULED") {
    scheduledAt = payload.scheduledAt ? new Date(payload.scheduledAt) : null;
    if (!scheduledAt || Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now() + 60_000) {
      return { success: false as const, error: "Pick a publish time in the future." };
    }
  }

  const html = cleanArticleHtml(payload.content ?? "");
  const readTime = Math.max(1, Math.ceil(htmlWordCount(html) / 200));
  const slug = await uniqueSlug(generateSlug(payload.slug || title).slice(0, 120) || "article", articleId);
  const categoryName = text(payload.category, 100);
  const categoryId = categoryName
    ? (await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM "Category" WHERE name = ${categoryName} OR id = ${categoryName} LIMIT 1`)[0]?.id ?? null
    : null;
  // A category that no longer exists used to be dropped silently, leaving the article uncategorised.
  if (categoryName && !categoryId) return { success: false as const, error: `The category "${categoryName}" no longer exists. Pick another one.` };
  if (status === "PUBLISHED" || status === "SCHEDULED") {
    if (htmlWordCount(html) === 0) return { success: false as const, error: "Write the article before publishing it." };
    const missing = missingToPublish({ type, categoryId, coverImage: httpUrl(payload.coverImage), excerpt: text(payload.subtitle, 500) });
    if (missing) return { success: false as const, error: missing };
  }
  const takeaways = Array.isArray(payload.keyTakeaways)
    ? payload.keyTakeaways.map((t) => text(t, 300)).filter(Boolean).slice(0, 10)
    : [];
  const flags = publisher
    ? { isFeatured: !!payload.isFeatured, isPinned: !!payload.isPinned, isSponsored: !!payload.isSponsored || type === "SPONSORED" }
    : { isFeatured: !!existing?.isFeatured, isPinned: !!existing?.isPinned, isSponsored: !!existing?.isSponsored || type === "SPONSORED" };
  // A published article keeps its first publish date; republishing doesn't move it.
  const firstPublished = existing?.publishedAt ? new Date(existing.publishedAt) : null;
  const publishedAt = status === "PUBLISHED" ? firstPublished ?? new Date() : firstPublished;

  const f = {
    title, slug, excerpt: text(payload.subtitle, 500), content: JSON.stringify({ html }), type, status,
    noIndex: !!payload.noIndex, ...flags, categoryId, scheduledAt, publishedAt, readTime,
    coverImage: httpUrl(payload.coverImage), thumbnailImage: httpUrl(payload.thumbnailImage),
    seoTitle: text(payload.seoTitle, 120) || null, seoDescription: text(payload.seoDescription, 320) || null,
    focusKeyword: text(payload.focusKeyword, 100) || null, ogImage: httpUrl(payload.ogImage),
    // Pointing the canonical at another site gives that site the search credit, so only editors set it.
    canonicalUrl: publisher ? httpUrl(payload.canonicalUrl) : httpUrl(existing?.canonicalUrl),
    keyTakeaways: takeaways.length ? JSON.stringify(takeaways) : null,
  };
  const id = articleId ?? crypto.randomUUID();

  try {
    await prisma.$transaction([
      existing
        ? prisma.$executeRaw`
            UPDATE "Article" SET
              title = ${f.title}, slug = ${f.slug}, excerpt = ${f.excerpt}, content = ${f.content}::jsonb,
              type = ${f.type}::"ArticleType", status = ${f.status}::"ArticleStatus", "noIndex" = ${f.noIndex},
              "isFeatured" = ${f.isFeatured}, "isPinned" = ${f.isPinned}, "isSponsored" = ${f.isSponsored},
              "categoryId" = ${f.categoryId}, "scheduledAt" = ${f.scheduledAt}, "publishedAt" = ${f.publishedAt},
              "readTimeMinutes" = ${f.readTime}, "coverImage" = ${f.coverImage}, "thumbnailImage" = ${f.thumbnailImage},
              "seoTitle" = ${f.seoTitle}, "seoDescription" = ${f.seoDescription}, "focusKeyword" = ${f.focusKeyword},
              "canonicalUrl" = ${f.canonicalUrl}, "ogImage" = ${f.ogImage}, "keyTakeaways" = ${f.keyTakeaways}::jsonb,
              "updatedAt" = NOW()
            WHERE id = ${id}`
        : prisma.$executeRaw`
            INSERT INTO "Article" (
              id, title, slug, excerpt, content, type, status, "noIndex", "isFeatured", "isPinned", "isSponsored",
              "categoryId", "scheduledAt", "publishedAt", "readTimeMinutes", "coverImage", "thumbnailImage",
              "seoTitle", "seoDescription", "focusKeyword", "canonicalUrl", "ogImage", "keyTakeaways",
              "authorId", "createdAt", "updatedAt"
            ) VALUES (
              ${id}, ${f.title}, ${f.slug}, ${f.excerpt}, ${f.content}::jsonb, ${f.type}::"ArticleType", ${f.status}::"ArticleStatus",
              ${f.noIndex}, ${f.isFeatured}, ${f.isPinned}, ${f.isSponsored}, ${f.categoryId}, ${f.scheduledAt}, ${f.publishedAt},
              ${f.readTime}, ${f.coverImage}, ${f.thumbnailImage}, ${f.seoTitle}, ${f.seoDescription}, ${f.focusKeyword},
              ${f.canonicalUrl}, ${f.ogImage}, ${f.keyTakeaways}::jsonb, ${user.id}, NOW(), NOW()
            )`,
      ...tagWrites(id, parseTags(payload.tags)),
    ]);
  } catch (error: any) {
    console.error("[articles] save failed:", error?.code ?? "", error?.message);
    return { success: false as const, error: "Couldn't save the article. Try again." };
  }
  // A published article's old address keeps working: remember it so the website can redirect to the new one.
  const oldSlug: string | null = existing && existing.slug && existing.slug !== slug ? existing.slug : null;
  let redirected = false;
  if (oldSlug) {
    try {
      if (existing.publishedAt) {
        await prisma.$executeRaw`
          UPDATE "Article" SET "previousSlugs" = array_append(array_remove(array_remove(COALESCE("previousSlugs", ARRAY[]::text[]), ${slug}), ${oldSlug}), ${oldSlug})
          WHERE id = ${id}`;
        redirected = true;
      } else {
        await prisma.$executeRaw`UPDATE "Article" SET "previousSlugs" = array_remove(COALESCE("previousSlugs", ARRAY[]::text[]), ${slug}) WHERE id = ${id}`;
      }
    } catch (e: any) {
      console.error("[articles] slug history not saved:", e?.message);
    }
  }
  // Startups and tools @-tagged in the body, for their profile pages. A failure here never loses the article.
  const profilePaths = await syncArticleMentions(id, html).catch((e) => {
    console.error("[articles] mention sync failed:", e?.message);
    return [] as string[];
  });

  const statusChanged = !existing || existing.status !== status;
  const touchesSite = status === "PUBLISHED" || existing?.status === "PUBLISHED";
  if (!payload.autosave) {
    if (statusChanged || touchesSite) {
      await logAuditEvent({
        action: existing ? "UPDATE" : "CREATE", resourceType: "ARTICLE", resourceId: id, resourceName: title,
        before: existing ? { status: existing.status } : undefined, after: { slug, status },
      });
    }
    if (statusChanged) revalidatePath("/articles");
    // The page cached at the old address must go too, or it would keep showing instead of redirecting.
    const oldPaths = oldSlug ? [`/news/${oldSlug}`, `/stories/${oldSlug}`, `/opinions/${oldSlug}`, `/opinion/${oldSlug}`] : [];
    if (touchesSite) await refreshPublic(PUBLIC_SECTIONS, [...profilePaths, ...oldPaths]);
  }
  const notice = !publisher && status === "IN_REVIEW" && payload.status !== "IN_REVIEW" && payload.status !== "DRAFT"
    ? "Sent for review. An editor will publish it."
    : redirected && !payload.autosave ? "Link changed. The old link now redirects to the new one." : undefined;
  return {
    success: true as const,
    data: { id, slug, status, publishedAt: publishedAt?.toISOString() ?? null, readTime },
    notice,
  };
}

export async function getArticleByIdAction(id: string) {
  const user = await viewer();
  if (!user) return { success: false as const, error: "Unauthorized" };
  try {
    const rows: any[] = await prisma.$queryRaw`
      SELECT
        a.id, a.title, a.slug, a.status::text AS status, a.type::text AS type, a.excerpt, a."authorId",
        a.content, a."coverImage", a."thumbnailImage", a."seoTitle", a."seoDescription",
        a."focusKeyword", a."isFeatured", a."isPinned", a."isSponsored",
        a."canonicalUrl", a."ogImage", a."noIndex", a."keyTakeaways",
        to_char(a."publishedAt", 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "publishedAt",
        to_char(a."scheduledAt", 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "scheduledAt",
        u.name AS "authorName", c.name AS "categoryName",
        (SELECT string_agg(t.name, ', ' ORDER BY t.name) FROM "ArticleTag" at JOIN "Tag" t ON t.id = at."tagId" WHERE at."articleId" = a.id) AS tags
      FROM "Article" a
      LEFT JOIN "User" u ON u.id = a."authorId"
      LEFT JOIN "Category" c ON c.id = a."categoryId"
      WHERE a.id = ${id} AND a."deletedAt" IS NULL
      LIMIT 1
    `;
    if (!rows.length) return { success: false as const, error: "Article not found" };
    const { content, ...a } = rows[0];
    const publisher = isPublisher(user);
    const own = a.authorId === user.id;
    return {
      success: true as const,
      data: {
        ...a,
        tags: a.tags ?? "",
        // Older articles are stored in earlier formats; the editor always works on HTML.
        html: articleHtml(content),
        canEdit: publisher || (own && !LOCKED_FOR_WRITERS.includes(a.status)),
        canPublish: publisher,
      },
    };
  } catch (error: any) {
    console.error("[articles] load failed:", error?.message);
    return { success: false as const, error: "Failed to load the article" };
  }
}

export async function getArticlesAction() {
  const user = await viewer();
  if (!user) return { success: false as const, error: "Unauthorized" };
  try {
    // Text casts: some older rows hold values the Neon HTTP adapter can't parse as dates.
    const rows: any[] = await prisma.$queryRaw`
      SELECT
        a.id, a.title, a.slug, a.status::text AS status, a.type::text AS type, a."viewCount", a."authorId",
        to_char(a."publishedAt", 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "publishedAt",
        to_char(a."scheduledAt", 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "scheduledAt",
        to_char(a."updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "updatedAt",
        u.name AS "authorName", c.name AS "categoryName"
      FROM "Article" a
      LEFT JOIN "User" u ON u.id = a."authorId"
      LEFT JOIN "Category" c ON c.id = a."categoryId"
      WHERE a."deletedAt" IS NULL
      ORDER BY COALESCE(a."publishedAt", a."scheduledAt", a."updatedAt") DESC
      LIMIT 2000
    `;
    const data = rows.map((a) => ({
      id: a.id, title: a.title, slug: a.slug, status: a.status, type: a.type, authorId: a.authorId,
      viewCount: a.viewCount ?? 0, publishedAt: a.publishedAt ?? null, scheduledAt: a.scheduledAt ?? null, updatedAt: a.updatedAt,
      author: { name: a.authorName }, category: { name: a.categoryName },
    }));
    return { success: true as const, data, viewer: { id: user.id, canPublish: isPublisher(user) } };
  } catch (error: any) {
    console.error("[articles] list failed:", error?.message);
    return { success: false as const, error: "Failed to fetch articles" };
  }
}

export async function updateArticleStatusAction(id: string, status: string) {
  const user = await viewer();
  if (!user) return { success: false as const, error: "Unauthorized" };
  if (!isStatus(status)) return { success: false as const, error: "Unknown status." };
  const rows: any[] = await prisma.$queryRaw`
    SELECT title, "authorId", status::text AS status, "scheduledAt", type::text AS type, "categoryId", "coverImage", excerpt
    FROM "Article" WHERE id = ${id} AND "deletedAt" IS NULL LIMIT 1`;
  const a = rows[0];
  if (!a) return { success: false as const, error: "Article not found." };

  if (!isPublisher(user)) {
    const allowed = a.authorId === user.id && ["DRAFT", "IN_REVIEW"].includes(a.status) && ["DRAFT", "IN_REVIEW"].includes(status);
    if (!allowed) return { success: false as const, error: "Only editors can publish, schedule or archive articles." };
  }
  // Publishing from the list goes through the same checklist as publishing from the editor.
  if ((status === "PUBLISHED" || status === "SCHEDULED") && a.status !== "PUBLISHED") {
    const missing = missingToPublish(a);
    if (missing) return { success: false as const, error: `${missing} Open the article to add them.` };
  }
  if (status === "SCHEDULED" && !(a.scheduledAt && new Date(a.scheduledAt).getTime() > Date.now())) {
    return { success: false as const, error: "Open the article and pick a publish time first." };
  }
  try {
    if (status === "PUBLISHED") {
      await prisma.$executeRaw`UPDATE "Article" SET status = 'PUBLISHED', "publishedAt" = COALESCE("publishedAt", NOW()), "updatedAt" = NOW() WHERE id = ${id}`;
    } else {
      await prisma.$executeRaw`UPDATE "Article" SET status = ${status}::"ArticleStatus", "updatedAt" = NOW() WHERE id = ${id}`;
    }
  } catch (error: any) {
    console.error("[articles] status change failed:", error?.message);
    return { success: false as const, error: "Failed to update status" };
  }
  await logAuditEvent({ action: "UPDATE", resourceType: "ARTICLE", resourceId: id, resourceName: a.title, before: { status: a.status }, after: { status } });
  revalidatePath("/articles");
  revalidatePath("/dashboard");
  if (status === "PUBLISHED" || a.status === "PUBLISHED") await refreshPublic(PUBLIC_SECTIONS, await mentionPaths(id).catch(() => []));
  return { success: true as const };
}

export async function deleteArticleAction(id: string) {
  // Only SUPER_ADMIN can delete
  const { allowed, error } = await canDelete();
  if (!allowed) return { success: false, error: error || 'Unauthorized' };

  try {
    const rows: any[] = await prisma.$queryRaw`SELECT title, slug, status::text AS status FROM "Article" WHERE id = ${id} AND "deletedAt" IS NULL LIMIT 1`;
    const before = rows[0];
    if (!before) return { success: false, error: "Article not found." };
    // Soft delete to avoid FK constraint failures from related records
    await prisma.$executeRaw`UPDATE "Article" SET "deletedAt" = NOW() WHERE id = ${id}`;
    await logAuditEvent({ action: 'DELETE', resourceType: 'ARTICLE', resourceId: id, before: { title: before.title, slug: before.slug } });
    revalidatePath("/articles");
    revalidatePath("/dashboard");
    if (before.status === "PUBLISHED") await refreshPublic(PUBLIC_SECTIONS, await mentionPaths(id).catch(() => []));
    return { success: true };
  } catch (error: any) {
    console.error("[articles] delete failed:", error?.message);
    return { success: false, error: "Failed to delete article" };
  }
}

export async function duplicateArticleAction(sourceId: string) {
  const user = await viewer();
  if (!user) return { success: false as const, error: "Unauthorized" };

  try {
    const rows: any[] = await prisma.$queryRaw`
      SELECT a.title, a.slug, a.type::text AS type, c.name AS "categoryName"
      FROM "Article" a LEFT JOIN "Category" c ON c.id = a."categoryId"
      WHERE a.id = ${sourceId} AND a."deletedAt" IS NULL LIMIT 1`;
    if (!rows.length) return { success: false as const, error: "Source article not found" };
    const src = rows[0];
    const newId = crypto.randomUUID();
    const newSlug = await uniqueSlug(`${src.slug}-copy`);
    const title = `${src.title} (Copy)`;

    // Copies everything editorial, as an unfeatured draft owned by whoever duplicated it.
    await prisma.$transaction([
      prisma.$executeRaw`
        INSERT INTO "Article" (
          id, title, slug, excerpt, content, type, status, "noIndex", "isFeatured", "isPinned", "isSponsored",
          "categoryId", "readTimeMinutes", "coverImage", "thumbnailImage", "seoTitle", "seoDescription",
          "focusKeyword", "canonicalUrl", "ogImage", "keyTakeaways", "authorId", "createdAt", "updatedAt"
        )
        SELECT ${newId}, ${title}, ${newSlug}, excerpt, content, type, 'DRAFT', "noIndex", false, false, false,
          "categoryId", "readTimeMinutes", "coverImage", "thumbnailImage", "seoTitle", "seoDescription",
          "focusKeyword", "canonicalUrl", "ogImage", "keyTakeaways", ${user.id}, NOW(), NOW()
        FROM "Article" WHERE id = ${sourceId}`,
      prisma.$executeRaw`INSERT INTO "ArticleTag" ("articleId", "tagId") SELECT ${newId}, "tagId" FROM "ArticleTag" WHERE "articleId" = ${sourceId}`,
      prisma.$executeRaw`INSERT INTO "ArticleStartupMention" ("articleId", "startupId") SELECT ${newId}, "startupId" FROM "ArticleStartupMention" WHERE "articleId" = ${sourceId}`,
      prisma.$executeRaw`INSERT INTO "ArticleToolMention" ("articleId", "toolId") SELECT ${newId}, "toolId" FROM "ArticleToolMention" WHERE "articleId" = ${sourceId}`,
    ]);

    revalidatePath("/articles");
    return {
      success: true as const,
      data: {
        id: newId, title, slug: newSlug, status: 'DRAFT', type: src.type, authorId: user.id, views: 0,
        publishedAt: null, author: user.name || 'You', category: src.categoryName || 'Uncategorized',
      },
    };
  } catch (error: any) {
    console.error("[articles] duplicate failed:", error?.message);
    return { success: false as const, error: "Failed to duplicate article" };
  }
}

export async function getCategoriesAction() {
  if (!(await viewer())) return { success: false, error: "Unauthorized", data: [] };
  try {
    const categories: any[] = await prisma.$queryRaw`SELECT id, name, slug FROM "Category" ORDER BY name ASC`;
    return { success: true, data: categories };
  } catch (error: any) {
    console.error("[articles] categories failed:", error?.message);
    return { success: false, error: "Failed to fetch categories", data: [] };
  }
}
