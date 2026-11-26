import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@udyaibase/database";
import { redirect, notFound } from "next/navigation";
import EventDashboard from "./EventDashboard";
import { sectionRoles } from '@/lib/section-access';

const EVENT_ROLES = sectionRoles('/events');

export default async function EventManagePage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  const session = await getServerSession(authOptions);

  if (!session?.user || !EVENT_ROLES.includes(session.user.role)) {
    redirect("/dashboard");
  }

  const event = await prisma.event.findUnique({
    where: { id: params.id, deletedAt: null },
    include: {
      speakers: { orderBy: { sortOrder: "asc" } },
      agendaItems: { orderBy: { sortOrder: "asc" } },
      ticketTiers: true,
      customQuestions: { orderBy: { sortOrder: "asc" } },
      tags: { include: { tag: true } },
    },
  });

  if (!event) notFound();

  // Check permissions
  const isAdmin = ["SUPER_ADMIN", "EDITOR_IN_CHIEF"].includes(session.user.role);
  if (!isAdmin && event.organizerId !== session.user.id) {
    redirect("/events");
  }

  // Fetch registrations with details
  const registrations = await prisma.eventRegistration.findMany({
    where: { eventId: event.id, deletedAt: null },
    orderBy: { registeredAt: "desc" },
    select: {
      id: true,
      guestName: true,
      guestEmail: true,
      guestPhone: true,
      guestCompany: true,
      guestRole: true,
      status: true,
      qrToken: true,
      registeredAt: true,
      checkedInAt: true,
      ticketTier: { select: { name: true } },
    },
  });

  // Registration timeline (daily counts over last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const dailyRegistrations = await prisma.$queryRaw<any[]>`
    SELECT DATE("registeredAt") as date, COUNT(*) as count
    FROM "EventRegistration"
    WHERE "eventId" = ${event.id}
      AND "deletedAt" IS NULL
      AND "registeredAt" >= ${thirtyDaysAgo}
    GROUP BY DATE("registeredAt")
    ORDER BY date ASC
  `;

  // Stats
  const checkedInCount = registrations.filter((r) => r.status === "CHECKED_IN").length;
  const confirmedCount = registrations.filter((r) => r.status === "CONFIRMED").length;
  const waitlistedCount = registrations.filter((r) => r.status === "WAITLISTED").length;

  // Serialize dates
  const serializedEvent = {
    ...event,
    startAt: event.startAt.toISOString(),
    endAt: event.endAt.toISOString(),
    publishAt: event.publishAt?.toISOString() || null,
    publishedAt: event.publishedAt?.toISOString() || null,
    registrationDeadline: event.registrationDeadline?.toISOString() || null,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
    selectedTagIds: event.tags.map((t) => t.tagId),
  };

  const serializedRegistrations = registrations.map((r) => ({
    ...r,
    registeredAt: r.registeredAt.toISOString(),
    checkedInAt: r.checkedInAt?.toISOString() || null,
    tierName: r.ticketTier?.name || null,
  }));

  const timeline = dailyRegistrations.map((d: any) => ({
    date: new Date(d.date).toISOString().split("T")[0],
    count: Number(d.count),
  }));

  return (
    <EventDashboard
      event={serializedEvent}
      registrations={serializedRegistrations}
      timeline={timeline}
      stats={{ checkedIn: checkedInCount, confirmed: confirmedCount, waitlisted: waitlistedCount, total: registrations.length }}
    />
  );
}
