import { prisma } from '@udyaibase/database';
import { isPlatformOrganizer, effectiveHostPlan } from '@/lib/events/plans';
import { certificateSettings, certificatesAllowed, eventPeople, isCertificateCode, newCertificateCode, CERTIFICATE_PHRASES } from './after-event';
import type { CertificateData } from './certificate-pdf';

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');

export const verifyUrl = (code: string) => `${SITE}/verify/${code}`;
export const certificatePageUrl = (code: string) => `${SITE}/certificates/${code}`;

/** "16 November 2026" in the event's own time zone (a late-night event in IST mustn't show the next day). */
export function eventDateText(startAt: Date, endAt: Date, timeZone: string): string {
  const tz = (() => { try { new Intl.DateTimeFormat('en-IN', { timeZone }); return timeZone; } catch { return 'Asia/Kolkata'; } })();
  const fmt = (d: Date) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: tz }).format(d);
  const a = fmt(startAt);
  const b = fmt(endAt);
  return a === b ? a : `${a} – ${b}`;
}

/** Where it happened, briefly: the city from the address, or "Online". */
export function eventPlaceText(e: { format: string; venueName: string | null; address: string | null }): string {
  if (e.format === 'VIRTUAL') return 'Online';
  const parts = (e.address ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  // "…, Bengaluru, Karnataka 560001, India" -> the part before the state/PIN, else the venue.
  const city = parts.length >= 3 ? parts[parts.length - 3].replace(/\d{6}/, '').trim() : '';
  return city || e.venueName || '';
}

type IssueResult = { issued: number; eligible: number };

/**
 * Issue certificates to everyone in the event's audience who doesn't have one yet (idempotent: re-running only adds
 * the new people). Audience: checked-in people, or everyone registered, as the host chose.
 */
export async function issueCertificates(eventId: string, opts: { registrationIds?: string[] } = {}): Promise<IssueResult> {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { certificateSettings: true } });
  if (!event) return { issued: 0, eligible: 0 };
  const settings = certificateSettings(event.certificateSettings);
  const people = (await eventPeople(eventId))
    .filter((p) => (settings.audience === 'CHECKED_IN' ? p.attended : true))
    .filter((p) => !opts.registrationIds || opts.registrationIds.includes(p.id));
  const missing = people.filter((p) => !p.certificateCode);
  if (missing.length) {
    await prisma.eventCertificate.createMany({
      data: missing.map((p) => ({ code: newCertificateCode(), eventId, registrationId: p.id, recipientName: (p.name || 'Participant').slice(0, 120) })),
      skipDuplicates: true,
    });
  }
  return { issued: missing.length, eligible: people.length };
}

/** At check-in: issue straight away when the host turned on automatic certificates (and has them). Never throws. */
export async function issueCertificateOnCheckIn(registrationId: string): Promise<void> {
  try {
    const reg = await prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      select: { eventId: true, event: { select: { organizerId: true, certificateSettings: true, certificatesPaidAt: true } } },
    });
    if (!reg) return;
    const s = certificateSettings(reg.event.certificateSettings);
    if (!reg.event.certificateSettings || !s.autoIssue) return;
    if (!(await certificatesAllowed({ organizerId: reg.event.organizerId, certificatesPaidAt: reg.event.certificatesPaidAt }))) return;
    await issueCertificates(reg.eventId, { registrationIds: [registrationId] });
  } catch (e) {
    console.error('[certificate on check-in]', e instanceof Error ? e.message : e);
  }
}

/** Everything the PDF and the public pages need, by code. Null for an unknown code. */
export async function certificateByCode(code: unknown) {
  if (!isCertificateCode(code)) return null;
  const cert = await prisma.eventCertificate.findUnique({
    where: { code },
    select: {
      code: true, recipientName: true, issuedAt: true, revokedAt: true,
      event: {
        select: {
          slug: true, title: true, startAt: true, endAt: true, timezone: true, format: true, venueName: true, address: true,
          certificateSettings: true, deletedAt: true,
          organizer: { select: { name: true, company: true, avatar: true, plan: true, planExpiresAt: true, email: true } },
        },
      },
    },
  });
  if (!cert || cert.event.deletedAt) return null;
  const e = cert.event;
  const s = certificateSettings(e.certificateSettings);
  const hostName = e.organizer.company || e.organizer.name;
  const date = eventDateText(e.startAt, e.endAt, e.timezone);
  const place = eventPlaceText(e);
  const pro = isPlatformOrganizer(e.organizer.email) || effectiveHostPlan(e.organizer).key === 'PRO';
  const pdf: CertificateData = {
    template: s.template,
    title: s.title,
    recipientName: cert.recipientName,
    eventTitle: e.title,
    dateLine: [date, place, s.duration].filter(Boolean).join(' · '),
    phrase: CERTIFICATE_PHRASES[s.phrase], description: s.description, skills: s.skills,
    hostName,
    logoUrl: s.logoUrl ?? e.organizer.avatar,
    partnerLogoUrl: s.partnerLogoUrl, logoPosition: s.logoPosition, logoSize: s.logoSize, showHostName: s.showHostName,
    logoHeight: s.logoHeight, logoOffsetX: s.logoOffsetX, logoOffsetY: s.logoOffsetY, logoPlate: s.logoPlate,
    customSvg: s.customSvg, duration: s.duration,
    signerName: s.signerName,
    signerTitle: s.signerTitle,
    signatureUrl: s.signatureUrl,
    code: cert.code,
    verifyUrl: verifyUrl(cert.code),
    showBranding: !pro,
  };
  return {
    code: cert.code,
    recipientName: cert.recipientName,
    issuedAt: cert.issuedAt,
    revoked: !!cert.revokedAt,
    title: s.title,
    eventTitle: e.title,
    eventSlug: e.slug,
    hostName,
    date,
    place,
    phrase: CERTIFICATE_PHRASES[s.phrase], description: s.description, skills: s.skills, duration: s.duration,
    pdf,
  };
}

/** LinkedIn "Add licence or certification" link, filled in. */
export function linkedInAddUrl(c: { title: string; eventTitle: string; hostName: string; issuedAt: Date; code: string }): string {
  const p = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME',
    name: `${c.title}: ${c.eventTitle}`.slice(0, 200),
    organizationName: c.hostName,
    issueYear: String(c.issuedAt.getUTCFullYear()),
    issueMonth: String(c.issuedAt.getUTCMonth() + 1),
    certUrl: verifyUrl(c.code),
    certId: c.code,
  });
  return `https://www.linkedin.com/profile/add?${p.toString()}`;
}
