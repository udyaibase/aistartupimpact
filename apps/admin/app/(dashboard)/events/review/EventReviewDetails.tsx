'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, ExternalLink, Info, Loader2, MapPin, User, Video } from 'lucide-react';
import { getReviewDetailsAction, type ReviewDetails } from './actions';

const label = (v: string) => v.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** Date and time in the event's own time zone, as attendees will see it. */
function when(iso: string, tz: string) {
  try {
    return new Date(iso).toLocaleString('en-IN', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return new Date(iso).toLocaleString('en-IN');
  }
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="pt-4 first:pt-0">
      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">{n}. {title}</h3>
      <div className="text-sm text-gray-800 dark:text-gray-200 space-y-1.5">{children}</div>
    </section>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-2">
      <span className="text-gray-500">{k}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

const Missing = ({ text = 'Not given' }: { text?: string }) => <span className="text-amber-700 dark:text-amber-400">{text}</span>;

/**
 * Everything an organizer submitted, laid out in the same order as their event form (basics, date and time,
 * location, tickets, details), so a reviewer checks the event as attendees would see it, without opening anything else.
 */
export default function EventReviewDetails({ eventId }: { eventId: string }) {
  const [d, setD] = useState<ReviewDetails | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    getReviewDetailsAction(eventId).then((r) => {
      if (!live) return;
      if (r.success) setD(r.details); else setError(r.error ?? 'Couldn’t load the event.');
    }).catch(() => live && setError('Couldn’t load the event.'));
    return () => { live = false; };
  }, [eventId]);

  if (error) return <p role="alert" className="text-sm text-red-700">{error}</p>;
  if (!d) return <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>;

  const tz = d.when.timezone;
  return (
    <div className="space-y-4">
      {d.flags.length > 0 && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/10 p-3">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 mb-1.5">Things to check</p>
          <ul className="space-y-1">
            {d.flags.map((f, i) => (
              <li key={i} className="flex items-start gap-1.5 text-sm text-gray-800 dark:text-gray-200">
                {f.level === 'warn' ? <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-600 shrink-0" aria-hidden /> : <Info className="w-4 h-4 mt-0.5 text-gray-400 shrink-0" aria-hidden />}
                <span>{f.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="divide-y divide-gray-200 dark:divide-gray-800 [&>section]:pb-4 [&>section:last-child]:pb-0">
        <Section n={1} title="Basics">
          {d.basics.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={d.basics.coverImageUrl} alt="Cover image" className="w-full max-w-md aspect-[16/9] object-cover rounded-lg border border-gray-200 dark:border-gray-800" />
          ) : <Row k="Cover image"><Missing text="None" /></Row>}
          <Row k="Title"><span className="font-semibold">{d.basics.title}</span></Row>
          <Row k="Tagline">{d.basics.subtitle || <Missing />}</Row>
          <Row k="Category">{label(d.basics.category)}</Row>
          <Row k="Topics">{d.basics.tags.length ? d.basics.tags.join(', ') : <Missing text="None" />}</Row>
          <Row k="Hosted by">
            {d.basics.hostedBy ? <>{d.basics.hostedBy.name} {d.basics.hostedBy.verified ? <span className="text-green-700">(verified)</span> : <span className="text-amber-700">(not verified)</span>}</> : 'The organizer'}
          </Row>
          <Row k="Visibility">{label(d.basics.visibility)}{d.basics.approvalRequired ? ' · organizer approves each registration' : ''}</Row>
        </Section>

        <Section n={2} title="Date and time">
          <Row k="Starts">{when(d.when.startAt, tz)}</Row>
          <Row k="Ends">{when(d.when.endAt, tz)}</Row>
          <Row k="Time zone">{tz}</Row>
          {d.when.registrationDeadline && <Row k="Registration closes">{when(d.when.registrationDeadline, tz)}</Row>}
        </Section>

        <Section n={3} title="Location">
          <Row k="Format">{label(d.where.format)}</Row>
          {d.where.format !== 'VIRTUAL' && (
            <Row k="Venue">
              {d.where.venueName || d.where.address ? (
                <span className="inline-flex items-start gap-1"><MapPin className="w-3.5 h-3.5 mt-0.5 text-gray-400 shrink-0" aria-hidden />
                  <span>{[d.where.venueName, d.where.address].filter(Boolean).join(', ')}
                    {d.where.mapUrl && <> · <a href={d.where.mapUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-brand hover:underline">Map</a></>}
                  </span>
                </span>
              ) : <Missing />}
            </Row>
          )}
          {d.where.format !== 'IN_PERSON' && (
            <Row k="Online link">
              {d.where.meetingLink ? (
                <span className="inline-flex items-start gap-1"><Video className="w-3.5 h-3.5 mt-0.5 text-gray-400 shrink-0" aria-hidden />
                  <a href={d.where.meetingLink} target="_blank" rel="noopener noreferrer nofollow" className="text-brand hover:underline break-all">{d.where.meetingLink}</a>
                </span>
              ) : <Missing />}
              {d.where.revealLinkAfterRegistration && <span className="block text-xs text-gray-500">Shown to attendees only after they register</span>}
            </Row>
          )}
        </Section>

        <Section n={4} title="Tickets">
          <Row k="Capacity">{d.tickets.capacity ? d.tickets.capacity.toLocaleString('en-IN') : 'Unlimited'}</Row>
          {d.tickets.tiers.length === 0 ? <Row k="Tickets"><Missing text="None" /></Row> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-gray-500"><th className="py-1 pr-3 font-medium">Ticket</th><th className="py-1 pr-3 font-medium">Price</th><th className="py-1 pr-3 font-medium">Quantity</th><th className="py-1 font-medium">On sale</th></tr></thead>
                <tbody>
                  {d.tickets.tiers.map((t, i) => (
                    <tr key={i} className="border-t border-gray-100 dark:border-gray-800 align-top">
                      <td className="py-1.5 pr-3">{t.name} <span className="text-xs text-gray-500">{label(t.type)}</span>{t.description && <span className="block text-xs text-gray-500">{t.description}</span>}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{t.priceRupees > 0 ? `₹${t.priceRupees.toLocaleString('en-IN')}` : 'Free'}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{t.quantity ?? 'No limit'}</td>
                      <td className="py-1.5 text-xs text-gray-600 dark:text-gray-400">{t.saleStart || t.saleEnd ? [t.saleStart && `from ${when(t.saleStart, tz)}`, t.saleEnd && `until ${when(t.saleEnd, tz)}`].filter(Boolean).join(' ') : 'Now until the event'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {d.tickets.tiers.some((t) => t.priceRupees > 0) && (
            <Row k="Payouts">{d.tickets.payoutReady ? <span className="text-green-700">Payout account active</span> : <Missing text="Payout account not active" />}</Row>
          )}
        </Section>

        <Section n={5} title="Details">
          <div>
            <p className="text-gray-500 mb-1">Full description <span className="text-xs">({d.details.descriptionChars.toLocaleString('en-IN')} characters)</span></p>
            {d.details.descriptionHtml ? (
              <div className="prose prose-sm dark:prose-invert max-w-none rounded-lg border border-gray-200 dark:border-gray-800 p-3 max-h-96 overflow-y-auto"
                dangerouslySetInnerHTML={{ __html: d.details.descriptionHtml }} />
            ) : <Missing text="No description" />}
          </div>
          <div className="pt-2">
            <p className="text-gray-500 mb-1">Speakers ({d.details.speakers.length})</p>
            {d.details.speakers.length === 0 ? <Missing text="None" /> : (
              <ul className="grid sm:grid-cols-2 gap-2">
                {d.details.speakers.map((s, i) => (
                  <li key={i} className="flex items-center gap-2.5 rounded-lg border border-gray-200 dark:border-gray-800 p-2">
                    {s.photo
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={s.photo} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                      : <span className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0"><User className="w-4 h-4 text-gray-400" aria-hidden /></span>}
                    <span className="min-w-0">
                      <span className="block font-medium truncate">{s.name}</span>
                      <span className="block text-xs text-gray-500 truncate">{[s.title, s.company].filter(Boolean).join(', ') || 'No role given'}</span>
                      {s.link && <a href={s.link} target="_blank" rel="noopener noreferrer nofollow" className="text-xs text-brand hover:underline">Profile</a>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {d.details.agenda.length > 0 && (
            <div className="pt-2">
              <p className="text-gray-500 mb-1">Agenda</p>
              <ul className="space-y-1">
                {d.details.agenda.map((a, i) => (
                  <li key={i} className="grid grid-cols-[7rem_1fr] gap-2"><span className="text-gray-500 tabular-nums">{d.details.agenda.some((x) => x.day > 1) ? `Day ${a.day} · ` : ''}{a.start}{a.end ? `–${a.end}` : ''}</span><span>{a.title}{a.note && <span className="text-gray-500"> · {a.note}</span>}</span></li>
                ))}
              </ul>
            </div>
          )}
          {d.details.questions.length > 0 && (
            <div className="pt-2">
              <p className="text-gray-500 mb-1">Questions for attendees</p>
              <ul className="list-disc pl-5 space-y-0.5">
                {d.details.questions.map((q, i) => <li key={i}>{q.text} <span className="text-xs text-gray-500">({label(q.type)}{q.required ? ', required' : ''})</span></li>)}
              </ul>
            </div>
          )}
          {d.source.url && (
            <Row k="Imported from"><a href={d.source.url} target="_blank" rel="noopener noreferrer nofollow" className="text-brand hover:underline inline-flex items-center gap-1">{d.source.name || d.source.url} <ExternalLink className="w-3 h-3" aria-hidden /></a></Row>
          )}
        </Section>
      </div>
    </div>
  );
}
