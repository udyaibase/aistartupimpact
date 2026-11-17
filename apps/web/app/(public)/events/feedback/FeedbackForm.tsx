'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2, Star } from 'lucide-react';

const LABELS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

export default function FeedbackForm({ token, eventTitle, hostName, questions, initial, editing }: {
  token: string;
  eventTitle: string;
  hostName: string;
  questions: string[];
  initial: { rating: number; recommend: number | null; answers: string[]; comment: string };
  editing: boolean;
}) {
  const [rating, setRating] = useState(initial.rating);
  const [hover, setHover] = useState(0);
  const [recommend, setRecommend] = useState<number | null>(initial.recommend);
  const [answers, setAnswers] = useState<string[]>(initial.answers);
  const [comment, setComment] = useState(initial.comment);
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) { setError('Choose a rating from 1 to 5 stars.'); return; }
    setState('busy');
    setError('');
    try {
      const r = await fetch('/api/events/feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ t: token, rating, recommend, answers, comment }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) { setError(d.error || 'Couldn’t send your feedback.'); setState('idle'); return; }
      setState('done');
    } catch {
      setError('You seem to be offline. Try again.');
      setState('idle');
    }
  }

  if (state === 'done') {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 sm:p-8 text-center">
        <CheckCircle2 className="w-10 h-10 mx-auto text-green-600 mb-3" aria-hidden />
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Thanks for your feedback</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{hostName} will use it to make the next event better.</p>
      </div>
    );
  }

  const shown = hover || rating;
  const field = 'w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand';

  return (
    <form onSubmit={submit} noValidate className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 sm:p-8 space-y-7">
      <div>
        <p className="text-sm text-gray-500 dark:text-gray-400">{editing ? 'Update your feedback' : 'Your feedback'}</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-gray-900 dark:text-white">How was {eventTitle}?</h1>
      </div>

      <fieldset>
        <legend className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Overall rating</legend>
        <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer p-1 rounded-md has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40" onMouseEnter={() => setHover(n)}>
              <input type="radio" name="rating" value={n} checked={rating === n} onChange={() => { setRating(n); setError(''); }} className="sr-only" aria-label={`${n} star${n === 1 ? '' : 's'}: ${LABELS[n]}`} />
              <Star className={`w-9 h-9 transition-colors ${n <= shown ? 'fill-amber-400 text-amber-400' : 'text-gray-300 dark:text-gray-600'}`} aria-hidden />
            </label>
          ))}
          <span className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[5rem]" aria-live="polite">{LABELS[shown]}</span>
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold text-gray-900 dark:text-white mb-2">How likely are you to recommend this event to a friend? <span className="font-normal text-gray-500">(optional)</span></legend>
        <div className="grid grid-cols-11 gap-1">
          {Array.from({ length: 11 }, (_, n) => (
            <label key={n} className={`cursor-pointer h-10 flex items-center justify-center rounded-md border text-sm font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40 ${recommend === n ? 'bg-gray-900 border-gray-900 text-white dark:bg-white dark:text-gray-900' : 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-400'}`}>
              <input type="radio" name="recommend" value={n} checked={recommend === n} onChange={() => setRecommend(n)} className="sr-only" />
              {n}
            </label>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-xs text-gray-500"><span>Not likely</span><span>Very likely</span></div>
      </fieldset>

      {questions.map((q, i) => (
        <div key={q}>
          <label htmlFor={`fq-${i}`} className="block text-sm font-semibold text-gray-900 dark:text-white mb-1.5">{q} <span className="font-normal text-gray-500">(optional)</span></label>
          <textarea id={`fq-${i}`} rows={2} maxLength={1000} value={answers[i] ?? ''} onChange={(e) => setAnswers(answers.map((a, j) => (j === i ? e.target.value : a)))} className={field} />
        </div>
      ))}

      <div>
        <label htmlFor="fb-comment" className="block text-sm font-semibold text-gray-900 dark:text-white mb-1.5">Anything else? <span className="font-normal text-gray-500">(optional)</span></label>
        <textarea id="fb-comment" rows={3} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} className={field} />
      </div>

      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button type="submit" disabled={state === 'busy'} className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-100 text-white dark:text-gray-900 font-medium text-[15px] disabled:opacity-60">
        {state === 'busy' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} {editing ? 'Update feedback' : 'Send feedback'}
      </button>
      <p className="text-xs text-center text-gray-500 dark:text-gray-400">Shared with {hostName}, the host of this event.</p>
    </form>
  );
}
