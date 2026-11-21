/**
 * Cleans what an organizer sends when creating or editing an event, before any of it is saved. Only fields that
 * were sent are touched (undefined stays undefined, so "leave as is" still works). Links must be http(s): a
 * `javascript:` link saved here would run on the public event page when someone clicks it.
 */

const CATEGORIES = ['CONFERENCE', 'HACKATHON', 'SUMMIT', 'WORKSHOP', 'MEETUP', 'DEMO_DAY', 'WEBINAR', 'NETWORKING'];
const FORMATS = ['IN_PERSON', 'VIRTUAL', 'HYBRID'];
const VISIBILITIES = ['PUBLIC', 'UNLISTED', 'INVITE_ONLY'];
const TIER_TYPES = ['EARLY_BIRD', 'REGULAR', 'VIP'];

type Problem = { ok: false; error: string; field: string };
type Raw = Record<string, any>;

const fail = (field: string, error: string): Problem => ({ ok: false, field, error });

/** An http(s) link of sensible length, or null when empty or missing. `undefined` = not a valid link. */
export function cleanLink(value: unknown, opts: { httpsOnly?: boolean } = {}): string | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const v = value.trim();
  if (!v) return null;
  if (v.length > 1000) return undefined;
  try {
    // "zoom.us/j/123" typed without a scheme is meant as https.
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`);
    if (!u.hostname.includes('.')) return undefined;
    if (u.protocol !== 'https:' && (opts.httpsOnly || u.protocol !== 'http:')) return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

/** Lower-case letters, digits and hyphens only. */
export function cleanSlug(value: unknown): string {
  // Apostrophes vanish ("rahul's" → "rahuls"); other separators ("/", ".", "&") become a hyphen.
  return String(value ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ'’]/g, '').replace(/[^a-z0-9\s_-]/g, ' ').replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

const text = (value: unknown, max: number): string => String(value ?? '').trim().slice(0, max);
const optionalText = (value: unknown, max: number): string | null => text(value, max) || null;

function wholeNumber(value: unknown, max: number): number | null | undefined {
  if (value === null || value === '' || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isInteger(n) || n < 1 || n > max) return undefined;
  return n;
}

export function cleanEventInput(input: unknown): { ok: true; data: Raw } | Problem {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('body', 'Invalid request.');
  const data: Raw = { ...(input as Raw) };

  if (data.title !== undefined) data.title = text(data.title, 200);
  if (data.slug !== undefined) data.slug = cleanSlug(data.slug) || undefined;
  if (data.subtitle !== undefined) data.subtitle = optionalText(data.subtitle, 300);
  if (data.venueName !== undefined) data.venueName = optionalText(data.venueName, 200);
  if (data.address !== undefined) data.address = optionalText(data.address, 500);
  if (data.seoTitle !== undefined) data.seoTitle = optionalText(data.seoTitle, 200);
  if (data.seoDescription !== undefined) data.seoDescription = optionalText(data.seoDescription, 500);
  if (data.approvalRequired !== undefined) data.approvalRequired = data.approvalRequired === true;
  if (data.description !== undefined && data.description !== null && typeof data.description !== 'string') return fail('description', 'Invalid description.');

  for (const [key, allowed, label] of [['category', CATEGORIES, 'event type'], ['format', FORMATS, 'format'], ['visibility', VISIBILITIES, 'visibility']] as const) {
    if (data[key] === undefined || data[key] === null || data[key] === '') { if (data[key] !== undefined) data[key] = undefined; continue; }
    if (!allowed.includes(data[key])) return fail(key, `Choose a valid ${label}.`);
  }

  for (const key of ['startAt', 'endAt'] as const) {
    if (data[key] === undefined || data[key] === null || data[key] === '') { if (data[key] !== undefined) data[key] = undefined; continue; }
    if (Number.isNaN(new Date(data[key]).getTime())) return fail(key, 'Enter a valid date and time.');
  }
  // The form checks this too, but a request sent straight to the server skipped it and saved an event that ended
  // before it began. (An edit that sends only one of the two is checked against the saved event in the route.)
  if (data.startAt && data.endAt && new Date(data.endAt) <= new Date(data.startAt)) return fail('endAt', 'The end must be after the start.');

  for (const key of ['meetingLink', 'venueMapUrl'] as const) {
    if (data[key] === undefined) continue;
    const link = cleanLink(data[key]);
    if (link === undefined) return fail(key, 'Enter a full link starting with https://');
    data[key] = link;
  }
  if (data.coverImageUrl !== undefined) {
    const link = cleanLink(data.coverImageUrl, { httpsOnly: true });
    if (link === undefined) return fail('coverImageUrl', 'The cover image link isn’t valid. Upload the image again.');
    data.coverImageUrl = link;
  }

  if (data.capacity !== undefined) {
    const n = wholeNumber(data.capacity, 1_000_000);
    if (n === undefined) return fail('capacity', 'Capacity must be a whole number.');
    data.capacity = n;
  }

  if (data.speakers !== undefined) {
    if (!Array.isArray(data.speakers) || data.speakers.length > 100) return fail('speakers', 'Invalid speakers.');
    const speakers = [];
    for (const s of data.speakers as Raw[]) {
      if (!s || typeof s !== 'object') return fail('speakers', 'Invalid speakers.');
      const name = text(s.name, 120);
      if (!name) return fail('speakers', 'Each speaker needs a name.');
      const photo = cleanLink(s.photo, { httpsOnly: true });
      const link = cleanLink(s.linkedin);
      if (photo === undefined) return fail('speakers', `The photo for ${name} isn’t valid. Upload it again.`);
      if (link === undefined) return fail('speakers', `The link for ${name} must start with https://`);
      speakers.push({ ...s, name, title: optionalText(s.title, 120), company: optionalText(s.company, 120), photo, linkedin: link });
    }
    data.speakers = speakers;
  }

  if (data.agenda !== undefined) {
    if (!Array.isArray(data.agenda) || data.agenda.length > 200) return fail('agenda', 'Invalid agenda.');
    data.agenda = (data.agenda as Raw[]).filter((a) => a && typeof a === 'object').map((a) => ({
      ...a, title: text(a.title, 200), time: a.time === undefined ? undefined : text(a.time, 20), speaker: a.speaker === undefined ? undefined : optionalText(a.speaker, 500),
    }));
  }

  if (data.ticketTiers !== undefined) {
    if (!Array.isArray(data.ticketTiers) || data.ticketTiers.length > 20) return fail('ticketTiers', 'Invalid ticket types.');
    const tiers = [];
    for (const t of data.ticketTiers as Raw[]) {
      if (!t || typeof t !== 'object') return fail('ticketTiers', 'Invalid ticket types.');
      const quantity = wholeNumber(t.quantity, 1_000_000);
      if (quantity === undefined) return fail('ticketTiers', 'Ticket quantity must be a whole number.');
      const price = t.priceRupees === undefined || t.priceRupees === null || t.priceRupees === '' ? 0 : Number(t.priceRupees);
      if (!Number.isFinite(price) || price < 0 || price > 1_000_000) return fail('ticketTiers', 'Enter a valid ticket price.');
      tiers.push({
        ...t, id: typeof t.id === 'string' ? t.id : undefined, name: text(t.name, 60) || 'General',
        type: TIER_TYPES.includes(t.type) ? t.type : 'REGULAR', quantity, priceRupees: price, description: optionalText(t.description, 500),
      });
    }
    data.ticketTiers = tiers;
  }

  if (data.customQuestions !== undefined) {
    if (!Array.isArray(data.customQuestions) || data.customQuestions.length > 30) return fail('customQuestions', 'Invalid questions.');
    const questions = [];
    for (const q of data.customQuestions as Raw[]) {
      if (!q || typeof q !== 'object') return fail('customQuestions', 'Invalid questions.');
      const label = text(q.text, 300);
      if (!label) continue;
      const options = Array.isArray(q.options) ? q.options.map((o: unknown) => text(o, 100)).filter(Boolean).join(', ') : text(q.options, 2000);
      questions.push({ ...q, text: label, type: ['TEXT', 'SELECT', 'CHECKBOX'].includes(q.type) ? q.type : 'TEXT', required: q.required === true, options });
    }
    data.customQuestions = questions;
  }

  return { ok: true, data };
}
