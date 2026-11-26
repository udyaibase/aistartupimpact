"use server";

import { prisma } from "@udyaibase/database";
import { requireActionAuth } from "@/lib/api-auth";
import { logAuditEvent } from "@/lib/audit-log";
import { refreshPublic, requestEventApproved, requestOrganizerSuspended } from "@/lib/refresh-public";
import { sendEmailFireAndForget } from "@/lib/email-send";
import { notifyOrganizer } from "@/lib/organizer-notify";
import { SUSPENSION_NOTE } from "@udyaibase/utils/event-moderation";
import { sectionRoles } from '@/lib/section-access';

/**
 * Event trust & safety. New independent organizers' first events and events hidden after reports wait here
 * (status PENDING_REVIEW, not public). Approving a first event makes the organizer verified, so their later events
 * publish without review. Suspending an organizer cancels their upcoming events at once; attendee notices and
 * refunds run on the website (instantly when it can be reached, otherwise from its daily job).
 */

const ROLES = sectionRoles('/events/review');
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
  await notifyOrganizer(ev.organizerId, { type: 'event_approved', title: `${ev.title} is live`, message: `It passed our review and is now public.${ev.organizer.verifiedAt ? '' : ' You’re now a verified organizer, so your next events publish straight away.'}`, link: `/organizer/events/${ev.id}` });
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
  const ev = await prisma.event.findFirst({ where: { id: eventId, status: "PENDING_REVIEW", deletedAt: null }, select: { id: true, title: true, organizerId: true, organizer: { select: { email: true } } } });
  if (!ev) return { success: false as const, error: "That event isn't waiting for review." };
  const now = new Date();
  await prisma.$transaction([
    prisma.event.update({ where: { id: ev.id }, data: { status: "DRAFT", reviewedAt: now, reviewNote: `Declined: ${reason}` } }),
    prisma.contentReport.updateMany({ where: { entityType: "EVENT", entityId: ev.id, status: { in: ["PENDING", "REVIEWING"] } }, data: { status: "RESOLVED", resolvedAt: now, resolvedBy: session?.user?.email ?? "admin" } }),
  ]);
  await notifyOrganizer(ev.organizerId, { type: 'event_declined', title: `Changes needed: ${ev.title}`, message: `Our team’s note: ${reason}`, link: `/organizer/events/${ev.id}` });
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

// ── Full details for review ───────────────────────────────────────────────────

export type ReviewFlag = { level: "warn" | "info"; text: string };
export type ReviewDetails = {
  basics: { title: string; subtitle: string | null; category: string; tags: string[]; coverImageUrl: string | null; gallery: string[]; hostedBy: { name: string; slug: string; verified: boolean } | null; visibility: string; approvalRequired: boolean };
  when: { startAt: string; endAt: string; timezone: string; registrationDeadline: string | null };
  where: { format: string; venueName: string | null; address: string | null; mapUrl: string | null; meetingLink: string | null; revealLinkAfterRegistration: boolean };
  tickets: { capacity: number | null; tiers: { name: string; type: string; priceRupees: number; quantity: number | null; saleStart: string | null; saleEnd: string | null; description: string | null }[]; payoutReady: boolean };
  details: { descriptionHtml: string; descriptionChars: number; speakers: { name: string; title: string | null; company: string | null; photo: string | null; link: string | null }[]; agenda: { day: number; start: string; end: string; title: string; note: string | null }[]; questions: { text: string; type: string; required: boolean }[] };
  source: { name: string | null; url: string | null };
  links: string[];
  flags: ReviewFlag[];
};

/** Description HTML for the reviewer: formatting only, links open in a new tab and carry no referrer. */
async function reviewHtml(html: string): Promise<string> {
  const { default: sanitize } = await import("sanitize-html");
  return sanitize(html, {
    allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "h2", "h3", "h4", "blockquote", "hr", "a"],
    allowedAttributes: { a: ["href", "target", "rel"] },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    transformTags: { a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer nofollow ugc" } }) },
  });
}

const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };
const KNOWN_MEETING_HOSTS = ["zoom.us", "meet.google.com", "teams.microsoft.com", "teams.live.com", "youtube.com", "youtu.be", "webex.com", "streamyard.com", "linkedin.com", "airmeet.com", "hopin.com", "discord.gg", "discord.com"];

/** Everything the organizer submitted, in the order of their form, plus things worth a closer look. */
export async function getReviewDetailsAction(eventId: string) {
  const { error } = await requireActionAuth(ROLES);
  if (error) return { success: false as const, error };
  const e = await prisma.event.findFirst({
    where: { id: String(eventId ?? ""), deletedAt: null },
    include: {
      ticketTiers: { orderBy: { createdAt: "asc" } },
      speakers: { orderBy: { sortOrder: "asc" } },
      agendaItems: { orderBy: [{ dayNumber: "asc" }, { sortOrder: "asc" }] },
      customQuestions: { orderBy: { sortOrder: "asc" } },
      tags: { select: { tag: { select: { name: true } } } },
      Startup: { select: { name: true, slug: true, isVerified: true } },
      organizer: { select: { payoutStatus: true, payoutAccountId: true } },
    },
  });
  if (!e) return { success: false as const, error: "Event not found." };

  const desc = (e.description ?? {}) as { html?: string; text?: string };
  const rawHtml = typeof desc.html === "string" ? desc.html : typeof desc.text === "string" ? `<p>${esc(desc.text)}</p>` : "";
  const descriptionHtml = rawHtml ? await reviewHtml(rawHtml) : "";
  const plain = (typeof desc.text === "string" ? desc.text : rawHtml.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  const [address, mapUrl] = (e.address ?? "").split("|||");
  const links = Array.from(new Set(Array.from(rawHtml.matchAll(/href="([^"]+)"/g)).map((m) => m[1]).filter((u) => /^https?:/i.test(u))));
  const payoutReady = e.organizer.payoutStatus === "ACTIVATED" && !!e.organizer.payoutAccountId;
  const tiers = e.ticketTiers.map((t) => ({
    name: t.name, type: t.tierType, priceRupees: Math.round(t.priceCents) / 100, quantity: t.quantity,
    saleStart: t.saleStart?.toISOString() ?? null, saleEnd: t.saleEnd?.toISOString() ?? null, description: t.description,
  }));

  const flags: ReviewFlag[] = [];
  const hoursToStart = (e.startAt.getTime() - Date.now()) / 36e5;
  if (hoursToStart < 0) flags.push({ level: "warn", text: "The start time has already passed." });
  else if (hoursToStart < 48) flags.push({ level: "warn", text: `Starts in ${Math.max(1, Math.round(hoursToStart))} hours: little time for people to register.` });
  if (!e.coverImageUrl) flags.push({ level: "info", text: "No cover image." });
  if (plain.length < 100) flags.push({ level: "warn", text: plain ? `Very short description (${plain.length} characters).` : "No description." });
  if (links.length) flags.push({ level: "info", text: `Description links to: ${Array.from(new Set(links.map(hostOf))).join(", ")}. Check they're genuine.` });
  const paid = tiers.filter((t) => t.priceRupees > 0);
  if (paid.length && !payoutReady) flags.push({ level: "warn", text: "Sells paid tickets, but the organizer's payout account isn't active yet." });
  const top = Math.max(0, ...paid.map((t) => t.priceRupees));
  if (top >= 25000) flags.push({ level: "warn", text: `High ticket price (₹${top.toLocaleString("en-IN")}). Check it's realistic.` });
  if (e.meetingLink) {
    const h = hostOf(e.meetingLink);
    if (!KNOWN_MEETING_HOSTS.some((k) => h === k || h.endsWith(`.${k}`))) flags.push({ level: "warn", text: `Online link goes to ${h}, not a common meeting service.` });
  }
  if ((e.format === "IN_PERSON" || e.format === "HYBRID") && !e.venueName && !address) flags.push({ level: "warn", text: "In-person event without a venue or address." });
  if (e.Startup && !e.Startup.isVerified) flags.push({ level: "warn", text: `Says it's hosted by ${e.Startup.name}, which isn't a verified startup.` });
  if (e.sourceUrl) flags.push({ level: "info", text: `Imported from ${e.sourceName || hostOf(e.sourceUrl)}.` });

  const details: ReviewDetails = {
    basics: {
      title: e.title, subtitle: e.subtitle, category: e.category, tags: e.tags.map((t) => t.tag.name), coverImageUrl: e.coverImageUrl, gallery: e.galleryImageUrls,
      hostedBy: e.Startup ? { name: e.Startup.name, slug: e.Startup.slug, verified: e.Startup.isVerified } : null, visibility: e.visibility, approvalRequired: e.approvalRequired,
    },
    when: { startAt: e.startAt.toISOString(), endAt: e.endAt.toISOString(), timezone: e.timezone, registrationDeadline: e.registrationDeadline?.toISOString() ?? null },
    where: { format: e.format, venueName: e.venueName, address: address || null, mapUrl: mapUrl || null, meetingLink: e.meetingLink, revealLinkAfterRegistration: e.revealLinkAfterRegistration },
    tickets: { capacity: e.capacity, tiers, payoutReady },
    details: {
      descriptionHtml, descriptionChars: plain.length,
      speakers: e.speakers.map((s) => ({ name: s.name, title: s.title, company: s.company, photo: s.headshotUrl, link: s.bio && /^https?:\/\//.test(s.bio) ? s.bio : null })),
      agenda: e.agendaItems.map((a) => ({ day: a.dayNumber, start: a.startTime, end: a.endTime, title: a.title, note: a.description })),
      questions: e.customQuestions.map((q) => ({ text: q.questionText, type: q.questionType, required: q.required })),
    },
    source: { name: e.sourceName, url: e.sourceUrl },
    links,
    flags,
  };
  return { success: true as const, details };
}
