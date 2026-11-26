/**
 * Reads values out of a submitted admin form, cleaned and bounded, so a server action never trusts raw form data:
 * text is trimmed and capped, numbers are finite and in range, and links must be http(s) (a "javascript:" link saved
 * here would end up on a public page).
 */
export class FormError extends Error {}

const URL_MAX = 2000;

export function formFields(formData: FormData) {
  const raw = (key: string) => {
    const v = formData.get(key);
    return typeof v === 'string' ? v.trim() : '';
  };
  const text = (key: string, max = 5000) => raw(key).slice(0, max);
  const link = (key: string): string => {
    const v = raw(key);
    if (!v) return '';
    let ok = false;
    try { ok = v.length <= URL_MAX && ['https:', 'http:'].includes(new URL(v).protocol); } catch { ok = false; }
    // Site-relative paths (e.g. "/startups/acme") are fine too.
    if (!ok && /^\/[^/\\]/.test(v) && v.length <= URL_MAX) ok = true;
    if (!ok) throw new FormError(`"${key}" must be a web address starting with https://`);
    return v;
  };
  const num = (key: string, min: number, max: number, fallback: number) => {
    const v = raw(key);
    if (!v) return fallback;
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max) throw new FormError(`"${key}" must be a number between ${min} and ${max}`);
    return n;
  };
  return {
    /** Trimmed text, capped. Empty string when not filled in. */
    text,
    /** Like text, but the field must be filled in. */
    required(key: string, max = 5000): string {
      const v = text(key, max);
      if (!v) throw new FormError(`"${key}" is required`);
      return v;
    },
    /** Trimmed text or null when left empty. */
    optional: (key: string, max = 5000): string | null => text(key, max) || null,
    /** An http(s) address (or a path on this site). Empty string when not filled in. */
    url: link,
    optionalUrl: (key: string): string | null => link(key) || null,
    int: (key: string, min = 0, max = 1_000_000_000): number => Math.round(num(key, min, max, 0)),
    intOrNull(key: string, min = 0, max = 1_000_000_000): number | null {
      return raw(key) ? Math.round(num(key, min, max, 0)) : null;
    },
    number: (key: string, min = 0, max = 1e12): number => num(key, min, max, 0),
    /** One entry per line, trimmed, empties dropped, capped in count and length. */
    lines: (key: string, maxItems = 50, maxLength = 500): string[] =>
      raw(key).split('\n').map((l) => l.trim().slice(0, maxLength)).filter(Boolean).slice(0, maxItems),
    flag: (key: string): boolean => formData.get(key) === 'on',
    date(key: string): Date {
      const d = new Date(raw(key));
      if (Number.isNaN(d.getTime())) throw new FormError(`"${key}" must be a valid date`);
      return d;
    },
  };
}
