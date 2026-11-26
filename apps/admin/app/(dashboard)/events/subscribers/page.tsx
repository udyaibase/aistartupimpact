import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@udyaibase/database";
import { redirect } from "next/navigation";
import SubscriberDashboard from "./SubscriberDashboard";
import { sectionRoles } from '@/lib/section-access';

const ADMIN_ROLES = sectionRoles('/events/subscribers');

export default async function EventSubscribersPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !ADMIN_ROLES.includes(session.user.role)) redirect("/dashboard");

  const [totalSubscribers, events, topCities, topOccupations] = await Promise.all([
    prisma.eventSubscriber.count({ where: { subscribed: true } }),
    prisma.event.findMany({
      where: { deletedAt: null, status: "PUBLISHED" },
      orderBy: { startAt: "desc" },
      select: { id: true, title: true, slug: true, startAt: true, venueName: true, category: true, format: true, coverImageUrl: true },
    }),
    prisma.$queryRaw<any[]>`
      SELECT "locationCity" as city, COUNT(*) as count
      FROM "EventSubscriber"
      WHERE subscribed = true AND "locationCity" IS NOT NULL AND "locationCity" != ''
      GROUP BY "locationCity"
      ORDER BY count DESC LIMIT 15
    `,
    prisma.$queryRaw<any[]>`
      SELECT "guestOccupation" as occupation, COUNT(*) as count
      FROM "EventRegistration"
      WHERE "deletedAt" IS NULL AND "guestOccupation" IS NOT NULL AND "guestOccupation" != ''
      GROUP BY "guestOccupation"
      ORDER BY count DESC LIMIT 10
    `,
  ]);

  const serializedEvents = events.map(e => ({
    ...e,
    startAt: e.startAt.toISOString(),
  }));

  return (
    <SubscriberDashboard
      totalCount={totalSubscribers}
      events={serializedEvents}
      topCities={topCities.map((c: any) => ({ city: c.city, count: Number(c.count) }))}
      topOccupations={topOccupations.map((o: any) => ({ occupation: o.occupation, count: Number(o.count) }))}
    />
  );
}
