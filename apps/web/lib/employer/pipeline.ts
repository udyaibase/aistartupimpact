import { prisma } from '@udyaibase/database';
import type { JobBoardAppStatus } from '@prisma/client';
import { sendEmailBatch } from '@/lib/email/send';

/** Board columns. "New" holds both unseen (APPLIED) and seen (REVIEWED) candidates. */
export const PIPELINE = [
  { key: 'new', label: 'New', statuses: ['APPLIED', 'REVIEWED'], target: 'REVIEWED' },
  { key: 'shortlisted', label: 'Shortlisted', statuses: ['SHORTLISTED'], target: 'SHORTLISTED' },
  { key: 'interview', label: 'Interview', statuses: ['INTERVIEW'], target: 'INTERVIEW' },
  { key: 'offer', label: 'Offer', statuses: ['OFFER'], target: 'OFFER' },
  { key: 'hired', label: 'Hired', statuses: ['HIRED'], target: 'HIRED' },
  { key: 'rejected', label: 'Rejected', statuses: ['REJECTED'], target: 'REJECTED' },
] as const satisfies readonly { key: string; label: string; statuses: readonly JobBoardAppStatus[]; target: JobBoardAppStatus }[];

export type StageKey = (typeof PIPELINE)[number]['key'];
export const MOVABLE: JobBoardAppStatus[] = ['REVIEWED', 'SHORTLISTED', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED'];

export function stageOf(status: string): StageKey {
  return (PIPELINE.find((s) => (s.statuses as readonly string[]).includes(status))?.key ?? 'new') as StageKey;
}

// ── Stage emails ───────────────────────────────────────────────────

export interface EmailTemplate { subject: string; body: string; sendByDefault: boolean }

/** Plain-text templates; {{firstName}}, {{jobTitle}}, {{company}} and {{bookingLink}} are filled per candidate. */
export const STAGE_TEMPLATES: Partial<Record<JobBoardAppStatus, EmailTemplate>> = {
  SHORTLISTED: {
    sendByDefault: false,
    subject: 'Your application for {{jobTitle}} at {{company}}',
    body: 'Hi {{firstName}},\n\nThanks for applying for the {{jobTitle}} role. We liked your profile and you’re on our shortlist. We’ll be in touch soon about next steps.\n\nBest,\nThe {{company}} team',
  },
  INTERVIEW: {
    sendByDefault: true,
    subject: 'Interview for {{jobTitle}} at {{company}}',
    body: 'Hi {{firstName}},\n\nWe’d love to talk with you about the {{jobTitle}} role.\n\nPlease pick a time that works for you: {{bookingLink}}\n\nLooking forward to it,\nThe {{company}} team',
  },
  OFFER: {
    sendByDefault: true,
    subject: 'Offer for {{jobTitle}} at {{company}}',
    body: 'Hi {{firstName}},\n\nWe’re delighted to let you know that we’d like to offer you the {{jobTitle}} role. We’ll share the details with you shortly.\n\nCongratulations,\nThe {{company}} team',
  },
  HIRED: {
    sendByDefault: false,
    subject: 'Welcome to {{company}}!',
    body: 'Hi {{firstName}},\n\nWelcome aboard! We’re excited to have you join {{company}} as {{jobTitle}}. We’ll be in touch about your first day.\n\nThe {{company}} team',
  },
  REJECTED: {
    sendByDefault: true,
    subject: 'Update on your application for {{jobTitle}}',
    body: 'Hi {{firstName}},\n\nThank you for your interest in the {{jobTitle}} role at {{company}} and for the time you put into applying. After careful review, we’ve decided not to move forward with your application this time.\n\nWe wish you all the best in your search.\n\nThe {{company}} team',
  },
};

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export const NO_BOOKING_LINE = 'We’ll email you shortly to find a time that works.';

export function fillTemplate(text: string, vars: Record<string, string>) {
  // Without a booking link, the whole line that mentions it becomes a plain sentence.
  const t = vars.bookingLink ? text : text.replace(/^.*\{\{\s*bookingLink\s*\}\}.*$/gm, NO_BOOKING_LINE);
  return t.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? '');
}

/** Plain text → simple, safe HTML (escaped; paragraphs; links clickable). */
export function textToEmailHtml(text: string): string {
  const paras = esc(text.trim()).split(/\n{2,}/).map((p) =>
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.6">${p.replace(/\n/g, '<br>').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#A50F15">$1</a>')}</p>`);
  return `<!doctype html><html><body style="margin:0;background:#F7F7F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px">
<tr><td style="padding:32px">${paras.join('')}</td></tr></table>
<p style="font-size:12px;color:#6b7280;margin:16px 0 0">Sent via Udyaibase. Reply to this email to reach the hiring team.</p>
</td></tr></table></body></html>`;
}

// ── Moving candidates ──────────────────────────────────────────────

export interface MoveEmail {
  subject: string;
  body: string;
  /** ISO time to send later; omit to send now. */
  sendAt?: string | null;
}

export interface MoveResult { moved: number; skipped: number; emailed: number; scheduled: number; failed: number }

/**
 * Moves candidates to a stage and optionally emails them. Safe to retry with the same `batchKey`:
 * each (candidate, stage, batchKey) is recorded once, so nobody gets the email twice.
 */
export async function moveApplications(opts: {
  employerId: string;
  actorEmail: string;
  company: string;
  bookingUrl?: string | null;
  ids: string[];
  toStatus: JobBoardAppStatus;
  email?: MoveEmail | null;
  batchKey: string;
}): Promise<MoveResult> {
  const { employerId, toStatus, batchKey } = opts;
  const apps = await prisma.jobBoardApplication.findMany({
    where: { id: { in: opts.ids.slice(0, 1000) }, Listing: { employerId } },
    select: { id: true, status: true, fullName: true, email: true, withdrawnAt: true, firstResponseAt: true, reviewedAt: true, Listing: { select: { title: true } } },
  });

  const result: MoveResult = { moved: 0, skipped: opts.ids.length - apps.length, emailed: 0, scheduled: 0, failed: 0 };
  const toEmail: { eventId: string; to: string; subject: string; html: string }[] = [];
  const now = new Date();

  for (const a of apps) {
    if (a.withdrawnAt || (a.status === toStatus && toStatus !== 'REVIEWED')) { result.skipped++; continue; }
    const idempotencyKey = `${a.id}:${toStatus}:${batchKey}`;
    try {
      const eventId = await prisma.$transaction(async (tx) => {
        const ev = await tx.jobBoardApplicationEvent.create({
          data: { applicationId: a.id, fromStatus: a.status, toStatus, actorEmail: opts.actorEmail, idempotencyKey },
          select: { id: true },
        });
        await tx.jobBoardApplication.update({
          where: { id: a.id },
          data: {
            status: toStatus,
            statusChangedAt: now,
            reviewedAt: a.reviewedAt ?? now,
            // "Reviewed" alone isn't a reply; any other move is the candidate's first response.
            ...(!a.firstResponseAt && toStatus !== 'REVIEWED' ? { firstResponseAt: now } : {}),
          },
        });
        return ev.id;
      });
      result.moved++;
      const deleted = a.email.endsWith('@deleted.invalid');
      if (opts.email && !deleted) {
        const vars = {
          firstName: a.fullName.split(' ')[0] || a.fullName, jobTitle: a.Listing.title, company: opts.company,
          bookingLink: opts.bookingUrl ?? '',
        };
        toEmail.push({ eventId, to: a.email, subject: fillTemplate(opts.email.subject, vars), html: textToEmailHtml(fillTemplate(opts.email.body, vars)) });
      }
    } catch (err: any) {
      if (err?.code === 'P2002') { result.skipped++; continue; } // already applied by an earlier attempt
      throw err;
    }
  }

  const scheduledAt = opts.email?.sendAt && new Date(opts.email.sendAt) > now ? new Date(opts.email.sendAt).toISOString() : undefined;
  for (let i = 0; i < toEmail.length; i += 100) {
    const chunk = toEmail.slice(i, i + 100);
    const sent = await sendEmailBatch(
      chunk.map((m) => ({ to: m.to, subject: m.subject, html: m.html, replyTo: opts.actorEmail, from: undefined, type: `stage_${toStatus.toLowerCase()}`, scheduledAt })),
      { idempotencyKey: `${batchKey}:${toStatus}:${i / 100}` },
    );
    await Promise.all(chunk.map((m, j) => {
      const r = sent[j];
      if (r.success) scheduledAt ? result.scheduled++ : result.emailed++;
      else result.failed++;
      return prisma.jobBoardApplicationEvent.update({
        where: { id: m.eventId },
        data: {
          emailSubject: m.subject,
          emailStatus: r.success ? (scheduledAt ? 'SCHEDULED' : 'SENT') : 'FAILED',
          resendId: r.resendId ?? null,
          scheduledFor: scheduledAt ? new Date(scheduledAt) : null,
        },
      });
    }));
  }
  return result;
}

/** Next 10:00 IST after now, for "send tomorrow morning". */
export function nextMorningIst(now = new Date()): Date {
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  const target = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + 1, 10, 0) - 5.5 * 3600_000;
  return new Date(target);
}
