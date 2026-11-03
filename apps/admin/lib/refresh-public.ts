/**
 * Tell the public web app to refresh cached pages after an admin change (apps/web/app/api/webhooks/revalidate).
 * Public pages are cached for hours and only rebuilt when content changes, so every admin write that affects
 * the public site calls this. Never throws: a failed refresh must not fail the admin action (the pages'
 * own revalidate timer is the safety net).
 */
export type PublicSection =
  | 'home' | 'news' | 'stories' | 'opinions' | 'authors' | 'startups' | 'tools' | 'funding'
  | 'jobs' | 'events' | 'india-ai' | 'milestones' | 'all';

export async function refreshPublic(sections: PublicSection[], paths: string[] = []): Promise<void> {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') console.warn('[refreshPublic] INTERNAL_API_SECRET not set; public pages refresh on their timer only');
    return;
  }
  const base = (process.env.WEB_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/api/webhooks/revalidate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ sections, paths }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.error('[refreshPublic] web app answered', res.status);
  } catch (err) {
    console.error('[refreshPublic] failed', err instanceof Error ? err.message : err);
  }
}

/** For route handlers: run the handler, then refresh the sections if it succeeded (2xx). */
export function withPublicRefresh<A extends unknown[]>(sections: PublicSection[], handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    const res = await handler(...args);
    if (res.ok) await refreshPublic(sections);
    return res;
  };
}

/**
 * After a refund: ask the web app to issue and email the GST credit note (apps/web/app/api/webhooks/credit-note).
 * Never throws; the web app's daily cron issues any credit note this call missed.
 */
export async function requestCreditNote(table: 'employer' | 'organizer', paymentId: string): Promise<void> {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return;
  const base = (process.env.WEB_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/api/webhooks/credit-note`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ table, paymentId }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) console.error('[requestCreditNote] web app answered', res.status);
  } catch (err) {
    console.error('[requestCreditNote] failed', err instanceof Error ? err.message : err);
  }
}

/** Tell the web app an admin approved an event, so its go-live steps run now (the daily cron catches any miss). */
export async function requestEventApproved(eventId: string): Promise<void> {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return;
  const base = (process.env.WEB_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/api/webhooks/event-approved`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ eventId }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) console.error('[requestEventApproved] web app answered', res.status);
  } catch (err) {
    console.error('[requestEventApproved] failed', err instanceof Error ? err.message : err);
  }
}

/** Tell the web app an organizer was suspended, so attendees of the cancelled events are emailed and refunded now. */
export async function requestOrganizerSuspended(organizerId: string): Promise<void> {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return;
  const base = (process.env.WEB_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/api/webhooks/organizer-suspended`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ organizerId }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) console.error('[requestOrganizerSuspended] web app answered', res.status);
  } catch (err) {
    console.error('[requestOrganizerSuspended] failed', err instanceof Error ? err.message : err);
  }
}
