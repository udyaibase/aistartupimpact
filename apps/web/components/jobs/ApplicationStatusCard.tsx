import { candidateView } from '@/lib/jobs/candidate-status';

/** The status box with the progress steps: same on the private link and in "My applications". */
export default function ApplicationStatusCard({ app }: { app: { status: string; outcome: string | null; withdrawnAt: Date | null } }) {
  const { stage, closed, step, steps } = candidateView(app);
  return (
    <section aria-labelledby="stage" className="mt-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] p-5">
      <h2 id="stage" className="text-sm font-semibold text-gray-600 dark:text-gray-400">Status</h2>
      <p className="font-sora font-bold text-xl text-gray-900 dark:text-white mt-1">{stage.label}</p>
      <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{stage.detail}</p>
      {!closed && (
        <ol className="mt-5 grid grid-cols-5 gap-1.5" aria-label="Progress">
          {steps.map((s, i) => (
            <li key={s} className="text-center">
              <span className={`block h-1.5 rounded-full ${i <= step ? 'bg-brand' : 'bg-gray-200 dark:bg-gray-700'}`} aria-hidden />
              <span className={`block mt-1.5 text-[11px] leading-tight ${i <= step ? 'text-gray-900 dark:text-white font-semibold' : 'text-gray-500'}`}>
                {s}<span className="sr-only">{i <= step ? ' (reached)' : ''}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
