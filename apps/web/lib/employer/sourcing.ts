import crypto from 'node:crypto';
import { prisma } from '@udyaibase/database';
import { sendEmail } from '@/lib/email/send';
import { button, esc, shell } from '@/lib/jobs/apply-emails';
import { hashStatusToken } from '@/lib/jobs/candidate-status';
import { deleteResume, putResume, resumeStorageReady } from '@/lib/jobs/resume-storage';
import { MAX_RESUME_BYTES, resumeText, sniffResume } from '@/lib/jobs/resume-text';
import { aiResumeFields, plainResumeFields, type ResumeFields } from '@/lib/jobs/resume-fields';
import { employerContext } from '@/lib/employer/applications';
import { SOURCING_CHANNELS } from '@/lib/employer/stages';

/**
 * Sourcing: people the team found (a resume folder, LinkedIn, Naukri, a referral on WhatsApp, an event) and adds to a
 * job. They didn't apply, so they sit in the job's sourcing lane, Added → Contacted → Interested, outside the pipeline
 * and its counts. First contact is deliberate (previewed, says how we got their details, offers removal); stage
 * emails start only once they're Interested. Never-contacted records go after 90 days (or 30 days after the job
 * closes), contacted-but-not-interested after 180 days.
 */

const SITE = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');
const DAY = 864e5;
export const SOURCED_RETENTION = { neverContactedDays: 90, afterJobClosedDays: 30, contactedDays: 180 } as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, n) : '');

export interface SourcedInput {
  fullName?: unknown; email?: unknown; phone?: unknown; linkedinUrl?: unknown; profileUrl?: unknown; currentTitle?: unknown; currentCompany?: unknown;
  city?: unknown; experienceYears?: unknown; channel?: unknown; channelOther?: unknown; note?: unknown;
}
export interface CleanSourced {
  fullName: string; email: string; phone: string | null; linkedinUrl: string | null; portfolioUrl: string | null; currentTitle: string | null;
  currentCompany: string | null; city: string | null; experienceYears: number | null; channel: string; note: string | null;
}

function isLinkedInUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'linkedin.com' || host.endsWith('.linkedin.com');
  } catch {
    return false;
  }
}

export function cleanSourced(i: SourcedInput): { ok: true; data: CleanSourced } | { ok: false; error: string; field: string } {
  const fullName = clip(i.fullName, 120);
  if (fullName.length < 2) return { ok: false, error: 'Add their name.', field: 'fullName' };
  const email = clip(i.email, 254).toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, error: 'Add a valid email so you can contact them.', field: 'email' };
  const phone = clip(i.phone, 30).replace(/[^\d+\-\s()]/g, '') || null;
  const link = (v: unknown) => {
    const s = clip(v, 300);
    if (!s) return null;
    const u = /^https?:\/\//i.test(s) ? s.replace(/^http:/i, 'https:') : `https://${s}`;
    return /^https:\/\/[^\s]+\.[^\s]+$/.test(u) ? u : null;
  };
  const profile = link(i.linkedinUrl) ?? link(i.profileUrl);
  // LinkedIn means the link's own host, not the text "linkedin.com/" anywhere in it
  // ("https://evil.example/linkedin.com/in/x" is not a LinkedIn profile).
  const linkedinUrl = profile && isLinkedInUrl(profile) ? profile : null;
  const years = Number(i.experienceYears);
  const raw = clip(i.channel, 40);
  const channel = raw === 'Other' ? clip(i.channelOther, 40) || 'Other' : (SOURCING_CHANNELS as readonly string[]).includes(raw) ? raw : 'Other';
  return {
    ok: true,
    data: {
      fullName, email, phone, linkedinUrl, portfolioUrl: profile && !linkedinUrl ? profile : null,
      currentTitle: clip(i.currentTitle, 100) || null, currentCompany: clip(i.currentCompany, 100) || null, city: clip(i.city, 80) || null,
      experienceYears: i.experienceYears !== '' && i.experienceYears != null && Number.isFinite(years) && years >= 0 && years < 60 ? Math.round(years) : null,
      channel, note: clip(i.note, 2000) || null,
    },
  };
}

/** Reads a resume the team uploaded: AI fills the form when the workspace allows it; otherwise just email and phone. */
export async function readSourcedResume(opts: { employerId: string; listingId: string; bytes: Uint8Array }):
  Promise<{ ok: true; fields: Partial<ResumeFields>; usedAi: boolean } | { ok: false; error: string; status: number }> {
  if (opts.bytes.byteLength > MAX_RESUME_BYTES) return { ok: false, error: 'Resume is over 5 MB.', status: 413 };
  const kind = sniffResume(opts.bytes);
  if (!kind) return { ok: false, error: 'Only PDF or Word (.docx) resumes.', status: 415 };
  const [employer, listing] = await Promise.all([
    prisma.jobBoardEmployer.findUnique({ where: { id: opts.employerId }, select: { aiReadSourcedResumes: true } }),
    prisma.jobBoardListing.findFirst({ where: { id: opts.listingId, employerId: opts.employerId }, select: { skills: true } }),
  ]);
  if (!listing) return { ok: false, error: 'Job not found.', status: 404 };
  let text = '';
  try { text = await resumeText(opts.bytes, kind); } catch { text = ''; }
  const ai = employer?.aiReadSourcedResumes ? await aiResumeFields(text, listing.skills) : null;
  return ai ? { ok: true, fields: ai, usedAi: true } : { ok: true, fields: plainResumeFields(text), usedAi: false };
}

export interface DuplicateSuggestion { id: string; fullName: string; jobTitle: string; reason: 'Same email' | 'Same phone'; linked: boolean }

const phoneKey = (p: string | null | undefined) => (p ?? '').replace(/\D/g, '').slice(-10);

/** Possible matches in this workspace. Suggestions only: a recruiter confirms. */
export async function duplicateSuggestions(employerId: string, who: { id?: string; email: string; phone: string | null; personId?: string | null }): Promise<DuplicateSuggestion[]> {
  const key = phoneKey(who.phone);
  const rows = await prisma.jobBoardApplication.findMany({
    where: {
      Listing: { employerId, deletedAt: null }, ...(who.id ? { id: { not: who.id } } : {}),
      NOT: { email: { endsWith: '@deleted.invalid' } },
      OR: [{ email: { equals: who.email, mode: 'insensitive' } }, ...(key.length === 10 ? [{ phone: { contains: key.slice(-4) } }] : [])],
    },
    take: 20,
    select: { id: true, fullName: true, email: true, phone: true, personId: true, Listing: { select: { title: true } } },
  });
  return rows
    .filter((r) => r.email.toLowerCase() === who.email.toLowerCase() || (key.length === 10 && phoneKey(r.phone) === key))
    .map((r) => ({
      id: r.id, fullName: r.fullName, jobTitle: r.Listing.title,
      reason: r.email.toLowerCase() === who.email.toLowerCase() ? 'Same email' as const : 'Same phone' as const,
      linked: !!who.personId && r.personId === who.personId,
    }));
}

/** A recruiter confirmed two records are the same person: link them (applications, sources and histories stay separate). */
export async function confirmSamePerson(employerId: string, aId: string, bId: string): Promise<boolean> {
  const rows = await prisma.jobBoardApplication.findMany({ where: { id: { in: [aId, bId] }, Listing: { employerId } }, select: { id: true, personId: true } });
  if (rows.length !== 2 || aId === bId) return false;
  const personId = rows.find((r) => r.personId)?.personId ?? crypto.randomUUID();
  const others = rows.map((r) => r.personId).filter((p): p is string => !!p && p !== personId);
  await prisma.jobBoardApplication.updateMany({
    where: { OR: [{ id: { in: [aId, bId] } }, ...(others.length ? [{ personId: { in: others } }] : [])], Listing: { employerId } },
    data: { personId },
  });
  return true;
}

/** Adds one sourced person to a job (with their resume, if given). */
export async function addSourced(opts: {
  employerId: string; listingId: string; actorEmail: string; input: SourcedInput; resume?: Uint8Array | null; jobIds: string[] | null; now?: Date;
}): Promise<{ ok: true; id: string; duplicates: DuplicateSuggestion[] } | { ok: false; error: string; status: number; field?: string; existingId?: string }> {
  const now = opts.now ?? new Date();
  const c = cleanSourced(opts.input);
  if (!c.ok) return { ok: false, error: c.error, status: 400, field: c.field };
  const listing = await prisma.jobBoardListing.findFirst({
    where: { id: opts.listingId, employerId: opts.employerId, deletedAt: null, isGeneral: false, ...(opts.jobIds ? { id: { in: opts.jobIds } } : {}) },
    select: { id: true },
  });
  if (!listing) return { ok: false, error: 'Job not found.', status: 404 };
  const existing = await prisma.jobBoardApplication.findUnique({ where: { listingId_email: { listingId: listing.id, email: c.data.email } }, select: { id: true } });
  if (existing) return { ok: false, error: 'They’re already a candidate for this job.', status: 409, existingId: existing.id };

  let resumeKey: string | null = null;
  if (opts.resume?.byteLength) {
    const kind = sniffResume(opts.resume);
    if (!kind || opts.resume.byteLength > MAX_RESUME_BYTES) return { ok: false, error: 'The resume must be a PDF or Word file under 5 MB.', status: 400, field: 'resume' };
    if (!resumeStorageReady()) return { ok: false, error: 'Resume storage isn’t set up. Add them without the resume for now.', status: 503, field: 'resume' };
    resumeKey = `resumes/${listing.id}/${crypto.randomUUID()}.${kind.ext}`;
    await putResume(resumeKey, opts.resume, kind.mime);
  }

  const d = c.data;
  const app = await prisma.jobBoardApplication.create({
    data: {
      listingId: listing.id, fullName: d.fullName, email: d.email, phone: d.phone, linkedinUrl: d.linkedinUrl, portfolioUrl: d.portfolioUrl,
      currentTitle: d.currentTitle, currentCompany: d.currentCompany, city: d.city, experienceYears: d.experienceYears, resumeKey,
      source: 'SOURCED', sourcedState: 'ADDED', sourcedChannel: d.channel, sourcedBy: opts.actorEmail, appliedAt: now, reviewedAt: now,
    },
    select: { id: true },
  });
  if (d.note) await prisma.jobBoardApplicationNote.create({ data: { applicationId: app.id, authorEmail: opts.actorEmail, authorName: opts.actorEmail.split('@')[0], body: d.note } });
  return { ok: true, id: app.id, duplicates: await duplicateSuggestions(opts.employerId, { id: app.id, email: d.email, phone: d.phone }) };
}

/** The first message, for the team to read and edit before it goes. */
export async function contactPreview(employerId: string, id: string, actorEmail: string) {
  const a = await prisma.jobBoardApplication.findFirst({
    where: { id, Listing: { employerId } },
    select: { fullName: true, email: true, sourcedState: true, sourcedChannel: true, Listing: { select: { title: true } } },
  });
  if (!a || !a.sourcedState || a.sourcedState === 'INTERESTED') return null;
  const ctx = await employerContext(employerId);
  const first = a.fullName.split(' ')[0] || a.fullName;
  return {
    to: a.email, replyTo: actorEmail,
    subject: `${a.Listing.title} at ${ctx.company}`,
    body: `Hi ${first},\n\nI came across your profile and think you could be a great fit for the ${a.Listing.title} role at ${ctx.company}. Would you be open to a quick chat?\n\nBest,\n${actorEmail.split('@')[0]}\n${ctx.company}`,
    howAdded: howAddedLine(a.sourcedChannel, ctx.company),
  };
}

function howAddedLine(channel: string | null, company: string) {
  const where = !channel || channel === 'Other' ? 'from your public profile or a referral' : channel === 'Referral' ? 'through a referral' : channel === 'Resume folder' ? 'from a resume you shared earlier' : `from ${channel}`;
  return `${company} added your details ${where}. You haven’t applied, and nothing is shared beyond their hiring team.`;
}

/**
 * Sends the first message (or a follow-up). Says how we got their details and gives them two buttons: "I'm
 * interested" and "Remove my details". Contacting doesn't switch on stage emails; those start once they're interested.
 */
export async function contactSourced(opts: { employerId: string; id: string; actorEmail: string; subject: unknown; body: unknown; now?: Date }):
  Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const now = opts.now ?? new Date();
  const subject = clip(opts.subject, 150);
  const body = typeof opts.body === 'string' ? opts.body.trim().slice(0, 4000) : '';
  if (subject.length < 3 || body.length < 20) return { ok: false, error: 'Write a subject and a short message.', status: 400 };
  const a = await prisma.jobBoardApplication.findFirst({
    where: { id: opts.id, Listing: { employerId: opts.employerId } },
    select: { id: true, email: true, sourcedState: true, sourcedChannel: true, contactedAt: true },
  });
  if (!a) return { ok: false, error: 'Candidate not found.', status: 404 };
  if (a.sourcedState !== 'ADDED' && a.sourcedState !== 'CONTACTED') return { ok: false, error: 'They’re already in your pipeline.', status: 409 };
  if (a.contactedAt && now.getTime() - a.contactedAt.getTime() < DAY) return { ok: false, error: 'You contacted them in the last day. Give them time to reply.', status: 429 };

  const ctx = await employerContext(opts.employerId);
  const token = crypto.randomBytes(24).toString('base64url');
  const link = `${SITE()}/sourced/${token}`;
  const paras = esc(body).split(/\n{2,}/).map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6">${p.replace(/\n/g, '<br>')}</p>`).join('');
  const r = await sendEmail({
    to: a.email, replyTo: opts.actorEmail, type: 'sourced_contact', subject,
    html: shell(`${paras}
<p style="margin:8px 0 16px">${button(link, 'I’m interested')}</p>
<p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6">${esc(howAddedLine(a.sourcedChannel, ctx.company))} Not interested? <a href="${link}" style="color:#6b7280">Remove my details</a>.</p>`),
  });
  if (r && r.success === false) return { ok: false, error: 'The email couldn’t be sent. Try again.', status: 502 };
  await prisma.jobBoardApplication.update({ where: { id: a.id }, data: { sourcedState: 'CONTACTED', contactedAt: now, statusTokenHash: hashStatusToken(token) } });
  await prisma.jobBoardApplicationEvent.create({ data: { applicationId: a.id, toStatus: 'APPLIED', actorEmail: opts.actorEmail, emailSubject: subject, emailStatus: 'SENT', reasonCode: 'SOURCED_CONTACTED' } });
  return { ok: true };
}

/** They said they're interested (by replying, or with the button): they enter the pipeline as New. */
export async function markInterested(opts: { employerId?: string; id: string; actor: string; now?: Date }): Promise<boolean> {
  const now = opts.now ?? new Date();
  const r = await prisma.jobBoardApplication.updateMany({
    where: { id: opts.id, sourcedState: { in: ['ADDED', 'CONTACTED'] }, ...(opts.employerId ? { Listing: { employerId: opts.employerId } } : {}) },
    data: { sourcedState: 'INTERESTED', interestedAt: now, status: 'APPLIED', statusChangedAt: now, reviewedAt: null },
  });
  if (!r.count) return false;
  await prisma.jobBoardApplicationEvent.create({ data: { applicationId: opts.id, toStatus: 'APPLIED', actorEmail: opts.actor, reasonCode: 'SOURCED_INTERESTED' } });
  return true;
}

/** Removes a sourced record completely (they never applied): the row, its notes and the resume. */
export async function deleteSourced(id: string): Promise<void> {
  const a = await prisma.jobBoardApplication.findUnique({ where: { id }, select: { resumeKey: true, sourcedState: true } });
  if (!a || !a.sourcedState || a.sourcedState === 'INTERESTED') return;
  if (a.resumeKey) await deleteResume(a.resumeKey).catch(() => undefined);
  await prisma.jobBoardApplication.delete({ where: { id } });
}

/** The person's own page (link in the first email): find their sourced record by the token. */
export async function sourcedByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  return prisma.jobBoardApplication.findFirst({
    where: { statusTokenHash: hashStatusToken(token), sourcedState: { not: null } },
    select: { id: true, fullName: true, sourcedState: true, Listing: { select: { title: true, slug: true, employerId: true } } },
  });
}

/** Daily: remove sourced records nobody followed up (see the retention rule above). */
export async function sweepSourced(now = new Date()): Promise<number> {
  const t = now.getTime();
  const rows = await prisma.jobBoardApplication.findMany({
    where: {
      OR: [
        { sourcedState: 'ADDED', appliedAt: { lt: new Date(t - SOURCED_RETENTION.neverContactedDays * DAY) } },
        { sourcedState: 'ADDED', Listing: { OR: [{ closedAt: { lt: new Date(t - SOURCED_RETENTION.afterJobClosedDays * DAY) } }, { deletedAt: { not: null } }] } },
        { sourcedState: 'CONTACTED', contactedAt: { lt: new Date(t - SOURCED_RETENTION.contactedDays * DAY) } },
      ],
    },
    select: { id: true },
    take: 500,
  });
  for (const r of rows) await deleteSourced(r.id).catch((e) => console.error('[sourcing] sweep', r.id, e instanceof Error ? e.message : e));
  return rows.length;
}
