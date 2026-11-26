import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { requireApiAuth } from '@/lib/api-auth';
import { canOpen } from '@/lib/section-access';

/**
 * Record search for the Ctrl/Cmd-K box: a company, founder, article, startup, tool, event, support ticket or
 * website user by name (or email / ticket number). Each kind is searched only when the signed-in role can open
 * that kind's section, so the box never reveals a record the person couldn't reach through the menu.
 */
const EVERY_ROLE = ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SENIOR_WRITER', 'WRITER', 'AD_MANAGER', 'CONTRIBUTOR', 'EVENT_ORGANIZER'];
const PER_KIND = 5;
/** Writers and contributors only see their own articles in the editor, so article search is for editors. */
const ARTICLE_SEARCH_ROLES = ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SENIOR_WRITER'];

export interface SearchHit { kind: string; label: string; detail: string; href: string }

export async function GET(request: NextRequest) {
  const { session, error } = await requireApiAuth(EVERY_ROLE);
  if (error) return error;
  const role: string = session.user.role;
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ hits: [] });
  const has = { contains: q, mode: 'insensitive' as const };
  const can = (section: string) => canOpen(role, section);
  const skip = Promise.resolve([] as SearchHit[]);

  try {
    const groups = await Promise.all([
      can('/employers') ? prisma.jobBoardEmployer.findMany({ where: { deletedAt: null, OR: [{ companyName: has }, { email: has }] }, select: { companyName: true, email: true, plan: true }, take: PER_KIND, orderBy: { updatedAt: 'desc' } })
        .then((rows) => rows.map((r) => ({ kind: 'Employer', label: r.companyName, detail: `${r.email} · ${r.plan}`, href: `/plans?tab=employers` }))) : skip,
      can('/founders') ? prisma.founderUser.findMany({ where: { OR: [{ name: has }, { email: has }, { company: has }] }, select: { id: true, name: true, email: true, company: true }, take: PER_KIND, orderBy: { createdAt: 'desc' } })
        .then((rows) => rows.map((r) => ({ kind: 'Founder', label: r.name || r.email, detail: [r.company, r.email].filter(Boolean).join(' · '), href: `/founders/${r.id}` }))) : skip,
      can('/articles') && ARTICLE_SEARCH_ROLES.includes(role) ? prisma.article.findMany({ where: { deletedAt: null, title: has }, select: { id: true, title: true, status: true }, take: PER_KIND, orderBy: { updatedAt: 'desc' } })
        .then((rows) => rows.map((r) => ({ kind: 'Article', label: r.title, detail: r.status.replace(/_/g, ' ').toLowerCase(), href: `/articles/${r.id}` }))) : skip,
      can('/startups-dir') ? prisma.startup.findMany({ where: { deletedAt: null, name: has }, select: { id: true, name: true, slug: true }, take: PER_KIND, orderBy: { updatedAt: 'desc' } })
        .then((rows) => rows.map((r) => ({ kind: 'Startup', label: r.name, detail: r.slug, href: `/startups-dir/${r.id}/edit` }))) : skip,
      can('/tools-dir') ? prisma.aiTool.findMany({ where: { deletedAt: null, name: has }, select: { id: true, name: true, slug: true }, take: PER_KIND, orderBy: { updatedAt: 'desc' } })
        .then((rows) => rows.map((r) => ({ kind: 'AI tool', label: r.name, detail: r.slug, href: `/tools-dir/${r.id}/edit` }))) : skip,
      can('/events') ? prisma.event.findMany({ where: { deletedAt: null, title: has }, select: { id: true, title: true, slug: true }, take: PER_KIND, orderBy: { createdAt: 'desc' } })
        .then((rows) => rows.map((r) => ({ kind: 'Event', label: r.title, detail: r.slug, href: `/events/${r.id}` }))) : skip,
      can('/support') ? prisma.supportTicket.findMany({ where: { OR: [{ subject: has }, { ticketNumber: has }, { submitterEmail: has }, { submitterName: has }] }, select: { id: true, subject: true, ticketNumber: true, status: true }, take: PER_KIND, orderBy: { createdAt: 'desc' } })
        .then((rows) => rows.map((r) => ({ kind: 'Support ticket', label: r.subject, detail: `${r.ticketNumber} · ${r.status.replace(/_/g, ' ').toLowerCase()}`, href: `/support/${r.id}` }))) : skip,
      can('/web-users') ? prisma.webUser.findMany({ where: { OR: [{ name: has }, { email: has }] }, select: { name: true, email: true }, take: PER_KIND, orderBy: { createdAt: 'desc' } })
        .then((rows) => rows.map((r) => ({ kind: 'Website user', label: r.name || r.email, detail: r.email, href: `/web-users` }))) : skip,
    ]);
    return NextResponse.json({ hits: groups.flat() });
  } catch (e) {
    console.error('[admin search]', e);
    return NextResponse.json({ hits: [], error: 'Search is unavailable right now.' }, { status: 500 });
  }
}
