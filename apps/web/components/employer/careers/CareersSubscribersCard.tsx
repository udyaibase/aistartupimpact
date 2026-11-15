import { BellRing, Download } from 'lucide-react';
import { prisma } from '@udyaibase/database';
import { card } from '@/components/organizer/embed/ui';

const SHOWN = 50;
const date = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

/** People who confirmed they want to hear when this company opens a role (careers widget and company page). */
export default async function CareersSubscribersCard({ employerId }: { employerId: string }) {
  const where = { employerId, confirmedAt: { not: null }, unsubscribedAt: null };
  const [total, rows] = await Promise.all([
    prisma.jobBoardCareersSubscriber.count({ where }),
    prisma.jobBoardCareersSubscriber.findMany({
      where, orderBy: { confirmedAt: 'desc' }, take: SHOWN,
      select: { id: true, email: true, source: true, confirmedAt: true, lastNotifiedAt: true },
    }),
  ]);

  return (
    <section aria-labelledby="notify-list" className={`${card} p-5 sm:p-6 mt-6 max-w-5xl mx-auto font-jakarta`}>
      <div className="flex flex-wrap items-start gap-3">
        <BellRing className="w-5 h-5 text-[#A50F15] mt-0.5" aria-hidden />
        <div className="flex-1 min-w-0">
          <h2 id="notify-list" className="portal-section-title">Waiting for your next role ({total})</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
            When you have no open roles, your widget and company page ask candidates to leave their email. They confirm it,
            and we email them once when you publish a new role (at most once a day).
          </p>
        </div>
        {total > 0 && (
          <a href="/api/employer/careers/subscribers" className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
            <Download className="w-4 h-4" aria-hidden /> Download CSV
          </a>
        )}
      </div>
      {total === 0 ? (
        <p className="mt-4 text-sm text-gray-500">Nobody yet. The sign-up box shows when you have no open roles.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100 dark:border-gray-800">
                <th scope="col" className="py-2 pr-4 font-semibold">Email</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Signed up on</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Joined</th>
                <th scope="col" className="py-2 font-semibold">Last emailed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-gray-50 dark:border-gray-800/60 last:border-0">
                  <td className="py-2 pr-4 text-gray-900 dark:text-white break-all">{r.email}</td>
                  <td className="py-2 pr-4 text-gray-600 dark:text-gray-400">{r.source === 'WIDGET' ? 'Your website' : 'Udyaibase page'}</td>
                  <td className="py-2 pr-4 text-gray-600 dark:text-gray-400 whitespace-nowrap">{r.confirmedAt ? date(r.confirmedAt) : ''}</td>
                  <td className="py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">{r.lastNotifiedAt ? date(r.lastNotifiedAt) : 'Not yet'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {total > SHOWN && <p className="mt-3 text-xs text-gray-500">Showing the latest {SHOWN}. Download the CSV for everyone.</p>}
        </div>
      )}
    </section>
  );
}
