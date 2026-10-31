"use server";
import { getPublicUrl } from "@/lib/media";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@udyaibase/database";
import { revalidatePath } from "next/cache";
import { logAuditEvent, canDelete } from '@/lib/audit-log';
import { refreshPublic } from '@/lib/refresh-public';

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

export async function uploadMediaAction(formData: FormData) {
  const session: any = await getServerSession(authOptions);

  if (!session?.user || !["SUPER_ADMIN", "EDITOR_IN_CHIEF", "SENIOR_WRITER", "WRITER"].includes(session.user.role)) {
    return { success: false, error: "Unauthorized or insufficient permissions to upload media" };
  }

  try {
    const file = formData.get("file") as File;
    if (!file) {
      return { success: false, error: "No file provided" };
    }

    const bucketName = process.env.R2_BUCKET_NAME;
    if (!bucketName) {
      return { success: false, error: "R2 Environment variables missing container name" };
    }

    // Generate unique filename securely
    const uniqueId = crypto.randomUUID();
    const cleanFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileKey = `uploads/${uniqueId}-${cleanFilename}`;

    // Convert Web File stream to Node Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: fileKey,
      ContentType: file.type,
      Body: buffer,
    });

    await s3Client.send(command);

    const url = getPublicUrl(fileKey);

    return {
      success: true,
      data: {
        url,
        id: fileKey,
        fileName: cleanFilename
      }
    };
  } catch (error: any) {
    console.error("R2 Upload Error:", error);
    return { success: false, error: error.message || "Failed to upload file to storage bucket" };
  }
}

export async function saveArticleAction(payload: any, articleId?: string | null) {
  console.log('[saveArticleAction] Starting...', { articleId, hasPayload: !!payload });
  
  const session: any = await getServerSession(authOptions);

  if (!session?.user || !["SUPER_ADMIN", "EDITOR_IN_CHIEF", "SENIOR_WRITER", "WRITER"].includes(session.user.role)) {
    console.log('[saveArticleAction] Unauthorized:', session?.user?.role);
    return { success: false, error: "Unauthorized or insufficient permissions to save articles" };
  }

  try {
    const {
      title, subtitle, content, type, category, tags, coverImage, thumbnailImage,
      seoTitle, seoDescription, focusKeyword, slug, status, canonicalUrl, ogImage, noIndex,
      scheduledAt, isFeatured, isPinned, isSponsored, keyTakeaways
    } = payload;
    const authorId = session.user.id;

    console.log('[saveArticleAction] Payload extracted:', { title, status, category, tags, hasContent: !!content });

    let baseSlug = slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    let finalSlug = baseSlug;

    // Check for slug uniqueness
    let isUnique = false;
    let counter = 1;
    while (!isUnique) {
      const existing = await prisma.article.findUnique({
        where: { slug: finalSlug },
        select: { id: true }
      });

      if (!existing || (articleId && existing.id === articleId)) {
        isUnique = true;
      } else {
        finalSlug = `${baseSlug}-${counter}`;
        counter++;
      }
    }

    console.log('[saveArticleAction] Final slug:', JSON.stringify(finalSlug));

    // Handle category - find or use null
    let categoryId: string | null = null;
    if (category && category.trim()) {
      const categoryResult: any[] = await prisma.$queryRaw`
        SELECT id FROM "Category" WHERE name = ${category.trim()} LIMIT 1
      `;
      if (categoryResult.length > 0) {
        categoryId = categoryResult[0].id;
      }
    }

    // The Prisma schema expects `content` to be a `Json` object (for TipTap), but we are storing HTML strings from the legacy editor.
    // Wrap the string in a JSON-compatible object so Neon's HTTP adapter doesn't crash from type mismatch.
    const contentJson = { html: content };

    // Build data object, filtering out undefined values
    const data: any = {
      title,
      slug: finalSlug,
      excerpt: subtitle,
      content: contentJson,
      type: type || 'NEWS',
      status: status || 'DRAFT',
      noIndex: noIndex || false,
      isFeatured: isFeatured || false,
      isPinned: isPinned || false,
      isSponsored: isSponsored || false,
      updatedAt: new Date(),
    };

    // Only add optional fields if they have values
    if (coverImage) data.coverImage = coverImage;
    if (thumbnailImage) data.thumbnailImage = thumbnailImage;
    if (seoTitle) data.seoTitle = seoTitle;
    if (seoDescription) data.seoDescription = seoDescription;
    if (focusKeyword) data.focusKeyword = focusKeyword;
    if (canonicalUrl) data.canonicalUrl = canonicalUrl;
    if (ogImage) data.ogImage = ogImage;
    if (categoryId) data.categoryId = categoryId;
    if (scheduledAt) data.scheduledAt = scheduledAt;

    console.log('[saveArticleAction] Saving to database...', { articleId, status: data.status, categoryId, isFeatured: data.isFeatured });

    let article;
    if (articleId) {
      // Use raw SQL for update to avoid corrupt data issues
      await prisma.$executeRaw`
        UPDATE "Article"
        SET
          title = ${data.title},
          slug = ${data.slug},
          excerpt = ${data.excerpt || ''},
          content = ${JSON.stringify(data.content)}::jsonb,
          type = ${data.type}::"ArticleType",
          status = ${data.status}::"ArticleStatus",
          "noIndex" = ${data.noIndex},
          "isFeatured" = ${data.isFeatured},
          "isPinned" = ${data.isPinned},
          "isSponsored" = ${data.isSponsored},
          "categoryId" = ${data.categoryId || null},
          "scheduledAt" = ${data.scheduledAt ? new Date(data.scheduledAt) : null},
          "coverImage" = ${data.coverImage || null},
          "thumbnailImage" = ${data.thumbnailImage || null},
          "seoTitle" = ${data.seoTitle || null},
          "seoDescription" = ${data.seoDescription || null},
          "focusKeyword" = ${data.focusKeyword || null},
          "canonicalUrl" = ${data.canonicalUrl || null},
          "ogImage" = ${data.ogImage || null},
          "keyTakeaways" = ${keyTakeaways && keyTakeaways.length > 0 ? JSON.stringify(keyTakeaways) : null}::jsonb,
          "updatedAt" = NOW()
        WHERE id = ${articleId}
      `;
      
      // Return the article data directly
      article = {
        id: articleId,
        ...data,
        updatedAt: new Date(),
      };
    } else {
      // Generate UUID for new article
      const newArticleId = crypto.randomUUID();
      
      // Use raw SQL to avoid Neon HTTP adapter issues with corrupt data in other rows
      await prisma.$executeRaw`
        INSERT INTO "Article" (
          id, title, slug, excerpt, content, type, status, "noIndex",
          "isFeatured", "isPinned", "isSponsored", "categoryId", "scheduledAt",
          "coverImage", "thumbnailImage", "seoTitle", "seoDescription",
          "focusKeyword", "canonicalUrl", "ogImage", "keyTakeaways",
          "authorId", "createdAt", "updatedAt"
        ) VALUES (
          ${newArticleId},
          ${data.title},
          ${data.slug},
          ${data.excerpt || ''},
          ${JSON.stringify(data.content)}::jsonb,
          ${data.type}::"ArticleType",
          ${data.status}::"ArticleStatus",
          ${data.noIndex},
          ${data.isFeatured},
          ${data.isPinned},
          ${data.isSponsored},
          ${data.categoryId || null},
          ${data.scheduledAt ? new Date(data.scheduledAt) : null},
          ${data.coverImage || null},
          ${data.thumbnailImage || null},
          ${data.seoTitle || null},
          ${data.seoDescription || null},
          ${data.focusKeyword || null},
          ${data.canonicalUrl || null},
          ${data.ogImage || null},
          ${keyTakeaways && keyTakeaways.length > 0 ? JSON.stringify(keyTakeaways) : null}::jsonb,
          ${authorId},
          NOW(),
          NOW()
        )
      `;
      
      // Return the article data directly without fetching (to avoid corrupt data issues)
      article = {
        id: newArticleId,
        ...data,
        authorId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    // Handle tags - parse comma-separated string, create tags if needed, and link to article
    if (tags && typeof tags === 'string' && tags.trim()) {
      const tagNames = tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
      
      if (tagNames.length > 0) {
        // First, delete existing article tags if updating
        if (articleId) {
          await prisma.$executeRaw`DELETE FROM "ArticleTag" WHERE "articleId" = ${articleId}`;
        }

        // Process each tag
        for (const tagName of tagNames) {
          const tagSlug = tagName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
          
          // Find or create tag
          let tagId: string;
          const existingTag: any[] = await prisma.$queryRaw`
            SELECT id FROM "Tag" WHERE name = ${tagName} LIMIT 1
          `;
          
          if (existingTag.length > 0) {
            tagId = existingTag[0].id;
          } else {
            // Create new tag
            tagId = crypto.randomUUID();
            await prisma.$executeRaw`
              INSERT INTO "Tag" (id, name, slug, "createdAt")
              VALUES (${tagId}, ${tagName}, ${tagSlug}, NOW())
              ON CONFLICT (slug) DO NOTHING
            `;
            
            // If there was a conflict, fetch the existing tag
            const conflictCheck: any[] = await prisma.$queryRaw`
              SELECT id FROM "Tag" WHERE slug = ${tagSlug} LIMIT 1
            `;
            if (conflictCheck.length > 0) {
              tagId = conflictCheck[0].id;
            }
          }
          
          // Link tag to article
          const finalArticleId = articleId || article.id;
          await prisma.$executeRaw`
            INSERT INTO "ArticleTag" ("articleId", "tagId")
            VALUES (${finalArticleId}, ${tagId})
            ON CONFLICT ("articleId", "tagId") DO NOTHING
          `;
        }
      }
    } else if (articleId) {
      // If tags is empty and we're updating, remove all tags
      await prisma.$executeRaw`DELETE FROM "ArticleTag" WHERE "articleId" = ${articleId}`;
    }

    console.log('[saveArticleAction] Article saved successfully:', JSON.stringify(article.id));

    // Refresh dashboard feeds
    revalidatePath("/articles");
    revalidatePath("/dashboard");

    // Audit log
    await logAuditEvent({
      action: articleId ? 'UPDATE' : 'CREATE',
      resourceType: 'ARTICLE',
      resourceId: article.id,
      after: { title: payload.title, slug: payload.slug, status: payload.status },
    });

    await refreshPublic(['news', 'stories', 'opinions', 'authors', 'home']); return { success: true, data: article };
  } catch (error: any) {
    console.error("[saveArticleAction] Error:", {
      message: error.message,
      code: error.code,
      name: error.name,
      stack: error.stack,
    });
    return { success: false, error: error.message || "Failed to save article" };
  }
}

export async function getArticleByIdAction(id: string) {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !["SUPER_ADMIN", "EDITOR_IN_CHIEF", "SENIOR_WRITER", "WRITER"].includes(session.user.role)) {
    return { success: false, error: "Unauthorized" };
  }
  try {
    const rows: any[] = await prisma.$queryRaw`
      SELECT
        a.id, a.title, a.slug, a.status, a.type, a.excerpt,
        a.content, a."coverImage", a."thumbnailImage", a."seoTitle", a."seoDescription",
        a."focusKeyword", a."isFeatured", a."isPinned", a."isSponsored",
        a."canonicalUrl", a."ogImage", a."noIndex", a."keyTakeaways",
        a."publishedAt"::text AS "publishedAt",
        a."scheduledAt"::text AS "scheduledAt",
        u.name AS "authorName",
        c.name AS "categoryName"
      FROM "Article" a
      LEFT JOIN "User" u ON u.id = a."authorId"
      LEFT JOIN "Category" c ON c.id = a."categoryId"
      WHERE a.id = ${id} AND a."deletedAt" IS NULL
      LIMIT 1
    `;
    if (!rows.length) return { success: false, error: "Article not found" };
    
    // Fetch tags for this article
    const tagRows: any[] = await prisma.$queryRaw`
      SELECT t.name
      FROM "ArticleTag" at
      JOIN "Tag" t ON t.id = at."tagId"
      WHERE at."articleId" = ${id}
      ORDER BY t.name ASC
    `;
    
    const article = rows[0];
    article.tags = tagRows.map(t => t.name).join(', ');
    
    return { success: true, data: article };
  } catch (error: any) {
    console.error("Get Article Error:", error);
    return { success: false, error: error.message || "Failed to fetch article" };
  }
}


export async function getArticlesAction() {
  const session: any = await getServerSession(authOptions);

  if (!session?.user || !["SUPER_ADMIN", "EDITOR_IN_CHIEF", "SENIOR_WRITER", "WRITER"].includes(session.user.role)) {
    console.log("[DEBUG] Unauthorized. Expected admin role, got:", session?.user?.role);
    return { success: false, error: "Unauthorized" };
  }

  try {
    // NOTE: Neon HTTP adapter returns DateTime fields as strings, not Date objects.
    // Avoid calling .toISOString() on them — they're already strings.
    // Also avoid orderBy on DateTime columns as it can cause adapter issues; use id ordering instead.
    // NOTE: Some rows have corrupt publishedAt values (e.g. `{}`), which crash the Neon HTTP adapter.
    // Use raw SQL to safely cast it to text and avoid the adapter's strict type parsing.
    const rows: any[] = await prisma.$queryRaw`
      SELECT
        a.id,
        a.title,
        a.slug,
        a.status,
        a.type,
        a."viewCount",
        a."publishedAt"::text AS "publishedAt",
        u.name AS "authorName",
        c.name AS "categoryName"
      FROM "Article" a
      LEFT JOIN "User" u ON u.id = a."authorId"
      LEFT JOIN "Category" c ON c.id = a."categoryId"
      WHERE a."deletedAt" IS NULL
      ORDER BY a.id DESC
    `;

    console.log(`[DEBUG] Found ${rows.length} articles in Prisma DB`);

    const safeData = rows.map((a: any) => ({
      id: a.id,
      title: a.title,
      slug: a.slug,
      status: a.status,
      type: a.type,
      viewCount: a.viewCount ?? 0,
      publishedAt: a.publishedAt || null,
      author: { name: a.authorName },
      category: { name: a.categoryName },
    }));

    return { success: true, data: safeData };
  } catch (error: any) {
    console.error("Fetch Articles Error:", error);
    return { success: false, error: error.message || "Failed to fetch articles" };
  }
}

export async function updateArticleStatusAction(id: string, status: string) {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !["SUPER_ADMIN", "EDITOR_IN_CHIEF"].includes(session.user.role)) {
    if (status === 'PUBLISHED') return { success: false, error: "Unauthorized to publish" };
  }
  try {
    if (status === 'PUBLISHED') {
      await prisma.$executeRaw`UPDATE "Article" SET status = ${status}::"ArticleStatus", "publishedAt" = NOW() WHERE id = ${id}`;
    } else {
      await prisma.$executeRaw`UPDATE "Article" SET status = ${status}::"ArticleStatus" WHERE id = ${id}`;
    }
    revalidatePath("/articles");
    revalidatePath("/dashboard");
    await refreshPublic(['news', 'stories', 'opinions', 'authors', 'home']); return { success: true };
  } catch (error: any) {
    console.error("Update Article Status Error:", error);
    return { success: false, error: error.message || "Failed to update status" };
  }
}

export async function deleteArticleAction(id: string) {
  // Only SUPER_ADMIN can delete
  const { allowed, error } = await canDelete();
  if (!allowed) {
    return { success: false, error: error || 'Unauthorized' };
  }

  try {
    // Capture before state for audit
    const article: any[] = await prisma.$queryRaw`SELECT id, title, slug FROM "Article" WHERE id = ${id} LIMIT 1`;
    const before = article[0] || null;

    // Soft delete to avoid FK constraint failures from related records
    await prisma.$executeRaw`UPDATE "Article" SET "deletedAt" = NOW() WHERE id = ${id}`;

    // Audit log
    await logAuditEvent({
      action: 'DELETE',
      resourceType: 'ARTICLE',
      resourceId: id,
      before: before ? { title: before.title, slug: before.slug } : undefined,
    });

    revalidatePath("/articles");
    revalidatePath("/dashboard");
    await refreshPublic(['news', 'stories', 'opinions', 'authors', 'home']); return { success: true };
  } catch (error: any) {
    console.error("Delete Article Error:", error);
    return { success: false, error: error.message || "Failed to delete article" };
  }
}

export async function duplicateArticleAction(sourceId: string) {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !["SUPER_ADMIN", "EDITOR_IN_CHIEF", "SENIOR_WRITER", "WRITER"].includes(session.user.role)) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const rows: any[] = await prisma.$queryRaw`
      SELECT title, slug, excerpt, content, type, "coverImage", "thumbnailImage",
             "seoTitle", "seoDescription", "focusKeyword", "canonicalUrl", "ogImage",
             "noIndex", "isFeatured", "isPinned", "isSponsored", "categoryId"
      FROM "Article" WHERE id = ${sourceId} AND "deletedAt" IS NULL LIMIT 1
    `;
    if (!rows.length) return { success: false, error: "Source article not found" };

    const src = rows[0];
    const newId = crypto.randomUUID();
    let newSlug = `${src.slug}-copy`;
    let counter = 1;
    while (true) {
      const existing: any[] = await prisma.$queryRaw`SELECT id FROM "Article" WHERE slug = ${newSlug} LIMIT 1`;
      if (!existing.length) break;
      newSlug = `${src.slug}-copy-${++counter}`;
    }

    await prisma.$executeRaw`
      INSERT INTO "Article" (
        id, title, slug, excerpt, content, type, status, "noIndex",
        "isFeatured", "isPinned", "isSponsored", "categoryId",
        "coverImage", "thumbnailImage", "seoTitle", "seoDescription",
        "focusKeyword", "canonicalUrl", "ogImage",
        "authorId", "createdAt", "updatedAt"
      ) VALUES (
        ${newId}, ${src.title + ' (Copy)'}, ${newSlug}, ${src.excerpt || ''},
        ${JSON.stringify(src.content)}::jsonb, ${src.type}::"ArticleType", 'DRAFT'::"ArticleStatus",
        ${src.noIndex}, false, false, false, ${src.categoryId || null},
        ${src.coverImage || null}, ${src.thumbnailImage || null},
        ${src.seoTitle || null}, ${src.seoDescription || null},
        ${src.focusKeyword || null}, ${src.canonicalUrl || null}, ${src.ogImage || null},
        ${session.user.id}, NOW(), NOW()
      )
    `;

    revalidatePath("/articles");
    return {
      success: true,
      data: {
        id: newId,
        title: src.title + ' (Copy)',
        slug: newSlug,
        status: 'DRAFT',
        type: src.type,
        views: 0,
        publishedAt: null,
        author: session.user.name || 'Unknown',
        category: '',
      }
    };
  } catch (error: any) {
    console.error("[duplicateArticleAction] Error:", error);
    return { success: false, error: error.message || "Failed to duplicate article" };
  }
}

export async function getCategoriesAction() {
  try {
    const categories: any[] = await prisma.$queryRaw`
      SELECT id, name, slug FROM "Category" ORDER BY name ASC
    `;
    return { success: true, data: categories };
  } catch (error: any) {
    console.error("Get Categories Error:", error);
    return { success: false, error: error.message || "Failed to fetch categories", data: [] };
  }
}
