import { ExternalLink, FileText, PlayCircle, Star, Users } from 'lucide-react';
import { youTubeEmbedUrl, type RecapLink } from '@/lib/events/recap';

/**
 * Recap mode: shown at the top of an event's page once it has ended. Highlights, photos, recordings and slides,
 * and totals. Never names or lists of attendees.
 */
export default function EventRecap({ summary, gallery, links, sessions, attended, rating }: {
  summary: string | null;
  gallery: string[];
  links: RecapLink[];
  sessions: { id: string; title: string; dayNumber: number; startTime: string; recordingUrl: string | null; slidesUrl: string | null }[];
  attended: number | null;
  rating: { average: number; responses: number } | null;
}) {
  const sessionLinks = sessions.filter((s) => s.recordingUrl || s.slidesUrl);
  const featured = links.find((l) => l.kind === 'recording' && youTubeEmbedUrl(l.url));
  const otherLinks = links.filter((l) => l !== featured);
  if (!summary && !gallery.length && !links.length && !sessionLinks.length && !attended && !rating) return null;

  return (
    <section aria-labelledby="recap-title" className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand">This event has ended</p>
      <h2 id="recap-title" className="mt-1 font-sora font-bold text-lg text-navy dark:text-white">Recap</h2>

      {(attended || rating) && (
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-700 dark:text-gray-300">
          {attended ? <span className="inline-flex items-center gap-1.5"><Users className="w-4 h-4 text-gray-500" aria-hidden /> {attended.toLocaleString('en-IN')} attended</span> : null}
          {rating ? <span className="inline-flex items-center gap-1.5"><Star className="w-4 h-4 fill-amber-400 text-amber-400" aria-hidden /> {rating.average.toFixed(1)} from {rating.responses} ratings</span> : null}
        </div>
      )}

      {summary && <p className="mt-4 text-sm leading-relaxed text-gray-700 dark:text-gray-300 whitespace-pre-line">{summary}</p>}

      {featured && (
        <div className="mt-5 aspect-video w-full overflow-hidden rounded-xl bg-black">
          <iframe src={youTubeEmbedUrl(featured.url)!} title={featured.title} className="w-full h-full" loading="lazy"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
        </div>
      )}

      {gallery.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Photos</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {gallery.map((src, i) => (
              <a key={src} href={src} target="_blank" rel="noopener noreferrer" className="block aspect-[4/3] overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`Photo ${i + 1} from the event`} loading="lazy" className="w-full h-full object-cover hover:scale-[1.02] transition-transform" />
              </a>
            ))}
          </div>
        </div>
      )}

      {(otherLinks.length > 0 || sessionLinks.length > 0) && (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Recordings and slides</h3>
          <ul className="divide-y divide-gray-100 dark:divide-gray-800 rounded-lg border border-gray-200 dark:border-gray-800">
            {otherLinks.map((l) => (
              <li key={l.url}>
                <a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
                  {l.kind === 'recording' ? <PlayCircle className="w-4 h-4 text-gray-500 shrink-0" aria-hidden /> : <FileText className="w-4 h-4 text-gray-500 shrink-0" aria-hidden />}
                  <span className="flex-1 truncate">{l.title}</span>
                  <ExternalLink className="w-3.5 h-3.5 text-gray-400" aria-hidden />
                </a>
              </li>
            ))}
            {sessionLinks.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
                <span className="flex-1 min-w-0 truncate text-gray-800 dark:text-gray-200">{s.title}</span>
                {s.recordingUrl && <a href={s.recordingUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 font-semibold text-brand"><PlayCircle className="w-4 h-4" aria-hidden /> Watch</a>}
                {s.slidesUrl && <a href={s.slidesUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 font-semibold text-brand"><FileText className="w-4 h-4" aria-hidden /> Slides</a>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
