import { redirect } from "next/navigation";
import { getOrganizerSession } from "@/lib/organizer-auth";
import { prisma } from "@udyaibase/database";
import Link from "next/link";
import {
  CalendarDays, Users, TrendingUp, Plus, ArrowRight, Check,
  AlertCircle, Pencil, ShieldAlert, MoreHorizontal, Code2, Mic2, Monitor, Building2,
  BookOpen, QrCode, MessageCircle, ChevronRight, CodeXml,
} from "lucide-react";

export const dynamic = "force-dynamic";

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default async function OrganizerHome() {
  const session = await getOrganizerSession();
  if (!session) return null;

  if (!session.onboardingCompleted) {
    redirect("/organizer/onboarding");
  }

  const [organizer, teamCount, widgets] = await Promise.all([
    prisma.eventOrganizer.findUnique({
      where: { id: session.id },
      select: { companyEmailVerified: true },
    }),
    prisma.eventTeamMember.count({
      where: { organizerId: session.id },
    }).catch(() => 0),
    prisma.embedWidget.findMany({
      where: { organizerId: session.id },
      select: { active: true, firstSeenAt: true, firstSeenHost: true, codeCopiedAt: true, markedInstalledAt: true },
    }).catch(() => []),
  ]);
  const widgetLive = widgets.some((w) => w.active && w.firstSeenAt);
  const widgetStale = !widgetLive && widgets.some((w) => {
    const since = w.markedInstalledAt || w.codeCopiedAt;
    return w.active && since && Date.now() - since.getTime() > 24 * 60 * 60 * 1000;
  });

  const events = await prisma.event.findMany({
    where: { organizerId: session.id, deletedAt: null },
    orderBy: { startAt: "asc" },
    select: {
      id: true, title: true, slug: true, status: true,
      startAt: true, endAt: true, registrationCount: true,
      capacity: true, venueName: true, meetingLink: true,
      format: true, address: true, updatedAt: true,
    },
  });

  const hasEvents = events.some(e => e.status === "PUBLISHED");
  const firstName = session.name.split(" ")[0];

  if (!hasEvents) {
    return <NewAccountView firstName={firstName} companyEmailVerified={organizer?.companyEmailVerified ?? false} events={events} teamCount={teamCount} widgetLive={widgetLive} />;
  }

  const now = new Date();
  const upcomingEvents = events
    .filter(e => e.startAt > now && e.status !== "CANCELLED")
    .slice(0, 4);

  const draftEvents = events.filter(e => e.status === "DRAFT");

  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const [totalRegs, checkedIn, waitlisted, recentRegs, regsLast30, regsPrev30, totalViews] = await Promise.all([
    prisma.eventRegistration.count({ where: { event: { organizerId: session.id }, deletedAt: null } }),
    prisma.eventRegistration.count({ where: { event: { organizerId: session.id }, status: "CHECKED_IN", deletedAt: null } }),
    prisma.eventRegistration.count({ where: { event: { organizerId: session.id }, status: "WAITLISTED", deletedAt: null } }),
    prisma.eventRegistration.findMany({
      where: { event: { organizerId: session.id }, deletedAt: null },
      orderBy: { registeredAt: "desc" },
      select: {
        id: true, guestName: true, registeredAt: true, status: true,
        event: { select: { title: true } },
      },
      take: 5,
    }),
    prisma.eventRegistration.count({ where: { event: { organizerId: session.id }, deletedAt: null, registeredAt: { gte: thirtyDaysAgo } } }),
    prisma.eventRegistration.count({ where: { event: { organizerId: session.id }, deletedAt: null, registeredAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } } }),
    prisma.analyticsDaily.aggregate({
      where: { entityType: "event", entityId: { in: events.map(e => e.id) }, date: { gte: thirtyDaysAgo } },
      _sum: { views: true },
    }).catch(() => ({ _sum: { views: 0 } })),
  ]);

  const viewsLast30 = totalViews._sum.views ?? 0;
  const conversionRate = viewsLast30 > 0 ? ((regsLast30 / viewsLast30) * 100).toFixed(1) : null;
  const regsChange = regsPrev30 > 0 ? Math.round(((regsLast30 - regsPrev30) / regsPrev30) * 100) : null;

  // Per-event waitlist counts
  const eventIds = upcomingEvents.map(e => e.id);
  const waitlistByEvent: Record<string, number> = {};
  if (eventIds.length > 0) {
    const wlCounts = await prisma.eventRegistration.groupBy({
      by: ["eventId"],
      where: { eventId: { in: eventIds }, status: "WAITLISTED", deletedAt: null },
      _count: true,
    });
    for (const w of wlCounts) waitlistByEvent[w.eventId] = w._count;
  }

  const soldOutEvents = upcomingEvents.filter(e => e.capacity && e.registrationCount >= e.capacity);
  const waitlistCount = waitlisted;

  const attentionItems: { icon: React.ReactNode; title: string; desc: string; action: string; href: string }[] = [];

  if (waitlistCount > 0 && soldOutEvents.length > 0) {
    attentionItems.push({
      icon: <Users className="w-4 h-4 text-brand" />,
      title: `${waitlistCount} people on the waitlist`,
      desc: `${soldOutEvents[0].title} is full and starts ${formatRelativeDate(soldOutEvents[0].startAt)}`,
      action: "Review",
      href: `/organizer/events/${soldOutEvents[0].id}`,
    });
  }

  if (draftEvents.length > 0) {
    attentionItems.push({
      icon: <Pencil className="w-4 h-4 text-amber-600" />,
      title: draftEvents.length > 1 ? `${draftEvents.length} unpublished drafts` : "Unpublished draft",
      desc: `${draftEvents[0].title} isn't visible to the public yet`,
      action: "Review & publish",
      href: `/organizer/events/${draftEvents[0].id}`,
    });
  }

  if (!widgetLive) {
    attentionItems.push({
      icon: <CodeXml className="w-4 h-4 text-[#A50F15]" />,
      title: widgetStale ? "Website widget not detected" : "Show your events on your website",
      desc: widgetStale ? "We haven't seen it load yet. See quick fixes" : "Visitors register on your site · about 2 minutes",
      action: widgetStale ? "Fix" : "Set up",
      href: "/organizer/embed",
    });
  }

  if (!organizer?.companyEmailVerified) {
    attentionItems.push({
      icon: <ShieldAlert className="w-4 h-4 text-gray-400" />,
      title: "Verify company email",
      desc: "Get the Verified badge on your events",
      action: "Verify",
      href: "/organizer/settings",
    });
  }

  const checkInRate = totalRegs > 0 ? Math.round((checkedIn / totalRegs) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="portal-title">
            {getGreeting()}, {firstName}
          </h1>
          <p className="portal-subtitle">
            {upcomingEvents.length} event{upcomingEvents.length !== 1 ? "s" : ""} this week
            {draftEvents.length > 0 ? ` · ${draftEvents.length} draft${draftEvents.length !== 1 ? "s" : ""} waiting to be finished` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/organizer/events/create"
            data-tour="create-event"
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 bg-brand hover:bg-brand-600 active:bg-brand-700 text-white text-sm font-bold font-jakarta rounded-md transition-colors"
          >
            <Plus className="w-4 h-4" /> Create event
          </Link>
        </div>
      </div>

      {/* Needs your attention */}
      {attentionItems.length > 0 && (
        <div data-tour="attention" className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
            <h2 className="portal-section-title flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Needs your attention
            </h2>
          </div>
          <div className="flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-gray-100 dark:divide-gray-800">
            {attentionItems.map((item, i) => (
              <div key={i} className="flex-1 min-w-0 px-4 sm:px-5 py-4 flex items-center gap-3 sm:gap-4">
                <div className="shrink-0">{item.icon}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white font-jakarta">{item.title}</p>
                  <p className="text-xs text-gray-500 font-jakarta mt-0.5 truncate">{item.desc}</p>
                </div>
                <Link
                  href={item.href}
                  className="shrink-0 inline-flex items-center min-h-[40px] px-3.5 text-xs font-semibold font-jakarta border border-gray-200 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition-colors"
                >
                  {item.action}
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <div data-tour="stats" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Registrations"
          value={totalRegs.toLocaleString("en-IN")}
          change={regsChange !== null ? `${regsChange > 0 ? "+" : ""}${regsChange}%` : "—"}
          positive={regsChange !== null && regsChange >= 0}
        />
        <StatCard
          label="Page views → registered"
          value={conversionRate !== null ? `${conversionRate}%` : "—"}
          change={viewsLast30 > 0 ? `${viewsLast30.toLocaleString("en-IN")} views` : "—"}
          positive
        />
        <StatCard
          label="Check-in rate"
          value={totalRegs > 0 ? `${checkInRate}%` : "—"}
          change="—"
          positive
        />
        <StatCard
          label="Waitlisted"
          value={waitlisted > 0 ? waitlisted.toLocaleString("en-IN") : "—"}
          change="—"
          positive
        />
      </div>

      {/* Upcoming events + Latest registrations */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        {/* Upcoming events table */}
        <div data-tour="upcoming" className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <h2 className="portal-section-title">Upcoming events</h2>
            <Link href="/organizer/events" className="text-xs text-brand font-semibold font-jakarta hover:underline flex items-center gap-0.5">
              All events <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {/* Table header */}
          <div className="hidden sm:grid grid-cols-[1fr_160px_100px_40px] px-5 py-2 text-[11px] uppercase tracking-wider font-bold text-gray-400 font-jakarta border-b border-gray-50 dark:border-gray-800">
            <span>Event</span>
            <span>Registrations</span>
            <span>Status</span>
            <span />
          </div>

          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {upcomingEvents.length === 0 && (
              <p className="px-5 py-8 text-sm text-gray-400 font-jakarta text-center">No upcoming events</p>
            )}
            {upcomingEvents.map(e => {
              const isSoldOut = e.capacity && e.registrationCount >= e.capacity;
              const pct = e.capacity ? Math.min((e.registrationCount / e.capacity) * 100, 100) : 0;
              const wlCount = waitlistByEvent[e.id] || 0;
              const statusLabel = e.status === "DRAFT" ? "Draft" : isSoldOut ? "Sold out" : "Live";
              const statusColor = e.status === "DRAFT" ? "text-gray-500" : isSoldOut ? "text-brand" : "text-green-600";
              const month = e.startAt.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
              const day = e.startAt.getDate().toString().padStart(2, "0");
              const loc = e.venueName || (e.meetingLink ? "Online" : "");

              return (
                <Link key={e.id} href={`/organizer/events/${e.id}`} className="grid grid-cols-1 sm:grid-cols-[1fr_160px_100px_40px] items-center px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-14 rounded-md border border-gray-100 dark:border-gray-700 flex flex-col items-center justify-center shrink-0 bg-white dark:bg-gray-900">
                      <span className="text-[10px] font-bold text-brand uppercase">{month}</span>
                      <span className="text-lg font-bold text-gray-900 dark:text-white font-sora leading-none">{day}</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white font-jakarta">{e.title}</p>
                      <p className="sm:hidden mt-0.5 text-xs font-jakarta text-gray-600 dark:text-gray-300">
                        <span className="font-semibold">{e.registrationCount}</span>{e.capacity ? ` / ${e.capacity}` : ""} registered
                        <span className={`ml-1.5 font-semibold ${statusColor}`}>· {statusLabel}</span>
                      </p>
                      <p className="text-xs text-gray-400 font-jakarta">
                        {e.startAt.toLocaleDateString("en-US", { weekday: "short" })}{" "}
                        {e.startAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })} IST
                        {loc ? ` · ${loc}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="hidden sm:block">
                    <p className="text-sm font-jakarta text-gray-700 dark:text-gray-200">
                      <span className="font-semibold">{e.registrationCount}</span>
                      {e.capacity ? ` / ${e.capacity}` : ""}
                      {wlCount > 0 && <span className="text-brand font-semibold"> · +{wlCount} waitlist</span>}
                    </p>
                    {e.capacity && (
                      <div className="w-24 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full mt-1 overflow-hidden">
                        <div className="h-full bg-brand rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                  <span className={`hidden sm:block text-xs font-semibold font-jakarta ${statusColor}`}>{statusLabel}</span>
                  <button className="hidden sm:flex items-center justify-center w-7 h-7 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </Link>
              );
            })}
            {draftEvents.length > 0 && !upcomingEvents.some(e => e.status === "DRAFT") && (
              <Link href={`/organizer/events/${draftEvents[0].id}`} className="grid grid-cols-1 sm:grid-cols-[1fr_160px_100px_40px] items-center px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-14 rounded-md border border-gray-100 dark:border-gray-700 flex flex-col items-center justify-center shrink-0 bg-white dark:bg-gray-900">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">DATE</span>
                    <span className="text-lg font-bold text-gray-300 dark:text-gray-600 font-sora leading-none">—</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white font-jakarta">{draftEvents[0].title}</p>
                    <p className="text-xs text-gray-400 font-jakarta">
                      Edited {formatRelativeDate(draftEvents[0].updatedAt)} · not published
                    </p>
                  </div>
                </div>
                <span className="hidden sm:block text-sm text-gray-400 font-jakarta">—</span>
                <span className="hidden sm:block text-xs font-semibold font-jakarta text-gray-500">Draft</span>
                <button className="hidden sm:flex items-center justify-center w-7 h-7 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </Link>
            )}
          </div>
        </div>

        {/* Latest registrations */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <h2 className="portal-section-title">Latest registrations</h2>
            <Link href="/organizer/attendees" className="text-xs text-brand font-semibold font-jakarta hover:underline flex items-center gap-0.5">
              All attendees <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {recentRegs.length === 0 && (
              <p className="px-5 py-8 text-sm text-gray-400 font-jakarta text-center">No registrations yet</p>
            )}
            {recentRegs.map(r => {
              const initials = (r.guestName || "?")
                .split(" ")
                .map(w => w[0])
                .join("")
                .slice(0, 2)
                .toUpperCase();
              const statusLabel = r.status === "CONFIRMED" || r.status === "CHECKED_IN" ? "Confirmed" : "Waitlist";
              const statusColor = statusLabel === "Confirmed"
                ? "text-green-700 bg-green-50 dark:bg-green-900/20 dark:text-green-400"
                : "text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400";
              const timeAgo = formatRelativeDate(r.registeredAt);
              return (
                <div key={r.id} className="px-5 py-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-brand/10 text-brand flex items-center justify-center text-xs font-bold font-jakarta shrink-0">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white font-jakarta truncate">{r.guestName || "Guest"}</p>
                    <p className="text-xs text-gray-400 font-jakarta truncate">{r.event.title} · {timeAgo}</p>
                  </div>
                  <span className={`text-[11px] font-semibold font-jakarta px-2 py-0.5 rounded-full ${statusColor}`}>
                    {statusLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── New Account View ────────────────────────────────────── */

function NewAccountView({ firstName, companyEmailVerified, events, teamCount, widgetLive }: { firstName: string; companyEmailVerified: boolean; events: any[]; teamCount: number; widgetLive: boolean }) {
  const hasEvent = events.length > 0;
  const hasTeam = teamCount > 0;
  const steps = [
    { num: 1, title: "Create your account", desc: `Done · signed in as ${firstName}`, done: true, action: null, href: "" },
    { num: 2, title: "Create your first event", desc: "Start blank or from a template — you can save a draft at any point.", done: hasEvent, action: hasEvent ? null : "Create event", href: "/organizer/events/create" },
    { num: 3, title: "Verify your company email", desc: "Earns a Verified badge so attendees trust your events.", done: companyEmailVerified, action: companyEmailVerified ? null : "Verify", href: "/organizer/settings" },
    { num: 4, title: "Invite your team", desc: hasTeam ? `Done · ${teamCount} member${teamCount !== 1 ? "s" : ""} added` : "Add co-organizers and check-in staff.", done: hasTeam, action: hasTeam ? null : "Invite", href: "/organizer/team" },
    { num: 5, title: "Show events on your website", desc: widgetLive ? "Done · your widget is live" : "Paste one snippet so visitors register on your own site.", done: widgetLive, action: widgetLive ? null : "Set up", href: "/organizer/embed" },
    { num: 6, title: "Set up payouts (optional)", desc: "Only needed if you'll sell paid tickets.", done: false, action: "Set up", href: "/organizer/settings" },
  ];
  const doneCount = steps.filter(s => s.done).length;

  const templates = [
    { icon: Code2, label: "Hackathon", desc: "Teams, judging, 24–48 h", href: "/organizer/events/create?template=hackathon" },
    { icon: Mic2, label: "Meetup", desc: "Free RSVP, single evening", href: "/organizer/events/create?template=meetup" },
    { icon: Monitor, label: "Webinar", desc: "Online link, reminders", href: "/organizer/events/create?template=webinar" },
    { icon: Building2, label: "Conference", desc: "Multi-track, paid tiers", href: "/organizer/events/create?template=conference" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="portal-title">
            {getGreeting()}, {firstName}
          </h1>
          <p className="portal-subtitle">
            Let&apos;s get your first event live. Most organizers publish in under 10 minutes.
          </p>
        </div>
        <Link
          href="/organizer/events/create"
          data-tour="create-event"
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 bg-brand hover:bg-brand-600 active:bg-brand-700 text-white text-sm font-bold font-jakarta rounded-md transition-colors"
        >
          <Plus className="w-4 h-4" /> Create event
        </Link>
      </div>

      {/* Setup checklist + Templates */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
        {/* Setup checklist */}
        <div data-tour="checklist" className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <h2 className="portal-section-title">Set up your organizer account</h2>
            <span className="text-xs font-semibold text-gray-400 font-jakarta">{doneCount} of {steps.length} done</span>
          </div>
          {/* Progress bar */}
          <div className="px-5 pt-4 pb-2 flex gap-1.5">
            {steps.map((s, i) => (
              <div key={i} className={`flex-1 h-1 rounded-full ${s.done ? "bg-brand" : "bg-gray-200 dark:bg-gray-700"}`} />
            ))}
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {steps.map(s => {
              const isActive = !s.done && steps.findIndex(x => !x.done) === steps.indexOf(s);
              return (
                <div key={s.num} className="px-4 sm:px-5 py-4 flex items-center gap-3 sm:gap-4">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    s.done
                      ? "bg-green-500 text-white"
                      : isActive
                        ? "bg-brand text-white"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-400"
                  }`}>
                    {s.done ? <Check className="w-3.5 h-3.5" /> : s.num}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold font-jakarta ${s.done ? "text-gray-500" : "text-gray-900 dark:text-white"}`}>
                      {s.title}
                    </p>
                    <p className="text-xs text-gray-400 font-jakarta mt-0.5">{s.desc}</p>
                  </div>
                  {s.action && (
                    <Link
                      href={s.href}
                      className={`shrink-0 inline-flex items-center min-h-[40px] px-4 text-xs font-bold font-jakarta rounded-md transition-colors ${
                        isActive
                          ? "bg-brand text-white hover:bg-brand-600"
                          : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                      }`}
                    >
                      {s.action}
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Start from a template */}
        <div data-tour="templates" className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <h2 className="portal-section-title">Start from a template</h2>
            <p className="text-xs text-gray-400 font-jakarta mt-0.5">Pre-filled schedule, tickets and registration questions.</p>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {templates.map(t => (
              <Link
                key={t.label}
                href={t.href}
                className="px-5 py-3.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
              >
                <div className="w-10 h-10 rounded-md bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-gray-500 shrink-0">
                  <t.icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white font-jakarta">{t.label}</p>
                  <p className="text-xs text-gray-400 font-jakarta">{t.desc}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
              </Link>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800">
            <p className="text-xs text-gray-400 font-jakarta">
              Moving from another platform?{" "}
              <Link href="/organizer/events/import" className="text-brand font-semibold hover:underline">
                Import events or a CSV
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* Overview stats (empty state) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="portal-section-title">Overview</h2>
          <p className="text-xs text-gray-400 font-jakarta">Your numbers appear once your first event is published</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {["Upcoming events", "Registrations", "Check-in rate", "Waitlisted"].map(label => (
            <div key={label} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md px-5 py-4">
              <p className="text-xs text-gray-400 font-jakarta">{label}</p>
              <p className="text-xl font-bold font-sora text-gray-300 dark:text-gray-600 mt-1">—</p>
            </div>
          ))}
        </div>
      </div>

      {/* Help cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <HelpCard icon={BookOpen} color="brand" title="Plan your first event" desc="A 5-minute checklist from idea to launch" href="/organizer/support" />
        <HelpCard icon={QrCode} color="brand" title="How QR check-in works" desc="Set up staff phones for event day" href="/organizer/check-in" />
        <HelpCard icon={MessageCircle} color="brand" title="Talk to us" desc="Chat with support · usually replies in minutes" href="/organizer/support" />
      </div>
    </div>
  );
}

/* ── Shared components ────────────────────────────────────── */

function StatCard({ label, value, change, positive }: { label: string; value: string; change: string; positive: boolean }) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md px-5 py-4">
      <p className="text-xs text-gray-400 font-jakarta">{label}</p>
      <p className="text-2xl font-extrabold font-sora text-gray-900 dark:text-white mt-1">{value}</p>
      {change !== "—" && (
        <p className={`text-xs font-semibold font-jakarta mt-1 ${positive ? "text-green-600" : "text-red-500"}`}>
          {positive ? "▲" : "▼"} {change} <span className="text-gray-400 font-normal">vs previous 30 days</span>
        </p>
      )}
    </div>
  );
}

function HelpCard({ icon: Icon, color, title, desc, href }: { icon: any; color: string; title: string; desc: string; href: string }) {
  return (
    <Link href={href} className="bg-brand-50 dark:bg-brand-900/10 border border-brand-100 dark:border-brand-900/20 rounded-md px-5 py-4 hover:bg-brand-100 dark:hover:bg-brand-900/20 transition-colors">
      <Icon className="w-5 h-5 text-brand mb-2" />
      <p className="text-sm font-bold text-gray-900 dark:text-white font-jakarta">{title}</p>
      <p className="text-xs text-gray-500 font-jakarta mt-0.5">{desc}</p>
    </Link>
  );
}

function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `in ${days} days`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
