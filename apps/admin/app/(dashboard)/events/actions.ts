"use server";
import { getPublicUrl } from "@/lib/media";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@udyaibase/database";
import { neon } from "@neondatabase/serverless";
import { requireActionAuth } from "@/lib/api-auth";
import { revalidatePath } from "next/cache";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { logAuditEvent, canDelete } from '@/lib/audit-log';
import { refreshPublic } from '@/lib/refresh-public';

const EVENT_ROLES = ["SUPER_ADMIN", "EDITOR_IN_CHIEF", "EVENT_ORGANIZER"];
const adminSql = neon(process.env.DATABASE_URL!);

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

// ─────────────────────────────────────────────────────────
// Upload event image
// ─────────────────────────────────────────────────────────

export async function uploadEventImageAction(formData: FormData) {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !EVENT_ROLES.includes(session.user.role)) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const file = formData.get("file") as File;
    if (!file) return { success: false, error: "No file provided" };

    const bucketName = process.env.R2_BUCKET_NAME;
    if (!bucketName) return { success: false, error: "Storage not configured" };

    const uniqueId = crypto.randomUUID();
    const cleanFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const fileKey = `events/${uniqueId}-${cleanFilename}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: fileKey,
        ContentType: file.type,
        Body: buffer,
      })
    );

    const url = getPublicUrl(fileKey);

    return { success: true, data: { url } };
  } catch (error: any) {
    console.error("Event image upload error:", error);
    return { success: false, error: error.message || "Upload failed" };
  }
}

// ─────────────────────────────────────────────────────────
// Create or update event (draft save)
// ─────────────────────────────────────────────────────────

export async function saveEventAction(data: any) {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !EVENT_ROLES.includes(session.user.role)) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const eventId = data.id;
    const isUpdate = !!eventId;

    // Check ownership for updates
    if (isUpdate) {
      const existing = await prisma.event.findUnique({
        where: { id: eventId },
        select: { organizerId: true },
      });
      if (!existing) return { success: false, error: "Event not found" };
      const isAdmin = ["SUPER_ADMIN", "EDITOR_IN_CHIEF"].includes(session.user.role);
      if (!isAdmin && existing.organizerId !== session.user.id) {
        return { success: false, error: "Not authorized to edit this event" };
      }
    }

    // Prepare event data
    const eventData = {
      title: data.title,
      slug: data.slug,
      subtitle: data.subtitle || null,
      category: data.category,
      format: data.format,
      status: data.status || "DRAFT",
      startAt: new Date(data.startAt),
      endAt: new Date(data.endAt),
      timezone: data.timezone || "Asia/Kolkata",
      venueName: data.venueName || null,
      address: data.address || null,
      latitude: data.latitude || null,
      longitude: data.longitude || null,
      meetingLink: data.meetingLink || null,
      revealLinkAfterRegistration: data.revealLinkAfterRegistration || false,
      coverImageUrl: data.coverImageUrl || null,
      galleryImageUrls: data.galleryImageUrls || [],
      description: data.description || null,
      capacity: data.capacity || null,
      visibility: data.visibility || "PUBLIC",
      registrationDeadline: data.registrationDeadline
        ? new Date(data.registrationDeadline)
        : null,
      approvalRequired: data.approvalRequired || false,
      metaTitle: data.metaTitle || null,
      metaDescription: data.metaDescription || null,
      socialImageUrl: data.socialImageUrl || null,
      publishAt: data.publishAt ? new Date(data.publishAt) : null,
    };

    let event;

    if (isUpdate) {
      event = await prisma.event.update({
        where: { id: eventId },
        data: eventData,
      });
    } else {
      // Generate a unique 6-char shortCode
      const shortCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      event = await prisma.event.create({
        data: {
          ...eventData,
          organizerId: session.user.id,
          shortCode,
        },
      });
    }

    // ─── Save speakers ───
    if (data.speakers && data.speakers.length > 0) {
      // Delete existing speakers and recreate
      await prisma.eventSpeaker.deleteMany({ where: { eventId: event.id } });
      await prisma.eventSpeaker.createMany({
        data: data.speakers.map((s: any, i: number) => ({
          eventId: event.id,
          name: s.name,
          title: s.title || null,
          company: s.company || null,
          headshotUrl: s.headshotUrl || null,
          bio: s.bio || null,
          talkTitle: s.talkTitle || null,
          sortOrder: i,
        })),
      });
    }

    // ─── Save agenda items ───
    if (data.agendaItems && data.agendaItems.length > 0) {
      await prisma.eventAgendaItem.deleteMany({ where: { eventId: event.id } });
      await prisma.eventAgendaItem.createMany({
        data: data.agendaItems.map((a: any, i: number) => ({
          eventId: event.id,
          dayNumber: a.dayNumber || 1,
          startTime: a.startTime,
          endTime: a.endTime,
          title: a.title,
          description: a.description || null,
          speakerId: a.speakerId || null,
          sortOrder: i,
        })),
      });
    }

    // ─── Save ticket tiers ───
    if (data.ticketTiers && data.ticketTiers.length > 0) {
      await prisma.eventTicketTier.deleteMany({ where: { eventId: event.id } });
      await prisma.eventTicketTier.createMany({
        data: data.ticketTiers.map((t: any) => ({
          eventId: event.id,
          name: t.name,
          priceCents: t.priceCents || 0,
          quantity: t.quantity || null,
          saleStart: t.saleStart ? new Date(t.saleStart) : null,
          saleEnd: t.saleEnd ? new Date(t.saleEnd) : null,
          tierType: t.tierType || "REGULAR",
          description: t.description || null,
        })),
      });
    }

    // ─── Save custom questions ───
    if (data.customQuestions && data.customQuestions.length > 0) {
      await prisma.eventCustomQuestion.deleteMany({
        where: { eventId: event.id },
      });
      await prisma.eventCustomQuestion.createMany({
        data: data.customQuestions.map((q: any, i: number) => ({
          eventId: event.id,
          questionText: q.questionText,
          questionType: q.questionType || "TEXT",
          options: q.options || null,
          required: q.required || false,
          sortOrder: i,
        })),
      });
    }

    // ─── Save tag mappings ───
    if (data.tags && data.tags.length > 0) {
      await prisma.eventTagMapping.deleteMany({ where: { eventId: event.id } });
      await prisma.eventTagMapping.createMany({
        data: data.tags.map((tagId: string) => ({
          eventId: event.id,
          tagId,
        })),
      });
    }

    revalidatePath("/events");

    // Audit log
    await logAuditEvent({
      action: data.id ? 'UPDATE' : 'CREATE',
      resourceType: 'EVENT',
      resourceId: event.id,
      after: { title: data.title, slug: event.slug },
    });

    await refreshPublic(['events', 'home']); return { success: true, data: { id: event.id, slug: event.slug } };
  } catch (error: any) {
    console.error("Save event error:", error);
    if (error.code === "P2002" && error.meta?.target?.includes("slug")) {
      return { success: false, error: "This slug is already taken. Choose a different one." };
    }
    return { success: false, error: error.message || "Failed to save event" };
  }
}

// ─────────────────────────────────────────────────────────
// Publish event
// ─────────────────────────────────────────────────────────

export async function publishEventAction(eventId: string) {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !EVENT_ROLES.includes(session.user.role)) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { organizerId: true, status: true },
    });

    if (!event) return { success: false, error: "Event not found" };

    const isAdmin = ["SUPER_ADMIN", "EDITOR_IN_CHIEF"].includes(session.user.role);
    if (!isAdmin && event.organizerId !== session.user.id) {
      return { success: false, error: "Not authorized" };
    }

    await prisma.event.update({
      where: { id: eventId },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });

    revalidatePath("/events");
    await refreshPublic(['events', 'home']); return { success: true };
  } catch (error: any) {
    console.error("Publish event error:", error);
    return { success: false, error: error.message || "Failed to publish" };
  }
}

// ─────────────────────────────────────────────────────────
// Delete event (soft delete)
// ─────────────────────────────────────────────────────────

export async function deleteEventAction(eventId: string) {
  // Only SUPER_ADMIN can delete
  const { allowed, error } = await canDelete();
  if (!allowed) {
    return { success: false, error: error || 'Unauthorized' };
  }

  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { organizerId: true, title: true, slug: true },
    });

    if (!event) return { success: false, error: "Event not found" };

    await prisma.event.update({
      where: { id: eventId },
      data: { deletedAt: new Date() },
    });

    // Audit log
    await logAuditEvent({
      action: 'DELETE',
      resourceType: 'EVENT',
      resourceId: eventId,
      before: { title: (event as any).title, slug: (event as any).slug },
    });

    revalidatePath("/events");
    await refreshPublic(['events', 'home']); return { success: true };
  } catch (error: any) {
    console.error("Delete event error:", error);
    return { success: false, error: error.message || "Failed to delete" };
  }
}

// ─────────────────────────────────────────────────────────
// Fetch event tags for the tag selector
// ─────────────────────────────────────────────────────────

export async function getEventTagsAction() {
  try {
    const tags = await prisma.eventTag.findMany({
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
    return { success: true, data: tags };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ─────────────────────────────────────────────────────────
// Check slug availability
// ─────────────────────────────────────────────────────────

export async function checkSlugAction(slug: string, excludeId?: string) {
  try {
    const existing = await prisma.event.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (existing && existing.id !== excludeId) {
      return { available: false };
    }
    return { available: true };
  } catch {
    return { available: false };
  }
}

// ─────────────────────────────────────────────────────────
// Bulk import scraped events as drafts
// ─────────────────────────────────────────────────────────

export async function importScrapedEventsAction(events: {
  title: string;
  url: string;
  date: string | null;
  endDate?: string | null;
  location: string | null;
  description: string | null;
  imageUrl?: string | null;
  organizer?: string | null;
  source?: string;
  suggestedCategory: string;
  suggestedFormat: string;
}[]) {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !EVENT_ROLES.includes(session.user.role)) {
    return { success: false, error: "Unauthorized" };
  }

  // Find or create a system organizer for auto-fetched events
  const SYSTEM_EMAIL = 'events@udyaibase.com';
  let systemOrganizer = await prisma.eventOrganizer.findUnique({
    where: { email: SYSTEM_EMAIL },
    select: { id: true },
  });
  if (!systemOrganizer) {
    systemOrganizer = await prisma.eventOrganizer.create({
      data: {
        email: SYSTEM_EMAIL,
        name: 'Udyaibase Events',
        company: 'Udyaibase',
        emailVerified: true,
      },
    });
  }

  const results: { title: string; status: 'created' | 'skipped'; reason?: string }[] = [];

  for (const event of events) {
    try {
      // Generate slug from title
      const baseSlug = event.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80);

      // Check for duplicate slug
      const existing = await prisma.event.findUnique({
        where: { slug: baseSlug },
        select: { id: true },
      });

      if (existing) {
        // Check title similarity to avoid importing the same event
        const existingByTitle = await adminSql`
          SELECT id FROM "Event"
          WHERE LOWER(title) = ${event.title.toLowerCase()} AND "deletedAt" IS NULL
          LIMIT 1
        `;
        if (existingByTitle.length > 0) {
          results.push({ title: event.title, status: 'skipped', reason: 'Duplicate event' });
          continue;
        }
      }

      const slug = existing ? `${baseSlug}-${Date.now().toString(36)}` : baseSlug;
      const shortCode = Math.random().toString(36).substring(2, 8).toUpperCase();

      const startAt = event.date ? new Date(event.date) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const endAt = event.endDate ? new Date(event.endDate) : new Date(startAt.getTime() + 3 * 60 * 60 * 1000);

      // Build description as Tiptap-compatible JSON
      const descText = event.description || '';
      const descJson = {
        type: 'doc',
        content: [
          ...(descText ? [{ type: 'paragraph', content: [{ type: 'text', text: descText.slice(0, 2000) }] }] : []),
          ...(event.url ? [{ type: 'paragraph', content: [{ type: 'text', text: `Source: ${event.url}` }] }] : []),
        ],
      };

      const sourceName = event.source
        ? event.source.charAt(0).toUpperCase() + event.source.slice(1)
        : null;

      await prisma.event.create({
        data: {
          slug,
          shortCode,
          organizerId: systemOrganizer.id,
          title: event.title,
          subtitle: event.organizer ? `Hosted by ${event.organizer}` : null,
          category: event.suggestedCategory as any,
          format: event.suggestedFormat as any,
          status: 'DRAFT',
          startAt,
          endAt,
          timezone: 'Asia/Kolkata',
          venueName: event.location || null,
          address: event.location || null,
          coverImageUrl: event.imageUrl || null,
          description: descJson,
          metaDescription: descText.slice(0, 160) || null,
          sourceUrl: event.url || null,
          sourceName,
        },
      });

      results.push({ title: event.title, status: 'created' });
    } catch (err: any) {
      results.push({ title: event.title, status: 'skipped', reason: err.message?.slice(0, 100) || 'Error' });
    }
  }

  await logAuditEvent({
    action: 'CREATE',
    resourceType: 'EVENT',
    resourceId: 'bulk-import',
    after: { count: results.filter(r => r.status === 'created').length, source: 'auto-fetch' },
  });

  revalidatePath('/events');

  return {
    success: true,
    data: {
      created: results.filter(r => r.status === 'created').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      results,
    },
  };
}

// ─────────────────────────────────────────────────────────
// Get all events for admin listing (client-side)
// ─────────────────────────────────────────────────────────

export async function getEventsAction() {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };

  try {
    const events = await adminSql`
      SELECT e.id, e.title, e.slug, e.status, e.category, e.format,
             e."startAt"::text AS "startAt", e."endAt"::text AS "endAt",
             e."registrationCount", e.capacity, e."coverImageUrl",
             e."createdAt"::text AS "createdAt",
             o.name AS "organizerName", o.email AS "organizerEmail"
      FROM "Event" e
      LEFT JOIN "EventOrganizer" o ON o.id = e."organizerId"
      WHERE e."deletedAt" IS NULL
      ORDER BY e."createdAt" DESC
      LIMIT 200
    `;
    return { success: true, data: events };
  } catch (error: any) {
    console.error("[Admin Events]", error);
    return { success: false, error: "Failed to load events" };
  }
}

// ─────────────────────────────────────────────────────────
// Toggle event status (PUBLISHED <-> DRAFT)
// ─────────────────────────────────────────────────────────

export async function toggleEventStatusAction(id: string, newStatus: "PUBLISHED" | "DRAFT") {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };

  try {
    await adminSql`
      UPDATE "Event"
      SET status = ${newStatus},
          "publishedAt" = ${newStatus === "PUBLISHED" ? new Date() : null},
          "updatedAt" = NOW()
      WHERE id = ${id}
    `;

    await logAuditEvent({
      action: "UPDATE",
      resourceType: "EVENT",
      resourceId: id,
      after: { status: newStatus },
    });

    revalidatePath("/events");
    await refreshPublic(['events', 'home']); return { success: true };
  } catch (error: any) {
    console.error("[Admin Events Toggle]", error);
    return { success: false, error: "Failed to update status" };
  }
}
