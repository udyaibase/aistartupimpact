import { prisma } from '@udyaibase/database';
import { generateShortCode, isSlugReserved } from './short-code';
import { utcToZoned, zonedToUtc } from './zoned-time';

/**
 * "Run it again": copy an event to a new date as a draft. Same local start time on the new date (in the event's own
 * time zone); end time, registration deadline and ticket sale windows move by the same amount. Copies speakers,
 * agenda, ticket tiers and registration questions, plus after-event settings. Never copies attendees, check-ins,
 * certificates, feedback, photos, recordings or the startup tag (that needs fresh proof).
 */

async function uniqueSlug(title: string): Promise<string> {
  let base = title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'event';
  if (isSlugReserved(base)) base = `${base}-event`;
  for (let attempt = 1; attempt <= 30; attempt++) {
    const candidate = attempt === 1 ? base : `${base}-${attempt}`;
    const [taken, old] = await Promise.all([
      prisma.event.findUnique({ where: { slug: candidate }, select: { id: true } }),
      prisma.eventSlugHistory.findUnique({ where: { oldSlug: candidate }, select: { id: true } }),
    ]);
    if (!taken && !old) return candidate;
  }
  return `${base}-${Date.now().toString(36).slice(-5)}`;
}

async function uniqueShortCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = generateShortCode(6);
    if (!(await prisma.event.findUnique({ where: { shortCode: code }, select: { id: true } }))) return code;
  }
  return generateShortCode(8);
}

export type DuplicateResult = { ok: true; id: string; slug: string; title: string } | { ok: false; error: string; status: number };

/** `date` is YYYY-MM-DD in the event's time zone. */
export async function duplicateEvent(sourceId: string, organizerId: string, date: string): Promise<DuplicateResult> {
  const src = await prisma.event.findFirst({
    where: { id: sourceId, organizerId, deletedAt: null },
    include: {
      speakers: { orderBy: { sortOrder: 'asc' } },
      agendaItems: { orderBy: [{ dayNumber: 'asc' }, { sortOrder: 'asc' }] },
      ticketTiers: true,
      customQuestions: { where: { hiddenAt: null }, orderBy: { sortOrder: 'asc' } },
    },
  });
  if (!src) return { ok: false, error: 'Event not found.', status: 404 };
  if (src.sourceUrl) return { ok: false, error: 'Imported events can’t be copied.', status: 400 };

  const { time } = utcToZoned(src.startAt, src.timezone);
  const newStart = zonedToUtc(date, time || '10:00', src.timezone);
  if (!newStart) return { ok: false, error: 'Choose a date.', status: 400 };
  if (newStart.getTime() < Date.now() - 60_000) return { ok: false, error: 'Choose a date in the future.', status: 400 };
  if (newStart.getTime() > Date.now() + 2 * 365 * 86_400_000) return { ok: false, error: 'Choose a date within the next two years.', status: 400 };
  const shift = newStart.getTime() - src.startAt.getTime();
  const move = (d: Date | null) => (d ? new Date(d.getTime() + shift) : null);

  const [slug, shortCode] = await Promise.all([uniqueSlug(src.title), uniqueShortCode()]);

  const created = await prisma.$transaction(async (tx) => {
    const e = await tx.event.create({
      data: {
        slug, shortCode, organizerId, status: 'DRAFT',
        title: src.title, subtitle: src.subtitle, category: src.category, format: src.format,
        startAt: newStart, endAt: move(src.endAt)!, timezone: src.timezone,
        venueName: src.venueName, address: src.address, venueMapUrl: src.venueMapUrl, latitude: src.latitude, longitude: src.longitude,
        meetingLink: src.meetingLink, revealLinkAfterRegistration: src.revealLinkAfterRegistration,
        coverImageUrl: src.coverImageUrl, description: src.description ?? undefined, capacity: src.capacity,
        visibility: src.visibility, registrationDeadline: move(src.registrationDeadline), approvalRequired: src.approvalRequired,
        metaTitle: src.metaTitle, metaDescription: src.metaDescription, socialImageUrl: src.socialImageUrl,
        certificateSettings: src.certificateSettings ?? undefined, followUpSettings: src.followUpSettings ?? undefined,
        feedbackSettings: src.feedbackSettings ?? undefined,
        seriesId: src.seriesId, agendaTracks: src.agendaTracks,
      },
      select: { id: true, slug: true },
    });

    const speakerIds = new Map<string, string>();
    for (const sp of src.speakers) {
      const n = await tx.eventSpeaker.create({
        data: { eventId: e.id, name: sp.name, title: sp.title, company: sp.company, headshotUrl: sp.headshotUrl, bio: sp.bio, talkTitle: sp.talkTitle, sortOrder: sp.sortOrder },
        select: { id: true },
      });
      speakerIds.set(sp.id, n.id);
    }
    if (src.agendaItems.length) {
      await tx.eventAgendaItem.createMany({
        data: src.agendaItems.map((a) => ({
          eventId: e.id, speakerId: a.speakerId ? speakerIds.get(a.speakerId) ?? null : null, dayNumber: a.dayNumber,
          startTime: a.startTime, endTime: a.endTime, title: a.title, description: a.description, sortOrder: a.sortOrder, track: a.track,
        })),
      });
    }
    if (src.ticketTiers.length) {
      await tx.eventTicketTier.createMany({
        data: src.ticketTiers.map((t) => ({
          eventId: e.id, name: t.name, priceCents: t.priceCents, quantity: t.quantity, soldCount: 0,
          saleStart: move(t.saleStart), saleEnd: move(t.saleEnd), tierType: t.tierType, description: t.description,
        })),
      });
    }
    if (src.customQuestions.length) {
      await tx.eventCustomQuestion.createMany({
        data: src.customQuestions.map((q) => ({
          eventId: e.id, questionText: q.questionText, questionType: q.questionType, options: q.options ?? undefined, required: q.required, sortOrder: q.sortOrder,
        })),
      });
    }
    return e;
  }, { timeout: 20_000 });

  return { ok: true, id: created.id, slug: created.slug, title: src.title };
}
