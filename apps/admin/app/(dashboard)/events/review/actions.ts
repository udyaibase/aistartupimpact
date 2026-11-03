"use server";

import { prisma } from "@udyaibase/database";
import { requireActionAuth } from "@/lib/api-auth";
import { logAuditEvent } from "@/lib/audit-log";
import { refreshPublic, requestEventApproved, requestOrganizerSuspended } from "@/lib/refresh-public";
import { sendEmailFireAndForget } from "@/lib/email-send";
import { SUSPENSION_NOTE } from "@udyaibase/utils/event-moderation";

/**
 * Event trust & safety. New independent organizers' first events and events hidden after reports wait here
 * (status PENDING_REVIEW, not public). Approving a first event makes the organizer verified, so their later events
 * publish without review. Suspending an organizer cancels their upcoming events at once; attendee notices and
 * refunds run on the website (instantly when it can be reached, otherwise from its daily job).
 */

const ROLES = ["SUPER_ADMIN", "EDITOR_IN_CHIEF"];
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://udyaibase.com").replace(/\/$/, "");

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const mail = (title: string, body: string, href?: string, label?: string) => `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937;max-width:560px;margin:0 auto;padding:24px">
<h1 style="font-size:20px;margin:0 0 8px">${esc(title)}</h1><p style="margin:0 0 20px;font-size:15px;line-height:1.6">${body}</p>
${href ? `<p style="margin:0"><a href="${href}" style="display:inline-block;background:#A50F15;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:10px">${esc(label ?? "Open")}</a></p>` : ""}</div>`;

export type ReviewItem = {
  id: string; title: string; slug: string; startAt: string; createdAt: string; reviewNote: string | null; held: boolean;
  organizer: { id: string; name: string; email: string; bio: string | null; website: string | null; linkedin: string | null; verified: boolean; status: string; events: number };
  reports: { reason: string; details: string; at: string }[];
};

export async function listReviewQueueAction() {
  const { error } = await requireActionAuth(ROLES);
  if (error) return { success: false as const, error };
  const events = await prisma.event.findMany({
    where: { status: "PENDING_REVIEW", deletedAt: null },
    orderBy: [{ heldAt: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }],
    take: 100,
    select: {
      id: true, title: true, slug: true, startAt: true, createdAt: true, reviewNote: true, heldAt: true,
      organizer: { select: { id: true, name: true, email: true, bio: true, website: true, linkedin: true, verifiedAt: true, status: true, _count: { select: { events: true } } } },
    },
  });
  const reports = events.length ? await prisma.contentReport.findMany({
    where: { entityType: "EVENT", entityId: { in: events.map((e) => e.id) }, status: { in: ["PENDING", "REVIEWING"] } },
    orderBy: { createdAt: "desc" },
    select: { entityId: true, reportType: true, description: true, createdAt: true },
  }) : [];
  const items: ReviewItem[] = events.map((e) => ({
    id: e.id, title: e.title, slug: e.slug, startAt: e.startAt.toISOString(), createdAt: e.createdAt.toISOString(), reviewNote: e.reviewNote, held: !!e.heldAt,
    organizer: {
      id: e.organizer.id, name: e.organizer.name, email: e.organizer.email, bio: e.organizer.bio, website: e.organizer.website, linkedin: e.organizer.linkedin,
      verified: !!e.organizer.verifiedAt, status: e.organizer.status, events: e.organizer._count.events,
    },
    reports: reports.filter((r) => r.entityId === e.id).map((r) => ({ reason: r.reportType, details: r.description, at: r.createdAt.toISOString() })),
  }));
  return { success: true as const, items };
}

/** Publish the event; a first event also makes its organizer verified. Open reports on it are resolved. */
export async function approveEventAction(eventId: string) {
  const { error, session } = await requireActionAuth(ROLES);
  if (error) return { success: false as const, error };
  const ev = await prisma.event.findFirst({ where: { id: eventId, status: "PENDING_REVIEW", deletedAt: null }, select: { id: true, title: true, slug: true, heldAt: true, organizerId: true, organizer: { select: { email: true, verifiedAt: true, status: true } } } });
  if (!ev) return { success: false as const, error: "That event isn't waiting for review." };
  if (ev.organizer.status === "SUSPENDED") return { success: false as const, error: "The organizer is suspended. Reinstate them first." };
  const now = new Date();
  await prisma.$transaction([
    prisma.event.update({ where: { id: ev.id }, data: { status: "PUBLISHED", publishedAt: now, reviewedAt: now, heldAt: null, reviewNote: null } }),
    ...(ev.organizer.verifiedAt ? [] : [prisma.eventOrganizer.update({ where: { id: ev.organizerId }, data: { verifiedAt: now } })]),
    prisma.contentReport.updateMany({ where: { entityType: "EVENT", entityId: ev.id, status: { in: ["PENDING", "REVIEWING"] } }, data: { status: "DISMISSED", resolvedAt: now, resolvedBy: session?.user?.email ?? "admin" } }),
  ]);
  sendEmailFireAndForget({
    to: ev.organizer.email,
    subject: `${ev.title} is live on Udyaibase`,
    type: "organizer_event_approved",
    html: mail("Your event is live", `<strong>${esc(ev.title)}</strong> passed our review and is now public.${ev.organizer.verifiedAt ? "" : " You're now a verified organizer, so your next events publish straight away."}`, `${SITE}/events/${ev.slug}`, "View your event"),
  });
  await logAuditEvent({ action: "UPDATE", resourceType: "EVENT", resourceId: ev.id, resourceName: ev.title, after: { status: "PUBLISHED", review: "approved", wasHidden: !!ev.heldAt } });
  await requestEventApproved(ev.id);
  await refreshPublic(["events", "home"], [`/events/${ev.slug}`]);
  return { success: true as const };
}

/** Send the event back to draft with a note to the organizer. Open reports on it are resolved. */
export async function declineEventAction(eventId: string, note: string) {
  const { error, session } = await requireActionAuth(ROLES);
  if (error) return { success: false as const, error };
  const reason = String(note ?? "").trim().slice(0, 1000);
  if (reason.length < 5) return { success: false as const, error: "Tell the organizer why, so they can fix it." };
  const ev = await prisma.event.findFirst({ where: { id: eventId, status: "PENDING_REVIEW", deletedAt: null }, select: { id: true, title: true, organizer: { select: { email: true } } } });
  if (!ev) return { success: false as const, error: "That event isn't waiting for review." };
  const now = new Date();
  await prisma.$transaction([
    prisma.event.update({ where: { id: ev.id }, data: { status: "DRAFT", reviewedAt: now, reviewNote: `Declined: ${reason}` } }),
    prisma.contentReport.updateMany({ where: { entityType: "EVENT", entityId: ev.id, status: { in: ["PENDING", "REVIEWING"] } }, data: { status: "RESOLVED", resolvedAt: now, resolvedBy: session?.user?.email ?? "admin" } }),
  ]);
  sendEmailFireAndForget({
    to: ev.organizer.email,
    subject: `Changes needed: ${ev.title}`,
    type: "organizer_event_declined",
    html: mail("Your event needs changes", `We couldn't publish <strong>${esc(ev.title)}</strong> yet. Our team's note:<br><br><em>${esc(reason)}</em><br><br>Update the event and publish it again for another review.`, `${SITE}/organizer/events`, "Edit your event"),
  });
  await logAuditEvent({ action: "UPDATE", resourceType: "EVENT", resourceId: ev.id, resourceName: ev.title, after: { status: "DRAFT", review: "declined", reason } });
  return { success: true as const };
}

/**
 * Suspend an organizer at once: sign-in is blocked (status SUSPENDED) and their upcoming events are cancelled and
 * hidden. The website then emails attendees and refunds paid tickets for those events.
 */
export async function suspendOrganizerAction(organizerId: string, reason: string) {
  const { error, session } = await requireActionAuth(["SUPER_ADMIN"]);
  if (error) return { success: false as const, error };
  const why = String(reason ?? "").trim().slice(0, 1000);
  if (why.length < 5) return { success: false as const, error: "Add a reason; it's kept in the audit log." };
  const o = await prisma.eventOrganizer.findUnique({ where: { id: organizerId }, select: { id: true, name: true, email: true, status: true } });
  if (!o) return { success: false as const, error: "Organizer not found." };
  if (/@udyaibase\.com$/i.test(o.email)) return { success: false as const, error: "Udyaibase's own accounts can't be suspended." };
  const now = new Date();
  const [, cancelled] = await prisma.$transaction([
    prisma.eventOrganizer.update({ where: { id: o.id }, data: { status: "SUSPENDED", suspendedAt: now, suspendReason: why } }),
    prisma.event.updateMany({
      where: { organizerId: o.id, deletedAt: null, endAt: { gt: now }, status: { in: ["PUBLISHED", "PENDING_REVIEW", "POSTPONED"] } },
      data: { status: "CANCELLED", reviewNote: SUSPENSION_NOTE, reviewedAt: null },
    }),
  ]);
  sendEmailFireAndForget({
    to: o.email,
    subject: "Your Udyaibase organizer account is suspended",
    type: "organizer_suspended",
    html: mail("Your organizer account is suspended", `Your account was suspended and your upcoming events were cancelled; attendees are being told and paid tickets refunded. Reason: <em>${esc(why)}</em><br><br>If you think this is a mistake, reply to this email.`),
  });
  await logAuditEvent({ action: "UPDATE", resourceType: "USER", resourceId: o.id, resourceName: `Event host ${o.name}`, before: { status: o.status }, after: { status: "SUSPENDED", reason: why, eventsCancelled: cancelled.count, by: session?.user?.email } });
  await requestOrganizerSuspended(o.id);
  await refreshPublic(["events", "home"]);
  return { success: true as const, eventsCancelled: cancelled.count };
}

/** Lift a suspension. Cancelled events stay cancelled; the organizer can create new ones. */
export async function reinstateOrganizerAction(organizerId: string) {
  const { error } = await requireActionAuth(["SUPER_ADMIN"]);
  if (error) return { success: false as const, error };
  const o = await prisma.eventOrganizer.update({ where: { id: organizerId }, data: { status: "ACTIVE", suspendedAt: null, suspendReason: null } }).catch(() => null);
  if (!o) return { success: false as const, error: "Organizer not found." };
  await logAuditEvent({ action: "UPDATE", resourceType: "USER", resourceId: o.id, resourceName: `Event host ${o.name}`, after: { status: "ACTIVE", reinstated: true } });
  return { success: true as const };
}
