import { prisma } from '@udyaibase/database';
import { sendEmail } from '@/lib/email/send';
import { speakerPortalToken } from './after-event';

/**
 * Call for speakers: a public submission form, a review board for the host (accept, waitlist, reject, with a
 * rating and private notes), and accepted speakers become event speakers with a portal link to keep their details
 * and slides up to date.
 */

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');
export const DEFAULT_FORMATS = ['Talk', 'Workshop', 'Panel', 'Lightning talk'];
export const SUBMISSION_STATUSES = ['SUBMITTED', 'ACCEPTED', 'WAITLISTED', 'REJECTED'] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export interface CfpSettings { open: boolean; closesAt: string | null; intro: string; formats: string[] }

export function cfpSettings(raw: unknown): CfpSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const closes = typeof r.closesAt === 'string' && !Number.isNaN(Date.parse(r.closesAt)) ? new Date(r.closesAt).toISOString() : null;
  const formats = (Array.isArray(r.formats) ? r.formats : DEFAULT_FORMATS)
    .filter((f): f is string => typeof f === 'string').map((f) => f.trim().slice(0, 40)).filter(Boolean).slice(0, 8);
  return { open: r.open === true, closesAt: closes, intro: String(r.intro ?? '').trim().slice(0, 2000), formats: formats.length ? formats : DEFAULT_FORMATS };
}

export function cfpIsOpen(s: CfpSettings, event: { endAt: Date; status: string; deletedAt: Date | null }, now = new Date()): boolean {
  return s.open && !event.deletedAt && event.status === 'PUBLISHED' && event.endAt > now && (!s.closesAt || new Date(s.closesAt) > now);
}

const clip = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);
const httpsOrNull = (v: unknown) => { const s = clip(v, 300); return /^https:\/\/\S+\.\S+/i.test(s) ? s : null; };

export type SubmissionInput = {
  name: string; email: string; company: string | null; jobTitle: string | null; bio: string | null; linkedinUrl: string | null;
  title: string; abstract: string; format: string | null; track: string | null;
};

export function cleanSubmission(b: Record<string, unknown>, ctx: { formats: string[]; tracks: string[] }): SubmissionInput | { error: string; field: string } {
  const name = clip(b.name, 100);
  const email = clip(b.email, 200).toLowerCase();
  const title = clip(b.title, 200);
  const abstract = clip(b.abstract, 3000);
  if (name.length < 2) return { error: 'Add your name.', field: 'name' };
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return { error: 'Add a valid email.', field: 'email' };
  if (title.length < 5) return { error: 'Add a title for your talk.', field: 'title' };
  if (abstract.length < 50) return { error: 'Describe your talk in at least a few sentences (50+ characters).', field: 'abstract' };
  return {
    name, email, title, abstract,
    company: clip(b.company, 100) || null, jobTitle: clip(b.jobTitle, 100) || null, bio: clip(b.bio, 1500) || null,
    linkedinUrl: httpsOrNull(b.linkedinUrl),
    format: typeof b.format === 'string' && ctx.formats.includes(b.format) ? b.format : null,
    track: typeof b.track === 'string' && ctx.tracks.includes(b.track) ? b.track : null,
  };
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
function mail(heading: string, lines: string[], cta?: { label: string; href: string }) {
  return `<!doctype html><html><body style="margin:0;background:#F7F7F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #e5e7eb;border-radius:14px"><tr><td style="padding:32px">
<h1 style="font-size:20px;margin:0 0 12px;color:#111827">${esc(heading)}</h1>
${lines.map((l) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#374151">${esc(l)}</p>`).join('')}
${cta ? `<p style="margin:20px 0 0"><a href="${cta.href}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;font-size:14px">${esc(cta.label)}</a></p>` : ''}
</td></tr></table></td></tr></table></body></html>`;
}

export const speakerPortalUrl = (speakerId: string) => `${SITE}/speaker/${encodeURIComponent(speakerPortalToken(speakerId))}`;

export function sendSubmissionReceived(to: string, name: string, talk: string, event: string) {
  return sendEmail({ to, type: 'cfp_received', subject: `We got your talk proposal for ${event}`, html: mail('Thanks for your proposal', [`Hi ${name}, we received “${talk}” for ${event}.`, 'The host will review proposals and email you with their decision.']) });
}

export function sendDecision(opts: { to: string; name: string; talk: string; event: string; status: 'ACCEPTED' | 'WAITLISTED' | 'REJECTED'; portalUrl?: string }) {
  if (opts.status === 'ACCEPTED') {
    return sendEmail({
      to: opts.to, type: 'cfp_decision', subject: `You’re speaking at ${opts.event}`,
      html: mail('Your talk was accepted', [`Hi ${opts.name}, great news: “${opts.talk}” has been accepted for ${opts.event}.`, 'Use your speaker page to check your details, add a photo and upload your slides link. The host will share timings soon.'], opts.portalUrl ? { label: 'Open your speaker page', href: opts.portalUrl } : undefined),
    });
  }
  if (opts.status === 'WAITLISTED') {
    return sendEmail({ to: opts.to, type: 'cfp_decision', subject: `Your proposal for ${opts.event} is on the waitlist`, html: mail('You’re on the waitlist', [`Hi ${opts.name}, “${opts.talk}” is on the waitlist for ${opts.event}. If a slot opens up, the host will be in touch.`]) });
  }
  return sendEmail({ to: opts.to, type: 'cfp_decision', subject: `About your proposal for ${opts.event}`, html: mail('Thank you for your proposal', [`Hi ${opts.name}, thank you for proposing “${opts.talk}” for ${opts.event}. The host had many strong proposals and couldn’t include yours this time.`, 'We hope you’ll propose again for a future event.']) });
}

/** Accepting makes (or reuses) an event speaker from the submission. Returns the speaker id. */
export async function speakerFromSubmission(submissionId: string): Promise<string | null> {
  const sub = await prisma.eventTalkSubmission.findUnique({ where: { id: submissionId } });
  if (!sub) return null;
  if (sub.speakerId && (await prisma.eventSpeaker.findFirst({ where: { id: sub.speakerId, eventId: sub.eventId }, select: { id: true } }))) return sub.speakerId;
  const count = await prisma.eventSpeaker.count({ where: { eventId: sub.eventId } });
  const sp = await prisma.eventSpeaker.create({
    data: {
      eventId: sub.eventId, name: sub.name, title: sub.jobTitle, company: sub.company, headshotUrl: sub.headshotUrl,
      bio: sub.linkedinUrl, talkTitle: sub.title, email: sub.email, submissionId: sub.id, sortOrder: count,
    },
    select: { id: true },
  });
  await prisma.eventTalkSubmission.update({ where: { id: sub.id }, data: { speakerId: sp.id } });
  return sp.id;
}
