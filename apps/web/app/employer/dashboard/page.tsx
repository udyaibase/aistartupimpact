import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, Check, Plus, Users, Clock, CalendarCheck, MessageSquareReply, Briefcase, FileText } from 'lucide-react';
import { getEmployerSession } from '@/lib/employer-auth';
import { can } from '@/lib/employer/roles';
import { getEmployerHome, getEmployerShell, type OpenRole } from '@/lib/employer/portal';
import RenewJobButton from '@/components/employer/RenewJobButton';
import { daysUntil } from '@/lib/jobs/composer';

export const dynamic = 'force-dynamic';

const WORK_TYPE: Record<string, string> = { REMOTE: 'Remote', HYBRID: 'Hybrid', ONSITE: 'On-site' };

function greeting() {
  const hour = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()));
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatHours(h: number | null) {
  if (h == null) return '—';
  if (h < 1) return '< 1 hr';
  if (h < 48) return `${Math.round(h)} hr`;
  return `${Math.round(h / 24)} days`;
}

function closesIn(expiresAt: Date | null) {
  if (!expiresAt) return { label: 'No closing date', soon: false, renewable: false };
  if (expiresAt.getTime() <= Date.now()) return { label: 'Closed — past closing date', soon: true, renewable: true };
  const days = daysUntil(expiresAt);
  if (days <= 0) return { label: 'Closes today', soon: true, renewable: true };
  if (days === 1) return { label: 'Closes tomorrow', soon: true, renewable: true };
  return { label: `Closes in ${days} days`, soon: days <= 7, renewable: days <= 14 };
}

function StatusChip({ status }: { status: OpenRole['status'] }) {
  return status === 'OPEN' ? (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-800 dark:text-green-300 bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
      <span className="w-1.5 h-1.5 rounded-full bg-green-600" aria-hidden /> Open
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-500" aria-hidden /> Paused
    </span>
  );
}

function Pipeline({ p, jobId }: { p: OpenRole['pipeline']; jobId: string }) {
  const stages = [
    { key: 'new', label: 'New', n: p.new },
    { key: 'shortlisted', label: 'Shortlisted', n: p.shortlisted },
    { key: 'interview', label: 'Interview', n: p.interview },
    { key: 'offer', label: 'Offer', n: p.offer },
  ];
  return (
    <Link href={`/employer/applications?job=${jobId}`} className="flex flex-wrap gap-1.5 group" aria-label="Open candidates for this job">
      {stages.map((s) => (
        <span
          key={s.key}
          className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md border tabular-nums ${
            s.n > 0 && s.key === 'new'
              ? 'border-brand/30 bg-brand/5 text-brand font-semibold'
              : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 group-hover:border-gray-300'
          }`}
        >
          {s.label} <span className="font-semibold">{s.n}</span>
        </span>
      ))}
    </Link>
  );
}

export default async function EmployerHomePage() {
  const session = await getEmployerSession();
  if (!session) redirect('/employer/login');
  if (!session.onboardingCompleted) redirect('/employer/onboarding');
  // Interviewers limited to some jobs only see those jobs' candidates; workspace-wide stats aren't theirs.
  if (session.jobIds) redirect('/employer/applications');

  const [home, shell] = await Promise.all([getEmployerHome(session.id), getEmployerShell(session.id)]);
  const { setup, stats, openRoles } = home;
  const doneCount = setup.filter((s) => s.done).length;
  const companyName = shell?.companyName ?? session.companyName;
  const canPost = can(session.role, 'jobs.manage');
  const isOwner = session.role === 'OWNER';
  const hello = session.memberName?.split(' ')[0] || companyName;

  const statCards = [
    { label: 'Applications', sub: 'Last 30 days', value: stats.applications30d.toLocaleString('en-IN'), icon: Users },
    {
      label: 'Waiting for review', value: stats.waiting.toLocaleString('en-IN'), icon: Clock,
      sub: stats.waitingOver5d > 0 ? `${stats.waitingOver5d} older than 5 days` : 'All caught up within 5 days',
      warn: stats.waitingOver5d > 0,
    },
    { label: 'In interviews', sub: 'Across all jobs', value: stats.inInterview.toLocaleString('en-IN'), icon: CalendarCheck },
    { label: 'Median first reply', sub: 'Last 90 days', value: formatHours(stats.medianFirstReplyHours), icon: MessageSquareReply },
  ];

  return (
    <div className="font-jakarta">
      {/* Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="portal-title">{greeting()}, {hello}</h1>
          <p className="portal-subtitle">
            {stats.waiting > 0
              ? `${stats.waiting} candidate${stats.waiting === 1 ? ' is' : 's are'} waiting for a reply.`
              : openRoles.length > 0
                ? `You have ${openRoles.length} active job${openRoles.length === 1 ? '' : 's'}. No one is waiting on you.`
                : 'Post a job to start receiving candidates.'}
          </p>
        </div>
        {stats.waiting > 0 ? (
          <Link href="/employer/applications?stage=new" className="btn-brand gap-2 shrink-0">
            Review {stats.waiting} new candidate{stats.waiting === 1 ? '' : 's'} <ArrowRight className="w-4 h-4" aria-hidden />
          </Link>
        ) : canPost ? (
          <Link href="/employer/jobs/new" className="btn-brand gap-2 shrink-0">
            <Plus className="w-4 h-4" aria-hidden /> Post a job
          </Link>
        ) : null}
      </div>

      {/* Setup checklist */}
      {isOwner && doneCount < setup.length && (
        <section aria-labelledby="setup-title" className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] p-4 sm:p-5 mb-6">
          <div className="flex items-center justify-between gap-4 mb-3">
            <h2 id="setup-title" className="portal-section-title">Finish setting up</h2>
            <span className="text-sm text-gray-600 dark:text-gray-400 tabular-nums">{doneCount} of {setup.length} done</span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden mb-4" role="progressbar" aria-valuemin={0} aria-valuemax={setup.length} aria-valuenow={doneCount} aria-label="Setup progress">
            <div className="h-full bg-brand rounded-full" style={{ width: `${(doneCount / setup.length) * 100}%` }} />
          </div>
          <ol className="grid gap-1">
            {setup.map((step) => (
              <li key={step.key}>
                {step.done ? (
                  <div className="flex items-center gap-3 px-2 py-2.5 rounded-[10px]">
                    <span className="w-6 h-6 rounded-full bg-green-600 text-white flex items-center justify-center shrink-0" aria-hidden><Check className="w-3.5 h-3.5" /></span>
                    <span className="text-sm text-gray-500 dark:text-gray-400 line-through decoration-gray-300">{step.label}</span>
                    <span className="sr-only">Done</span>
                  </div>
                ) : (
                  <Link href={step.href} className="flex items-center gap-3 px-2 py-2.5 rounded-[10px] hover:bg-gray-50 dark:hover:bg-gray-800/60 group">
                    <span className="w-6 h-6 rounded-full border-2 border-gray-300 dark:border-gray-600 shrink-0" aria-hidden />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-gray-900 dark:text-white">{step.label}</span>
                      <span className="block text-[13px] text-gray-600 dark:text-gray-400">{step.hint}</span>
                    </span>
                    <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-brand shrink-0" aria-hidden />
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Stats */}
      <section aria-label="Hiring at a glance" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        {statCards.map((s) => (
          <div key={s.label} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] p-4">
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 mb-2">
              <s.icon className="w-4 h-4 shrink-0" aria-hidden />
              <span className="text-[13px] font-medium">{s.label}</span>
            </div>
            <p className="font-sora font-bold text-2xl text-gray-900 dark:text-white tabular-nums">{s.value}</p>
            <p className={`text-xs mt-0.5 ${s.warn ? 'text-amber-700 dark:text-amber-400 font-semibold' : 'text-gray-500 dark:text-gray-400'}`}>{s.sub}</p>
          </div>
        ))}
      </section>

      {/* Open roles */}
      <section aria-labelledby="roles-title" className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px]">
        <div className="flex items-center justify-between gap-4 px-4 sm:px-5 pt-4 pb-3">
          <h2 id="roles-title" className="portal-section-title">Open roles</h2>
          {home.hasAnyJob && (
            <Link href="/employer/jobs" className="text-sm font-semibold text-brand hover:underline">All jobs</Link>
          )}
        </div>

        {openRoles.length === 0 ? (
          <div className="px-4 sm:px-5 pb-8 pt-4 text-center">
            <span className="w-12 h-12 rounded-[12px] bg-gray-100 dark:bg-gray-800 text-gray-500 flex items-center justify-center mx-auto mb-3" aria-hidden>
              {home.hasAnyJob ? <Briefcase className="w-6 h-6" /> : <FileText className="w-6 h-6" />}
            </span>
            <p className="text-[15px] font-semibold text-gray-900 dark:text-white">
              {home.hasAnyJob ? 'No open roles right now' : 'Post your first job in about 2 minutes'}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-sm mx-auto">
              {home.hasAnyJob
                ? 'Reopen a closed job or post a new one. Drafts are in Jobs.'
                : 'Paste a job description or a link and we’ll fill in the form. You review it before it goes live.'}
            </p>
            {canPost && (
              <Link href="/employer/jobs/new" className="btn-brand gap-2 mt-4">
                <Plus className="w-4 h-4" aria-hidden /> Post a job
              </Link>
            )}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-gray-100 dark:border-gray-800 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">
                    <th scope="col" className="px-5 py-2.5 font-semibold">Role</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Status</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold text-right">Views</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Pipeline</th>
                    <th scope="col" className="px-5 py-2.5 font-semibold">Closing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {openRoles.map((r) => {
                    const c = closesIn(r.expiresAt);
                    return (
                      <tr key={r.id} className="align-middle">
                        <td className="px-5 py-3">
                          <Link href={`/employer/jobs/${r.id}/edit`} className="font-semibold text-gray-900 dark:text-white hover:text-brand">{r.title}</Link>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{[r.location, WORK_TYPE[r.workType] ?? r.workType].filter(Boolean).join(' · ')}</p>
                        </td>
                        <td className="px-3 py-3"><StatusChip status={r.status} /></td>
                        <td className="px-3 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">{r.views.toLocaleString('en-IN')}</td>
                        <td className="px-3 py-3"><Pipeline p={r.pipeline} jobId={r.id} /></td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <span className={`block text-[13px] ${c.soon ? 'text-amber-700 dark:text-amber-400 font-semibold' : 'text-gray-600 dark:text-gray-400'}`}>{c.label}</span>
                          {canPost && c.renewable && <RenewJobButton jobId={r.id} title={r.title} />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="md:hidden divide-y divide-gray-100 dark:divide-gray-800 border-t border-gray-100 dark:border-gray-800">
              {openRoles.map((r) => {
                const c = closesIn(r.expiresAt);
                return (
                  <li key={r.id} className="px-4 py-3.5 space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/employer/jobs/${r.id}/edit`} className="block text-[15px] font-semibold text-gray-900 dark:text-white truncate">{r.title}</Link>
                        <p className="text-[13px] text-gray-500 dark:text-gray-400">{[r.location, WORK_TYPE[r.workType] ?? r.workType, `${r.views.toLocaleString('en-IN')} views`].filter(Boolean).join(' · ')}</p>
                      </div>
                      <StatusChip status={r.status} />
                    </div>
                    <Pipeline p={r.pipeline} jobId={r.id} />
                    <div className="flex items-center justify-between gap-3">
                      <span className={`text-[13px] ${c.soon ? 'text-amber-700 dark:text-amber-400 font-semibold' : 'text-gray-600 dark:text-gray-400'}`}>{c.label}</span>
                      {canPost && c.renewable && <RenewJobButton jobId={r.id} title={r.title} />}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
