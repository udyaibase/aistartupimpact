'use client';

import { useState } from 'react';
import { Check, Loader2, Plus, Send } from 'lucide-react';

const input = 'w-full min-h-[44px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-sm text-gray-900 dark:text-white';
const label = 'block text-sm font-semibold text-gray-900 dark:text-white mb-1';

/**
 * Handing in, by type: answers to each question; links and/or a file (assignments, work samples); or "I've
 * finished" for a test on another site.
 */
export default function AssessmentSubmit({ token, kind, questions }: { token: string; kind: string; questions: string[] }) {
  const [links, setLinks] = useState<string[]>(['']);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const external = kind === 'EXTERNAL';

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError('');
    const res = await fetch(`/api/assessment/${token}`, { method: 'POST', body: new FormData(e.currentTarget) }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : { error: 'You seem to be offline.' };
    if (res?.ok) setDone(true); else setError(d.error || 'Couldn’t submit. Try again.');
    setBusy(false);
  }
  if (done) return <p role="status" className="mt-6 p-4 rounded-xl bg-green-50 dark:bg-green-900/20 text-sm text-green-900 dark:text-green-200"><Check className="inline w-4 h-4 mr-1" aria-hidden />{external ? 'Thanks! The team knows you’ve finished.' : kind === 'QUESTIONS' ? 'Your answers are in. Thank you! The team will be in touch.' : 'Handed in. Thank you! The team will be in touch.'}</p>;

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      {kind === 'QUESTIONS' && questions.map((q, i) => (
        <div key={i}>
          <label htmlFor={`as-a${i}`} className={label}>{i + 1}. {q}</label>
          <textarea id={`as-a${i}`} name="answer" rows={5} required maxLength={5000} className={`${input} py-2`} />
        </div>
      ))}

      {kind !== 'QUESTIONS' && (
        <div>
          <p className={label}>{external ? 'Link to your result (optional)' : kind === 'WORK_SAMPLE' ? 'Links to your work' : 'Link to your work'}</p>
          <div className="space-y-2">
            {links.map((l, i) => (
              <div key={i}>
                <label htmlFor={`as-l${i}`} className="sr-only">Link {i + 1}</label>
                <input id={`as-l${i}`} name="link" type="url" value={l} onChange={(e) => setLinks(links.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder={external ? 'https://… link to your score or certificate' : kind === 'WORK_SAMPLE' ? 'https://behance.net/… or a Google Drive link' : 'https://github.com/… or a Google Drive link'} className={input} />
              </div>
            ))}
          </div>
          {!external && links.length < 5 && <button type="button" onClick={() => setLinks([...links, ''])} className="mt-1.5 inline-flex items-center gap-1 text-sm font-semibold underline"><Plus className="w-3.5 h-3.5" aria-hidden /> Add another link</button>}
        </div>
      )}

      {(kind === 'TAKE_HOME' || kind === 'WORK_SAMPLE') && (
        <div>
          <label htmlFor="as-file" className={label}>Or attach a file <span className="font-normal text-gray-500">(PDF or Word, up to 5 MB)</span></label>
          <input id="as-file" name="file" type="file" accept=".pdf,.docx" className="block w-full text-sm" />
        </div>
      )}

      <div>
        <label htmlFor="as-note" className={label}>Anything the team should know <span className="font-normal text-gray-500">(optional)</span></label>
        <textarea id="as-note" name="note" rows={3} maxLength={2000} className={`${input} py-2`} />
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={busy} className="btn-brand gap-2">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : external ? <Check className="w-4 h-4" aria-hidden /> : <Send className="w-4 h-4" aria-hidden />}
        {external ? 'I’ve finished the test' : kind === 'QUESTIONS' ? 'Send my answers' : 'Hand in'}
      </button>
    </form>
  );
}
