import crypto from 'crypto';
import { prisma } from '@udyaibase/database';
import { effectiveHostPlan, isPlatformOrganizer } from '@/lib/events/plans';

/**
 * After the event: certificates and follow-up emails.
 *
 * - Certificates: Pro hosts (and Udyaibase's own events) get them; Free hosts can buy them for one event.
 * - Follow-ups: one send emails both groups (checked in: thank you; registered but absent: sorry we missed you).
 *   Free hosts get one per event, Pro unlimited. Everyone who opted out of this host's emails is skipped.
 */

export const CERTIFICATE_PRICE_PAISE = 49_900;
export const FREE_FOLLOW_UPS_PER_EVENT = 1;
export const FOLLOW_UP_AUTO_DELAY_MS = 2 * 60 * 60 * 1000;

export type CertificateTemplate = 'classic' | 'modern' | 'minimal';
export type CertificateAudience = 'CHECKED_IN' | 'REGISTERED';

export interface CertificateSettings {
  template: CertificateTemplate;
  audience: CertificateAudience;
  /** "Certificate of Participation" etc. */
  title: string;
  signerName: string;
  signerTitle: string;
  signatureUrl: string | null;
  /** Issue at check-in, so people can download it straight after the event. */
  autoIssue: boolean;
}

export interface FollowUpSettings {
  auto: boolean;
  includeMissed: boolean;
  attendedSubject: string;
  attendedBody: string;
  missedSubject: string;
  missedBody: string;
}

const clip = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);

export function certificateSettings(raw: unknown): CertificateSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const template = (['classic', 'modern', 'minimal'] as const).includes(r.template as CertificateTemplate) ? (r.template as CertificateTemplate) : 'classic';
  const signatureUrl = typeof r.signatureUrl === 'string' && /^https:\/\/\S+$/i.test(r.signatureUrl) ? r.signatureUrl.slice(0, 500) : null;
  return {
    template,
    audience: r.audience === 'REGISTERED' ? 'REGISTERED' : 'CHECKED_IN',
    title: clip(r.title, 60) || 'Certificate of Participation',
    signerName: clip(r.signerName, 80),
    signerTitle: clip(r.signerTitle, 80),
    signatureUrl,
    autoIssue: r.autoIssue === true,
  };
}

export function followUpSettings(raw: unknown, eventTitle: string): FollowUpSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    auto: r.auto === true,
    includeMissed: r.includeMissed !== false,
    attendedSubject: clip(r.attendedSubject, 150) || `Thanks for coming to ${eventTitle}`,
    attendedBody: clip(r.attendedBody, 3000) || DEFAULT_ATTENDED_BODY,
    missedSubject: clip(r.missedSubject, 150) || `Sorry we missed you at ${eventTitle}`,
    missedBody: clip(r.missedBody, 3000) || DEFAULT_MISSED_BODY,
  };
}

export const DEFAULT_ATTENDED_BODY = 'Hi {name},\n\nThank you for joining us at {event}. We hope you enjoyed it and met some great people.\n\nWe’d love to see you at our next event.';
export const DEFAULT_MISSED_BODY = 'Hi {name},\n\nWe’re sorry we missed you at {event}. We hope to see you at the next one.\n\nFollow us to hear about upcoming events first.';

/** {name} and {event} in a host's message. */
export function fillTemplate(text: string, vars: { name: string; event: string }): string {
  return text.replace(/\{name\}/gi, vars.name).replace(/\{event\}/gi, vars.event);
}

/** Certificates are included in Pro (and for Udyaibase's own events), or bought for this one event. */
export async function certificatesAllowed(event: { organizerId: string; certificatesPaidAt: Date | null }): Promise<boolean> {
  if (event.certificatesPaidAt) return true;
  const o = await prisma.eventOrganizer.findUnique({ where: { id: event.organizerId }, select: { plan: true, planExpiresAt: true, email: true } });
  if (!o) return false;
  return isPlatformOrganizer(o.email) || effectiveHostPlan(o).key === 'PRO';
}

/** Follow-ups left for this event: Free hosts get one, Pro unlimited (null = no limit). */
export async function followUpsLeft(event: { id: string; organizerId: string }): Promise<number | null> {
  const o = await prisma.eventOrganizer.findUnique({ where: { id: event.organizerId }, select: { plan: true, planExpiresAt: true, email: true } });
  if (o && (isPlatformOrganizer(o.email) || effectiveHostPlan(o).key === 'PRO')) return null;
  const used = await prisma.eventEmailCampaign.count({ where: { eventId: event.id, kind: 'FOLLOW_UP', status: { not: 'FAILED' } } });
  return Math.max(0, FREE_FOLLOW_UPS_PER_EVENT - used);
}

/** Unguessable certificate code, easy to read aloud: 16 characters, no 0/O/1/I. ~80 bits. */
export function newCertificateCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 16; i++) out += alphabet[crypto.randomInt(alphabet.length)];
  return out;
}

export const isCertificateCode = (s: unknown): s is string => typeof s === 'string' && /^[A-HJ-NP-Z2-9]{16}$/.test(s);

/** People in an event's audience, with the name and email to use. Cancelled and deleted registrations never count. */
export async function eventPeople(eventId: string) {
  const regs = await prisma.eventRegistration.findMany({
    where: { eventId, deletedAt: null, cancelledAt: null, status: { in: ['CONFIRMED', 'CHECKED_IN'] } },
    select: { id: true, userId: true, guestName: true, guestEmail: true, checkedInAt: true, hostEmailsOptOutAt: true, certificate: { select: { code: true, revokedAt: true } } },
  });
  const userIds = regs.map((r) => r.userId).filter((x): x is string => !!x);
  const users = userIds.length ? await prisma.webUser.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }) : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  return regs.map((r) => {
    const u = r.userId ? byId.get(r.userId) : undefined;
    const name = (r.guestName || u?.name || '').trim();
    const email = (r.guestEmail || u?.email || '').trim().toLowerCase();
    return {
      id: r.id, name, email, attended: !!r.checkedInAt, optedOut: !!r.hostEmailsOptOutAt,
      certificateCode: r.certificate && !r.certificate.revokedAt ? r.certificate.code : null,
    };
  });
}

// ----- Opt-out links ("Stop emails from this host about this event") -----

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error('NEXTAUTH_SECRET is not set');
  return s;
}

/** A registration id plus a signature for one purpose, so a link can't be reused for something else or forged. */
function signId(purpose: string, id: string): string {
  const sig = crypto.createHmac('sha256', secret()).update(`${purpose}:${id}`).digest('base64url').slice(0, 32);
  return `${id}.${sig}`;
}

function verifyId(purpose: string, token: unknown): string | null {
  if (typeof token !== 'string' || token.length > 200) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const id = token.slice(0, dot);
  const expected = signId(purpose, id).slice(dot + 1);
  const got = token.slice(dot + 1);
  if (got.length !== expected.length) return null;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected)) ? id : null;
}

export const seriesFollowToken = (followerId: string, action: 'confirm' | 'stop') => signId(`series-${action}`, followerId);
export const verifySeriesFollowToken = (token: unknown, action: 'confirm' | 'stop') => verifyId(`series-${action}`, token);
export const hostOptOutToken = (registrationId: string) => signId('host-optout', registrationId);
export const verifyHostOptOutToken = (token: unknown) => verifyId('host-optout', token);
export const feedbackToken = (registrationId: string) => signId('event-feedback', registrationId);
export const verifyFeedbackToken = (token: unknown) => verifyId('event-feedback', token);
export const speakerPortalToken = (speakerId: string) => signId('speaker-portal', speakerId);
export const verifySpeakerPortalToken = (token: unknown) => verifyId('speaker-portal', token);

/** Speaker page links work until 30 days after the event ends; later the event's done and the link shouldn't edit a public profile. */
export const SPEAKER_LINK_DAYS_AFTER = 30;
export function speakerLinkOpen(event: { endAt: Date | string; deletedAt?: Date | string | null }, now = Date.now()): boolean {
  if (event.deletedAt) return false;
  return new Date(event.endAt).getTime() + SPEAKER_LINK_DAYS_AFTER * 864e5 > now;
}
