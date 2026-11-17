/**
 * One set of attendee fields and rules for every way people register for an event: the event page on
 * udyaibase.com, the website widget, and paid checkout. The forms use these for instant feedback; the server
 * (lib/events/registration-input.ts) applies the same rules, so organizers get the same data whichever way people
 * signed up. Safe to import in the browser.
 */

export const OCCUPATIONS = [
  'Founder / CEO',
  'Student',
  'Software Engineer',
  'Product Manager',
  'Investor',
  'Researcher',
  'Designer',
  'Data Scientist',
  'Freelancer',
  'Marketing / Growth',
  'Business Analyst',
  'Content Creator',
  'Other',
] as const;

export const COUNTRY_CODES = [
  { code: '+91', label: 'IN +91' },
  { code: '+1', label: 'US +1' },
  { code: '+44', label: 'UK +44' },
  { code: '+971', label: 'AE +971' },
  { code: '+65', label: 'SG +65' },
  { code: '+61', label: 'AU +61' },
] as const;

/** How a ticked / unticked yes-no question is stored, from every form. */
export const CHECKBOX_YES = 'Yes';
export const CHECKBOX_NO = 'No';

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

/** Why a phone number isn't accepted, or '' when it's fine (empty is fine: phone is optional). */
export function phoneProblem(countryCode: string, phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (countryCode === '+91') return digits.length === 10 ? '' : 'Enter a 10-digit mobile number.';
  return digits.length >= 6 && digits.length <= 14 ? '' : 'Enter a valid phone number.';
}

/** "+91" + "98765 43210" → "+91 9876543210" (the one stored format), or '' when empty. */
export function formatPhone(countryCode: string, phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits ? `${countryCode} ${digits}` : '';
}

/** Ticket types someone can pick right now: on sale and not sold out. */
export function availableTiers<T extends { saleStart?: string | Date | null; saleEnd?: string | Date | null; quantity?: number | null; soldCount?: number | null }>(
  tiers: T[], now = Date.now(),
): T[] {
  return tiers.filter((t) => {
    if (t.saleStart && new Date(t.saleStart).getTime() > now) return false;
    if (t.saleEnd && new Date(t.saleEnd).getTime() < now) return false;
    return !(t.quantity != null && (t.soldCount ?? 0) >= t.quantity);
  });
}
