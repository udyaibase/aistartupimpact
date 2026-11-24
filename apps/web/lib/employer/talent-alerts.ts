import { prisma } from '@udyaibase/database';
import { sendEmail } from '@/lib/email/send';
import { button, esc, shell } from '@/lib/jobs/apply-emails';
import { loadTalentPool } from './talent';
import type { PoolCandidate } from './talent';
import { cleanTalentFilters, describeFilters, matchesTalentFilters } from './talent-filters';

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');

/** Most people listed in one alert email (the rest are a link away). */
const LIST_MAX = 8;

/**
 * Daily saved-search alerts: for each saved search with alerts on, email the person who saved it about pool members
 * who joined (applied) since the last alert and match the search. Uses the same filters as the Talent pool page, so
 * the email and the page always agree. Nothing is sent when nobody new matches.
 *
 * The email goes only to someone who can still see the whole pool: the account owner, or an active teammate who
 * isn't limited to some jobs. A teammate who left stops getting alerts without anyone having to delete the search.
 */
export async function runTalentAlerts(now = new Date()) {
  const searches = await prisma.jobBoardSavedTalentSearch.findMany({
    where: { alert: true, lastAlertAt: { lt: new Date(now.getTime() - 20 * 3600e3) } },
    select: {
      id: true, name: true, filters: true, createdByEmail: true, lastAlertAt: true, employerId: true,
      Employer: { select: { email: true } },
    },
    orderBy: { employerId: 'asc' },
    take: 2000,
  });
  const results = { searches: searches.length, emailed: 0, noMatches: 0, skippedRecipient: 0 };
  const pools = new Map<string, PoolCandidate[]>();

  for (const s of searches) {
    const to = s.createdByEmail.toLowerCase();
    let allowed = s.Employer.email.toLowerCase() === to;
    if (!allowed) {
      const member = await prisma.jobBoardTeamMember.findFirst({
        where: { employerId: s.employerId, email: { equals: to, mode: 'insensitive' }, status: 'ACTIVE' },
        select: { role: true, jobIds: true },
      });
      allowed = !!member && !(member.role === 'INTERVIEWER' && member.jobIds.length > 0);
    }
    if (!allowed) {
      results.skippedRecipient++;
      await prisma.jobBoardSavedTalentSearch.update({ where: { id: s.id }, data: { lastAlertAt: now } });
      continue;
    }

    let people = pools.get(s.employerId);
    if (!people) { people = (await loadTalentPool(s.employerId, now)).people; pools.set(s.employerId, people); }
    const filters = cleanTalentFilters(s.filters);
    const since = s.lastAlertAt.getTime();
    const fresh = people.filter((p) => new Date(p.appliedAt).getTime() > since && matchesTalentFilters(p, filters, now.getTime()));

    if (fresh.length) {
      const r = await sendEmail({
        to,
        subject: `${fresh.length} new ${fresh.length === 1 ? 'person matches' : 'people match'} “${s.name}”`.replace(/[\r\n]+/g, ' '),
        type: 'employer_talent_alert',
        html: talentAlertHtml({ name: s.name, filters: describeFilters(filters), people: fresh }),
      });
      if (!r.success) continue; // try again tomorrow
      results.emailed++;
    } else {
      results.noMatches++;
    }
    await prisma.jobBoardSavedTalentSearch.update({ where: { id: s.id }, data: { lastAlertAt: now } });
  }
  return results;
}

export function talentAlertHtml(opts: { name: string; filters: string; people: PoolCandidate[] }): string {
  const rows = opts.people.slice(0, LIST_MAX).map((p) => {
    const line = [p.currentTitle, p.currentCompany, p.city].filter(Boolean).join(' · ');
    return `<tr><td style="padding:10px 0;border-bottom:1px solid #e5e7eb">
<div style="font-size:15px;font-weight:600">${esc(p.fullName)}</div>
${line ? `<div style="font-size:13px;color:#4b5563">${esc(line)}</div>` : ''}
<div style="font-size:12px;color:#6b7280">Applied for ${esc(p.appliedFor)} · ${esc(p.furthestStage)}</div></td></tr>`;
  }).join('');
  const more = opts.people.length > LIST_MAX ? `<p style="margin:12px 0 0;font-size:13px;color:#6b7280">and ${opts.people.length - LIST_MAX} more.</p>` : '';
  return shell(`
<h1 style="font-size:20px;margin:0 0 6px">New in your talent pool: ${esc(opts.name)}</h1>
<p style="margin:0 0 16px;font-size:14px;color:#4b5563">${esc(opts.filters)}</p>
<table style="width:100%;border-collapse:collapse">${rows}</table>${more}
<p style="margin:24px 0">${button(`${SITE}/employer/talent`, 'Open the talent pool')}</p>
<p style="margin:0;font-size:12px;color:#6b7280;line-height:1.6">You saved this search with alerts on. Turn alerts off from the Talent pool page.</p>`);
}
