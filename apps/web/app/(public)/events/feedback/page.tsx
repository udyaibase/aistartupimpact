import type { Metadata } from 'next';
import { prisma } from '@udyaibase/database';
import { verifyFeedbackToken } from '@/lib/events/after-event';
import { feedbackOpen, feedbackSettings } from '@/lib/events/feedback';
import FeedbackForm from './FeedbackForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Event feedback', robots: { index: false, follow: false } };

export default async function FeedbackPage(props: { searchParams: Promise<{ t?: string; r?: string }> }) {
  const { t, r } = await props.searchParams;
  const id = verifyFeedbackToken(t);
  const reg = id ? await prisma.eventRegistration.findUnique({
    where: { id },
    select: {
      deletedAt: true, cancelledAt: true,
      feedback: { select: { rating: true, recommend: true, answers: true, comment: true } },
      event: { select: { title: true, startAt: true, endAt: true, deletedAt: true, feedbackSettings: true, organizer: { select: { name: true, company: true } } } },
    },
  }) : null;
  const usable = reg && !reg.deletedAt && !reg.cancelledAt && !reg.event.deletedAt;
  const settings = usable ? feedbackSettings(reg!.event.feedbackSettings) : null;

  const box = (title: string, body: string) => (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 sm:p-8">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{body}</p>
      </div>
    </div>
  );
  if (!usable || !settings) return box('This feedback link isn’t valid', 'Use the link in the email you received after the event.');
  if (!settings.enabled) return box('Feedback is closed', 'The host isn’t collecting feedback for this event.');
  if (!feedbackOpen(reg!.event)) return box('Feedback has closed', 'Thanks for coming. Feedback for this event is no longer open.');

  const prev = reg!.feedback;
  const prevAnswers = (Array.isArray(prev?.answers) ? prev!.answers : []) as { question?: string; answer?: string }[];
  const initialRating = Number(r);
  return (
    <div className="max-w-xl mx-auto px-4 py-10 sm:py-14">
      <FeedbackForm
        token={t!}
        eventTitle={reg!.event.title}
        hostName={reg!.event.organizer.company || reg!.event.organizer.name}
        questions={settings.questions}
        initial={{
          rating: prev?.rating ?? (Number.isInteger(initialRating) && initialRating >= 1 && initialRating <= 5 ? initialRating : 0),
          recommend: prev?.recommend ?? null,
          answers: settings.questions.map((q) => prevAnswers.find((a) => a.question === q)?.answer ?? ''),
          comment: prev?.comment ?? '',
        }}
        editing={!!prev}
      />
    </div>
  );
}
